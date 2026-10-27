"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { POSITION_LABELS, type BGPNeighbor, type PositionFilter } from "@/lib/bgp-explorer";
import { buildBGPTopology } from "@/lib/bgp-graph";

interface BGPNetworkChartProps {
  neighbors: BGPNeighbor[];
  position: PositionFilter;
  centerAsn: number;
  centerName: string;
  selectedAsn: number | null;
  onSelect: (asn: number) => void;
}

export default function BGPNetworkChart({ neighbors, position, centerAsn, centerName, selectedAsn, onSelect }: BGPNetworkChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const height = width !== null && width < 420 ? 300 : 340;
  const topology = useMemo(() => width === null ? null : buildBGPTopology(neighbors, position, selectedAsn, width, height), [neighbors, position, selectedAsn, width, height]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
        for (const property of ["fill", "stroke", "stroke-width", "stroke-opacity", "fill-opacity", "opacity", "font-family", "font-size", "font-weight"]) {
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
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法生成图片");
      context.fillStyle = getComputedStyle(containerRef.current!).backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.download = `as${centerAsn}-neighbours.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      toast.error("导出失败", { description: error instanceof Error ? error.message : "无法生成关系图片" });
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    }
  };

  const centerLabel = centerName && centerName !== `AS${centerAsn}` ? (centerName.length > 18 ? `${centerName.slice(0, 17)}…` : centerName) : "";

  return (
    <figure className="bgp-chart">
      <figcaption className="bgp-chart-head">
        <span>邻接关系图</span>
        <button type="button" className="ui-button ui-icon-button" aria-label="导出关系图 PNG" title="导出 PNG" onClick={exportImage} disabled={!topology || topology.nodes.length === 0}><Download className="h-4 w-4" /></button>
      </figcaption>
      <div ref={containerRef} className="bgp-chart-canvas">
        {topology === null ? <div className="bgp-state" style={{ height }} role="status">正在准备关系图…</div> : topology.nodes.length === 0 ? (
          <div className="bgp-state" style={{ height }} role="status">当前筛选没有可展示的邻居。</div>
        ) : (
          <svg ref={svgRef} width={width ?? 0} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`AS${centerAsn} 的观测邻接，按观测强度显示前 ${topology.nodes.length} 个`}>
            <g className="bgp-chart-links">
              {topology.nodes.map(node => <line key={node.asn} x1={topology.center.x} y1={topology.center.y} x2={node.x} y2={node.y} data-position={node.position} data-selected={node.asn === selectedAsn || undefined} />)}
            </g>
            <g className="bgp-chart-center">
              <circle cx={topology.center.x} cy={topology.center.y} r={topology.center.r} />
              <text x={topology.center.x} y={topology.center.y + 4} textAnchor="middle" className="font-mono">AS{centerAsn}</text>
              {centerLabel ? <text x={topology.center.x} y={topology.center.y + topology.center.r + 15} textAnchor="middle" className="bgp-chart-center-name">{centerLabel}</text> : null}
            </g>
            {topology.nodes.map(node => {
              const selected = node.asn === selectedAsn;
              const label = `AS${node.asn}${node.name && node.name !== `AS${node.asn}` ? ` ${node.name}` : ""}，${POSITION_LABELS[node.position]}，观测强度 ${node.power}`;
              return <g
                key={node.asn}
                className="bgp-chart-node"
                data-position={node.position}
                data-selected={selected || undefined}
                data-quiet={node.quiet || undefined}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onSelect(node.asn)}
                onKeyDown={event => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(node.asn);
                }}
              >
                <title>{label}</title>
                <circle cx={node.x} cy={node.y} r={node.r + 8} className="bgp-chart-hit" />
                <circle cx={node.x} cy={node.y} r={node.r} />
                <text x={node.labelX} y={node.labelY} textAnchor={node.anchor} className="font-mono">AS{node.asn}</text>
              </g>;
            })}
          </svg>
        )}
      </div>
      <div className="bgp-legend">
        {(["upstream", "downstream", "uncertain"] as const).map(value => <span key={value} data-position={value}><i aria-hidden="true" />{POSITION_LABELS[value]}</span>)}
        {topology && topology.hidden > 0 ? <span className="bgp-legend-note">按观测强度显示前 {topology.nodes.length} 个，另有 {topology.hidden.toLocaleString()} 个见列表</span> : null}
      </div>
    </figure>
  );
}
