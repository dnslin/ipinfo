import { Activity } from "lucide-react";
import type { ProxyDetectionResult } from "@/lib/ip-detection";

const typeNames = { direct: "直连", domestic: "国内代理", foreign: "国外代理", mixed: "混合代理", unknown: "暂无法判断" };

export function ProxyDetectionSummary({ result }: { result: ProxyDetectionResult }) {
  return (
    <section className="ui-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="ui-section-heading"><Activity />代理检测</h2><span className="ui-badge">{typeNames[result.proxyType]} · 置信度 {Math.round(result.confidence * 100)}%</span></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[["请求来源", result.headerIP], ["国内探测源", result.domesticIP], ["国外探测源", result.foreignIP]].map(([label, ip]) => <div key={label} className="rounded-lg bg-[rgb(var(--color-surface-hover))] p-3"><dt className="mb-1 text-xs text-[rgb(var(--color-text-muted))]">{label}</dt><dd className="break-all font-mono text-sm">{ip || "未获取"}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-[rgb(var(--color-text-muted))]">检测耗时 {result.detectionTime} ms</p>
      {result.errors.length > 0 && <details className="mt-3 text-xs text-[rgb(var(--color-text-secondary))]"><summary>探测详情</summary><ul className="mt-2 space-y-1">{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
    </section>
  );
}
