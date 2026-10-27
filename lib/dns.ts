import { Resolver } from "node:dns/promises";
import { isPrivateIP } from "./ip-detection";
import { normalizeDomain } from "./domain";

export interface DomainResolution {
  domain: string;
  addresses: string[];
}

export class DomainResolveError extends Error {
  constructor(message: string, readonly code: "INVALID_DOMAIN" | "NOT_FOUND" | "PRIVATE_ONLY" | "DNS_FAILED") {
    super(message);
    this.name = "DomainResolveError";
  }
}

const TTL = 5 * 60 * 1000;
const cache = new Map<string, { value: DomainResolution; expires: number }>();
const ptrCache = new Map<string, { value: string[]; expires: number }>();

function createResolver() {
  const resolver = new Resolver({ timeout: 2500, tries: 2 });
  const servers = process.env.DNS_SERVERS?.split(",").map((server) => server.trim()).filter(Boolean);
  if (servers?.length) resolver.setServers(servers);
  return resolver;
}

// 除内网地址外，基准测试与文档保留段也不是真实解析结果（常见于代理软件的 fake-ip 模式）。
const NON_GLOBAL = [/^198\.1[89]\./, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^2001:2:0?:/i, /^2001:db8:/i];
export const isGlobalAddress = (address: string) => !isPrivateIP(address) && !NON_GLOBAL.some((pattern) => pattern.test(address));

const missing = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENODATA" || code === "ENOTFOUND" || code === "ENONAME";
};

/**
 * 解析域名的 A 与 AAAA 记录。只返回公网地址：内网地址会暴露服务器所在网络的 DNS，不对外展示。
 */
export async function resolveDomain(input: string): Promise<DomainResolution> {
  const domain = normalizeDomain(input);
  if (!domain) throw new DomainResolveError("无效的域名", "INVALID_DOMAIN");
  const cached = cache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.value;

  const resolver = createResolver();
  const [v4, v6] = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  const failures = [v4, v6].filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length === 2 && !failures.every((failure) => missing(failure.reason))) {
    throw new DomainResolveError(`域名 ${domain} 解析失败，请稍后重试`, "DNS_FAILED");
  }
  const all = [v4, v6].flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (all.length === 0) throw new DomainResolveError(`域名 ${domain} 没有 A 或 AAAA 记录`, "NOT_FOUND");
  const addresses = [...new Set(all)].filter(isGlobalAddress);
  if (addresses.length === 0) throw new DomainResolveError(`域名 ${domain} 只解析到内网或保留地址`, "PRIVATE_ONLY");

  const value = { domain, addresses };
  cache.set(domain, { value, expires: Date.now() + TTL });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return value;
}

// 反向解析（PTR）。没有记录时返回空数组，超时等错误向上抛出。
export async function reverseLookup(ip: string): Promise<string[]> {
  const cached = ptrCache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: string[];
  try {
    value = [...new Set(await createResolver().reverse(ip))];
  } catch (error) {
    if (!missing(error)) throw error;
    value = [];
  }
  ptrCache.set(ip, { value, expires: Date.now() + TTL });
  if (ptrCache.size > 1000) ptrCache.delete(ptrCache.keys().next().value!);
  return value;
}
