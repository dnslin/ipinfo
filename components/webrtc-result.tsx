import { Radio } from "lucide-react";
import type { WebRTCResult } from "@/lib/webrtc";

const VERDICTS: Record<WebRTCResult["status"], { text: string; warn?: boolean }> = {
  leak: { text: "检测到泄露", warn: true },
  consistent: { text: "与网页出口一致" },
  "no-public": { text: "未暴露公网地址" },
  unsupported: { text: "浏览器不支持 WebRTC" },
};

const EXPLANATIONS: Record<WebRTCResult["status"], string> = {
  leak: "WebRTC 通过 STUN 看到的公网地址与网页请求的出口不同，代理或 VPN 没有接管 WebRTC 流量，网站可以借此获得你的真实地址。",
  consistent: "WebRTC 看到的公网地址与网页请求的出口相同，没有额外暴露地址。",
  "no-public": "STUN 请求没有返回公网地址，可能是浏览器或扩展禁用了 WebRTC，或网络屏蔽了 STUN。",
  unsupported: "当前浏览器没有提供 RTCPeerConnection，无法通过 WebRTC 获取地址。",
};

export function WebRTCSummary({ result }: { result: WebRTCResult }) {
  const verdict = VERDICTS[result.status];
  const local = result.localIPs.length ? result.localIPs.join(", ") : result.mdnsHidden ? "已由浏览器隐藏（mDNS）" : "未获取";
  return (
    <section className="proxy-panel" aria-labelledby="webrtc-title">
      <div className="proxy-head">
        <h2 id="webrtc-title"><Radio />WebRTC 泄露检测</h2>
        <span className="proxy-verdict" data-proxy={verdict.warn || undefined}>{verdict.text}</span>
      </div>
      <dl className="proxy-sources">
        <div><dt>WebRTC 公网地址</dt><dd className="font-mono">{result.publicIPs.join(", ") || "未获取"}</dd></div>
        <div><dt>未被代理的地址</dt><dd className="font-mono">{result.leakedIPs.join(", ") || "无"}</dd></div>
        <div><dt>本机内网地址</dt><dd className="font-mono">{local}</dd></div>
      </dl>
      <p className="proxy-meta">{EXPLANATIONS[result.status]}</p>
    </section>
  );
}
