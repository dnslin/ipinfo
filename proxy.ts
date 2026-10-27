import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const url = new URL(request.url);

  // IPv4/IPv6 由浏览器端双栈检测完成（见 lib/dual-stack.ts），这里不再依赖 ip4/ip6 子域名。
  const response = NextResponse.next();

  // 安全相关头
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  // CORS设置（API路由需要）
  if (url.pathname.startsWith("/api/")) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
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
