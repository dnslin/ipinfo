import { NextRequest, NextResponse } from "next/server";
import { cliResponse, parseFormat } from "@/lib/cli-response";

// 命令行入口（路径形式）：/api/cli/<format>/<IP或域名>。proxy 改写到这里，路径参数在开发与生产环境下都可靠。
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const [rawFormat, target, ...rest] = (await context.params).slug;
  const format = parseFormat(rawFormat);
  if (!format || rest.length > 0) return NextResponse.json({ error: "无效的命令行路径" }, { status: 404 });
  return cliResponse(request, format, target ? decodeURIComponent(target) : undefined);
}
