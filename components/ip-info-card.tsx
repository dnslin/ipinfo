"use client";

import { useState } from "react";
import ReactCountryFlag from "react-country-flag";
import { Activity, Copy, Globe2, Loader2, RotateCcw, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import { type IPInfo, useIPQueryStore } from "@/lib/store";
import { mergeIPLocation } from "@/lib/ip-result";
import { IPAddress } from "./ip-address";
import { AdditionalDetails, LocationDetails, NetworkDetails } from "./ip-info-details";
import { ProxyDetectionSummary } from "./proxy-detection-result";
import LazyIPMap from "./lazy-ip-map";
import BGPPeersDialog from "./bgp-peers-dialog";

function CountryMark({ code, country }: { code: string; country: string }) {
  const [failedCode, setFailedCode] = useState<string | null>(null);
  if (code === "PRIVATE") return <span title="私有地址"><Shield className="h-4 w-4" /></span>;
  if (!/^[A-Z]{2}$/i.test(code) || ["XX", "ZZ"].includes(code) || failedCode === code) return <Globe2 className="h-4 w-4" aria-hidden="true" />;
  return <ReactCountryFlag countryCode={code} svg title={country} style={{ width: "1.2em", height: "1.2em" }} onError={() => setFailedCode(code)} />;
}

export default function IPInfoCard({ ipData }: { ipData: IPInfo }) {
  const { isProxyDetecting, executeProxyDetection, isAutoDetected } = useIPQueryStore();
  const [tracedData, setTracedData] = useState<IPInfo | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [traceMessage, setTraceMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [selectedASN, setSelectedASN] = useState<{ asn: number; name?: string; trigger: HTMLButtonElement } | null>(null);
  const currentData = tracedData ? mergeIPLocation(ipData, tracedData) : ipData;
  const isLocalAddress = currentData.source === "Local";
  const sourceName = isLocalAddress ? "本地地址分类" : currentData.source === "MeiTuan" ? "美团" : currentData.source;

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

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(ipData.ip);
      toast.success("IP 地址已复制");
    } catch {
      toast.error("无法访问剪贴板，请手动复制 IP 地址");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="ui-card overflow-hidden" aria-label="IP 查询结果">
        <div className="ip-result-header">
          <div className="ip-result-identity">
            <p className="mb-2 text-xs text-[rgb(var(--color-text-muted))]">{isAutoDetected ? "当前连接 IP" : "查询结果"}</p>
            <h2 className="ip-result-address"><IPAddress value={ipData.ip} /></h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[rgb(var(--color-text-secondary))]">
              <span>{currentData.ipVersion}</span>
              <span className="flex items-center gap-1.5"><CountryMark code={currentData.countryCode} country={currentData.country} />{isLocalAddress ? "本地网络" : currentData.country || "地区未知"}</span>
              <span className="h-3 w-px bg-[rgb(var(--color-border))]" aria-hidden="true" />
              <span>{isLocalAddress ? sourceName : `位置来源 · ${sourceName}`}</span>
            </div>
          </div>
          <div className="ip-result-actions">
            <button type="button" onClick={copyIP} className="ui-button" aria-label="复制 IP 地址"><Copy className="h-3.5 w-3.5" />复制</button>
            {!isLocalAddress && currentData.source !== "MeiTuan" && <button type="button" disabled={isTracing} onClick={trace} className="ui-button">{isTracing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}{isTracing ? "正在查询" : "美团溯源"}</button>}
            {tracedData && <button type="button" onClick={() => { setTracedData(null); setTraceMessage(null); }} className="ui-button"><RotateCcw className="h-3.5 w-3.5" />恢复原始结果</button>}
            {isAutoDetected && !isLocalAddress && <button type="button" disabled={isProxyDetecting} onClick={executeProxyDetection} className="ui-button">{isProxyDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}{isProxyDetecting ? "检测中" : "代理检测"}</button>}
          </div>
        </div>
        {traceMessage && <p role={traceMessage.error ? "alert" : "status"} className={`ip-trace-message ${traceMessage.error ? "text-[rgb(var(--color-error))]" : "text-[rgb(var(--color-text-secondary))]"}`}>{traceMessage.text}</p>}
        <div className="ip-result-fields">
          <LocationDetails data={currentData} />
          <NetworkDetails data={currentData} onOpenBGP={(asn, name, trigger) => setSelectedASN({ asn, name, trigger })} />
        </div>
        <AdditionalDetails data={currentData} />
      </section>
      {isAutoDetected && currentData.proxyDetection && <ProxyDetectionSummary result={currentData.proxyDetection} />}
      <LazyIPMap ipData={currentData} />
      {selectedASN && <BGPPeersDialog asn={selectedASN.asn} asnName={selectedASN.name} isOpen onClose={() => setSelectedASN(null)} onReturnFocus={() => selectedASN.trigger.focus({ preventScroll: true })} />}
    </div>
  );
}
