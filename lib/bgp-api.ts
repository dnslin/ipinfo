// BGP API 数据类型定义
// 按 AS 路径位置划分的方向，仅描述观测位置，不代表商业关系。
export type BGPPosition = "upstream" | "downstream" | "uncertain";

export interface BGPPeer {
  asn: number;
  name: string;
  description: string;
  country_code: string;
  position?: BGPPosition;
  // 观测强度：RIS 中看到该邻接的程度，大型 ASN 可能不提供
  power?: number;
  // RIS 按协议给出的观测计数（asn-neighbours 的 v4_peers / v6_peers）
  v4Peers?: number;
  v6Peers?: number;
}

export interface BGPPeersResponse {
  status: string;
  status_message: string;
  data: {
    ipv4_peers: BGPPeer[];
    ipv6_peers: BGPPeer[];
  };
  "@meta": {
    time_zone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface ProcessedBGPData {
  centerAsn: number;
  centerName: string;
  ipv4Peers: BGPPeer[];
  ipv6Peers: BGPPeer[];
  allPeers: BGPPeer[];
}

// "GOOGLE - Google LLC" → 组织名 "Google LLC"、注册句柄 "GOOGLE"；末尾的 ", US" 视为国家代码。
export function splitASName(raw: string): Pick<BGPPeer, "name" | "description" | "country_code"> {
  let value = raw.trim();
  let country_code = "";
  const country = value.match(/,\s*([A-Z]{2})$/);
  if (country) {
    country_code = country[1];
    value = value.slice(0, country.index).trim();
  }
  const parts = value.match(/^(\S+) - (.+)$/);
  return parts ? { name: parts[2].trim(), description: parts[1], country_code } : { name: value, description: "", country_code };
}

// BGP API 缓存
class BGPCache {
  private cache = new Map<
    number,
    { data: ProcessedBGPData; timestamp: number }
  >();
  private readonly TTL = 30 * 60 * 1000; // 30分钟缓存

  get(asn: number): ProcessedBGPData | null {
    const entry = this.cache.get(asn);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(asn);
      return null;
    }

    return entry.data;
  }

  set(asn: number, data: ProcessedBGPData): void {
    this.cache.set(asn, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const bgpCache = new BGPCache();

/**
 * 查询 ASN 的 BGP 对等关系
 */
export async function fetchBGPPeers(asn: number): Promise<ProcessedBGPData> {
  // 检查缓存
  const cached = bgpCache.get(asn);
  if (cached) {
    return cached;
  }

  try {
    // 使用本地代理 API 端点
    const response = await fetch(`/api/bgp/${asn}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error ||
          `BGP API 请求失败: ${response.status} ${response.statusText}`
      );
    }

    const processedData: ProcessedBGPData = await response.json();

    // 缓存结果
    bgpCache.set(asn, processedData);

    return processedData;
  } catch (error) {
    console.error("BGP API 查询失败:", error);
    throw new Error(
      error instanceof Error
        ? `BGP 查询失败: ${error.message}`
        : "BGP 查询失败: 未知错误"
    );
  }
}

/**
 * 清除 BGP 缓存
 */
export function clearBGPCache(): void {
  bgpCache.clear();
}
