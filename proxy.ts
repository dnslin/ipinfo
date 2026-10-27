import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidIP } from "@/lib/ip-detection";
import { normalizeDomain } from "@/lib/domain";
import { isCLIRequest } from "@/lib/cli-format";

// 看起来像文件的路径不当作域名，例如 /robots.txt。
const FILE_EXTENSION = /\.(txt|ico|png|svg|jpe?g|gif|webp|avif|xml|json|js|mjs|css|map|webmanifest|html?|woff2?|ttf)$/i;

function lookupTarget(segment: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (isValidIP(value)) return value;
  return !FILE_EXTENSION.test(value) && normalizeDomain(value) ? value : null;
}

/**
 * 命令行友好入口（只处理 GET/HEAD）：
 *   curl host            → 纯文本 IP
 *   curl host/info       → 当前 IP 的文本摘要
 *   curl host/json       → 当前 IP 的 JSON
 *   curl host/1.1.1.1    → 文本摘要；浏览器访问时跳转到 /?q=1.1.1.1
 *   curl host/1.1.1.1/json
 */
function routeShortcut(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = request.nextUrl;
  const cli = isCLIRequest(request.headers.get("user-agent"));
  const rewrite = (format: "ip" | "json" | "text", target?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = `/api/cli/${format}${target ? `/${encodeURIComponent(target)}` : ""}`;
    url.search = "";
    return NextResponse.rewrite(url);
  };

  if (pathname === "/") return cli ? rewrite("ip") : null;
  if (pathname === "/json") return rewrite("json");
  if (pathname === "/info") return cli ? rewrite("text") : null;

  const match = pathname.match(/^\/([^/]+?)(\/json)?\/?$/);
  const target = match && lookupTarget(match[1]);
  if (!target) return null;
  if (match[2]) return rewrite("json", target);
  if (cli) return rewrite("text", target);
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = new URLSearchParams({ q: target }).toString();
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const url = new URL(request.url);

  // IPv4/IPv6 由浏览器端双栈检测完成（见 lib/dual-stack.ts），这里不再依赖 ip4/ip6 子域名。
  const response = routeShortcut(request) ?? NextResponse.next();

  // 安全相关头
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  // 首页按 User-Agent 返回网页或纯文本，缓存需要区分
  if (url.pathname === "/") response.headers.append("Vary", "User-Agent");

  // CORS设置（API路由与命令行入口需要）
  if (url.pathname.startsWith("/api/") || url.pathname === "/json" || url.pathname.endsWith("/json")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Token"
    );
    response.headers.set("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After");
  }

  // 缓存设置
  if (url.pathname.startsWith("/api/query")) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 匹配所有请求路径，除了:
     * - api路由 (除了我们的查询API)
     * - _next/static (静态文件)
     * - _next/image (图像优化文件)
     * - favicon.ico (网站图标)
     * - 公共文件夹中的文件
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
