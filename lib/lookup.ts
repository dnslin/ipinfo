import { geoIPService } from "./geoip";
import { GeoIPError } from "./geoip/types";
import { isValidIP } from "./ip-detection";
import { normalizeDomain } from "./domain";
import { DomainResolveError, resolveDomain } from "./dns";
import type { IPInfo } from "./store";

export class LookupError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "LookupError";
  }
}

export const MAX_BATCH = 100;

export function isLookupTarget(target: string): boolean {
  return isValidIP(target.trim()) || normalizeDomain(target) !== null;
}

/**
 * 查询一个 IP 或域名。域名先解析，查询第一个公网地址，并在结果里附上全部解析地址，
 * 界面可以据此切换到其他地址。
 */
export async function lookupTarget(input: string): Promise<IPInfo> {
  const target = input.trim();
  let ip = target;
  let resolvedFrom: IPInfo["resolvedFrom"];
  if (!isValidIP(target)) {
    if (!normalizeDomain(target)) throw new LookupError("无效的 IP 地址或域名", 400, "INVALID_TARGET");
    try {
      resolvedFrom = await resolveDomain(target);
    } catch (error) {
      if (error instanceof DomainResolveError) {
        throw new LookupError(error.message, error.code === "DNS_FAILED" ? 502 : error.code === "INVALID_DOMAIN" ? 400 : 404, error.code);
      }
      throw error;
    }
    ip = resolvedFrom.addresses[0];
  }

  try {
    const result = await geoIPService.queryIPInfo(ip);
    return resolvedFrom ? { ...result, resolvedFrom } : result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (error instanceof GeoIPError && error.code === "QUERY_FAILED" && /未找到/.test(message)) throw new LookupError(message, 404, "NOT_FOUND");
    throw new LookupError(`IP查询失败: ${message}`, 500, error instanceof GeoIPError ? error.code : undefined);
  }
}

export type BatchItem = { query: string; ok: true; data: IPInfo } | { query: string; ok: false; error: string };

// 批量查询：去重后限制并发，单条失败不影响其他条目。
export async function lookupBatch(queries: string[], concurrency = 8): Promise<BatchItem[]> {
  const unique = [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
  const results: BatchItem[] = new Array(unique.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (next < unique.length) {
      const index = next++;
      const query = unique[index];
      try {
        results[index] = { query, ok: true, data: await lookupTarget(query) };
      } catch (error) {
        results[index] = { query, ok: false, error: error instanceof Error ? error.message : "查询失败" };
      }
    }
  }));
  return results;
}
