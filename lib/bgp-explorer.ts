import type { BGPPeer, BGPPosition, ProcessedBGPData } from "./bgp-api";

export type BGPProtocol = "ipv4" | "ipv6" | "both";
export type NeighborProtocol = Exclude<BGPProtocol, "both">;
export type PositionFilter = BGPPosition | "all";
export type NeighborSort = "power" | "asn";

export interface BGPNeighbor extends BGPPeer {
  protocols: NeighborProtocol[];
  position: BGPPosition;
  power: number;
}

export const POSITION_LABELS: Record<BGPPosition, string> = {
  upstream: "上游侧",
  downstream: "下游侧",
  uncertain: "方向不确定",
};

export function getBGPNeighbors(data: ProcessedBGPData): BGPNeighbor[] {
  const ipv4 = new Set(data.ipv4Peers.map(peer => peer.asn));
  const ipv6 = new Set(data.ipv6Peers.map(peer => peer.asn));
  return data.allPeers.map(peer => ({
    ...peer,
    position: peer.position ?? "uncertain",
    power: peer.power ?? 0,
    protocols: (["ipv4", "ipv6"] as const).filter(protocol => (protocol === "ipv4" ? ipv4 : ipv6).has(peer.asn)),
  })).sort((a, b) => a.asn - b.asn);
}

export function countBGPPositions(neighbors: BGPNeighbor[]): Record<BGPPosition, number> {
  const counts = { upstream: 0, downstream: 0, uncertain: 0 };
  for (const neighbor of neighbors) counts[neighbor.position] += 1;
  return counts;
}

// 观测强度相同时按 ASN 排序，保证分页稳定。
export function sortBGPNeighbors(neighbors: BGPNeighbor[], sort: NeighborSort): BGPNeighbor[] {
  return [...neighbors].sort((a, b) => sort === "power" ? b.power - a.power || a.asn - b.asn : a.asn - b.asn);
}

export function filterBGPNeighbors(neighbors: BGPNeighbor[], query: string, protocol: BGPProtocol, position: PositionFilter = "all"): BGPNeighbor[] {
  const search = query.trim().toLowerCase().replace(/^as(?=\d)/, "");
  return neighbors.filter(neighbor =>
    (protocol === "both" || neighbor.protocols.includes(protocol)) &&
    (position === "all" || neighbor.position === position) &&
    `${neighbor.asn} AS${neighbor.asn} ${neighbor.name} ${neighbor.description} ${neighbor.country_code}`.toLowerCase().includes(search),
  );
}

export function paginateBGPNeighbors(neighbors: BGPNeighbor[], requestedPage: number, pageSize = 20) {
  const total = neighbors.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  const offset = (page - 1) * pageSize;
  return {
    items: neighbors.slice(offset, offset + pageSize),
    page,
    pageCount,
    total,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + pageSize, total),
  };
}
