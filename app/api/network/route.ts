import { NextRequest, NextResponse } from "next/server";
import { isPrivateIP, isValidIP } from "@/lib/ip-detection";
import { reverseLookup } from "@/lib/dns";
import { fetchRegistration, fetchRouting, settle } from "@/lib/network-intel";
import { guarded } from "@/lib/api-guard";

// 公网 IP 的反向解析、BGP 前缀与 RPKI、RDAP 注册信息。三部分独立返回，单项失败不影响其他项。
async function lookup(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get("ip")?.trim() ?? "";
  if (!isValidIP(ip)) return NextResponse.json({ error: "无效的IP地址格式" }, { status: 400 });
  if (isPrivateIP(ip)) return NextResponse.json({ error: "内网和保留地址没有公网路由与注册信息" }, { status: 400 });

  const [ptr, routing, registration] = await Promise.all([
    settle(reverseLookup(ip)),
    settle(fetchRouting(ip)),
    settle(fetchRegistration(ip)),
  ]);
  return NextResponse.json({ ip, ptr, routing, registration }, {
    headers: { "Cache-Control": "public, max-age=1800, s-maxage=1800" },
  });
}

export const GET = guarded(lookup, 3);
