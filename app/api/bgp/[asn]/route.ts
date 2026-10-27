import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api-guard";
import { describeFetchError, isFetchTimeout } from "@/lib/network";
import { splitASName, type BGPPeer, type BGPPosition, type ProcessedBGPData } from "@/lib/bgp-api";

interface RISNeighbour {
  asn: number;
  type?: string;
  power?: number;
  v4_peers?: number;
  v6_peers?: number;
}

// RIS 按 AS 路径位置划分：left 靠近观测点（通常是上游或对等方向），right 靠近源站（通常是下游方向）。
const POSITIONS: Record<string, BGPPosition> = { left: "upstream", right: "downstream", uncertain: "uncertain" };
const NAME_BATCH = 500;
const NAME_LIMIT = 3000;

// 名称只是补充信息：失败或超时时保留 ASN 编号，不影响邻接数据。
async function fetchASNames(asns: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const batches: number[][] = [];
  for (let index = 0; index < asns.length; index += NAME_BATCH) batches.push(asns.slice(index, index + NAME_BATCH));
  await Promise.all(batches.map(async (batch) => {
    try {
      const response = await fetch(`https://stat.ripe.net/data/as-names/data.json?resource=${batch.map((asn) => `AS${asn}`).join(",")}&sourceapp=ipinfo`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return;
      const payload: { data?: { names?: unknown } } | null = await response.json();
      const result = payload?.data?.names;
      if (!result || typeof result !== "object") return;
      for (const [asn, name] of Object.entries(result)) {
        if (typeof name === "string" && name.trim()) names.set(Number(asn), name);
      }
    } catch {
      // 忽略名称查询失败
    }
  }));
  return names;
}

function isRISNeighbour(value: unknown): value is RISNeighbour {
  if (typeof value !== "object" || value === null) return false;
  const neighbour = value as RISNeighbour;
  return Number.isInteger(neighbour.asn) && neighbour.asn > 0 && neighbour.asn <= 4294967295
    && (neighbour.power === undefined || (Number.isInteger(neighbour.power) && neighbour.power >= 0))
    && (neighbour.v4_peers === undefined || (Number.isInteger(neighbour.v4_peers) && neighbour.v4_peers >= 0))
    && (neighbour.v6_peers === undefined || (Number.isInteger(neighbour.v6_peers) && neighbour.v6_peers >= 0));
}

async function getNeighbours(
  _request: NextRequest,
  context: { params: Promise<{ asn: string }> },
) {
  const { asn } = await context.params;
  const asnNumber = Number(asn);
  if (!/^[1-9]\d*$/.test(asn) || !Number.isInteger(asnNumber) || asnNumber > 4294967295) {
    return NextResponse.json({ error: "无效的 ASN 编号" }, { status: 400 });
  }

  try {
    const url = `https://stat.ripe.net/data/asn-neighbours/data.json?resource=AS${asnNumber}&sourceapp=ipinfo`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `RIPEstat BGP 服务请求失败（HTTP ${response.status}）` },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const payload: { status?: string; data?: { neighbours?: unknown } } | null = await response.json();
    const neighbours = payload?.data?.neighbours;
    if (payload?.status !== "ok" || !Array.isArray(neighbours) || !neighbours.every(isRISNeighbour)) {
      return NextResponse.json(
        { error: "RIPEstat BGP 数据格式错误，无法读取 ASN 邻接观测" },
        { status: 502 },
      );
    }

    const ipv4Peers = new Map<number, BGPPeer>();
    const ipv6Peers = new Map<number, BGPPeer>();
    const allPeers = new Map<number, BGPPeer>();
    const positions = new Map<number, Set<BGPPosition>>();

    // RIS 观测的是 AS 路径中的邻接，v4/v6_peers 是按协议给出的观测计数。
    // 同一 ASN 可能在左右两侧都出现，合并为一条，方向同时出现时记为不确定。
    // https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours
    for (const neighbour of neighbours) {
      if (neighbour.v4_peers === 0 && neighbour.v6_peers === 0) continue;
      const peer = allPeers.get(neighbour.asn) ?? {
        asn: neighbour.asn,
        name: `AS${neighbour.asn}`,
        description: "",
        country_code: "",
        power: 0,
        v4Peers: 0,
        v6Peers: 0,
      };
      peer.power = Math.max(peer.power ?? 0, neighbour.power ?? 0);
      peer.v4Peers = (peer.v4Peers ?? 0) + (neighbour.v4_peers ?? 0);
      peer.v6Peers = (peer.v6Peers ?? 0) + (neighbour.v6_peers ?? 0);
      const position = POSITIONS[neighbour.type ?? ""] ?? "uncertain";
      positions.set(neighbour.asn, (positions.get(neighbour.asn) ?? new Set()).add(position));
      if (neighbour.v4_peers !== undefined && neighbour.v4_peers > 0) ipv4Peers.set(neighbour.asn, peer);
      if (neighbour.v6_peers !== undefined && neighbour.v6_peers > 0) ipv6Peers.set(neighbour.asn, peer);
      allPeers.set(neighbour.asn, peer);
    }
    for (const [asn, set] of positions) {
      allPeers.get(asn)!.position = set.size === 1 ? [...set][0] : "uncertain";
    }

    const named = [...allPeers.values()].sort((a, b) => (b.power ?? 0) - (a.power ?? 0)).slice(0, NAME_LIMIT).map((peer) => peer.asn);
    const names = await fetchASNames([asnNumber, ...named]);
    for (const [asn, raw] of names) {
      const peer = allPeers.get(asn);
      if (!peer) continue;
      Object.assign(peer, splitASName(raw));
      // 句柄与 ASN 相同（如 "AS10429 - ..."）时不重复显示
      if (peer.description === `AS${asn}`) peer.description = "";
    }
    const center = names.get(asnNumber);

    const data: ProcessedBGPData = {
      centerAsn: asnNumber,
      centerName: center ? splitASName(center).name : `AS${asnNumber}`,
      ipv4Peers: Array.from(ipv4Peers.values()),
      ipv6Peers: Array.from(ipv6Peers.values()),
      allPeers: Array.from(allPeers.values()),
    };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=1800, s-maxage=1800" },
    });
  } catch (error) {
    console.error(`RIPEstat BGP 查询失败（AS${asnNumber}）: ${describeFetchError(error)}`);
    const timedOut = isFetchTimeout(error);
    return NextResponse.json(
      { error: `${timedOut ? "RIPEstat BGP 请求超时" : "RIPEstat BGP 查询失败"}，请稍后重试（${describeFetchError(error)}）` },
      { status: timedOut ? 504 : 502 },
    );
  }
}

export const GET = guarded(getNeighbours, 2);
