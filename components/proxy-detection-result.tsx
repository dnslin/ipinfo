import { Activity } from "lucide-react";
import { PROXY_TYPE_LABELS, type ProxyDetectionResult } from "@/lib/ip-detection";

export function ProxyDetectionSummary({ result }: { result: ProxyDetectionResult }) {
  return (
    <section className="proxy-panel" aria-labelledby="proxy-title">
      <div className="proxy-head">
        <h2 id="proxy-title"><Activity />代理检测</h2>
        <span className="proxy-verdict" data-proxy={result.isUsingProxy || undefined}>{PROXY_TYPE_LABELS[result.proxyType]}</span>
      </div>
      <dl className="proxy-sources">
        {[["请求来源", result.headerIP], ["国内探测源", result.domesticIP], ["国外探测源", result.foreignIP]].map(([label, ip]) => <div key={label}><dt>{label}</dt><dd className="font-mono">{ip || "未获取"}</dd></div>)}
      </dl>
      <p className="proxy-meta">仅比较当前浏览器的访问出口。出口不同可能来自代理分流或网络出口变化；出口一致也不能排除全局代理。</p>
      <p className="proxy-meta">检测耗时 {result.detectionTime} ms</p>
      {result.errors.length > 0 && <details className="proxy-meta"><summary>探测详情</summary><ul className="mt-2 space-y-1">{result.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
    </section>
  );
}
