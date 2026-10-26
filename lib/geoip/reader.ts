import { Reader, ReaderModel, City, Asn } from "@maxmind/geoip2-node";
import * as mmdb from "mmdb-lib";
import * as path from "path";
import * as fs from "fs";
import { GeoCNResult, RawQueryResult, GeoIPError } from "./types";
import { isValidIP } from "../ip-detection";
import { databaseDownloader } from "./downloader";

// 数据库文件路径配置
const DB_PATH = path.join(process.cwd(), "lib", "data");
const MAXMIND_CITY_PATH = path.join(DB_PATH, "GeoLite2-City.mmdb");
const MAXMIND_ASN_PATH = path.join(DB_PATH, "GeoLite2-ASN.mmdb");
const GEOCN_PATH = path.join(DB_PATH, "GeoCN.mmdb");

/**
 * MMDB数据库读取器
 * 支持MaxMind GeoLite2和GeoCN数据库
 */
export class GeoIPReader {
  private maxmindCityReader: ReaderModel | null = null;
  private maxmindASNReader: ReaderModel | null = null;
  private geocnReader: mmdb.Reader<Record<string, unknown>> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 首先检查数据库文件状态
      await this.ensureDatabasesAvailable();

      const [maxmindCity, maxmindASN, geocn] = await Promise.allSettled([
        this.initializeMaxMindCity(),
        this.initializeMaxMindASN(),
        this.initializeGeoCN(),
      ]);

      if (maxmindCity.status === "rejected") {
        console.warn("MaxMind City数据库初始化失败:", maxmindCity.reason);
      }

      if (maxmindASN.status === "rejected") {
        console.warn("MaxMind ASN数据库初始化失败:", maxmindASN.reason);
      }

      if (geocn.status === "rejected") {
        console.warn("GeoCN数据库初始化失败:", geocn.reason);
      }

      if (!this.maxmindCityReader && !this.geocnReader) {
        throw new GeoIPError("所有数据库初始化失败", "DB_NOT_FOUND");
      }

