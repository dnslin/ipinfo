import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BGPNeighbor, paginateBGPNeighbors } from "@/lib/bgp-explorer";

type NeighborPage = ReturnType<typeof paginateBGPNeighbors>;

interface NeighborListProps {
  neighbors: BGPNeighbor[];
  targetAsn: number;
  selectedAsn: number | null;
  showMetadata: boolean;
  onSelect: (asn: number) => void;
}

export function NeighborList({ neighbors, targetAsn, selectedAsn, showMetadata, onSelect }: NeighborListProps) {
  const columns = showMetadata ? "sm:grid-cols-[7rem_minmax(0,1fr)_7rem_5rem]" : "sm:grid-cols-[minmax(0,1fr)_7rem_5rem]";
  return <div>
    <div className={`sticky top-0 z-10 hidden ${columns} gap-3 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2 text-xs text-[rgb(var(--color-text-secondary))] sm:grid`}>
      <span>ASN</span>{showMetadata ? <span>网络名称 / 描述</span> : null}<span>观测协议</span><span className="text-right">关系</span>
    </div>
    <ul aria-label="相邻网络列表" className="divide-y divide-[rgb(var(--color-border))]">
      {neighbors.map(neighbor => {
        const name = neighbor.name !== `AS${neighbor.asn}` ? neighbor.name : "";
        const metadata = name || neighbor.description || neighbor.country_code;
        return <li key={neighbor.asn}>
          <button
            id={`bgp-neighbor-${neighbor.asn}`}
            type="button"
            aria-label={`查看 AS${neighbor.asn} 与 AS${targetAsn} 的关系`}
            aria-current={selectedAsn === neighbor.asn ? "true" : undefined}
            onClick={() => onSelect(neighbor.asn)}
            className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors ${columns} ${selectedAsn === neighbor.asn ? "bg-[rgb(var(--color-surface-hover))]" : "hover:bg-[rgb(var(--color-surface-hover))]"}`}
          >
            <span className="font-mono text-sm font-medium text-[rgb(var(--color-text-primary))]">AS{neighbor.asn}</span>
            {showMetadata ? <span className={`col-span-2 min-w-0 break-words text-sm text-[rgb(var(--color-text-secondary))] sm:col-span-1 sm:col-start-2 sm:row-start-1 ${metadata ? "" : "hidden sm:block"}`}>
              {metadata || "—"}
              {neighbor.country_code && neighbor.country_code !== metadata ? <span className="ml-2 text-xs">{neighbor.country_code}</span> : null}
              {name && neighbor.description && neighbor.description !== name ? <span className="mt-0.5 block text-xs">{neighbor.description}</span> : null}
            </span> : null}
            <span className={`col-start-2 row-start-1 flex items-center justify-end gap-2 sm:justify-start ${showMetadata ? "sm:col-start-3" : "sm:col-start-2"}`}>
              <span className="ui-badge whitespace-nowrap text-xs">{neighbor.protocols.length === 0 ? "协议未提供" : neighbor.protocols.map(protocol => protocol === "ipv4" ? "IPv4" : "IPv6").join(" · ")}</span>
              <ChevronRight className="h-4 w-4 text-[rgb(var(--color-text-secondary))] sm:hidden" />
            </span>
            <span className="hidden items-center justify-end gap-1 text-xs text-[rgb(var(--color-text-secondary))] sm:flex">查看<ChevronRight className="h-3.5 w-3.5" /></span>
          </button>
        </li>;
      })}
    </ul>
  </div>;
}

export function NeighborPagination({ page, onPageChange }: { page: NeighborPage; onPageChange: (page: number) => void }) {
  return <nav aria-label="邻接列表分页" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[rgb(var(--color-border))] px-4 py-3">
    <span className="text-xs tabular-nums text-[rgb(var(--color-text-secondary))]" aria-live="polite">{page.start}–{page.end} / {page.total} 个网络</span>
    <div className="flex items-center gap-2">
      <button type="button" className="ui-button ui-icon-button" aria-label="上一页邻接网络" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}><ChevronLeft className="h-4 w-4" /></button>
      <form key={`${page.page}-${page.pageCount}`} className="flex items-center gap-2" onSubmit={event => {
        event.preventDefault();
        onPageChange(Number(new FormData(event.currentTarget).get("page")));
      }}>
        <label className="flex items-center gap-1 text-xs text-[rgb(var(--color-text-secondary))]">
          <span className="sr-only">跳转邻接列表页</span>
          <input type="number" name="page" aria-label="跳转邻接列表页" min={1} max={page.pageCount} step={1} required inputMode="numeric" defaultValue={page.page} className="ui-input h-11 w-16 px-2 font-mono text-sm" />
          <span>/ {page.pageCount}</span>
        </label>
        <button type="submit" className="ui-button">跳转</button>
      </form>
      <button type="button" className="ui-button ui-icon-button" aria-label="下一页邻接网络" disabled={page.page >= page.pageCount} onClick={() => onPageChange(page.page + 1)}><ChevronRight className="h-4 w-4" /></button>
    </div>
  </nav>;
}
