import { NextRequest, NextResponse } from "next/server";
import { getClientIP } from "@/lib/ip-detection";
import { LookupError, MAX_BATCH, lookupBatch, lookupTarget } from "@/lib/lookup";
import { guardRequest, withHeaders } from "@/lib/api-guard";

const NO_STORE = { "Cache-Control": "private, no-store" };

function failure(error: unknown, headers: Headers) {
  const status = error instanceof LookupError ? error.status : 500;
  if (status >= 500) console.error("IP查询错误:", error);
  const body = { error: error instanceof Error ? error.message : "查询失败", ...(error instanceof LookupError && error.code ? { code: error.code } : {}) };
  return withHeaders(NextResponse.json(body, { status, headers: NO_STORE }), headers);
}

// GET请求：获取客户端IP信息；带 ?q= 时查询指定的 IP 或域名
export async function GET(request: NextRequest) {
  const guard = guardRequest(request);
  if (guard instanceof NextResponse) return guard;
  const target = request.nextUrl.searchParams.get("q")?.trim() || getClientIP(request);
  if (!target) return withHeaders(NextResponse.json({ error: "无法获取客户端IP地址" }, { status: 400, headers: NO_STORE }), guard);
  try {
    return withHeaders(NextResponse.json(await lookupTarget(target), { headers: NO_STORE }), guard);
  } catch (error) {
    return failure(error, guard);
  }
}

// POST请求：{"ip": "..."} 查询指定 IP 或域名；{"ips": [...]} 批量查询，最多 100 条
export async function POST(request: NextRequest) {
  let body: { ip?: unknown; ips?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的JSON请求体" }, { status: 400, headers: NO_STORE });
  }

  if (body?.ips !== undefined) {
    if (!Array.isArray(body.ips) || !body.ips.every((item) => typeof item === "string")) {
      return NextResponse.json({ error: "ips 必须是字符串数组" }, { status: 400, headers: NO_STORE });
    }
    const queries = [...new Set((body.ips as string[]).map((item) => item.trim()).filter(Boolean))];
    if (queries.length === 0) return NextResponse.json({ error: "请提供至少一个 IP 地址或域名" }, { status: 400, headers: NO_STORE });
    if (queries.length > MAX_BATCH) return NextResponse.json({ error: `批量查询最多 ${MAX_BATCH} 条，当前 ${queries.length} 条` }, { status: 400, headers: NO_STORE });
    const guard = guardRequest(request, Math.ceil(queries.length / 10));
    if (guard instanceof NextResponse) return guard;
    return withHeaders(NextResponse.json({ results: await lookupBatch(queries) }, { headers: NO_STORE }), guard);
  }

  const guard = guardRequest(request);
  if (guard instanceof NextResponse) return guard;
  if (body?.ip !== undefined && body.ip !== null && body.ip !== "" && typeof body.ip !== "string") {
    return withHeaders(NextResponse.json({ error: "无效的 IP 地址或域名" }, { status: 400, headers: NO_STORE }), guard);
  }
  // 如果没有提供IP，使用客户端IP
  const target = (body?.ip as string | undefined)?.trim() || getClientIP(request);
  if (!target) return withHeaders(NextResponse.json({ error: "请提供有效的IP地址" }, { status: 400, headers: NO_STORE }), guard);
  try {
    return withHeaders(NextResponse.json(await lookupTarget(target), { headers: NO_STORE }), guard);
  } catch (error) {
    return failure(error, guard);
  }
}
