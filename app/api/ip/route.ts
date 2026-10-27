import { NextRequest, NextResponse } from "next/server";
import { detectIPVersion, getClientIP } from "@/lib/ip-detection";
import { readProbeConfig } from "@/lib/dual-stack";

// 只回显本次连接的来源地址，不查数据库。也可作为自建 ip4/ip6 子域名的单栈探测入口。
export function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const version = ip ? detectIPVersion(ip) : "invalid";
  return NextResponse.json(
    { ip: version === "invalid" ? null : ip, version: version === "invalid" ? null : version, probes: readProbeConfig() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
