import { NextRequest, NextResponse } from "next/server";
import type { BGPPeer, ProcessedBGPData } from "@/lib/bgp-api";

interface RISNeighbour {
  asn: number;
  v4_peers?: number;
  v6_peers?: number;
}

function isRISNeighbour(value: unknown): value is RISNeighbour {
  if (typeof value !== "object" || value === null) return false;
  const neighbour = value as RISNeighbour;
  return Number.isInteger(neighbour.asn) && neighbour.asn > 0 && neighbour.asn <= 4294967295
    && (neighbour.v4_peers === undefined || (Number.isInteger(neighbour.v4_peers) && neighbour.v4_peers >= 0))
    && (neighbour.v6_peers === undefined || (Number.isInteger(neighbour.v6_peers) && neighbour.v6_peers >= 0));
}

export async function GET(
  request: NextRequest,
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

    // RIS 观测的是 AS 路径中的邻接，v4/v6_peers 表示按协议观察到的路由数量。
    // https://stat.ripe.net/docs/data-api/api-endpoints/asn-neighbours
    for (const neighbour of neighbours) {
      if (neighbour.v4_peers === 0 && neighbour.v6_peers === 0) continue;
      const peer: BGPPeer = {
        asn: neighbour.asn,
        name: `AS${neighbour.asn}`,
        description: "",
        country_code: "",
      };
      if (neighbour.v4_peers !== undefined && neighbour.v4_peers > 0) ipv4Peers.set(neighbour.asn, peer);
      if (neighbour.v6_peers !== undefined && neighbour.v6_peers > 0) ipv6Peers.set(neighbour.asn, peer);
      allPeers.set(neighbour.asn, peer);
    }

    const data: ProcessedBGPData = {
      centerAsn: asnNumber,
      centerName: `AS${asnNumber}`,
      ipv4Peers: Array.from(ipv4Peers.values()),
      ipv6Peers: Array.from(ipv6Peers.values()),
      allPeers: Array.from(allPeers.values()),
    };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=1800, s-maxage=1800" },
    });
  } catch (error) {
    console.error(`RIPEstat BGP 查询失败（AS${asnNumber}）:`, error);
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "RIPEstat BGP 请求超时，请稍后重试" : "RIPEstat BGP 查询失败，请稍后重试" },
      { status: timedOut ? 504 : 502 },
    );
  }
}
