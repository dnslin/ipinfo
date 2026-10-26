import { create } from "zustand";
import { toast } from "sonner";
import { ProxyDetectionResult, detectProxyClient } from "@/lib/ip-detection";

// IP信息接口定义
export interface IPInfo {
  ip: string;
  country: string;
  countryCode: string;
  province?: string;
  provinceCode?: string;
  city?: string;
  cityCode?: string;
  district?: string;
  districtCode?: string;
  isp?: string;
  net?: string;
  // 新增字段，匹配Python版本的输出结构
  regions?: string[];
  regions_short?: string[];
  type?: string;
  as?: {
    number?: number;
    name?: string;
    info?: string;
  };
  addr?: string;
  registered_country?: {
    code: string;
    name: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracy_radius?: number;
    source: "MaxMind" | "MeiTuan" | null;
  };
  timezone?: string;
  postal?: string;
  accuracy: "high" | "medium" | "low";
  source: "MaxMind" | "GeoCN" | "MeiTuan";
  ipVersion: "IPv4" | "IPv6";
  // 代理检测信息
  proxyDetection?: ProxyDetectionResult;
  // 美团特有字段
  meituan?: {
    areaName?: string; // 区域名称，如"王府井/东单"
    detail?: string; // 详细地址，如"正义路甲4号-B座"
    cityPinyin?: string; // 城市拼音
    openCityName?: string; // 开放城市名
    isForeign?: boolean; // 是否为境外
    dpCityId?: number; // 美团城市ID
    area?: number; // 区域编号
    parentArea?: number; // 父区域编号
    fromwhere?: string; // 数据来源标识
    adcode?: string; // 行政区划代码
  };
}

// 状态管理接口
interface IPQueryState {
  // 数据状态
  currentQuery: string;
  ipData: IPInfo | null;
  queryHistory: IPInfo[];

  // UI状态
  isLoading: boolean;
  error: string | null;
  isAutoDetected: boolean;
  isProxyDetecting: boolean;

  // 动作
  setQuery: (query: string) => void;
  executeQuery: (ip?: string) => Promise<void>;
  executeProxyDetection: () => Promise<void>;
  clearError: () => void;
  addToHistory: (data: IPInfo) => void;
  clearHistory: () => void;
}

let queryController: AbortController | null = null;

// 创建store
export const useIPQueryStore = create<IPQueryState>((set, get) => ({
  // 初始状态
  currentQuery: "",
  ipData: null,
  queryHistory: [],
  isLoading: false,
  error: null,
  isAutoDetected: false,
  isProxyDetecting: false,

  // 设置查询内容
  setQuery: (query: string) => set({ currentQuery: query }),

  // 执行IP查询
  executeQuery: async (ip?: string) => {
    queryController?.abort();
    const controller = new AbortController();
    queryController = controller;

    // 开始查询时清除之前的状态
    set({
      isLoading: true,
      error: null,
      ipData: null, // 清除之前的IP数据，避免显示旧数据
    });

    try {
      const queryIP = ip?.trim();
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip: queryIP || undefined }), // 发送undefined而不是空字符串
        signal: controller.signal,
      });

      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error || `查询失败: ${response.status} ${response.statusText}`);
      }

      const result: IPInfo = await response.json();
      if (controller.signal.aborted) return;

      set({
        ipData: result,
        error: null, // 确保清除错误状态
        isAutoDetected: !queryIP,
        currentQuery: result.ip,
      });

      // 显示成功提示
      toast.success(`查询成功`, {
        description: `IP: ${result.ip} - ${result.country}${
          result.city ? ` · ${result.city}` : ""
        }`,
        duration: 1000,
      });

      // 添加到历史记录
      get().addToHistory(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage = error instanceof Error ? error.message : "查询失败";

      set({
        error: errorMessage,
        ipData: null, // 确保清除IP数据
      });

      // 只显示toast错误提示，不在页面显示错误卡片
      toast.error("查询失败", {
        description: errorMessage,
        duration: 2000,
      });
    } finally {
      if (!controller.signal.aborted) {
        queryController = null;
        set({ isLoading: false });
      }
    }
  },

  // 执行代理检测
  executeProxyDetection: async () => {
    const queryData = get().ipData;
    if (!queryData || get().isProxyDetecting) return;
    set({ isProxyDetecting: true });

    try {
      // 1. 先获取headers中的IP地址
      let headerIP: string | null = null;
      try {
        const headerResponse = await fetch("/api/query", {
          method: "GET",
        });
        if (headerResponse.ok) {
          const headerData = await headerResponse.json();
          headerIP = headerData.ip;
          console.log("获取到headers IP:", headerIP);
        }
      } catch (error) {
        console.warn("获取headers IP失败:", error);
      }

      // 2. 执行客户端代理检测（直接调用外部API）
      const proxyResult: ProxyDetectionResult = await detectProxyClient(
        headerIP
      );

      // 更新当前IP数据，添加代理检测信息
      const currentData = get().ipData;
      if (currentData === queryData) {
        const updatedData: IPInfo = {
          ...currentData,
          proxyDetection: proxyResult,
        };

        set({
          ipData: updatedData,
        });

        // 显示检测结果提示
        const proxyTypeText = {
          direct: "直连",
          domestic: "国内代理",
          foreign: "国外代理",
          mixed: "混合代理",
          unknown: "未知",
        }[proxyResult.proxyType];

        toast.success("代理检测完成", {
          description: `检测结果: ${proxyTypeText} (置信度: ${Math.round(
            proxyResult.confidence * 100
          )}%)`,
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("代理检测失败:", error);

      toast.error("代理检测失败", {
        description:
          error instanceof Error ? error.message : "无法完成代理检测",
        duration: 4000,
      });
    } finally {
      set({ isProxyDetecting: false });
    }
  },

  // 清除错误
  clearError: () => set({ error: null }),

  // 添加到历史记录
  addToHistory: (data: IPInfo) => {
    const history = get().queryHistory;
    const exists = history.some((item) => item.ip === data.ip);

    if (!exists) {
      set({
        queryHistory: [data, ...history].slice(0, 10), // 只保留最近10条
      });
    }
  },

  // 清空历史记录
  clearHistory: () => set({ queryHistory: [] }),
}));
