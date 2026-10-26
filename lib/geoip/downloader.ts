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

export interface DatabaseStatus {
  name: string;
  exists: boolean;
  size: number;
  lastModified: Date | null;
  isValid: boolean;
  databaseType?: string;
  buildDate?: Date;
  error?: string;
}

export class DatabaseDownloader {
  private pending: Promise<DatabaseStatus[]> | null = null;
  private errors = new Map<string, string>();

  constructor(private readonly dbPath = path.join(process.cwd(), "lib", "data")) {}

  getDatabasePath(filename: string): string {
    return path.join(this.dbPath, filename);
  }

  async checkDatabases(): Promise<DatabaseStatus[]> {
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
        const reader = new Reader(fs.readFileSync(filepath));
        status.isValid = true;
        status.databaseType = reader.metadata.databaseType;
        status.buildDate = reader.metadata.buildEpoch;
        status.error = undefined;
      } catch (error) {
        status.error = error instanceof Error ? error.message : String(error);
      }
      return status;
    });
  }

  downloadMissingDatabases(): Promise<DatabaseStatus[]> {
    if (!this.pending) {
      this.pending = this.downloadMissing().finally(() => {
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

  private async downloadDatabase(filename: string): Promise<void> {
    const url = DATABASE_URLS[filename as keyof typeof DATABASE_URLS];
    const filepath = this.getDatabasePath(filename);
    const partialPath = `${filepath}.partial`;
    try {
      fs.mkdirSync(this.dbPath, { recursive: true });
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      if (!response.body) throw new Error("响应体为空");

      await pipeline(Readable.fromWeb(response.body as NodeReadableStream), fs.createWriteStream(partialPath));
      // Parse the actual format. Database sizes change between releases.
      new Reader(fs.readFileSync(partialPath));
      fs.renameSync(partialPath, filepath);
      this.errors.delete(filename);
    } catch (error) {
      fs.rmSync(partialPath, { force: true });
      const message = error instanceof Error ? error.message : String(error);
      this.errors.set(filename, message);
      console.warn(`数据库 ${filename} 下载失败 (${url}): ${message}`);
      throw new GeoIPError(`下载 ${filename} 失败: ${message}`, "DOWNLOAD_FAILED");
    }
  }

  isCurrentlyDownloading(): boolean {
    return this.pending !== null;
  }
}

export const databaseDownloader = new DatabaseDownloader();
