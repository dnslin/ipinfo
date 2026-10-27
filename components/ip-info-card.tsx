"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import ReactCountryFlag from "react-country-flag";
import { Activity, Check, Copy, Globe2, Loader2, Radio, RotateCcw, Search, Shield } from "lucide-react";
import type { LatLngTuple } from "leaflet";
import { toast } from "sonner";
import { type IPInfo, useIPQueryStore } from "@/lib/store";
import { mergeIPLocation } from "@/lib/ip-result";
import { validateCoordinates } from "@/lib/geoip/map-types";
import { IPAddress } from "./ip-address";
import { LocationDetails, NetworkDetails, StatStrip, locationParts } from "./ip-info-details";
import { ProxyDetectionSummary } from "./proxy-detection-result";
import { ResultStage } from "./result-stage";
import { useSetMapFocus } from "./map-focus";
import BGPPeersDialog from "./bgp-peers-dialog";
import { StackSummary } from "./version-switcher";
import { NetworkIntelSections } from "./network-intel";
import { WebRTCSummary } from "./webrtc-result";
import { classifyWebRTC, gatherCandidates, type WebRTCResult } from "@/lib/webrtc";

function CountryMark({ code, country }: { code: string; country: string }) {
  const [failedCode, setFailedCode] = useState<string | null>(null);
  if (code === "PRIVATE") return <span title="私有地址"><Shield className="h-[1.05em] w-[1.05em]" /></span>;
  if (!/^[A-Z]{2}$/i.test(code) || ["XX", "ZZ"].includes(code) || failedCode === code) return <Globe2 className="h-[1.05em] w-[1.05em]" aria-hidden="true" />;
  return <ReactCountryFlag countryCode={code} svg title={country} style={{ width: "1.15em", height: "1.15em", borderRadius: 3 }} onError={() => setFailedCode(code)} />;
}

const RESOLVED_VISIBLE = 12;

