import { singleton } from "../singleton";
import { CacheEntry, QueryConfig } from "./types";
import { IPInfo } from "../store";

/**
 * IP查询缓存系统
 * 使用LRU策略和基于地理位置的智能TTL
 */
export class IPQueryCache {
  private cache = new Map<string, CacheEntry>();
  private hitOrder = new Map<string, number>(); // 用于LRU排序
  private currentOrder = 0;

  private config: QueryConfig = {
    enableCache: true,
    maxCacheSize: 10000,
    defaultTTL: 3600000, // 1小时
    preferredSource: "auto",
    fallbackEnabled: true,
  };

  constructor(config?: Partial<QueryConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * 获取缓存的IP信息
   */
  get(ip: string): IPInfo | null {
    if (!this.config.enableCache) {
      return null;
    }

    const entry = this.cache.get(ip);
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.delete(ip);
      return null;
    }

    // 更新命中信息
    this.updateHitInfo(ip, entry);

    return entry.data;
  }

  /**
   * 设置缓存条目
   */
  set(ip: string, data: IPInfo): void {
    if (!this.config.enableCache) {
      return;
    }

    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    // 计算TTL
    const ttl = this.calculateTTL(data);

    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      hits: 1,
      ttl,
    };

    this.cache.set(ip, entry);
    this.hitOrder.set(ip, ++this.currentOrder);
  }

  /**
   * 删除缓存条目
   */
  delete(ip: string): boolean {
    this.hitOrder.delete(ip);
    return this.cache.delete(ip);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.hitOrder.clear();
    this.currentOrder = 0;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalQueries: number;
  } {
    let totalHits = 0;
    let totalQueries = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalQueries += entry.hits; // 简化统计，实际应该记录总查询数
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: totalQueries > 0 ? totalHits / totalQueries : 0,
      totalHits,
      totalQueries,
    };
  }

  /**
   * 检查缓存条目是否过期
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * 更新命中信息
   */
  private updateHitInfo(ip: string, entry: CacheEntry): void {
    entry.hits++;
    this.hitOrder.set(ip, ++this.currentOrder);
  }

  /**
   * LRU淘汰最少使用的条目
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // 找到最少使用的条目
    let lruKey = "";
    let minOrder = Infinity;

    for (const [key, order] of this.hitOrder) {
      if (order < minOrder) {
        minOrder = order;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
    }
  }

  /**
   * 根据地理位置计算智能TTL
   */
  private calculateTTL(data: IPInfo): number {
    let ttl = this.config.defaultTTL;

    // 基于数据精度调整TTL
    switch (data.accuracy) {
      case "high":
        ttl *= 2; // 高精度数据缓存更长时间
        break;
      case "medium":
        ttl *= 1.5;
        break;
      case "low":
        ttl *= 0.5; // 低精度数据缓存较短时间
        break;
    }

    // 基于数据源调整TTL
    if (data.source === "GeoCN") {
      ttl *= 1.5; // GeoCN数据在中国地区更稳定
    }

    // 基于地理位置调整TTL
    if (data.countryCode === "CN") {
      ttl *= 1.2; // 中国IP变化相对较少
    }

    // 基于IP类型调整TTL
    if (data.ipVersion === "IPv6") {
      ttl *= 0.8; // IPv6地址可能变化更频繁
    }

    return Math.max(ttl, 300000); // 最少缓存5分钟
  }

  /**
   * 清理过期缓存
   */
  cleanupExpired(): number {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [ip, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(ip);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 预热缓存（使用常见IP进行预查询）
   */
  async warmup(
    commonIPs: string[],
    queryFunction: (ip: string) => Promise<IPInfo>
  ): Promise<void> {
    const promises = commonIPs.map(async (ip) => {
      try {
        // 检查是否已缓存
        if (this.get(ip)) {
          return;
        }

        // 查询并缓存
        const result = await queryFunction(ip);
        this.set(ip, result);
      } catch (error) {
        console.warn(`缓存预热失败 - IP: ${ip}`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 获取热点IP列表
   */
  getHotIPs(
    limit: number = 10
  ): Array<{ ip: string; hits: number; data: IPInfo }> {
    const entries = Array.from(this.cache.entries())
      .map(([ip, entry]) => ({
        ip,
        hits: entry.hits,
        data: entry.data,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);

    return entries;
  }

  /**
   * 导出缓存数据（用于持久化）
   */
  export(): { [key: string]: CacheEntry } {
    const exported: { [key: string]: CacheEntry } = {};

    for (const [ip, entry] of this.cache) {
      // 只导出未过期的数据
      if (!this.isExpired(entry)) {
        exported[ip] = entry;
      }
    }

    return exported;
  }

  /**
   * 导入缓存数据（用于恢复）
   */
  import(data: { [key: string]: CacheEntry }): number {
    let importedCount = 0;

    for (const [ip, entry] of Object.entries(data)) {
      // 检查数据有效性
      if (entry.data && !this.isExpired(entry)) {
        this.cache.set(ip, entry);
        this.hitOrder.set(ip, ++this.currentOrder);
        importedCount++;
      }
    }

    return importedCount;
  }
}

// 全局缓存实例
export const globalIPCache = singleton("ipCache", () => new IPQueryCache());
