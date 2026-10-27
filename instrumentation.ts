// 服务启动时在后台准备数据库并开启定期更新，不阻塞启动，也不再依赖浏览器触发下载。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.GEOIP_PRELOAD !== "0") {
    const { geoIPReader } = await import("./lib/geoip/reader");
    geoIPReader.initialize().catch((error) => console.warn("数据库预加载失败，将在首次查询时重试:", error instanceof Error ? error.message : error));
  }
  const { databaseUpdater } = await import("./lib/geoip/updater");
  databaseUpdater.start();
}