      this.initialized = true;
      console.log("GeoIP数据库初始化完成");
    } catch (error) {
      throw new GeoIPError(
        `数据库初始化失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
        "DB_NOT_FOUND"
      );
    }
  }

  /**
   * 确保数据库文件可用，如果缺失则自动下载
   */
  private async ensureDatabasesAvailable(): Promise<void> {
    try {
      // 检查数据库状态
      const statuses = await databaseDownloader.checkDatabases();
      const missingDatabases = statuses.filter(
        (status) => !status.exists || !status.isValid
      );

      if (missingDatabases.length > 0) {
        console.log(
          `检测到 ${missingDatabases.length} 个缺失的数据库文件，开始自动下载...`
        );

        // 自动下载缺失的数据库
        await databaseDownloader.downloadMissingDatabases();

        console.log("数据库文件下载完成");
      }
    } catch (error) {
      console.error("数据库文件检查/下载失败:", error);
      // 如果自动下载失败，回退到原有的验证逻辑
      this.validateDatabaseFiles();
    }
  }

  private validateDatabaseFiles(): void {
    const files = [
      { exists: fs.existsSync(MAXMIND_CITY_PATH), name: "MaxMind City" },
      { exists: fs.existsSync(MAXMIND_ASN_PATH), name: "MaxMind ASN" },
      { exists: fs.existsSync(GEOCN_PATH), name: "GeoCN" },
    ];

    const missingFiles = files.filter((file) => !file.exists);

    if (missingFiles.length === files.length) {
      throw new GeoIPError("找不到任何MMDB数据库文件", "DB_NOT_FOUND");
    }

    if (missingFiles.length > 0) {
      console.warn(
        "缺失数据库文件:",
        missingFiles.map((f) => f.name).join(", ")
      );
    }
  }

  private async initializeMaxMindCity(): Promise<void> {
    if (!fs.existsSync(MAXMIND_CITY_PATH)) {
      throw new Error("MaxMind City数据库文件不存在");
    }
    this.maxmindCityReader = await Reader.open(MAXMIND_CITY_PATH);
  }

  private async initializeMaxMindASN(): Promise<void> {
    if (!fs.existsSync(MAXMIND_ASN_PATH)) {
      throw new Error("MaxMind ASN数据库文件不存在");
    }
    this.maxmindASNReader = await Reader.open(MAXMIND_ASN_PATH);
  }

  private async initializeGeoCN(): Promise<void> {
    if (!fs.existsSync(GEOCN_PATH)) {
      throw new Error("GeoCN数据库文件不存在");
    }
    const buffer = fs.readFileSync(GEOCN_PATH);
    this.geocnReader = new mmdb.Reader<Record<string, unknown>>(buffer);
  }

  async queryIP(ip: string): Promise<RawQueryResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!isValidIP(ip)) {
      throw new GeoIPError(`无效的IP地址格式: ${ip}`, "INVALID_IP");
    }

    const results: RawQueryResult[] = [];
    // const ipVersion = detectIPVersion(ip); // 如果没用可省略

    const queries = await Promise.allSettled([
      this.queryMaxMind(ip),
      this.queryGeoCN(ip),
    ]);

    if (queries[0].status === "fulfilled" && queries[0].value) {
      results.push(queries[0].value);
    }

    if (queries[1].status === "fulfilled" && queries[1].value) {
      results.push(queries[1].value);
    }

    if (results.length === 0) {
      throw new GeoIPError(`未找到IP地址 ${ip} 的地理位置信息`, "QUERY_FAILED");
    }

    return results;
  }

  private async queryMaxMind(ip: string): Promise<RawQueryResult | null> {
    if (!this.maxmindCityReader) return null;

    try {
      const cityResult: City = this.maxmindCityReader.city(ip);
      let asnResult: Asn | undefined;

      if (this.maxmindASNReader) {
        try {
          asnResult = this.maxmindASNReader.asn(ip);
        } catch (error) {
          console.warn("MaxMind ASN查询失败:", error);
        }
      }

      const accuracy = this.evaluateMaxMindAccuracy(cityResult);
      const completeness = this.evaluateMaxMindCompleteness(
        cityResult,
        asnResult
      );

      return {
        sourceInfo: {
          source: "maxmind",
          accuracy,
          completeness,
          timestamp: Date.now(),
        },
        cityData: cityResult,
        asnData: asnResult,
      };
    } catch (error) {
      console.warn("MaxMind查询失败:", error);
      return null;
    }
  }

  private async queryGeoCN(ip: string): Promise<RawQueryResult | null> {
    if (!this.geocnReader) return null;

    try {
      const result = this.geocnReader.get(ip); // 类型推断为 GeoCNResult | undefined
      if (!result) return null;

      const accuracy = this.evaluateGeoCNAccuracy(result);
      const completeness = this.evaluateGeoCNCompleteness(result);

      return {
        sourceInfo: {
          source: "geocn",
          accuracy,
          completeness,
          timestamp: Date.now(),
        },
        cityData: result,
      };
    } catch (error) {
      console.warn("GeoCN查询失败:", error);
      return null;
    }
  }

  private evaluateMaxMindAccuracy(data: City): number {
    let score = 0.5;

    if (data.location?.latitude && data.location?.longitude) {
      score += 0.3;

      if (data.location.accuracyRadius) {
        if (data.location.accuracyRadius <= 10) score += 0.2;
        else if (data.location.accuracyRadius <= 50) score += 0.1;
      }
    }

    if (data.city?.names) score += 0.1;

    return Math.min(score, 1.0);
  }

  private evaluateMaxMindCompleteness(cityData: City, asnData?: Asn): number {
    let score = 0;
    const maxScore = 6;

    if (cityData.country?.names) score++;
    if (cityData.subdivisions?.[0]?.names) score++;
    if (cityData.city?.names) score++;
    if (cityData.location?.latitude && cityData.location?.longitude) score++;
    if (cityData.postal?.code) score++;
    if (asnData?.autonomousSystemOrganization) score++;

    return score / maxScore;
  }

  private evaluateGeoCNAccuracy(data: GeoCNResult): number {
    let score = 0.7;
    if (data.lat && data.lng) score += 0.2;
    if (data.district) score += 0.1;
    return Math.min(score, 1.0);
  }

  private evaluateGeoCNCompleteness(data: GeoCNResult): number {
    let score = 0;
    const maxScore = 6;

    if (data.country) score++;
    if (data.province) score++;
    if (data.city) score++;
    if (data.district) score++;
    if (data.isp) score++;
    if (data.lat && data.lng) score++;

    return score / maxScore;
  }

  destroy(): void {
    this.maxmindCityReader = null;
    this.maxmindASNReader = null;
    this.geocnReader = null;
    this.initialized = false;
  }
}

export const geoIPReader = new GeoIPReader();
