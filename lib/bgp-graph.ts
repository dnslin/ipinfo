import type { ProcessedBGPData } from "./bgp-api";

export type BGPProtocol = "ipv4" | "ipv6" | "both";

export interface NetworkNode {
  id: string;
  asn: number;
  name: string;
  description: string;
  countryCode: string;
  isCenter: boolean;
  x: number;
  y: number;
  color: string;
  protocolType: BGPProtocol;
}

export interface NetworkLink {
  source: string;
  target: string;
  sourceNode: NetworkNode;
  targetNode: NetworkNode;
  protocolType: "ipv4" | "ipv6";
}

export function buildBGPGraph(
  data: ProcessedBGPData,
  protocolType: BGPProtocol,
  height = 600,
): { nodes: NetworkNode[]; links: NetworkLink[] } {
  const ipv4 = new Set(data.ipv4Peers.map(peer => peer.asn));
  const ipv6 = new Set(data.ipv6Peers.map(peer => peer.asn));
  const peers = protocolType === "ipv4" ? data.ipv4Peers
    : protocolType === "ipv6" ? data.ipv6Peers
    : [...new Map([...data.ipv4Peers, ...data.ipv6Peers].map(peer => [peer.asn, peer])).values()];
  const center: NetworkNode = {
    id: `as${data.centerAsn}`,
    asn: data.centerAsn,
    name: data.centerName,
    description: "目标 ASN",
    countryCode: "",
    isCenter: true,
    x: 80,
    y: height / 2 - 25,
    color: "#22c55e",
    protocolType,
  };
  const nodes = [center];
  const links: NetworkLink[] = [];
  const rows = Math.max(1, Math.ceil(Math.sqrt(peers.length * height * 160 / (660 * 70))));

  peers.forEach((peer, index) => {
    const hasIPv4 = ipv4.has(peer.asn);
    const hasIPv6 = ipv6.has(peer.asn);
    const peerProtocol = hasIPv4 && hasIPv6 ? "both" : hasIPv6 ? "ipv6" : "ipv4";
    const node: NetworkNode = {
      id: `as${peer.asn}`,
      asn: peer.asn,
      name: peer.name,
      description: peer.description,
      countryCode: peer.country_code,
      isCenter: false,
      x: 340 + Math.floor(index / rows) * 160,
      y: 80 + (index % rows) * 70,
      color: "#3b82f6",
      protocolType: peerProtocol,
    };
    nodes.push(node);

    for (const protocol of ["ipv4", "ipv6"] as const) {
      if ((protocolType === "both" || protocolType === protocol) && (protocol === "ipv4" ? hasIPv4 : hasIPv6)) {
        links.push({ source: center.id, target: node.id, sourceNode: center, targetNode: node, protocolType: protocol });
      }
    }
  });

  return { nodes, links };
}