// 按域名查询时列出全部解析地址，点击切换，切换后仍保留这份解析结果。
function ResolvedAddresses({ resolved, current }: { resolved: NonNullable<IPInfo["resolvedFrom"]>; current: string }) {
  const { isLoading, executeQuery } = useIPQueryStore();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? resolved.addresses : resolved.addresses.slice(0, RESOLVED_VISIBLE);
  return (
    <div className="id-resolved">
      <p className="id-resolved-title"><span className="font-mono">{resolved.domain}</span> 解析到 {resolved.addresses.length} 个公网地址</p>
      {resolved.addresses.length > 1 && (
        <ul className="id-resolved-list">
          {visible.map((address) => (
            <li key={address}>
              <button type="button" className="font-mono" aria-current={address === current || undefined} disabled={address === current || isLoading}
                onClick={() => executeQuery(address, { resolvedFrom: resolved })} title={address === current ? "当前显示的地址" : `查看 ${address}`}>
                {address}
              </button>
            </li>
          ))}
          {!expanded && resolved.addresses.length > RESOLVED_VISIBLE && (
            <li><button type="button" onClick={() => setExpanded(true)}>另外 {resolved.addresses.length - RESOLVED_VISIBLE} 个</button></li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function IPInfoCard({ ipData }: { ipData: IPInfo }) {
  const { isProxyDetecting, executeProxyDetection, isAutoDetected, stack } = useIPQueryStore();
  const [webrtc, setWebRTC] = useState<WebRTCResult | null>(null);
  const [isCheckingWebRTC, setCheckingWebRTC] = useState(false);
  const [tracedData, setTracedData] = useState<IPInfo | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [traceMessage, setTraceMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [selectedASN, setSelectedASN] = useState<{ asn: number; name?: string; trigger: HTMLButtonElement } | null>(null);
  const currentData = tracedData ? mergeIPLocation(ipData, tracedData) : ipData;
  const isLocalAddress = currentData.source === "Local";
  const sourceName = isLocalAddress ? "本地地址分类" : currentData.source === "MeiTuan" ? "美团" : currentData.source;
  const { latitude, longitude, accuracy_radius, source: coordinateSource } = currentData.location;
  const center: LatLngTuple | null = !isLocalAddress && latitude !== null && longitude !== null && validateCoordinates(latitude, longitude).isValid ? [latitude, longitude] : null;
  const place = locationParts(currentData).join(" · ");
  const setMapFocus = useSetMapFocus();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 只在坐标或精度真正变化时通知地图，避免每次渲染都触发飞行。
  const focusLat = center?.[0];
  const focusLng = center?.[1];
  useEffect(() => {
    setMapFocus({ center: focusLat === undefined || focusLng === undefined ? null : [focusLat, focusLng], radius: accuracy_radius });
  }, [setMapFocus, focusLat, focusLng, accuracy_radius]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const trace = async () => {
    if (isTracing) return;
    setIsTracing(true);
    setTraceMessage(null);
    try {
      const response = await fetch("/api/meituan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: ipData.ip }),
      });
      if (!response.ok) {
        const result: { error?: string; code?: string } = await response.json();
        if (response.status === 404 && result.code === "MEITUAN_LOCATION_NOT_FOUND") {
          setTraceMessage({ error: false, text: "美团未收录此 IP，当前数据库查询结果仍可使用。" });
          return;
        }
        throw new Error(result.error || `美团查询失败（${response.status}）`);
      }
      setTracedData(await response.json() as IPInfo);
      setTraceMessage({ error: false, text: "已切换为美团补充位置信息，可随时恢复原始结果。" });
    } catch (error) {
      setTraceMessage({ error: true, text: error instanceof Error ? error.message : "暂时无法查询美团补充信息" });
    } finally {
      setIsTracing(false);
    }
  };

  const checkWebRTC = async () => {
    if (isCheckingWebRTC) return;
    setCheckingWebRTC(true);
    try {
      const candidates = await gatherCandidates();
      setWebRTC(candidates ? classifyWebRTC(candidates, [ipData.ip, stack.IPv4, stack.IPv6]) : { status: "unsupported", publicIPs: [], localIPs: [], mdnsHidden: false, leakedIPs: [] });
    } catch (error) {
      toast.error("WebRTC 检测失败", { description: error instanceof Error ? error.message : "无法建立 WebRTC 连接" });
    } finally {
      setCheckingWebRTC(false);
    }
  };

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(ipData.ip);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("无法访问剪贴板，请手动复制 IP 地址");
    }
  };

  const note = center
    ? `${accuracy_radius !== undefined ? `定位精度 ±${accuracy_radius} km` : "精度半径未提供"} · 坐标来自 ${coordinateSource}`
    : isLocalAddress ? "本地网络地址没有公网地理位置" : "此 IP 的数据库记录未提供有效坐标";

  return (
    <>
      <ResultStage note={note}>
        <section className="id-card" aria-label="IP 查询结果" data-long={ipData.ip.length > 20 || undefined}>
          <p className="id-eyebrow">{isAutoDetected ? "当前连接 IP" : "查询结果"} · {currentData.ipVersion}</p>
          <h2 className="id-ip" style={{ "--ip-chars": ipData.ip.length } as CSSProperties}><IPAddress value={ipData.ip} /></h2>
          <p className="id-place"><CountryMark code={currentData.countryCode} country={currentData.country} /><span>{isLocalAddress ? "本地网络" : place || "地区信息未提供"}</span></p>
          <p className="id-source">{isLocalAddress ? sourceName : `位置来源 · ${sourceName}`}</p>
          {ipData.resolvedFrom && <ResolvedAddresses resolved={ipData.resolvedFrom} current={ipData.ip} />}
          {isAutoDetected && <StackSummary />}
          <div className="id-actions">
            <button type="button" onClick={copyIP} className="id-button id-button-primary" aria-label={copied ? "IP 地址已复制" : "复制 IP 地址"}>
              <span className="icon-swap" data-done={copied || undefined} aria-hidden="true"><Copy /><Check /></span>{copied ? "已复制" : "复制 IP"}
            </button>
            {!isLocalAddress && currentData.source !== "MeiTuan" && <button type="button" disabled={isTracing} onClick={trace} className="id-button">{isTracing ? <Loader2 className="animate-spin" /> : <Search />}{isTracing ? "正在查询" : "美团溯源"}</button>}
            {tracedData && <button type="button" onClick={() => { setTracedData(null); setTraceMessage(null); }} className="id-button"><RotateCcw />恢复原始结果</button>}
            {isAutoDetected && !isLocalAddress && <button type="button" disabled={isProxyDetecting} onClick={executeProxyDetection} className="id-button">{isProxyDetecting ? <Loader2 className="animate-spin" /> : <Activity />}{isProxyDetecting ? "检测中" : "代理检测"}</button>}
            {isAutoDetected && !isLocalAddress && <button type="button" disabled={isCheckingWebRTC} onClick={checkWebRTC} className="id-button">{isCheckingWebRTC ? <Loader2 className="animate-spin" /> : <Radio />}{isCheckingWebRTC ? "检测中" : "WebRTC 检测"}</button>}
          </div>
          {traceMessage && <p role={traceMessage.error ? "alert" : "status"} className="id-message" data-error={traceMessage.error || undefined}>{traceMessage.text}</p>}
        </section>
      </ResultStage>

      <div className="site-body">
        <StatStrip data={currentData} onOpenBGP={(asn, name, trigger) => setSelectedASN({ asn, name, trigger })} />
        {isAutoDetected && currentData.proxyDetection && <ProxyDetectionSummary result={currentData.proxyDetection} />}
        {isAutoDetected && webrtc && <WebRTCSummary result={webrtc} />}
        <div className="detail-grid">
          <LocationDetails data={currentData} />
          <NetworkDetails data={currentData} sourceName={sourceName} />
        </div>
        {!isLocalAddress && <NetworkIntelSections ip={ipData.ip} />}
      </div>
      {selectedASN && <BGPPeersDialog asn={selectedASN.asn} asnName={selectedASN.name} isOpen onClose={() => setSelectedASN(null)} onReturnFocus={() => selectedASN.trigger.focus({ preventScroll: true })} />}
    </>
  );
}
