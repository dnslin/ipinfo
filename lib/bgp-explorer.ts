import type { BGPPeer, ProcessedBGPData } from "./bgp-api";

export type BGPProtocol = "ipv4" | "ipv6" | "both";
export type NeighborProtocol = Exclude<BGPProtocol, "both">;

export interface BGPNeighbor extends BGPPeer {
  protocols: NeighborProtocol[];
}

export function getBGPNeighbors(data: ProcessedBGPData): BGPNeighbor[] {
  const ipv4 = new Set(data.ipv4Peers.map(peer => peer.asn));
  const ipv6 = new Set(data.ipv6Peers.map(peer => peer.asn));
  return data.allPeers.map(peer => ({
    ...peer,
    protocols: (["ipv4", "ipv6"] as const).filter(protocol => (protocol === "ipv4" ? ipv4 : ipv6).has(peer.asn)),
  })).sort((a, b) => a.asn - b.asn);
}

export function filterBGPNeighbors(neighbors: BGPNeighbor[], query: string, protocol: BGPProtocol): BGPNeighbor[] {
  const search = query.trim().toLowerCase();
  return neighbors.filter(neighbor =>
    (protocol === "both" || neighbor.protocols.includes(protocol)) &&
    `${neighbor.asn} AS${neighbor.asn} ${neighbor.name} ${neighbor.description} ${neighbor.country_code}`.toLowerCase().includes(search),
  );
}

export function paginateBGPNeighbors(neighbors: BGPNeighbor[], requestedPage: number) {
  const pageSize = 20;
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
