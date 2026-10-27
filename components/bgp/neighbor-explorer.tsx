"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ProcessedBGPData } from "@/lib/bgp-api";
import { POSITION_LABELS, countBGPPositions, filterBGPNeighbors, getBGPNeighbors, paginateBGPNeighbors, sortBGPNeighbors, type BGPProtocol, type NeighborSort, type PositionFilter } from "@/lib/bgp-explorer";
import BGPNetworkChart from "@/components/bgp-network-chart";
import ProtocolFilter from "./protocol-filter";
import { NeighborList, NeighborPagination } from "./neighbor-list";
import NeighborDetail from "./neighbor-detail";

const positions: PositionFilter[] = ["all", "upstream", "downstream", "uncertain"];

export default function NeighborExplorer({ data, onDrill }: { data: ProcessedBGPData; onDrill: (asn: number, name?: string) => void }) {
  const neighbors = useMemo(() => getBGPNeighbors(data), [data]);
  const hasPower = neighbors.some(neighbor => neighbor.power > 0);
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState<BGPProtocol>("both");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [sort, setSort] = useState<NeighborSort>(hasPower ? "power" : "asn");
  const [requestedPage, setPage] = useState(1);
  const [selectedAsn, setSelectedAsn] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => countBGPPositions(neighbors), [neighbors]);
  const maxPower = useMemo(() => Math.max(1, ...neighbors.map(neighbor => neighbor.power)), [neighbors]);
  const ranks = useMemo(() => new Map(sortBGPNeighbors(neighbors, "power").map((neighbor, index) => [neighbor.asn, index + 1])), [neighbors]);
  // 关系图跟随搜索和协议筛选，方向由图本身的分区表达
  const matching = useMemo(() => filterBGPNeighbors(neighbors, query, protocol), [neighbors, query, protocol]);
  const filtered = useMemo(() => sortBGPNeighbors(position === "all" ? matching : matching.filter(neighbor => neighbor.position === position), sort), [matching, position, sort]);
  const page = paginateBGPNeighbors(filtered, requestedPage);
  const selected = neighbors.find(neighbor => neighbor.asn === selectedAsn) ?? null;
  const unknownProtocols = neighbors.filter(neighbor => neighbor.protocols.length === 0).length;

  // 任何筛选变化都回到第一页并滚回列表顶部
  const resetPage = () => {
    setPage(1);
    if (listRef.current) listRef.current.scrollTop = 0;
  };
  const select = (asn: number) => {
    setSelectedAsn(current => current === asn ? null : asn);
    // 窄屏上详情在列表下方，选中后滚到可见位置
    requestAnimationFrame(() => {
      if (detailRef.current && window.matchMedia("(max-width: 1023px)").matches) detailRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return <div className="bgp-explorer">
    <section className="bgp-overview" aria-label="邻接概况">
      <div className="bgp-target">
        <p className="bgp-eyebrow">查询目标</p>
        <p className="bgp-target-asn font-mono">AS{data.centerAsn}</p>
        {data.centerName && data.centerName !== `AS${data.centerAsn}` ? <p className="bgp-target-name">{data.centerName}</p> : null}
      </div>
      <div className="bgp-stats" role="group" aria-label="按路径方向筛选">
        {positions.map(value => {
          const count = value === "all" ? neighbors.length : counts[value];
          return <button key={value} type="button" className="bgp-stat" data-position={value} aria-pressed={position === value} onClick={() => { setPosition(value); resetPage(); }}>
            <span className="bgp-stat-label">{value !== "all" ? <i aria-hidden="true" /> : null}{value === "all" ? "相邻网络" : POSITION_LABELS[value]}</span>
            <span className="bgp-stat-value font-mono">{count.toLocaleString()}</span>
          </button>;
        })}
      </div>
      <p className="bgp-overview-note">
        {unknownProtocols > 0 && unknownProtocols === neighbors.length
          ? "上游未提供协议信息"
          : `IPv4 ${data.ipv4Peers.length.toLocaleString()} · IPv6 ${data.ipv6Peers.length.toLocaleString()}${unknownProtocols > 0 ? ` · 协议未提供 ${unknownProtocols.toLocaleString()}` : ""}`}
        <span aria-hidden="true"> · </span>方向按 AS 路径位置划分，不等同于商业关系
      </p>
    </section>

    <div className="bgp-body">
      <section className="bgp-list-pane" aria-label="相邻网络">
        <div className="bgp-toolbar">
          <label className="bgp-search">
            <Search aria-hidden="true" />
            <input type="search" className="ui-input" aria-label="搜索相邻网络" placeholder="搜索 ASN 或网络名称" value={query} onChange={event => { setQuery(event.target.value); resetPage(); }} />
          </label>
          <ProtocolFilter value={protocol} onChange={value => { setProtocol(value); resetPage(); }} />
          {hasPower ? <select className="ui-input bgp-sort" aria-label="排序方式" value={sort} onChange={event => { setSort(event.target.value as NeighborSort); resetPage(); }}>
            <option value="power">按观测强度</option>
            <option value="asn">按 ASN</option>
          </select> : null}
        </div>
        <div ref={listRef} className="bgp-list-scroll">
          {page.items.length > 0
            ? <NeighborList neighbors={page.items} targetAsn={data.centerAsn} selectedAsn={selectedAsn} maxPower={hasPower ? maxPower : 0} onSelect={select} />
            : <div className="bgp-state" role="status">
              <p className="bgp-state-title">{neighbors.length === 0 ? "暂未观测到相邻网络" : "没有匹配的网络"}</p>
              {neighbors.length > 0
                ? <><p className="bgp-state-text">试试其他 ASN、名称、方向或协议。</p><button type="button" className="ui-button" onClick={() => { setQuery(""); setProtocol("both"); setPosition("all"); resetPage(); }}>清除筛选</button></>
                : <p className="bgp-state-text">RIPE RIS 当前没有返回此 ASN 的邻接记录。</p>}
            </div>}
        </div>
        <NeighborPagination page={page} onPageChange={value => { setPage(value); if (listRef.current) listRef.current.scrollTop = 0; }} />
      </section>

      <aside className="bgp-side-pane" aria-label="邻接图与详情">
        <BGPNetworkChart neighbors={matching} position={position} centerAsn={data.centerAsn} centerName={data.centerName} selectedAsn={selectedAsn} onSelect={select} />
        <div ref={detailRef}>
          <NeighborDetail neighbor={selected} centerAsn={data.centerAsn} rank={selected ? ranks.get(selected.asn) : undefined} total={neighbors.length} hasPower={hasPower} onDrill={onDrill} onClose={() => setSelectedAsn(null)} />
        </div>
      </aside>
    </div>
  </div>;
}
