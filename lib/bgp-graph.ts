import type { BGPPosition } from "./bgp-api";
import type { BGPNeighbor, PositionFilter } from "./bgp-explorer";

export interface TopologyNode {
  asn: number;
  name: string;
  position: BGPPosition;
  power: number;
  x: number;
  y: number;
  r: number;
  // 标签沿径向放在节点外侧
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
  // 内圈标签容易与连线重叠，默认隐藏，悬停或选中时显示
  quiet: boolean;
}

export interface Topology {
  center: { x: number; y: number; r: number };
  nodes: TopologyNode[];
  hidden: number;
}

// 角度以 SVG 坐标为准（y 向下）：上游在上半圆，下游在下半圆，方向不确定的放在左右两侧。
const SECTORS: Record<BGPPosition, Array<[number, number]>> = {
  upstream: [[-148, -32]],
  downstream: [[32, 148]],
  uncertain: [[-16, 16], [164, 196]],
};
const LIMITS: Record<BGPPosition, number> = { upstream: 8, downstream: 8, uncertain: 4 };
const SINGLE_LIMIT = 16;

const byPower = (a: BGPNeighbor, b: BGPNeighbor) => b.power - a.power || a.asn - b.asn;

// 只展示观测强度最高的一部分邻居，选中的邻居即使排在后面也保证可见。
export function pickTopologyNeighbors(neighbors: BGPNeighbor[], position: PositionFilter, selectedAsn: number | null): BGPNeighbor[] {
  const groups: BGPPosition[] = position === "all" ? ["upstream", "downstream", "uncertain"] : [position];
  return groups.flatMap(group => {
    const members = neighbors.filter(neighbor => neighbor.position === group).sort(byPower);
    const limit = position === "all" ? LIMITS[group] : SINGLE_LIMIT;
    const shown = members.slice(0, limit);
    const selected = members.find(neighbor => neighbor.asn === selectedAsn);
    if (selected && !shown.includes(selected)) shown.splice(limit - 1, 1, selected);
    return shown;
  });
}

export function buildBGPTopology(neighbors: BGPNeighbor[], position: PositionFilter, selectedAsn: number | null, width: number, height: number): Topology {
  const center = { x: width / 2, y: height / 2, r: 30 };
  const radius = Math.max(60, Math.min(width / 2 - 70, height / 2 - 34));
  const picked = pickTopologyNeighbors(neighbors, position, selectedAsn);
  const maxPower = Math.max(1, ...picked.map(neighbor => neighbor.power));
  const nodes: TopologyNode[] = [];

  const groups: BGPPosition[] = ["upstream", "downstream", "uncertain"];
  for (const group of groups) {
    const members = picked.filter(neighbor => neighbor.position === group);
    if (members.length === 0) continue;
    // 只有一个方向时铺满整圈
    const sectors = position === "all" ? SECTORS[group] : [[-90, 270] as [number, number]];
    const fullCircle = position !== "all";
    members.forEach((neighbor, index) => {
      const sector = sectors[index % sectors.length];
      const slot = Math.floor(index / sectors.length);
      const slots = Math.ceil(members.length / sectors.length);
      const t = fullCircle ? index / members.length : slots === 1 ? 0.5 : slot / (slots - 1);
      const angle = ((sector[0] + (sector[1] - sector[0]) * t) * Math.PI) / 180;
      // 相邻节点交错放在两条半径上，给标签留出空间
      const inner = (fullCircle ? index : slot) % 2 === 1 && members.length > 3;
      const distance = radius * (inner ? 0.74 : 1);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const r = 5 + 9 * Math.sqrt(neighbor.power / maxPower);
      const x = center.x + cos * distance;
      const y = center.y + sin * distance;
      nodes.push({
        asn: neighbor.asn,
        name: neighbor.name,
        position: group,
        power: neighbor.power,
        x,
        y,
        r,
        labelX: x + cos * (r + 6),
        labelY: y + sin * (r + 6) + 4,
        anchor: cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle",
        quiet: inner,
      });
    });
  }

  const total = position === "all" ? neighbors.length : neighbors.filter(neighbor => neighbor.position === position).length;
  return { center, nodes, hidden: Math.max(0, total - nodes.length) };
}
