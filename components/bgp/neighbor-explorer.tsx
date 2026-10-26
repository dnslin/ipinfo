"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { ProcessedBGPData } from "@/lib/bgp-api";
import { filterBGPNeighbors, getBGPNeighbors, paginateBGPNeighbors, type BGPProtocol } from "@/lib/bgp-explorer";
import BGPNetworkChart from "@/components/bgp-network-chart";
import ProtocolFilter from "./protocol-filter";
import { NeighborList, NeighborPagination } from "./neighbor-list";

export default function NeighborExplorer({ data }: { data: ProcessedBGPData }) {
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState<BGPProtocol>("both");
  const [requestedPage, setPage] = useState(1);
  const [selectedAsn, setSelectedAsn] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "relationship">("list");
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const neighbors = useMemo(() => getBGPNeighbors(data), [data]);
  const showMetadata = useMemo(() => neighbors.some(neighbor => Boolean(neighbor.description || neighbor.country_code || (neighbor.name && neighbor.name !== `AS${neighbor.asn}`))), [neighbors]);
  const filtered = useMemo(() => filterBGPNeighbors(neighbors, query, protocol), [neighbors, query, protocol]);
  const page = paginateBGPNeighbors(filtered, requestedPage);
  const selected = neighbors.find(neighbor => neighbor.asn === selectedAsn);
  const unknownProtocolCount = neighbors.filter(neighbor => neighbor.protocols.length === 0).length;
  const protocolSummary = unknownProtocolCount > 0 && unknownProtocolCount === neighbors.length
    ? `协议信息未提供 · ${unknownProtocolCount} 个网络`
    : `${unknownProtocolCount > 0 ? "已知 " : ""}IPv4 ${data.ipv4Peers.length} · IPv6 ${data.ipv6Peers.length}${unknownProtocolCount > 0 ? ` · 未标记 ${unknownProtocolCount}` : ""}`;

  const changeProtocol = (value: BGPProtocol) => {
    if (value === protocol) return;
    listScrollTop.current = 0;
    setProtocol(value);
    setPage(1);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const changePage = (value: number) => {
    listScrollTop.current = 0;
    setPage(value);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const showList = () => {
    setView("list");
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = listScrollTop.current;
      const selectedButton = document.getElementById(`bgp-neighbor-${selectedAsn}`);
      if (selectedButton) selectedButton.focus({ preventScroll: true });
      else searchRef.current?.focus();
    });
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    {view === "list" ? <>
      <div className="shrink-0 space-y-3 border-b border-[rgb(var(--color-border))] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-medium text-[rgb(var(--color-text-primary))]">相邻网络 <span className="ml-1 font-mono">{neighbors.length}</span></p>
          <p className="text-xs text-[rgb(var(--color-text-secondary))]">{protocolSummary}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-text-secondary))]" />
            <input ref={searchRef} type="search" className="ui-input h-11 w-full !pl-10" aria-label="搜索相邻网络" placeholder={showMetadata ? "搜索 ASN、名称或描述" : "搜索 ASN"} value={query} onChange={event => {
              listScrollTop.current = 0;
              setQuery(event.target.value);
              setPage(1);
              if (scrollRef.current) scrollRef.current.scrollTop = 0;
            }} />
          </div>
          <ProtocolFilter value={protocol} onChange={changeProtocol} />
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {page.items.length > 0 ? <NeighborList neighbors={page.items} targetAsn={data.centerAsn} selectedAsn={selectedAsn} showMetadata={showMetadata} onSelect={asn => {
          listScrollTop.current = scrollRef.current?.scrollTop ?? 0;
          setSelectedAsn(asn);
          setView("relationship");
        }} /> : <div className="ui-empty-state flex flex-col items-center justify-center min-h-56 gap-3 px-6 text-center" role="status">
          <p className="font-medium text-[rgb(var(--color-text-primary))]">{neighbors.length === 0 ? "暂未观测到相邻网络" : "没有匹配的网络"}</p>
          {neighbors.length > 0 ? <><p className="text-sm text-[rgb(var(--color-text-secondary))]">试试其他 ASN、名称或协议。</p><button type="button" className="ui-button" onClick={() => { setQuery(""); changeProtocol("both"); }}>清除筛选</button></> : <p className="text-sm text-[rgb(var(--color-text-secondary))]">RIPE RIS 当前没有返回此 ASN 的邻接记录。</p>}
        </div>}
      </div>
      <NeighborPagination page={page} onPageChange={changePage} />
    </> : selected ? <>
      <div className="flex shrink-0 flex-col gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <button type="button" autoFocus className="ui-button self-start" onClick={showList}><ArrowLeft className="h-4 w-4" />返回邻接列表</button>
        <ProtocolFilter value={protocol} onChange={changeProtocol} />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div>
          <h3 className="text-base font-medium text-[rgb(var(--color-text-primary))]">当前选择 <span className="font-mono">AS{selected.asn}</span></h3>
          {selected.name && selected.name !== `AS${selected.asn}` ? <p className="mt-1 break-words text-sm text-[rgb(var(--color-text-secondary))]">{selected.name}</p> : null}
          {selected.description ? <p className="mt-1 break-words text-sm text-[rgb(var(--color-text-secondary))]">{selected.description}</p> : null}
          <p className="mt-2 text-xs text-[rgb(var(--color-text-secondary))]">{selected.protocols.length === 0 ? "协议未提供" : `观测协议：${selected.protocols.map(value => value === "ipv4" ? "IPv4" : "IPv6").join(" / ")}`}{selected.country_code ? ` · 国家/地区：${selected.country_code}` : ""}</p>
          <p className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]">仅展示 AS{data.centerAsn} 与当前选择的邻接关系。</p>
        </div>
        <BGPNetworkChart data={data} selectedAsn={selected.asn} protocolType={protocol} />
      </div>
    </> : null}
  </div>;
}
