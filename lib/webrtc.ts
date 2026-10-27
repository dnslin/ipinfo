// WebRTC 泄露检测：浏览器通过 STUN 收集 ICE 候选地址，srflx 候选就是 WebRTC 看到的公网出口。
// 如果它不同于网页请求的出口（双栈检测结果），说明代理或 VPN 没有接管 WebRTC 流量。

export const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"];

export interface ICECandidateInfo {
  address: string;
  type: "host" | "srflx" | "prflx" | "relay";
}

export function parseCandidate(candidate: string): ICECandidateInfo | null {
  // candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> ...
  const parts = candidate.replace(/^a=/, "").split(/\s+/);
  const typeIndex = parts.indexOf("typ");
  if (parts.length < 8 || typeIndex !== 6) return null;
  const type = parts[7] as ICECandidateInfo["type"];
  if (!["host", "srflx", "prflx", "relay"].includes(type)) return null;
  return { address: parts[4], type };
}

export interface WebRTCResult {
  status: "leak" | "consistent" | "no-public" | "unsupported";
  publicIPs: string[];
  localIPs: string[];
  // 浏览器用 mDNS 主机名（xxx.local）隐藏了内网地址
  mdnsHidden: boolean;
  leakedIPs: string[];
}

export function classifyWebRTC(candidates: ICECandidateInfo[], knownIPs: (string | null | undefined)[]): WebRTCResult {
  const known = new Set(knownIPs.filter((ip): ip is string => Boolean(ip)).map((ip) => ip.toLowerCase()));
  const publicIPs = [...new Set(candidates.filter((item) => item.type === "srflx" || item.type === "prflx").map((item) => item.address.toLowerCase()))];
  const hosts = candidates.filter((item) => item.type === "host");
  const localIPs = [...new Set(hosts.map((item) => item.address).filter((address) => !address.endsWith(".local")))];
  const mdnsHidden = hosts.some((item) => item.address.endsWith(".local"));
  const leakedIPs = publicIPs.filter((ip) => !known.has(ip));
  return {
    status: publicIPs.length === 0 ? "no-public" : leakedIPs.length > 0 ? "leak" : "consistent",
    publicIPs, localIPs, mdnsHidden, leakedIPs,
  };
}

export async function gatherCandidates(stunUrls = DEFAULT_STUN_URLS, timeout = 5000): Promise<ICECandidateInfo[] | null> {
  if (typeof RTCPeerConnection === "undefined") return null;
  const connection = new RTCPeerConnection({ iceServers: [{ urls: stunUrls }] });
  const candidates: ICECandidateInfo[] = [];
  try {
    connection.createDataChannel("probe");
    const done = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeout);
      connection.addEventListener("icecandidate", (event) => {
        if (!event.candidate) { clearTimeout(timer); resolve(); return; }
        const parsed = parseCandidate(event.candidate.candidate);
        if (parsed) candidates.push(parsed);
      });
    });
    await connection.setLocalDescription(await connection.createOffer());
    await done;
    return candidates;
  } finally {
    connection.close();
  }
}
