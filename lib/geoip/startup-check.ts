import { databaseDownloader, type DatabaseStatus } from "./downloader";
import { geoIPReader } from "./reader";

export interface StartupCheckStatus {
  isChecking: boolean;
  isDownloading: boolean;
  databases: DatabaseStatus[];
  isReady: boolean;
  canQuery: boolean;
  error: string | null;
}

export class StartupCheckService {
  private pending: Promise<void> | null = null;
  private status = {
    databases: [] as DatabaseStatus[],
    isReady: false,
    canQuery: false,
    error: null as string | null,
  };

  getStatus(): StartupCheckStatus {
    return {
      ...this.status,
      isChecking: this.pending !== null,
      isDownloading: databaseDownloader.isCurrentlyDownloading(),
    };
  }

  async checkDatabases(): Promise<DatabaseStatus[]> {
    const databases = await databaseDownloader.checkDatabases();
    const missing = databases.filter((database) => !database.isValid);
    this.status = {
      databases,
      isReady: missing.length === 0,
      canQuery: databases.some((database) => database.name === "GeoLite2-City.mmdb" && database.isValid),
      error: missing.length
        ? missing.map((database) => `${database.name}: ${database.error ?? "文件缺失"}`).join("; ")
        : null,
    };
    return databases;
  }

  performStartupCheck(): Promise<void> {
    if (!this.pending) {
      this.pending = this.initialize().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  private async initialize(): Promise<void> {
    try {
      // Explicit initialization retries missing supplements; normal lookups reuse open readers.
      await geoIPReader.refresh();
      await this.checkDatabases();
    } catch (error) {
      await this.checkDatabases();
      this.status.canQuery = false;
      this.status.isReady = false;
      this.status.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  reset(): void {
    this.status = { databases: [], isReady: false, canQuery: false, error: null };
  }
}

export const startupCheckService = new StartupCheckService();
