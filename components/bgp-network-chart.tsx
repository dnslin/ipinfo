"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ProcessedBGPData } from "@/lib/bgp-api";
import type { BGPProtocol } from "@/lib/bgp-explorer";
import { buildBGPGraph } from "@/lib/bgp-graph";

interface BGPNetworkChartProps {
  data: ProcessedBGPData;
  selectedAsn: number;
  protocolType: BGPProtocol;
}

export default function BGPNetworkChart({ data, selectedAsn, protocolType }: BGPNetworkChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const height = 320;
  const graph = useMemo(() => width === null ? null : buildBGPGraph(data, selectedAsn, protocolType, width, height), [data, selectedAsn, protocolType, width]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !groupRef.current || !graph) return;
    const svg = d3.select(svgRef.current);
    const group = d3.select(groupRef.current);
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.75, 2.5])
      .on("zoom", event => group.attr("transform", event.transform));
    zoomRef.current = zoom;
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity);
    return () => {
      svg.on(".zoom", null);
      zoomRef.current = null;
    };
  }, [graph]);

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, factor);
  };
  const reset = () => {
    if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.transform, d3.zoomIdentity);
  };

  const exportImage = async () => {
    const svg = svgRef.current;
    if (!svg || width === null) return;
    let imageUrl: string | undefined;
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const originals = [svg, ...svg.querySelectorAll("*")];
      const copies = [clone, ...clone.querySelectorAll("*")];
      originals.forEach((element, index) => {
        const style = getComputedStyle(element);
        for (const property of ["fill", "stroke", "font-family", "font-size", "font-weight"]) {
          copies[index].setAttribute(property, style.getPropertyValue(property));
        }
      });
      imageUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("无法生成关系图片"));
        image.src = imageUrl!;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * 2);
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法生成图片");
      context.fillStyle = getComputedStyle(svg).backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.download = `as${data.centerAsn}-as${selectedAsn}-relationship.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      toast.error("导出失败", { description: error instanceof Error ? error.message : "无法生成关系图片" });
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    }
  };

  return (
    <div ref={containerRef} className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] px-3 py-2">
        <span className="text-xs text-[rgb(var(--color-text-secondary))]">可拖拽平移</span>
        <div className="flex items-center gap-1">
          <button type="button" className="ui-button ui-icon-button" aria-label="放大关系图" title="放大" onClick={() => zoomBy(1.2)}><Plus className="h-4 w-4" /></button>
          <button type="button" className="ui-button ui-icon-button" aria-label="缩小关系图" title="缩小" onClick={() => zoomBy(0.8)}><Minus className="h-4 w-4" /></button>
          <button type="button" className="ui-button ui-icon-button" aria-label="重置关系图" title="重置" onClick={reset}><RotateCcw className="h-4 w-4" /></button>
          <button type="button" className="ui-button ui-icon-button" aria-label="导出关系图" title="导出 PNG" onClick={exportImage}><Download className="h-4 w-4" /></button>
        </div>
      </div>
      {width === null ? <div className="ui-empty-state flex flex-col items-center justify-center h-80" role="status">正在准备关系视图…</div> : graph === null ? (
        <div className="ui-empty-state flex flex-col items-center justify-center h-80" role="status">当前筛选没有可展示的协议记录，可切换“全部”查看邻接关系。</div>
      ) : (
        <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`AS${data.centerAsn} 与 AS${selectedAsn} 的观测邻接关系`} style={{ background: "rgb(var(--color-surface))", touchAction: "none" }}>
          <g ref={groupRef}>
            {graph.links.map((link, index) => {
              const offset = graph.links.length === 1 ? 0 : index === 0 ? -24 : 24;
              const source = link.sourceNode;
              const target = link.targetNode;
              const middleX = width / 2 + offset;
              const middleY = height / 2 + offset;
              const path = graph.vertical
                ? `M${middleX},${source.y + source.height}V${target.y}`
                : `M${source.x + source.width},${middleY}H${target.x}`;
              return <g key={link.protocolType}>
                <path d={path} fill="none" stroke="rgb(var(--color-text-secondary))" strokeWidth="1.5" strokeDasharray={link.protocolType === "unknown" ? "2 5" : link.protocolType === "ipv6" ? "5 5" : undefined} />
                <text x={graph.vertical ? middleX + (index === 0 ? -8 : 8) : width / 2} y={graph.vertical ? height / 2 : middleY - 8} textAnchor={graph.vertical ? index === 0 ? "end" : "start" : "middle"} fill="rgb(var(--color-text-secondary))" fontSize="12">{link.protocolType === "unknown" ? "邻接（协议未提供）" : link.protocolType === "ipv4" ? "IPv4" : "IPv6"}</text>
              </g>;
            })}
            {graph.nodes.map(node => <g key={node.id} transform={`translate(${node.x},${node.y})`}>
              <rect width={node.width} height={node.height} rx="8" fill="rgb(var(--color-surface-hover))" stroke={node.isCenter ? "rgb(var(--color-border))" : "rgb(var(--color-primary))"} />
              <text x={node.width / 2} y="23" textAnchor="middle" fill="rgb(var(--color-text-secondary))" fontSize="11">{node.isCenter ? "查询目标" : "当前选择"}</text>
              <text x={node.width / 2} y="50" textAnchor="middle" fill="rgb(var(--color-text-primary))" fontSize="18" className="font-mono">AS{node.asn}</text>
              {node.name && node.name !== `AS${node.asn}` ? <text x={node.width / 2} y="68" textAnchor="middle" fill="rgb(var(--color-text-secondary))" fontSize="11">{node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}</text> : null}
            </g>)}
          </g>
        </svg>
      )}
    </div>
  );
}
