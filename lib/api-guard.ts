import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getClientIP } from "./ip-detection";

// 每个来源地址一个令牌桶：容量为每分钟的请求数，按时间匀速补充。
// 只在本进程内计数，单实例自托管足够；多实例部署请在反向代理层限流。
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(readonly limit: number, private readonly windowMs = 60_000, private readonly now = () => Date.now()) {}

  take(key: string, cost = 1): { allowed: boolean; remaining: number; retryAfter: number } {
    const now = this.now();
    const rate = this.limit / this.windowMs;
    const bucket = this.buckets.get(key) ?? { tokens: this.limit, updatedAt: now };
    bucket.tokens = Math.min(this.limit, bucket.tokens + (now - bucket.updatedAt) * rate);
    bucket.updatedAt = now;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.prune(now);

    if (bucket.tokens < cost) {
      return { allowed: false, remaining: Math.floor(bucket.tokens), retryAfter: Math.ceil((cost - bucket.tokens) / rate / 1000) };
    }
    bucket.tokens -= cost;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfter: 0 };
  }

  // 已经补满的桶与新建的桶等价，可以丢弃。
  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * (this.limit / this.windowMs) >= this.limit) this.buckets.delete(key);
    }
  }
}

function readLimit(): number {
  const value = Number(process.env.API_RATE_LIMIT ?? 120);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 120;
}

let limiter: RateLimiter | null = null;
const getLimiter = () => {
  const limit = readLimit();
  if (!limiter || limiter.limit !== limit) limiter = new RateLimiter(limit);
  return limiter;
};

export function configuredToken(): string | null {
  return process.env.API_TOKEN?.trim() || null;
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1].trim() || request.headers.get("x-api-token")?.trim() || null;
}

export function hasValidToken(request: NextRequest): boolean {
  const expected = configuredToken();
  const provided = bearer(request);
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 公共 API 的统一入口：携带有效 Token 的请求不限流，其余按来源地址限流。
 * 返回 NextResponse 表示请求被拒绝，返回 headers 表示放行并附带配额信息。
 */
export function guardRequest(request: NextRequest, cost = 1): NextResponse | Headers {
  const headers = new Headers();
  if (hasValidToken(request)) return headers;
  const rateLimiter = getLimiter();
  if (rateLimiter.limit === 0) return headers;

  const key = getClientIP(request) ?? "unknown";
  const result = rateLimiter.take(key, cost);
  headers.set("X-RateLimit-Limit", String(rateLimiter.limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  if (result.allowed) return headers;

  headers.set("Retry-After", String(result.retryAfter));
  return NextResponse.json(
    { error: `请求过于频繁，请在 ${result.retryAfter} 秒后重试`, code: "RATE_LIMITED" },
    { status: 429, headers },
  );
}

// 管理操作：配置了 API_TOKEN 时必须携带；未配置时返回 null 让调用方决定是否放行。
export function requireToken(request: NextRequest): NextResponse | null {
  if (!configuredToken()) return NextResponse.json({ error: "服务端未配置 API_TOKEN，此操作不可用", code: "TOKEN_NOT_CONFIGURED" }, { status: 403 });
  if (!hasValidToken(request)) return NextResponse.json({ error: "缺少或无效的 API Token", code: "UNAUTHORIZED" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return null;
}

export function withHeaders<T extends Response>(response: T, headers: Headers): T {
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

// 给路由处理函数套上限流，并把配额信息附加到任意返回的响应上。
export function guarded<A extends unknown[]>(handler: (request: NextRequest, ...args: A) => Promise<Response> | Response, cost = 1) {
  return async (request: NextRequest, ...args: A): Promise<Response> => {
    const guard = guardRequest(request, cost);
    if (guard instanceof NextResponse) return guard;
    return withHeaders(await handler(request, ...args), guard);
  };
}
