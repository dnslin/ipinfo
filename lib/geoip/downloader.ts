import { singleton } from "../singleton";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Reader } from "mmdb-lib";
import { GeoIPError } from "./types";

const DATABASE_URLS = {
  "GeoLite2-City.mmdb": "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb",
  "GeoLite2-ASN.mmdb": "https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb",
  "GeoCN.mmdb": "https://github.com/ljxi/GeoCN/releases/latest/download/GeoCN.mmdb",
};

type DatabaseName = keyof typeof DATABASE_URLS;
const VERSIONS_FILE = "versions.json";

export interface DatabaseStatus {
  name: string;
  exists: boolean;
  size: number;
  lastModified: Date | null;
  isValid: boolean;
  databaseType?: string;
  buildDate?: Date;
  // GitHub Release 的版本标签，例如 2026.10.25；手动放入的文件没有记录时为空
  version?: string;
  error?: string;
}

interface VersionRecord {
  source: string;
  updatedAt: string;
}

export interface UpdateResult {
  name: string;
  outcome: "updated" | "current" | "skipped" | "failed";
  version?: string;
  message?: string;
}

// 发布地址形如 .../releases/download/<tag>/<file>，取 tag 作为版本号。
export function releaseTag(source: string | undefined): string | undefined {
  return source?.match(/\/releases\/download\/([^/]+)\//)?.[1];
}

export class DatabaseDownloader {
  private pending: Promise<DatabaseStatus[]> | null = null;
  // 下载与更新串行执行，避免同一个文件被两个任务同时写入。
  private queue: Promise<unknown> = Promise.resolve();
  private active = 0;
  private errors = new Map<string, string>();
  // 校验需要读取整个文件，按大小与修改时间缓存结果，状态接口可以频繁调用。
  private validated = new Map<string, { key: string; status: Pick<DatabaseStatus, "isValid" | "databaseType" | "buildDate" | "error"> }>();

  constructor(private readonly dbPath = path.join(process.cwd(), "lib", "data")) {}

  getDatabasePath(filename: string): string {
    return path.join(this.dbPath, filename);
  }

  private readVersions(): Partial<Record<DatabaseName, VersionRecord>> {
    try {
      return JSON.parse(fs.readFileSync(this.getDatabasePath(VERSIONS_FILE), "utf8"));
    } catch {
      return {};
    }
  }

  private recordVersion(name: string, source: string) {
    const versions = this.readVersions();
    versions[name as DatabaseName] = { source, updatedAt: new Date().toISOString() };
    const filepath = this.getDatabasePath(VERSIONS_FILE);
    fs.writeFileSync(`${filepath}.partial`, JSON.stringify(versions, null, 2));
    fs.renameSync(`${filepath}.partial`, filepath);
  }

  async checkDatabases(): Promise<DatabaseStatus[]> {
    const versions = this.readVersions();
    return Object.keys(DATABASE_URLS).map((name) => {
      const filepath = this.getDatabasePath(name);
      const status: DatabaseStatus = {
        name,
        exists: fs.existsSync(filepath),
        size: 0,
        lastModified: null,
        isValid: false,
        error: this.errors.get(name),
      };
      if (!status.exists) return status;

      try {
        const stats = fs.statSync(filepath);
        status.size = stats.size;
        status.lastModified = stats.mtime;
        const key = `${stats.size}:${stats.mtimeMs}`;
        let cached = this.validated.get(name);
        if (cached?.key !== key) {
          try {
            const reader = new Reader(fs.readFileSync(filepath));
            cached = { key, status: { isValid: true, databaseType: reader.metadata.databaseType, buildDate: reader.metadata.buildEpoch, error: undefined } };
          } catch (error) {
            cached = { key, status: { isValid: false, error: error instanceof Error ? error.message : String(error) } };
          }
          this.validated.set(name, cached);
        }
        Object.assign(status, cached.status);
        if (status.isValid) status.version = releaseTag(versions[name as DatabaseName]?.source);
      } catch (error) {
        status.error = error instanceof Error ? error.message : String(error);
      }
      return status;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.active += 1;
    const run = this.queue.then(task, task).finally(() => { this.active -= 1; });
    this.queue = run.catch(() => undefined);
    return run;
  }

  downloadMissingDatabases(): Promise<DatabaseStatus[]> {
    if (!this.pending) {
      this.pending = this.enqueue(() => this.downloadMissing()).finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  private async downloadMissing(): Promise<DatabaseStatus[]> {
    const statuses = await this.checkDatabases();
    const missing = statuses.filter((database) => !database.isValid);
    await Promise.allSettled(missing.map((database) => this.downloadDatabase(database.name)));

    const finalStatuses = await this.checkDatabases();
    const city = finalStatuses.find((database) => database.name === "GeoLite2-City.mmdb");
    if (!city?.isValid) {
      throw new GeoIPError(`城市数据库不可用: ${city?.error ?? "文件缺失"}`, "DOWNLOAD_FAILED");
    }
    return finalStatuses;
  }

  // GitHub 的 latest 地址会 302 到带版本标签的地址，只取跳转目标，不下载文件。
  private async resolveRelease(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15_000) });
      const location = response.headers.get("location");
      return response.status >= 300 && response.status < 400 && location ? new URL(location, url).href : null;
    } catch {
      return null;
    }
  }

  // 下载到临时文件并校验格式，返回新文件的构建时间；调用方决定是否替换正式文件。
  private async fetchToPartial(filename: string, url: string): Promise<{ partialPath: string; buildDate: Date }> {
    const partialPath = `${this.getDatabasePath(filename)}.partial`;
    try {
      fs.mkdirSync(this.dbPath, { recursive: true });
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      if (!response.body) throw new Error("响应体为空");
      await pipeline(Readable.fromWeb(response.body as NodeReadableStream), fs.createWriteStream(partialPath));
      // Parse the actual format. Database sizes change between releases.
      const reader = new Reader(fs.readFileSync(partialPath));
      return { partialPath, buildDate: reader.metadata.buildEpoch };
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
      throw error;
    }
  }

  private async downloadDatabase(filename: string): Promise<void> {
    const url = DATABASE_URLS[filename as DatabaseName];
    const source = await this.resolveRelease(url);
    try {
      const { partialPath } = await this.fetchToPartial(filename, source ?? url);
      fs.renameSync(partialPath, this.getDatabasePath(filename));
      if (source) this.recordVersion(filename, source);
      this.errors.delete(filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.set(filename, message);
      console.warn(`数据库 ${filename} 下载失败 (${url}): ${message}`);
      throw new GeoIPError(`下载 ${filename} 失败: ${message}`, "DOWNLOAD_FAILED");
    }
  }

  /**
   * 检查已有数据库是否有新版本。先比较发布标签，标签变化才下载；
   * 新文件校验通过且构建时间不早于当前文件时，原子替换正式文件。
   */
  checkForUpdates(): Promise<UpdateResult[]> {
    return this.enqueue(async () => {
      const statuses = await this.checkDatabases();
      const versions = this.readVersions();
      return Promise.all(statuses.map(async (status): Promise<UpdateResult> => {
        const { name } = status;
        if (!status.isValid) return { name, outcome: "skipped", message: "文件缺失或无效，等待重新下载" };
        const source = await this.resolveRelease(DATABASE_URLS[name as DatabaseName]);
        if (!source) return { name, outcome: "skipped", message: "无法获取远端版本" };
        const version = releaseTag(source);
        if (versions[name as DatabaseName]?.source === source) return { name, outcome: "current", version };

        try {
          const { partialPath, buildDate } = await this.fetchToPartial(name, source);
          if (status.buildDate && buildDate < status.buildDate) {
            fs.rmSync(partialPath, { force: true });
            this.recordVersion(name, source);
            return { name, outcome: "current", version, message: "远端文件不比本地新" };
          }
          fs.renameSync(partialPath, this.getDatabasePath(name));
          this.recordVersion(name, source);
          this.errors.delete(name);
          return { name, outcome: "updated", version };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`数据库 ${name} 更新失败 (${source}): ${message}`);
          return { name, outcome: "failed", version, message };
        }
      }));
    });
  }

  isCurrentlyDownloading(): boolean {
    return this.active > 0;
  }
}

export const databaseDownloader = singleton("databaseDownloader", () => new DatabaseDownloader());
