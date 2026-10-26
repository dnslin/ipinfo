import type { City, Asn, Names } from "@maxmind/geoip2-node";

// MaxMind City查询结果类型（基于@maxmind/geoip2-node的City类型）
export type MaxMindCityResult = City;

// MaxMind ASN查询结果类型（基于@maxmind/geoip2-node的Asn类型）
export type MaxMindASNResult = Asn;

// 重新导出Names类型供其他模块使用
export type { Names };

// 中国ISP ASN映射表
export const CHINESE_ISP_ASN_MAP: { [key: number]: string } = {
  9812: "东方有线",
  9389: "中国长城",
  17962: "天威视讯",
  17429: "歌华有线",
  7497: "科技网",
  24139: "华数",
  9801: "中关村",
  4538: "教育网",
  24151: "CNNIC",
  // 中国移动
  38019: "中国移动",
  139080: "中国移动",
  9808: "中国移动",
  24400: "中国移动",
  134810: "中国移动",
  24547: "中国移动",
  56040: "中国移动",
  56041: "中国移动",
  56042: "中国移动",
  56044: "中国移动",
  132525: "中国移动",
  56046: "中国移动",
  56047: "中国移动",
  56048: "中国移动",
  59257: "中国移动",
  24444: "中国移动",
  24445: "中国移动",
  137872: "中国移动",
  9231: "中国移动",
  58453: "中国移动",
  // 中国电信
  4134: "中国电信",
  4812: "中国电信",
  23724: "中国电信",
  136188: "中国电信",
  137693: "中国电信",
  17638: "中国电信",
  140553: "中国电信",
  4847: "中国电信",
  140061: "中国电信",
  136195: "中国电信",
  17799: "中国电信",
  139018: "中国电信",
  134764: "中国电信",
  // 中国联通
  4837: "中国联通",
  4808: "中国联通",
  134542: "中国联通",
  134543: "中国联通",
  // 云服务商
  59019: "金山云",
  135377: "优刻云",
  45062: "网易云",
  37963: "阿里云",
  45102: "阿里云国际",
  45090: "腾讯云",
  132203: "腾讯云国际",
  55967: "百度云",
  38365: "百度云",
  58519: "华为云",
  55990: "华为云",
  136907: "华为云",
  // 其他
  4609: "澳門電訊",
  13335: "Cloudflare",
  55960: "亚马逊云",
  14618: "亚马逊云",
  16509: "亚马逊云",
  15169: "谷歌云",
  396982: "谷歌云",
  36492: "谷歌云",
};

// 中国省份标准化列表
export const CHINESE_PROVINCES = [
  "内蒙古",
  "黑龙江",
  "河北",
  "山西",
  "吉林",
  "辽宁",
  "江苏",
  "浙江",
  "安徽",
  "福建",
  "江西",
  "山东",
  "河南",
  "湖北",
  "湖南",
  "广东",
  "海南",
  "四川",
  "贵州",
  "云南",
  "陕西",
  "甘肃",
  "青海",
  "广西",
  "西藏",
  "宁夏",
  "新疆",
  "北京",
  "天津",
  "上海",
  "重庆",
];

// 特别行政区映射
export const SPECIAL_REGIONS_MAP: { [key: string]: string } = {
  香港: "中国香港",
  澳门: "中国澳门",
  台湾: "中国台湾",
};

// 语言优先级列表
export const LANGUAGE_PRIORITY = ["zh-CN", "en"];

// GeoCN数据库查询结果
export interface GeoCNResult {
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  isp?: string;
  type?: string;
  desc?: string;
  lat?: number;
  lng?: number;
}

// 数据源信息
export interface DataSourceInfo {
  source: "maxmind" | "geocn";
  accuracy: number;
  completeness: number;
  timestamp: number;
}

// 原始查询结果包装
export interface RawQueryResult {
  sourceInfo: DataSourceInfo;
  cityData?: City | GeoCNResult;
  asnData?: Asn;
}

// 缓存条目
export interface CacheEntry {
  data: import("../store").IPInfo;
  timestamp: number;
  hits: number;
  ttl: number;
}

// 查询配置
export interface QueryConfig {
  enableCache: boolean;
  maxCacheSize: number;
  defaultTTL: number;
  preferredSource: "auto" | "maxmind" | "geocn";
  fallbackEnabled: boolean;
}

// Nominatim API响应类型
export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: string[];
}

// 地理编码配置
export interface GeocodeConfig {
  cacheEnabled: boolean;
  cacheTTL: number; // 秒
  requestTimeout: number; // 毫秒
  maxRetries: number;
  rateLimitDelay: number; // 毫秒
  nominatimBaseUrl: string;
}

// 坐标结果
export interface CoordinateResult {
  latitude: number;
  longitude: number;
  accuracy?: string;
  source: "geocn" | "nominatim";
}

// 错误类型
export class GeoIPError extends Error {
  constructor(
    message: string,
    public code:
      | "DB_NOT_FOUND"
      | "INVALID_IP"
      | "QUERY_FAILED"
      | "MERGE_FAILED"
      | "INVALID_DATABASE"
      | "DOWNLOAD_FAILED",
    public source?: string
  ) {
    super(message);
    this.name = "GeoIPError";
  }
}

