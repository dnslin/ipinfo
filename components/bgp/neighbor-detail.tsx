import { ArrowUpRight, Network, X } from "lucide-react";
import { POSITION_LABELS, type BGPNeighbor } from "@/lib/bgp-explorer";

const POSITION_NOTES = {
  upstream: "在 AS 路径中位于查询目标之前，更靠近观测点，通常是上游或对等方向。",
  downstream: "在 AS 路径中位于查询目标之后，更靠近路由源，通常是下游方向。",
  uncertain: "RIS 观测中的路径位置不固定或不足以判断方向。",
};

interface NeighborDetailProps {
  neighbor: BGPNeighbor | null;
  centerAsn: number;
  rank?: number;
  total: number;
  hasPower: boolean;
  onDrill: (asn: number, name?: string) => void;
  onClose: () => void;
}

export default function NeighborDetail({ neighbor, centerAsn, rank, total, hasPower, onDrill, onClose }: NeighborDetailProps) {
  if (!neighbor) return <div className="bgp-detail bgp-detail-empty">在列表或关系图中选择一个邻居，查看它与 AS{centerAsn} 的观测详情。</div>;
  const named = neighbor.name && neighbor.name !== `AS${neighbor.asn}`;
  return <section className="bgp-detail" aria-label={`AS${neighbor.asn} 详情`}>
    <div className="bgp-detail-head">
      <div className="min-w-0">
        <p className="bgp-detail-asn font-mono">AS{neighbor.asn}</p>
        <p className="bgp-detail-name">{named ? neighbor.name : "名称未提供"}</p>
        {neighbor.description || neighbor.country_code ? <p className="bgp-detail-sub">{[neighbor.description, neighbor.country_code].filter(Boolean).join(" · ")}</p> : null}
      </div>
      <button type="button" className="ui-button ui-icon-button" aria-label="取消选择" onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
    <dl className="bgp-detail-rows">
      <div><dt>路径方向</dt><dd><span className="bgp-position" data-position={neighbor.position}><i aria-hidden="true" />{POSITION_LABELS[neighbor.position]}</span><small>{POSITION_NOTES[neighbor.position]}</small></dd></div>
      {hasPower ? <div><dt>观测强度</dt><dd><span className="font-mono">{neighbor.power}</span>{rank ? <small>在 {total.toLocaleString()} 个邻居中排第 {rank}</small> : null}</dd></div> : null}
      <div><dt>IPv4</dt><dd>{neighbor.protocols.includes("ipv4") ? <><span className="font-mono">{neighbor.v4Peers?.toLocaleString() ?? "—"}</span><small>RIS 观测计数</small></> : <span className="bgp-muted">{neighbor.protocols.length === 0 ? "协议未提供" : "未观测到"}</span>}</dd></div>
      <div><dt>IPv6</dt><dd>{neighbor.protocols.includes("ipv6") ? <><span className="font-mono">{neighbor.v6Peers?.toLocaleString() ?? "—"}</span><small>RIS 观测计数</small></> : <span className="bgp-muted">{neighbor.protocols.length === 0 ? "协议未提供" : "未观测到"}</span>}</dd></div>
    </dl>
    <div className="bgp-detail-actions">
      <button type="button" className="ui-button ui-button-primary" onClick={() => onDrill(neighbor.asn, named ? neighbor.name : undefined)}><Network className="h-4 w-4" />查看它的邻接</button>
      <a className="ui-button" href={`https://stat.ripe.net/AS${neighbor.asn}`} target="_blank" rel="noreferrer">RIPEstat<ArrowUpRight className="h-3.5 w-3.5" /></a>
      <a className="ui-button" href={`https://bgp.tools/as/${neighbor.asn}`} target="_blank" rel="noreferrer">bgp.tools<ArrowUpRight className="h-3.5 w-3.5" /></a>
    </div>
  </section>;
}
