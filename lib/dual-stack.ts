import { detectIPVersion } from "./ip-detection";

export type StackVersion = "IPv4" | "IPv6";

export interface ProbeConfig {
  ipv4: string[];
  ipv6: string[];
}

// 公共单栈回显接口：域名只有 A 或 AAAA 记录，浏览器只能用对应协议连接，因此返回的就是该协议下的出口地址。
// 它们都返回 Access-Control-Allow-Origin: *，本站服务器不需要支持 IPv6，也不需要额外的子域名。
export const DEFAULT_PROBES: ProbeConfig = {
  ipv4: ["https://api-ipv4.ip.sb/ip", "https://api4.ipify.org?format=json", "https://ipv4.icanhazip.com"],
  ipv6: ["https://api-ipv6.ip.sb/ip", "https://api6.ipify.org?format=json", "https://ipv6.icanhazip.com"],
};

const parseList = (value: string | undefined) => value?.split(",").map((item) => item.trim()).filter(Boolean);

// 部署者可用 IPV4_PROBE_URLS / IPV6_PROBE_URLS 换成自建入口（例如 https://ip6.example.com/api/ip），逗号分隔，并行请求，取第一个有效结果。
export function readProbeConfig(env: Record<string, string | undefined> = process.env): ProbeConfig {
  return {
    ipv4: parseList(env.IPV4_PROBE_URLS) ?? DEFAULT_PROBES.ipv4,
    ipv6: parseList(env.IPV6_PROBE_URLS) ?? DEFAULT_PROBES.ipv6,
  };
}

// 兼容 {"ip": "..."} 与纯文本两种回显格式；协议不符的结果视为无效（例如双栈域名回落到 IPv4）。
export function parseProbeResponse(body: string, version: StackVersion): string | null {
  let ip = body.trim();
  try {
    const json: unknown = JSON.parse(ip);
    if (json && typeof json === "object" && "ip" in json && typeof json.ip === "string") ip = json.ip.trim();
  } catch {
    // 纯文本响应
  }
  return detectIPVersion(ip) === version ? ip : null;
}

// 并行请求所有接口，取第一个有效结果；网络不支持该协议时最多等待一个超时周期。
export async function probeAddress(urls: string[], version: StackVersion, timeout = 4000, fetcher: typeof fetch = fetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await Promise.any(urls.map(async (url) => {
      const response = await fetcher(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ip = parseProbeResponse(await response.text(), version);
      if (!ip) throw new Error("协议不符");
      return ip;
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
