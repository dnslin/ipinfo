import type { ProcessedBGPData } from "./bgp-api";
import { getBGPNeighbors, type BGPProtocol, type NeighborProtocol } from "./bgp-explorer";

export interface NetworkNode {
  id: string;
  asn: number;
  name: string;
  isCenter: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NetworkLink {
  source: string;
  target: string;
  sourceNode: NetworkNode;
  targetNode: NetworkNode;
  protocolType: NeighborProtocol | "unknown";
}

export function buildBGPGraph(
  data: ProcessedBGPData,
  selectedAsn: number,
  protocol: BGPProtocol = "both",
  width = 720,
  height = 320,
): { nodes: NetworkNode[]; links: NetworkLink[]; vertical: boolean } | null {
  const selected = getBGPNeighbors(data).find(neighbor => neighbor.asn === selectedAsn);
  if (!selected) return null;
  const protocols: Array<NeighborProtocol | "unknown"> = selected.protocols.length === 0 && protocol === "both"
    ? ["unknown"]
    : selected.protocols.filter(value => protocol === "both" || value === protocol);
  if (protocols.length === 0) return null;

  const vertical = width < 640;
  const nodeWidth = Math.min(220, width - 48);
  const nodeHeight = 80;
  const center: NetworkNode = {
    id: `as${data.centerAsn}`,
    asn: data.centerAsn,
    name: data.centerName,
    isCenter: true,
    x: vertical ? (width - nodeWidth) / 2 : 32,
    y: vertical ? 24 : (height - nodeHeight) / 2,
    width: nodeWidth,
    height: nodeHeight,
  };
  const neighbor: NetworkNode = {
    id: `as${selected.asn}`,
    asn: selected.asn,
    name: selected.name,
    isCenter: false,
    x: vertical ? center.x : width - nodeWidth - 32,
    y: vertical ? height - nodeHeight - 24 : center.y,
    width: nodeWidth,
    height: nodeHeight,
  };
  return {
    nodes: [center, neighbor],
    links: protocols.map(protocolType => ({
      source: center.id,
      target: neighbor.id,
      sourceNode: center,
      targetNode: neighbor,
      protocolType,
    })),
    vertical,
  };
}
