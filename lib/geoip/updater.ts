import { singleton } from "../singleton";
import { databaseDownloader, type UpdateResult } from "./downloader";
import { geoIPReader } from "./reader";
import { globalIPCache } from "./cache";

export interface UpdateState {
  intervalHours: number;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastResults: UpdateResult[];
}

const HOUR = 60 * 60 * 1000;

// GEOIP_UPDATE_INTERVAL 以小时计，默认 24；设为 0 关闭自动更新。
export function readUpdateInterval(): number {
  const value = Number(process.env.GEOIP_UPDATE_INTERVAL ?? 24);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

class DatabaseUpdater {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<UpdateResult[]> | null = null;
  private state: UpdateState = { intervalHours: 0, lastCheckedAt: null, nextCheckAt: null, lastResults: [] };

  getState(): UpdateState {
    return { ...this.state, intervalHours: readUpdateInterval() };
  }

  // 有文件被替换时重新打开数据库并清空查询缓存，之后的查询使用新数据。
  run(): Promise<UpdateResult[]> {
    if (!this.running) {
      this.running = (async () => {
        const results = await databaseDownloader.checkForUpdates();
        if (results.some((result) => result.outcome === "updated")) {
          await geoIPReader.refresh();
          globalIPCache.clear();
        }
        this.state.lastCheckedAt = new Date().toISOString();
        this.state.lastResults = results;
        return results;
      })().finally(() => { this.running = null; });
    }
    return this.running;
  }

  start(initialDelayMs = 5 * 60 * 1000) {
    const hours = readUpdateInterval();
    if (!hours || this.timer) return;
    const schedule = (delay: number) => {
      this.state.nextCheckAt = new Date(Date.now() + delay).toISOString();
      this.timer = setTimeout(async () => {
        try {
          const results = await this.run();
          const updated = results.filter((result) => result.outcome === "updated");
          if (updated.length) console.log(`数据库已更新: ${updated.map((result) => `${result.name}@${result.version}`).join(", ")}`);
        } catch (error) {
          console.warn("数据库更新检查失败:", error);
        }
        schedule(hours * HOUR);
      }, delay);
      this.timer.unref?.();
    };
    schedule(initialDelayMs);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state.nextCheckAt = null;
  }
}

export const databaseUpdater = singleton("databaseUpdater", () => new DatabaseUpdater());
