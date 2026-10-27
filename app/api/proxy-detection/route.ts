import { NextRequest, NextResponse } from "next/server";
import { detectProxy, ProxyDetectionResult } from "@/lib/ip-detection";
import { guarded } from "@/lib/api-guard";

/**
 * 代理检测API路由
 * GET请求：检测当前客户端的代理使用情况
 */
async function detect(request: NextRequest) {
  try {
    console.log("开始代理检测...");
    
    // 执行代理检测
    const result: ProxyDetectionResult = await detectProxy(request);
    
    console.log("代理检测完成:", {
      headerIP: result.headerIP,
      domesticIP: result.domesticIP,
      foreignIP: result.foreignIP,
      proxyType: result.proxyType,
      confidence: result.confidence,
      detectionTime: result.detectionTime,
      errorCount: result.errors.length,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60", // 缓存1分钟
      },
    });
  } catch (error) {
    console.error("代理检测失败:", error);
    
    // 返回错误信息，但保持API结构一致
    const errorResult: ProxyDetectionResult = {
      headerIP: null,
      domesticIP: null,
      foreignIP: null,
      isUsingProxy: false,
      proxyType: 'unknown',
      confidence: 0,
      errors: [error instanceof Error ? error.message : "代理检测失败"],
      detectionTime: 0,
    };

    return NextResponse.json(errorResult, {
      status: 500,
    });
  }
}

/**
 * POST请求：检测指定IP的代理情况（可选功能）
 */
async function detectEnabled(request: NextRequest) {
  try {
    const body = await request.json();
    const { enableProxyDetection } = body;

    if (!enableProxyDetection) {
      return NextResponse.json(
        { error: "代理检测未启用" },
        { status: 400 }
      );
    }

    // 执行代理检测
    const result: ProxyDetectionResult = await detectProxy(request);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    console.error("代理检测POST请求失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "代理检测失败" },
      { status: 500 }
    );
  }
}

export const GET = guarded(detect, 3);
export const POST = guarded(detectEnabled, 3);
