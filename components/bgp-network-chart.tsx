'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ProcessedBGPData } from '@/lib/bgp-api';
import { buildBGPGraph, type NetworkNode } from '@/lib/bgp-graph';
import { Globe, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import ReactCountryFlag from "react-country-flag";
import { toast } from "sonner";

interface BGPNetworkChartProps {
  data: ProcessedBGPData;
  protocolType?: 'ipv4' | 'ipv6' | 'both';
  width?: number;
  height?: number;
  className?: string;
}

export default function BGPNetworkChart({ 
  data, 
  protocolType = 'both',
  width = 1000, 
  height = 600, 
  className = '' 
}: BGPNetworkChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const initialTransformRef = useRef(d3.zoomIdentity);



  // 获取国旗emoji
  const getCountryFlag = (countryCode: string) => {
    const flagMap: Record<string, string> = {
      'US': '🇺🇸', 'JP': '🇯🇵', 'EE': '🇪🇪', 'AU': '🇦🇺',
      'SB': '🇸🇧', 'CA': '🇨🇦', 'CN': '🇨🇳', 'DE': '🇩🇪',
      'GB': '🇬🇧', 'FR': '🇫🇷', 'NL': '🇳🇱', 'SG': '🇸🇬',
      'KR': '🇰🇷', 'HK': '🇭🇰', 'IN': '🇮🇳', 'BR': '🇧🇷',
      'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸', 'SE': '🇸🇪',
      'NO': '🇳🇴', 'FI': '🇫🇮', 'DK': '🇩🇰', 'CH': '🇨🇭',
      'AT': '🇦🇹', 'BE': '🇧🇪', 'LU': '🇱🇺', 'IE': '🇮🇪'
    };
    return flagMap[countryCode] || '🌐';
  };

  const graph = useMemo(() => buildBGPGraph(data, protocolType, height), [data, protocolType, height]);

  // 绘制图表
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { nodes, links } = graph;

    // 创建缩放行为
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // 主要绘图组
    const g = svg.append("g");

    // 添加箭头标记 - IPv4
    const defs = g.append("defs");
    defs.append("marker")
      .attr("id", "arrowhead-ipv4")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#3b82f6");

    // 添加箭头标记 - IPv6
    defs.append("marker")
      .attr("id", "arrowhead-ipv6")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#8b5cf6");

    // 绘制连接线
    g.selectAll(".link")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("x1", d => d.sourceNode.x + 60)
      .attr("y1", d => d.sourceNode.y + 25)
      .attr("x2", d => d.targetNode.x)
      .attr("y2", d => d.targetNode.y + 25)
      .attr("stroke", d => d.protocolType === 'ipv4' ? "#3b82f6" : "#8b5cf6")
      .attr("stroke-width", d => d.protocolType === 'ipv4' ? 2 : 1.5)
      .attr("stroke-dasharray", d => d.protocolType === 'ipv4' ? "none" : "5,5")
      .attr("marker-end", d => d.protocolType === 'ipv4' ? "url(#arrowhead-ipv4)" : "url(#arrowhead-ipv6)");

    // 绘制节点
    const nodeGroups = g.selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x}, ${d.y})`)
      .style("cursor", "pointer")
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", d => `查看 AS${d.asn} ${d.name}`)
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedNode(d);
        }
      })
      .on("click", (event, d) => {
        setSelectedNode(d);
      });

    // 节点矩形
    nodeGroups.append("rect")
      .attr("width", d => d.isCenter ? 120 : 100)
      .attr("height", d => d.isCenter ? 50 : 40)
      .attr("rx", 6)
      .attr("fill", d => d.color)
      .attr("stroke", "rgb(var(--color-surface))")
      .attr("stroke-width", 3);

    // ASN文本
    nodeGroups.append("text")
      .attr("x", d => d.isCenter ? 60 : 50)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text(d => `AS${d.asn}`);

    // 名称文本
    nodeGroups.append("text")
      .attr("x", d => d.isCenter ? 60 : 50)
      .attr("y", 32)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", "10px")
      .text(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name);

    // 国家标识 - 直接使用SVG text显示emoji国旗
    nodeGroups.filter((d: NetworkNode) => !d.isCenter && Boolean(d.countryCode) && d.countryCode !== 'XX')
      .append("text")
      .attr("x", 85)
      .attr("y", 20)
      .attr("font-size", "14px")
      .attr("text-anchor", "middle")
      .style("filter", "drop-shadow(1px 1px 1px rgba(0,0,0,0.5))")
      .text(d => {
        const flag = getCountryFlag(d.countryCode);
        // 如果emoji国旗不可用，显示国家代码
        return flag !== '🌐' ? flag : d.countryCode;
      });

    // 添加工具提示
    const tooltip = d3.select('body').append('div')
      .attr('class', 'bgp-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('white-space', 'pre-line')
      .style('background', 'rgb(var(--color-surface))')
      .style('color', 'rgb(var(--color-text-primary))')
      .style('border', '1px solid rgb(var(--color-border))')
      .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    nodeGroups
      .on('mouseover', (event, d) => {
        tooltip
          .style('visibility', 'visible')
          .text(
            [`AS${d.asn}`, d.name, d.description,
              d.countryCode ? `国家: ${d.countryCode}` : "",
              `协议: ${d.protocolType === 'both' ? 'IPv4/IPv6' : d.protocolType}`,
            ].filter(Boolean).join("\n")
          );
      })
      .on('mousemove', (event) => {
        tooltip
          .style('top', (event.pageY - 10) + 'px')
          .style('left', (event.pageX + 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('visibility', 'hidden');
      });

    // 时间戳
    g.append("text")
      .attr("x", 20)
      .attr("y", height - 20)
      .attr("fill", "#6b7280")
      .attr("font-size", "12px")
      .text(new Date().toLocaleString('zh-CN', {
        year: '2-digit',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      }) + ' UTC');

    const maxX = Math.max(...nodes.map(node => node.x + 120));
    const maxY = Math.max(...nodes.map(node => node.y + 50));
    const scale = Math.min(1, (width - 80) / maxX, (height - 80) / maxY);
    initialTransformRef.current = d3.zoomIdentity.translate(40, 40).scale(scale);
    zoom.scaleExtent([Math.min(0.1, scale), 3]);
    svg.call(zoom.transform, initialTransformRef.current);

    // 清理函数
    return () => {
      tooltip.remove();
      svg.on('.zoom', null);
      zoomRef.current = null;
    };

  }, [graph, height, width]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.2);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.8);
  };

  const handleReset = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, initialTransformRef.current);
  };

  const handleExport = () => {
    try {
      const svgElement = svgRef.current;
      if (!svgElement) return;
      
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      // 使用2倍尺寸确保内容完整显示
      const exportWidth = width * 2;
      const exportHeight = height * 2;
      
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      
      // 设置高质量图像
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = 'high';
      
      img.onload = () => {
        ctx!.drawImage(img, 0, 0, exportWidth, exportHeight);
        const link = document.createElement('a');
        link.download = `asn-${data.centerAsn}-topology.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
      };
      
      img.onerror = () => {
        toast.error("图片生成失败", {
          description: "请稍后重试",
          duration: 3000,
        });
      };
      
      // Unicode 字符编码处理
      const encodedSvg = btoa(unescape(encodeURIComponent(svgData)));
      img.src = 'data:image/svg+xml;base64,' + encodedSvg;
      
    } catch {
      toast.error("导出失败", {
        description: "请稍后重试",
        duration: 3000,
      });
    }
  };

  // 统计信息
  const { nodes, links } = graph;
  const peerCount = nodes.length - 1;
  const countries = [...new Set(nodes.filter(node => !node.isCenter && node.countryCode).map(node => node.countryCode))];

  return (
    <div className={`w-full ${className}`}>
      {/* SVG容器 */}
      <div className="relative w-full overflow-hidden border border-[rgb(var(--color-border))] rounded-lg bg-[rgb(var(--color-surface))] transition-colors duration-300">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ background: 'rgb(var(--color-surface))' }}
        />

        {/* 控制按钮 */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button
            aria-label="放大网络图"
            onClick={handleZoomIn}
            className="w-10 h-10 bg-[rgb(var(--color-surface))]/90 backdrop-blur-sm border border-[rgb(var(--color-border))] rounded-md hover:bg-[rgb(var(--color-surface-hover))] transition-colors duration-200 flex items-center justify-center"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            aria-label="缩小网络图"
            onClick={handleZoomOut}
            className="w-10 h-10 bg-[rgb(var(--color-surface))]/90 backdrop-blur-sm border border-[rgb(var(--color-border))] rounded-md hover:bg-[rgb(var(--color-surface-hover))] transition-colors duration-200 flex items-center justify-center"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            aria-label="重置网络图"
            onClick={handleReset}
            className="w-10 h-10 bg-[rgb(var(--color-surface))]/90 backdrop-blur-sm border border-[rgb(var(--color-border))] rounded-md hover:bg-[rgb(var(--color-surface-hover))] transition-colors duration-200 flex items-center justify-center"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            aria-label="导出网络图"
            onClick={handleExport}
            className="w-10 h-10 bg-[rgb(var(--color-surface))]/90 backdrop-blur-sm border border-[rgb(var(--color-border))] rounded-md hover:bg-[rgb(var(--color-surface-hover))] transition-colors duration-200 flex items-center justify-center"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>

        {/* 图例 */}
        <div className="absolute bottom-4 left-4 bg-[rgb(var(--color-surface))]/95 backdrop-blur-sm p-3 rounded-lg shadow-sm border border-[rgb(var(--color-border))] max-w-xs">
          <h4 className="font-medium text-sm mb-2 flex items-center gap-1 text-[rgb(var(--color-text-primary))]">
            <Globe className="h-4 w-4" />
            节点类型
          </h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-green-500"></div>
              <span className="text-[rgb(var(--color-text-secondary))]">目标 ASN</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded bg-blue-500"></div>
              <span className="text-[rgb(var(--color-text-secondary))]">邻接 ASN</span>
            </div>

          </div>
          
          {/* 协议类型图例 */}
          {protocolType === 'both' && (
            <>
              <div className="mt-3 pt-2 border-t border-[rgb(var(--color-border))]">
                <h5 className="font-medium text-xs mb-2 text-[rgb(var(--color-text-primary))]">连接类型</h5>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-blue-500"></div>
                    <span className="text-[rgb(var(--color-text-secondary))]">IPv4 连接</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-purple-500" style={{ borderTop: '2px dashed #8b5cf6' }}></div>
                    <span className="text-[rgb(var(--color-text-secondary))]">IPv6 连接</span>
                  </div>
                </div>
              </div>
            </>
          )}
          
          <div className="mt-2 pt-2 border-t text-xs text-[rgb(var(--color-text-muted))]">
            点击节点查看详细信息<br/>
            鼠标滚轮缩放，拖拽平移
          </div>
        </div>
      </div>

      {/* 选中节点信息面板 */}
      {selectedNode && (
        <div className="mt-4 p-4 bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-border))] rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
              选中节点: AS{selectedNode.asn}
            </h3>
            <button
              aria-label="关闭节点详情"
              onClick={() => setSelectedNode(null)}
              className="h-6 w-6 text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              ✕
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-2 break-words text-sm">
            <div><strong>名称:</strong> {selectedNode.name}</div>
            <div><strong>描述:</strong> {selectedNode.description}</div>
            <div><strong>国家:</strong> 
              {selectedNode.countryCode && selectedNode.countryCode !== 'XX' ? (
                <ReactCountryFlag 
                  countryCode={selectedNode.countryCode} 
                  svg 
                  style={{ width: '1em', height: '1em', marginLeft: '0.25rem' }} 
                />
              ) : '🌐'} {selectedNode.countryCode}
            </div>
            <div><strong>协议:</strong> {selectedNode.protocolType === 'both' ? 'IPv4/IPv6' : selectedNode.protocolType}</div>
          </div>
        </div>
      )}

             {/* 统计信息 */}
       <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-sm text-[rgb(var(--color-text-secondary))]">邻接 ASN</span>
          </div>
          <div className="text-2xl font-bold text-[rgb(var(--color-text-primary))] mt-1">
            {peerCount}
          </div>
          <p className="text-xs text-[rgb(var(--color-text-muted))]">当前协议下的全部节点</p>
        </div>
        
        <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span className="text-sm text-[rgb(var(--color-text-secondary))]">连接数</span>
          </div>
          <div className="text-2xl font-bold text-[rgb(var(--color-text-primary))] mt-1">
            {links.length}
          </div>
          <p className="text-xs text-[rgb(var(--color-text-muted))]">双协议分别计数</p>
        </div>
        
        
        <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-green-500" />
            <span className="text-sm text-[rgb(var(--color-text-secondary))]">覆盖地区</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {countries.slice(0, 6).map(countryCode => (
              <span key={countryCode} className="text-lg">{getCountryFlag(countryCode)}</span>
            ))}
          </div>
          <p className="text-xs text-[rgb(var(--color-text-muted))]">{countries.length > 0 ? "已提供国家信息的节点" : "数据源未提供国家信息"}</p>
        </div>
      </div>
    </div>
  );
} 