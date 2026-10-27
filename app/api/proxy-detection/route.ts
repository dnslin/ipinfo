import { NextRequest, NextResponse } from "next/server";
import { detectProxy, normalizePublicIP } from "@/lib/ip-detection";
import { guarded } from "@/lib/api-guard";

const headers = { "Cache-Control": "private, no-store" };

// GET 仅回显本站看到的连接，服务器不能代替浏览器采样出口。
function detect(request: NextRequest) {
  return NextResponse.json(detectProxy(request), { headers });
}

// 国内和国外探测必须在访问者的浏览器中执行；这里只比较提交的观察结果。
async function detectEnabled(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是有效 JSON" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || !("enableProxyDetection" in body) || body.enableProxyDetection !== true) {
    return NextResponse.json({ error: "代理检测未启用" }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const samples = {
    domesticIP: normalizePublicIP(input.domesticIP),
    foreignIP: normalizePublicIP(input.foreignIP),
  };
  for (const field of ["domesticIP", "foreignIP"] as const) {
    if (input[field] != null && !samples[field]) {
      return NextResponse.json({ error: `${field} 必须是有效公网 IP 或 null` }, { status: 400, headers });
    }
  }
  return NextResponse.json(detectProxy(request, samples), { headers });
}

export const GET = guarded(detect, 3);
export const POST = guarded(detectEnabled, 3);
