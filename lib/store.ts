import { create } from "zustand";
import { toast } from "sonner";
import { ProxyDetectionResult, detectIPVersion, detectProxyClient, isPrivateIP } from "@/lib/ip-detection";
import { DEFAULT_PROBES, probeAddress, type ProbeConfig, type StackVersion } from "@/lib/dual-stack";

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
  source: "MaxMind" | "GeoCN" | "MeiTuan" | "Local";
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

// 访客双栈地址：undefined 为检测中，null 为该协议不可用
export type ConnectionStack = Record<StackVersion, string | null | undefined>;

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
  stack: ConnectionStack;

  // 动作
  setQuery: (query: string) => void;
  // auto 表示查询的是访客自己的连接地址（来自双栈检测），而不是手动输入。
  executeQuery: (ip?: string, options?: { auto?: boolean }) => Promise<void>;
  detectStack: () => Promise<ConnectionStack>;
  executeProxyDetection: () => Promise<void>;
  clearError: () => void;
  addToHistory: (data: IPInfo) => void;
  clearHistory: () => void;
}

let queryController: AbortController | null = null;
let stackDetection: Promise<ConnectionStack> | null = null;

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
  stack: { IPv4: undefined, IPv6: undefined },

  // 设置查询内容
  setQuery: (query: string) => set({ currentQuery: query }),

  // 执行IP查询
  executeQuery: async (ip?: string, options?: { auto?: boolean }) => {
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
      const post = (target?: string) => fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip: target || undefined }), // 发送undefined而不是空字符串
        signal: controller.signal,
      });
      let response = await post(queryIP);

      // 服务端拿不到来源地址（例如没有反向代理头）时，改用浏览器检测到的地址。
      if (!response.ok && !queryIP) {
        const stack = await get().detectStack();
        const fallback = stack.IPv4 ?? stack.IPv6;
        if (fallback && !controller.signal.aborted) response = await post(fallback);
      }

      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error || `查询失败: ${response.status} ${response.statusText}`);
      }

      const result: IPInfo = await response.json();
      if (controller.signal.aborted) return;

      set({
        ipData: result,
        error: null, // 确保清除错误状态
        isAutoDetected: !queryIP || Boolean(options?.auto),
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

  // 检测访客的 IPv4 与 IPv6：本站只回显当前连接的那一种，另一种交给浏览器请求单栈探测接口。
  detectStack: () => {
    if (stackDetection) return stackDetection;
    stackDetection = (async () => {
      let probes: ProbeConfig = DEFAULT_PROBES;
      const stack: ConnectionStack = { IPv4: undefined, IPv6: undefined };
      try {
        const response = await fetch("/api/ip", { cache: "no-store" });
        if (response.ok) {
          const result: { ip: string | null; probes?: ProbeConfig } = await response.json();
          if (result.probes) probes = result.probes;
          const version = result.ip ? detectIPVersion(result.ip) : "invalid";
          // 本地或内网回显（例如开发环境的 ::1）不代表公网出口，仍交给探测接口。
          if (version !== "invalid" && result.ip && !isPrivateIP(result.ip)) {
            stack[version] = result.ip;
            set({ stack: { ...get().stack, [version]: result.ip } });
          }
        }
      } catch {
        // 回显接口不可用时两种协议都交给探测接口
      }
      await Promise.all((["IPv4", "IPv6"] as const).map(async (version) => {
        if (stack[version]) return;
        stack[version] = await probeAddress(version === "IPv4" ? probes.ipv4 : probes.ipv6, version);
        set({ stack: { ...get().stack, [version]: stack[version] } });
      }));
      return stack;
    })();
    return stackDetection;
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
