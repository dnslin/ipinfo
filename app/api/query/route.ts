import { NextRequest, NextResponse } from "next/server";
import { detectIPVersion, getClientIP, isValidIP } from "@/lib/ip-detection";
import { IPInfo } from "@/lib/store";
import { geoIPService } from "@/lib/geoip";

// 真实的IP查询函数，使用MMDB数据库
async function queryIPInfo(ip: string): Promise<IPInfo> {
  const ipVersion = detectIPVersion(ip);

  if (ipVersion === "invalid") {
    throw new Error("无效的IP地址格式");
  }

  try {
    // 使用真实的GeoIP服务查询
    const result = await geoIPService.queryIPInfo(ip);
    return result;
  } catch (error) {
    console.error("IP查询失败:", error);
    throw new Error(
      `IP查询失败: ${error instanceof Error ? error.message : "未知错误"}`
    );
  }
}

// GET请求：获取客户端IP信息
export async function GET(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);

    if (!clientIP) {
      return NextResponse.json(
        { error: "无法获取客户端IP地址" },
        { status: 400 }
      );
    }

    const result = await queryIPInfo(clientIP);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("IP查询错误:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

// POST请求：查询指定IP信息
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ip } = body;

    // 如果没有提供IP，使用客户端IP
    const queryIP = ip || getClientIP(request);

    if (!queryIP) {
      return NextResponse.json(
        { error: "请提供有效的IP地址" },
        { status: 400 }
      );
    }

    // 验证IP格式
    if (!isValidIP(queryIP)) {
      return NextResponse.json({ error: "无效的IP地址格式" }, { status: 400 });
    }

    const result = await queryIPInfo(queryIP);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("IP查询错误:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}
