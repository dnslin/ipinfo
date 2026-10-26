import { NextRequest, NextResponse } from "next/server";
import { MeituanAPIService, MeituanLocationNotFoundError } from "@/lib/meituan-api";
import { isValidIP } from "@/lib/ip-detection";

// POST请求：使用美团API查询IP信息
export async function POST(request: NextRequest) {
  let ip: unknown;
  try {
    ip = (await request.json())?.ip;
  } catch {
    return NextResponse.json({ error: "无效的JSON请求体" }, { status: 400 });
  }

  if (!ip) {
    return NextResponse.json({ error: "请提供IP地址" }, { status: 400 });
  }

  // 验证IP格式
  if (typeof ip !== "string" || !isValidIP(ip)) {
    return NextResponse.json({ error: "无效的IP地址格式" }, { status: 400 });
  }

  // 检查是否适合使用美团API
  if (!MeituanAPIService.isSuitableForMeituan(ip)) {
    return NextResponse.json(
      { error: "该IP不适合使用美团API查询" },
      { status: 400 }
    );
  }

  try {
    // 使用美团API查询增强信息
    const result = await MeituanAPIService.enhancedIPQuery(ip);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=600, s-maxage=600", // 缓存10分钟
      },
    });
  } catch (error) {
    if (error instanceof MeituanLocationNotFoundError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 404 });
    }

    console.error("美团API查询错误:", error);
    return NextResponse.json(
      { code: "MEITUAN_UPSTREAM_UNAVAILABLE", error: "美团服务暂时不可用，请稍后重试" },
      { status: 503 }
    );
  }
}
