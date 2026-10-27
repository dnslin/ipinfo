import { NextRequest, NextResponse } from "next/server";
import { cliResponse, parseFormat } from "@/lib/cli-response";

// 命令行入口（查询参数形式）：/api/cli?format=text|json|ip&q=<IP或域名>
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const format = parseFormat(params.get("format"));
  if (!format) return NextResponse.json({ error: "format 只能是 ip、json 或 text" }, { status: 400 });
  return cliResponse(request, format, params.get("q") ?? undefined);
}
