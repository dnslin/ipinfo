import { ChevronLeft, ChevronRight } from "lucide-react";
import { POSITION_LABELS, type BGPNeighbor, type paginateBGPNeighbors } from "@/lib/bgp-explorer";

type NeighborPage = ReturnType<typeof paginateBGPNeighbors>;

interface NeighborListProps {
  neighbors: BGPNeighbor[];
  targetAsn: number;
  selectedAsn: number | null;
  // 0 表示上游未提供观测强度，隐藏强度列
  maxPower: number;
  onSelect: (asn: number) => void;
}

export function NeighborList({ neighbors, targetAsn, selectedAsn, maxPower, onSelect }: NeighborListProps) {
  return <div className="bgp-list" data-power={maxPower > 0 || undefined}>
    <div className="bgp-row bgp-list-head" aria-hidden="true">
      <span>ASN</span><span>网络</span><span>路径方向</span>{maxPower > 0 ? <span>观测强度</span> : null}<span className="text-right">协议</span>
    </div>
    <ul aria-label="相邻网络列表">
    {neighbors.map(neighbor => {
      const named = neighbor.name && neighbor.name !== `AS${neighbor.asn}`;
      const selected = selectedAsn === neighbor.asn;
      return <li key={neighbor.asn}>
        <button
          id={`bgp-neighbor-${neighbor.asn}`}
          type="button"
          className="bgp-row"
          aria-label={`AS${neighbor.asn}${named ? ` ${neighbor.name}` : ""}，${POSITION_LABELS[neighbor.position]}，查看与 AS${targetAsn} 的邻接详情`}
          aria-pressed={selected}
          onClick={() => onSelect(neighbor.asn)}
        >
          <span className="bgp-row-asn font-mono">AS{neighbor.asn}</span>
          <span className="bgp-row-name">
            <span>{named ? neighbor.name : <span className="bgp-muted">名称未提供</span>}</span>
            {neighbor.description || neighbor.country_code ? <small>{[neighbor.description, neighbor.country_code].filter(Boolean).join(" · ")}</small> : null}
          </span>
          <span className="bgp-position" data-position={neighbor.position}><i aria-hidden="true" />{POSITION_LABELS[neighbor.position]}</span>
          {maxPower > 0 ? <span className="bgp-power" title={`观测强度 ${neighbor.power}`}>
            <span className="bgp-power-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, (neighbor.power / maxPower) * 100)}%` }} /></span>
            <span className="font-mono">{neighbor.power}</span>
          </span> : null}
          <span className="bgp-protocols" title={neighbor.protocols.length === 0 ? "协议未提供" : undefined}>
            <span data-on={neighbor.protocols.includes("ipv4") || undefined}>v4</span>
            <span data-on={neighbor.protocols.includes("ipv6") || undefined}>v6</span>
          </span>
        </button>
      </li>;
    })}
    </ul>
  </div>;
}

export function NeighborPagination({ page, onPageChange }: { page: NeighborPage; onPageChange: (page: number) => void }) {
  return <nav aria-label="邻接列表分页" className="bgp-pagination">
    <span className="tabular-nums" aria-live="polite">{page.start}–{page.end} / {page.total.toLocaleString()}</span>
    <div className="bgp-pagination-controls">
      <button type="button" className="ui-button ui-icon-button" aria-label="上一页邻接网络" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}><ChevronLeft className="h-4 w-4" /></button>
      <form key={`${page.page}-${page.pageCount}`} onSubmit={event => {
        event.preventDefault();
        onPageChange(Number(new FormData(event.currentTarget).get("page")));
      }}>
        <input type="number" name="page" aria-label="跳转邻接列表页" min={1} max={page.pageCount} step={1} required inputMode="numeric" defaultValue={page.page} className="ui-input font-mono" />
        <span>/ {page.pageCount}</span>
      </form>
      <button type="button" className="ui-button ui-icon-button" aria-label="下一页邻接网络" disabled={page.page >= page.pageCount} onClick={() => onPageChange(page.page + 1)}><ChevronRight className="h-4 w-4" /></button>
    </div>
  </nav>;
}
