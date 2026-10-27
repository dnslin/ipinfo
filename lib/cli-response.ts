import { NextResponse, type NextRequest } from "next/server";
import { getClientIP } from "./ip-detection";
import { LookupError, lookupTarget } from "./lookup";
import { formatText } from "./cli-format";
import { guardRequest, withHeaders } from "./api-guard";

export type CLIFormat = "ip" | "json" | "text";

export function parseFormat(value: string | null | undefined): CLIFormat | null {
  return value === "ip" || value === "json" || value === "text" ? value : value ? null : "text";
}

// 命令行入口的响应：format=ip 只回显地址；json 返回与 /api/query 相同的结构；text 为对齐的纯文本。
export async function cliResponse(request: NextRequest, format: CLIFormat, query?: string): Promise<Response> {
  const text = (body: string, status = 200, headers?: Headers) => withHeaders(new NextResponse(body, {
    status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  }), headers ?? new Headers());

  const clientIP = getClientIP(request);
  if (format === "ip") return clientIP ? text(`${clientIP}\n`) : text("无法获取客户端 IP 地址\n", 400);

  const guard = guardRequest(request);
  if (guard instanceof NextResponse) {
    return format === "json" ? guard : text(`${(await guard.clone().json()).error}\n`, 429, guard.headers);
  }
  const target = query?.trim() || clientIP;
  if (!target) return format === "json"
    ? withHeaders(NextResponse.json({ error: "无法获取客户端 IP 地址" }, { status: 400 }), guard)
    : text("无法获取客户端 IP 地址\n", 400, guard);

  try {
    const data = await lookupTarget(target);
    return format === "json"
      ? withHeaders(NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } }), guard)
      : text(formatText(data), 200, guard);
  } catch (error) {
    const status = error instanceof LookupError ? error.status : 500;
    const message = error instanceof Error ? error.message : "查询失败";
    return format === "json" ? withHeaders(NextResponse.json({ error: message }, { status }), guard) : text(`错误: ${message}\n`, status, guard);
  }
}
