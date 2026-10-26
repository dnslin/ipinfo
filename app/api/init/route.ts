import { NextResponse } from "next/server";
import { startupCheckService } from "@/lib/geoip/startup-check";

export async function GET() {
  try {
    await startupCheckService.checkDatabases();
    return NextResponse.json({ success: true, data: startupCheckService.getStatus() });
  } catch (error) {
    console.error("获取数据库状态失败:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "获取数据库状态失败" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await startupCheckService.performStartupCheck();
    const status = startupCheckService.getStatus();
    return NextResponse.json({
      success: status.canQuery,
      message: status.isReady ? "数据库初始化完成" : "基础查询已可用，部分补充数据库不可用",
      data: status,
    });
  } catch (error) {
    console.error("数据库初始化失败:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "数据库初始化失败",
      data: startupCheckService.getStatus(),
    }, { status: 503 });
  }
}
