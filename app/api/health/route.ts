import { NextResponse } from "next/server";
import { databaseDownloader } from "@/lib/geoip/downloader";
import { geoIPReader } from "@/lib/geoip/reader";
import { databaseUpdater } from "@/lib/geoip/updater";

// 健康检查：只读取状态，不触发下载。City 库可用即视为可以提供服务。
export async function GET() {
  const databases = await databaseDownloader.checkDatabases();
  const loaded = geoIPReader.loaded();
  const cityReady = loaded.city || databases.some((database) => database.name === "GeoLite2-City.mmdb" && database.isValid);
  const status = cityReady
    ? databases.every((database) => database.isValid) ? "ok" : "degraded"
    : databaseDownloader.isCurrentlyDownloading() ? "starting" : "down";

  return NextResponse.json({
    status,
    uptime: Math.round(process.uptime()),
    databases: databases.map(({ name, isValid, version, buildDate, size, error }) => ({ name, isValid, version, buildDate, size, error })),
    update: databaseUpdater.getState(),
  }, {
    status: cityReady ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
