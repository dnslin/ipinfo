import { NextRequest, NextResponse } from "next/server";
import { startupCheckService } from "@/lib/geoip/startup-check";
import { databaseUpdater } from "@/lib/geoip/updater";
import { configuredToken, guardRequest, requireToken, withHeaders } from "@/lib/api-guard";

export async function GET() {
  try {
    await startupCheckService.checkDatabases();
    return NextResponse.json({ success: true, data: { ...startupCheckService.getStatus(), update: databaseUpdater.getState() } });
  } catch (error) {
    console.error("获取数据库状态失败:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "获取数据库状态失败" }, { status: 500 });
  }
}

// 请求体 {"update": true} 检查并下载新版本，需要 API_TOKEN；不带请求体时只补齐缺失的数据库。
export async function POST(request: NextRequest) {
  const body: { update?: unknown } = await request.json().catch(() => ({}));
  const update = body?.update === true;

  if (update || configuredToken()) {
    const denied = requireToken(request);
    if (denied) return denied;
  }
  const guard = guardRequest(request, 10);
  if (guard instanceof NextResponse) return guard;

  if (update) {
    try {
      const results = await databaseUpdater.run();
      await startupCheckService.checkDatabases();
      return withHeaders(NextResponse.json({ success: results.every((result) => result.outcome !== "failed"), data: { results, ...startupCheckService.getStatus() } }), guard);
    } catch (error) {
      return withHeaders(NextResponse.json({ success: false, error: error instanceof Error ? error.message : "数据库更新失败" }, { status: 500 }), guard);
    }
  }

  try {
    await startupCheckService.performStartupCheck();
    const status = startupCheckService.getStatus();
    return withHeaders(NextResponse.json({
      success: status.canQuery,
      message: status.isReady ? "数据库初始化完成" : "基础查询已可用，部分补充数据库不可用",
      data: status,
    }), guard);
  } catch (error) {
    console.error("数据库初始化失败:", error);
    return withHeaders(NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "数据库初始化失败",
      data: startupCheckService.getStatus(),
    }, { status: 503 }), guard);
  }
}
