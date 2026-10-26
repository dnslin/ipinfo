import { AddressNotFoundError, Reader, type ReaderModel, type Asn } from "@maxmind/geoip2-node";
import { Reader as MMDBReader } from "mmdb-lib";
import { readFileSync } from "node:fs";
import { type GeoCNResult, type RawQueryResult, GeoIPError } from "./types";
import { isValidIP } from "../ip-detection";
import { databaseDownloader } from "./downloader";

export class GeoIPReader {
  private cityReader: ReaderModel | null = null;
  private asnReader: ReaderModel | null = null;
  private geocnReader: MMDBReader<Record<string, unknown>> | null = null;
  private initializing: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (this.initializing) return this.initializing;
    if (this.cityReader) return Promise.resolve();
    return this.refresh();
  }

  refresh(): Promise<void> {
    if (!this.initializing) {
      this.initializing = this.openDatabases().finally(() => {
        this.initializing = null;
      });
    }
    return this.initializing;
  }

  private async openDatabases(): Promise<void> {
    const statuses = await databaseDownloader.downloadMissingDatabases();
    this.cityReader = await Reader.open(databaseDownloader.getDatabasePath("GeoLite2-City.mmdb"));

    for (const status of statuses.filter((database) => database.isValid && database.name !== "GeoLite2-City.mmdb")) {
      const filepath = databaseDownloader.getDatabasePath(status.name);
      try {
        if (status.name === "GeoLite2-ASN.mmdb") {
          this.asnReader = await Reader.open(filepath);
        } else if (status.name === "GeoCN.mmdb") {
          this.geocnReader = new MMDBReader<Record<string, unknown>>(readFileSync(filepath));
        }
      } catch (error) {
        console.warn(`补充数据库 ${filepath} 无法读取:`, error);
      }
    }
  }

  async queryIP(ip: string): Promise<RawQueryResult[]> {
    if (!isValidIP(ip)) {
      throw new GeoIPError(`无效的IP地址格式: ${ip}`, "INVALID_IP");
    }
    await this.initialize();
    if (!this.cityReader) throw new GeoIPError("城市数据库未初始化", "DB_NOT_FOUND");

    let cityData;
    try {
      cityData = this.cityReader.city(ip);
    } catch (error) {
      if (error instanceof AddressNotFoundError) {
        throw new GeoIPError(`未找到IP地址 ${ip} 的地理位置信息`, "QUERY_FAILED");
      }
      throw new GeoIPError(`城市数据库查询 ${ip} 失败: ${error instanceof Error ? error.message : String(error)}`, "QUERY_FAILED");
    }

    let asnData: Asn | undefined;
    if (this.asnReader) {
      try {
        asnData = this.asnReader.asn(ip);
      } catch (error) {
        if (!(error instanceof AddressNotFoundError)) console.warn(`ASN查询 ${ip} 失败:`, error);
      }
    }

    const results: RawQueryResult[] = [{
      sourceInfo: { source: "maxmind", timestamp: Date.now() },
      cityData,
      asnData,
    }];
    if (this.geocnReader) {
      try {
        const data = this.geocnReader.get(ip);
        if (data) results.push({ sourceInfo: { source: "geocn", timestamp: Date.now() }, cityData: data as GeoCNResult });
      } catch (error) {
        console.warn(`GeoCN查询 ${ip} 失败:`, error);
      }
    }
    return results;
  }

  destroy(): void {
    this.cityReader = null;
    this.asnReader = null;
    this.geocnReader = null;
  }
}

export const geoIPReader = new GeoIPReader();
