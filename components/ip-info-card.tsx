"use client";

import React from "react";
import { motion } from "framer-motion";
import ReactCountryFlag from "react-country-flag";
import {
  MapPin,
  Globe,
  Wifi,
  Clock,
  Building,
  Shield,
  Copy,
  Search,
  Loader2,
  Network,
  Router,
  MapIcon,
  Zap,
  Eye,
  Hash,
  Flag,
  Building2,
  Server,
  Layers,
  Activity,
  CheckCircle,
  HelpCircle,
  Shuffle,
} from "lucide-react";
import { IPInfo, useIPQueryStore } from "@/lib/store";
import { useState, useEffect } from "react";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import LazyIPMap from "@/components/lazy-ip-map";
import BGPPeersDialog from "@/components/bgp-peers-dialog";
import { toast } from "sonner";

interface IPInfoCardProps {
  ipData: IPInfo;
}

// 检查是否为有效的国家代码
const isValidCountryCode = (code: string) => {
  return (
    code &&
    code.length === 2 &&
    code !== "XX" &&
    code !== "--" &&
    code.toUpperCase() !== "PRIVATE" &&
    code.toUpperCase() !== "ZZ" &&
    code !== "**"
  );
};

// 检查是否为私有IP
const isPrivateIP = (ip: string) => {
  // 私有IPv4地址范围
  const privateIPv4Ranges = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^127\./,
    /^169\.254\./,
    /^0\.0\.0\.0$/,
    /^255\.255\.255\.255$/,
  ];

  // 私有IPv6地址
  const privateIPv6Ranges = [
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^fd[0-9a-f]{2}:/i,
    /^fe80:/i,
  ];

  return (
    privateIPv4Ranges.some((range) => range.test(ip)) ||
    privateIPv6Ranges.some((range) => range.test(ip))
  );
};

// 国旗组件，带有错误处理
const CountryFlagWithFallback = ({
  countryCode,
  ip,
  country,
  style,
  className = "",
}: {
  countryCode: string;
  ip: string;
  country: string;
  style?: React.CSSProperties;
  className?: string;
}) => {
  const isPrivate = isPrivateIP(ip);
  const [failedCountry, setFailedCountry] = useState<string | null>(null);

  if (!isValidCountryCode(countryCode) || isPrivate) {
    return (
      <div
        className={`bg-gradient-to-br from-gray-100 to-gray-200 rounded flex items-center justify-center ${className}`}
        style={style}
        title={isPrivate ? "私有地址" : "未知地区"}
      >
        {isPrivate ? (
          <Shield className="w-3 h-3 text-gray-600" />
        ) : (
          <Globe className="w-3 h-3 text-gray-500" />
        )}
      </div>
    );
  }

  if (failedCountry === countryCode) {
    return (
      <div
        className={`bg-gray-200 rounded flex items-center justify-center ${className}`}
        style={style}
        title="国旗加载失败"
      >
        <Globe className="w-3 h-3 text-gray-500" />
      </div>
    );
  }

  return (
    <ReactCountryFlag
      countryCode={countryCode.toUpperCase()}
      svg
      style={style}
      className={className}
      title={country}
      onError={() => setFailedCountry(countryCode)}
    />
  );
};

export default function IPInfoCard({ ipData }: IPInfoCardProps) {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [isTracing, setIsTracing] = useState(false);
  const [queryData, setQueryData] = useState<{
    originalData: IPInfo;
    tracedData: IPInfo | null;
  }>({ originalData: ipData, tracedData: null });

  if (queryData.originalData !== ipData) {
    setQueryData({ originalData: ipData, tracedData: null });
  }

  const tracedData = queryData.originalData === ipData ? queryData.tracedData : null;
  const currentData = tracedData ?? ipData;
  const [isBGPDialogOpen, setIsBGPDialogOpen] = useState(false);
  const [selectedASN, setSelectedASN] = useState<{
    asn: number;
    name?: string;
  } | null>(null);

  // 获取store中的代理检测状态和自动检测状态
  const { isProxyDetecting, executeProxyDetection, isAutoDetected } = useIPQueryStore();

  // 溯源功能
  const handleTrace = async () => {
    if (isTracing) return;

    setIsTracing(true);
    try {
      const response = await fetch("/api/meituan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip: ipData.ip }),
      });

      if (!response.ok) {
        throw new Error(`溯源失败: ${response.statusText}`);
      }

      const meituanData: IPInfo = await response.json();
      setQueryData({ originalData: ipData, tracedData: meituanData });

      toast.success("溯源成功", {
        description: `已获取美团数据源的详细位置信息`,
        duration: 3000,
      });
    } catch (error) {
      console.error("溯源失败:", error);
      toast.error("溯源失败", {
        description:
          error instanceof Error ? error.message : "无法获取美团数据",
        duration: 4000,
      });
    } finally {
      setIsTracing(false);
    }
  };

  // 重置到原始数据
  const resetToOriginal = () => {
    setQueryData({ originalData: ipData, tracedData: null });
  };

  // Update current time only on client side to avoid hydration mismatch
  useEffect(() => {
    const updateTime = () => {
      if (currentData.timezone) {
        setCurrentTime(
          new Date().toLocaleString("zh-CN", {
            timeZone: currentData.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      }
    };

    updateTime(); // Set initial time
    const interval = setInterval(updateTime, 1000); // Update every second

    return () => clearInterval(interval);
  }, [currentData.timezone]);

  // BGP 对话框处理函数
  const handleASNClick = (asn: number, name?: string) => {
    setSelectedASN({ asn, name });
    setIsBGPDialogOpen(true);
  };

  const handleBGPDialogClose = () => {
    setIsBGPDialogOpen(false);
    setSelectedASN(null);
  };

  // 代理检测处理函数
  const handleProxyDetection = async () => {
    if (isProxyDetecting) return;
    await executeProxyDetection();
  };

  // 获取代理类型的显示信息
  const getProxyTypeInfo = (proxyType: string) => {
    switch (proxyType) {
      case 'direct':
        return {
          text: '直连',
          icon: CheckCircle,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/30'
        };
      case 'domestic':
        return {
          text: '国内代理',
          icon: Shield,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/30'
        };
      case 'foreign':
        return {
          text: '国外代理',
          icon: Globe,
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-50 dark:bg-purple-900/30'
        };
      case 'mixed':
        return {
          text: '混合代理',
          icon: Shuffle,
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'bg-orange-50 dark:bg-orange-900/30'
        };
      default:
        return {
          text: '未知',
          icon: HelpCircle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/30'
        };
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("复制成功", {
        description: `${type}: ${text}`,
        duration: 2000,
      });
    } catch (err) {
      console.error("复制失败:", err);
      toast.error("复制失败", {
        description: "无法访问剪贴板，请手动复制",
        duration: 3000,
      });
    }
  };

  // 格式化位置信息（支持美团数据）
  const formatLocationWithMeituan = () => {
    if (currentData.source === "MeiTuan" && currentData.meituan?.areaName) {
      // 美团数据：显示更详细的区域信息
      const parts = [currentData.country];
      if (currentData.province) parts.push(currentData.province);
      if (currentData.city) parts.push(currentData.city);
      if (currentData.district) parts.push(currentData.district);
      if (currentData.meituan.areaName)
        parts.push(currentData.meituan.areaName);
      return parts.join(" · ");
    }

    // 原始数据格式
    return formatLocation();
  };

  const formatLocation = () => {
    const parts = [currentData.country];
    if (currentData.province) parts.push(currentData.province);
    if (currentData.city) parts.push(currentData.city);
    if (currentData.district) parts.push(currentData.district);
    return parts.join(" · ");
  };



  // 格式化简化区域信息
  const formatRegionsShort = () => {
    if (currentData.regions_short) {
      return currentData.regions_short.join(" · ");
    }
    return null;
  };

  const getVersionColor = (version: string) => {
    return version === "IPv4" ? "text-blue-500" : "text-purple-500";
  };

  const getVersionBg = (version: string) => {
    return version === "IPv4"
      ? "bg-blue-50 dark:bg-blue-950/50"
      : "bg-purple-50 dark:bg-purple-950/50";
  };

  // 获取数据源颜色
  const getSourceColor = (source: string) => {
    if (source === "MeiTuan") return "text-yellow-600";
    return source === "MaxMind" ? "text-blue-600" : "text-green-600";
  };

  const getSourceBg = (source: string) => {
    if (source === "MeiTuan") return "bg-yellow-100 dark:bg-yellow-900/30";
    return source === "MaxMind"
      ? "bg-blue-100 dark:bg-blue-900/30"
      : "bg-green-100 dark:bg-green-900/30";
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-4xl mx-auto"
    >
      {/* 主IP展示卡片 */}
      <motion.div
        variants={itemVariants}
        className="bg-[rgb(var(--color-glass-background))] backdrop-blur-sm rounded-3xl shadow-xl border border-[rgb(var(--color-border))] overflow-hidden transition-colors duration-300"
      >
        {/* 头部 - IP地址 */}
        <div
          className={`px-4 md:px-8 py-4 md:py-6 ${getVersionBg(
            currentData.ipVersion
          )} border-b border-[rgb(var(--color-border))] transition-colors duration-300`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
              <div
                className={`p-3 rounded-2xl ${getVersionBg(
                  currentData.ipVersion
                )} border border-[rgb(var(--color-border))] transition-colors duration-300`}
              >
                <Wifi
                  className={`w-6 h-6 ${getVersionColor(
                    currentData.ipVersion
                  )}`}
                />
              </div>

              <div>
                <div className="mb-1">
                  <TextGenerateEffect
                    words={currentData.ip}
                    className="text-xl md:text-3xl font-mono font-bold text-[rgb(var(--color-text-primary))] break-all"
                    duration={0.3}
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getVersionColor(
                      currentData.ipVersion
                    )} bg-[rgb(var(--color-surface))] dark:bg-[rgb(var(--color-surface-hover))] transition-colors duration-300`}
                  >
                    {currentData.ipVersion}
                  </span>
                  <div className="flex items-center space-x-2">
                    <CountryFlagWithFallback
                      ip={currentData.ip}
                      country={currentData.country}
                      countryCode={currentData.countryCode}
                      style={{
                        width: "1.2em",
                        height: "1.2em",
                        borderRadius: "2px",
                      }}
                    />
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">
                      {isPrivateIP(currentData.ip)
                        ? "本地网络"
                        : currentData.country}
                    </span>
                    {isPrivateIP(currentData.ip) && (
                      <span className="text-xs text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-surface-hover))] px-2 py-0.5 rounded-full transition-colors duration-300">
                        私有
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm px-2 py-0.5 rounded-full transition-colors duration-300 ${getSourceBg(
                      currentData.source
                    )} ${getSourceColor(currentData.source)}`}
                  >
                    {currentData.source}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* 溯源按钮 */}
              {currentData.source !== "MeiTuan" &&
                !isPrivateIP(currentData.ip) && (
                  <button
                    onClick={handleTrace}
                    disabled={isTracing}
                    className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTracing ? (
                      <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 text-yellow-600" />
                    )}
                    <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                      {isTracing ? "溯源中..." : "溯源"}
                    </span>
                  </button>
                )}

              {/* 代理检测按钮 - 只在查询用户自己的IP时显示 */}
              {isAutoDetected && !isPrivateIP(currentData.ip) && (
                <button
                  onClick={handleProxyDetection}
                  disabled={isProxyDetecting}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="检测您当前的网络代理状态"
                >
                  {isProxyDetecting ? (
                    <Loader2 className="w-4 h-4 text-cyan-600 animate-spin" />
                  ) : (
                    <Activity className="w-4 h-4 text-cyan-600" />
                  )}
                  <span className="text-sm font-medium text-cyan-700 dark:text-cyan-400">
                    {isProxyDetecting ? "检测中..." : "代理检测"}
                  </span>
                </button>
              )}

              {/* 重置按钮 - 仅在已溯源时显示 */}
              {tracedData && (
                <button
                  onClick={resetToOriginal}
                  className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-colors duration-200 text-sm font-medium text-gray-600 dark:text-gray-400"
                >
                  重置
                </button>
              )}

              {/* 复制按钮 */}
              <button
                onClick={() => copyToClipboard(currentData.ip, "IP地址")}
                className="p-2 rounded-xl hover:bg-[rgb(var(--color-surface-hover))] transition-colors duration-200"
              >
                <Copy className="w-5 h-5 text-[rgb(var(--color-text-muted))]" />
              </button>
            </div>
          </div>
        </div>

        {/* 详细信息网格 */}
        <div className="p-4 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* 地理位置 */}
            <motion.div
              variants={itemVariants}
              className="space-y-4 md:space-y-3"
            >
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-green-500" />
                <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                  地理位置
                </h3>
              </div>

              <div className="pl-6 md:pl-7 space-y-4 md:space-y-3">
                <div className="flex items-center space-x-3">
                  <CountryFlagWithFallback
                    ip={currentData.ip}
                    country={currentData.country}
                    countryCode={currentData.countryCode}
                    style={{
                      width: "2em",
                      height: "2em",
                      borderRadius: "4px",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                  />
                  <div>
                    <p className="text-lg font-medium text-[rgb(var(--color-text-primary))]">
                      {formatLocationWithMeituan()}
                    </p>
                    {formatRegionsShort() && (
                      <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                        简称: {formatRegionsShort()}
                      </p>
                    )}
                    {/* 美团特有信息 */}
                    {currentData.source === "MeiTuan" &&
                      currentData.meituan?.detail && (
                        <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                          详细地址: {currentData.meituan.detail}
                        </p>
                      )}
                  </div>
                </div>
                {currentData.postal && (
                  <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                    邮编: {currentData.postal}
                  </p>
                )}
                <div className="text-sm text-[rgb(var(--color-text-muted))] space-y-1">
                  <p>纬度: {currentData.location.latitude.toFixed(4)}°</p>
                  <p>经度: {currentData.location.longitude.toFixed(4)}°</p>
                  {currentData.location.accuracy_radius && (
                    <p>精度半径: ~{currentData.location.accuracy_radius}km</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* 网络信息 - 增强ASN展示 */}
            <motion.div
              variants={itemVariants}
              className="space-y-4 md:space-y-3"
            >
              <div className="flex items-center space-x-2">
                <Network className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                  网络信息
                </h3>
              </div>
              <div className="pl-6 md:pl-7 space-y-4 md:space-y-3">
                {/* ASN编号 */}
                {currentData.as?.number && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Hash className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        ASN编号
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        handleASNClick(
                          currentData.as!.number!,
                          currentData.as?.name
                        )
                      }
                      className="font-mono text-sm bg-[rgb(var(--color-surface-hover))] hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded text-[rgb(var(--color-text-primary))] hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-300 cursor-pointer border border-transparent hover:border-blue-200 dark:hover:border-blue-700"
                      title="点击查看 BGP 对等关系"
                    >
                      AS{currentData.as.number}
                    </button>
                  </div>
                )}

                {/* ASN组织 */}
                {currentData.as?.name && (
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        ASN组织
                      </span>
                    </div>
                    <span className="font-medium text-right text-[rgb(var(--color-text-primary))] max-w-xs break-words">
                      {currentData.as.name}
                    </span>
                  </div>
                )}

                {/* 中文ISP信息 */}
                {currentData.as?.info && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Router className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        运营商
                      </span>
                    </div>
                    <span className="font-medium text-[rgb(var(--color-text-primary))]">
                      {currentData.as.info}
                    </span>
                  </div>
                )}

                {/* 传统ISP字段 */}
                {currentData.isp && !currentData.as?.info && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Router className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        运营商
                      </span>
                    </div>
                    <span className="font-medium text-[rgb(var(--color-text-primary))]">
                      {currentData.isp}
                    </span>
                  </div>
                )}

                {/* 网络类型 */}
                {currentData.type && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Server className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        网络类型
                      </span>
                    </div>
                    <span className="font-medium text-[rgb(var(--color-text-primary))]">
                      {currentData.type}
                    </span>
                  </div>
                )}

                {/* 网络地址 */}
                {currentData.net && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        网络段
                      </span>
                    </div>
                    <span className="font-mono text-sm text-[rgb(var(--color-text-primary))]">
                      {currentData.net}
                    </span>
                  </div>
                )}

                {/* 数据精度 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                    <span className="text-[rgb(var(--color-text-secondary))]">
                      精度
                    </span>
                  </div>
                  <span
                    className={`
                    px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 transition-colors duration-300
                    ${
                      currentData.accuracy === "high"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : currentData.accuracy === "medium"
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                    }
                  `}
                  >
                    <Zap className="w-3 h-3" />
                    <span>
                      {currentData.accuracy === "high"
                        ? "高精度"
                        : currentData.accuracy === "medium"
                        ? "中等精度"
                        : "低精度"}
                    </span>
                  </span>
                </div>
              </div>
            </motion.div>

            {/* 代理检测结果 - 只在查询用户自己的IP时显示 */}
            {isAutoDetected && currentData.proxyDetection && (
              <motion.div
                variants={itemVariants}
                className="space-y-4 md:space-y-3 md:col-span-2"
              >
                <div className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-cyan-500" />
                  <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                    代理检测结果
                  </h3>
                </div>

                <div className="pl-6 md:pl-7 space-y-4 md:space-y-3">
                  {/* 检测状态 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        连接状态
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const { text, icon: Icon, color, bgColor } = getProxyTypeInfo(currentData.proxyDetection.proxyType);
                        return (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${bgColor} ${color}`}>
                            <Icon className="w-3 h-3" />
                            <span>{text}</span>
                          </span>
                        );
                      })()}
                      <span className="text-xs text-[rgb(var(--color-text-muted))]">
                        置信度: {Math.round(currentData.proxyDetection.confidence * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* IP对比信息 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Headers IP */}
                    <div className="bg-[rgb(var(--color-surface))] rounded-lg p-3">
                      <div className="text-xs text-[rgb(var(--color-text-muted))] mb-1">Headers IP</div>
                      <div className="font-mono text-sm text-[rgb(var(--color-text-primary))]">
                        {currentData.proxyDetection.headerIP || '未获取'}
                      </div>
                    </div>

                    {/* 国内源IP */}
                    <div className="bg-[rgb(var(--color-surface))] rounded-lg p-3">
                      <div className="text-xs text-[rgb(var(--color-text-muted))] mb-1">国内源</div>
                      <div className="font-mono text-sm text-[rgb(var(--color-text-primary))]">
                        {currentData.proxyDetection.domesticIP || '获取失败'}
                      </div>
                    </div>

                    {/* 国外源IP */}
                    <div className="bg-[rgb(var(--color-surface))] rounded-lg p-3">
                      <div className="text-xs text-[rgb(var(--color-text-muted))] mb-1">国外源</div>
                      <div className="font-mono text-sm text-[rgb(var(--color-text-primary))]">
                        {currentData.proxyDetection.foreignIP || '获取失败'}
                      </div>
                    </div>
                  </div>

                  {/* 检测详情 */}
                  <div className="text-xs text-[rgb(var(--color-text-muted))] space-y-1">
                    <p>检测耗时: {currentData.proxyDetection.detectionTime}ms</p>
                    {currentData.proxyDetection.errors.length > 0 && (
                      <div>
                        <p className="text-orange-600 dark:text-orange-400">检测警告:</p>
                        <ul className="list-disc list-inside ml-2 space-y-1">
                          {currentData.proxyDetection.errors.map((error, index) => (
                            <li key={index} className="text-orange-600 dark:text-orange-400">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 时区信息 */}
            {currentData.timezone && (
              <motion.div
                variants={itemVariants}
                className="space-y-4 md:space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                    时区信息
                  </h3>
                </div>
                <div className="pl-6 md:pl-7 space-y-3 md:space-y-2">
                  <p className="font-mono text-[rgb(var(--color-text-primary))]">
                    {currentData.timezone}
                  </p>
                  {currentTime && (
                    <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                      当地时间: {currentTime}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* 注册国家信息 */}
            {currentData.registered_country && (
              <motion.div
                variants={itemVariants}
                className="space-y-4 md:space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-[rgb(var(--color-text-muted))]" />
                  <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                    注册信息
                  </h3>
                </div>
                <div className="pl-6 md:pl-7 space-y-4 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Flag className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        注册国家
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CountryFlagWithFallback
                        ip={currentData.ip}
                        country={currentData.country}
                        countryCode={currentData.registered_country.code}
                        style={{
                          width: "1.2em",
                          height: "1.2em",
                          borderRadius: "2px",
                        }}
                      />
                      <span className="font-medium text-[rgb(var(--color-text-primary))]">
                        {currentData.registered_country.name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MapIcon className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        注册代码
                      </span>
                    </div>
                    <span className="font-mono text-sm bg-[rgb(var(--color-surface-hover))] px-2 py-1 rounded text-[rgb(var(--color-text-primary))] transition-colors duration-300">
                      {currentData.registered_country.code}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 其他区域代码信息 */}
            {(currentData.countryCode ||
              currentData.provinceCode ||
              currentData.cityCode) && (
              <motion.div
                variants={itemVariants}
                className="space-y-4 md:space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-[rgb(var(--color-text-muted))]" />
                  <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">
                    区域代码
                  </h3>
                </div>
                <div className="pl-7 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Flag className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                      <span className="text-[rgb(var(--color-text-secondary))]">
                        国家代码
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CountryFlagWithFallback
                        ip={currentData.ip}
                        country={currentData.country}
                        countryCode={currentData.countryCode}
                        style={{
                          width: "1.2em",
                          height: "1.2em",
                          borderRadius: "2px",
                        }}
                      />
                      <span className="font-mono text-sm bg-[rgb(var(--color-surface-hover))] px-2 py-1 rounded text-[rgb(var(--color-text-primary))] transition-colors duration-300">
                        {currentData.countryCode}
                      </span>
                    </div>
                  </div>

                  {currentData.provinceCode && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <MapIcon className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                        <span className="text-[rgb(var(--color-text-secondary))]">
                          省份代码
                        </span>
                      </div>
                      <span className="font-mono text-sm bg-[rgb(var(--color-surface-hover))] px-2 py-1 rounded text-[rgb(var(--color-text-primary))] transition-colors duration-300">
                        {currentData.provinceCode}
                      </span>
                    </div>
                  )}
                  {currentData.cityCode && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Building className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                        <span className="text-[rgb(var(--color-text-secondary))]">
                          城市代码
                        </span>
                      </div>
                      <span className="font-mono text-sm bg-[rgb(var(--color-surface-hover))] px-2 py-1 rounded text-[rgb(var(--color-text-primary))] transition-colors duration-300">
                        {currentData.cityCode}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 地图组件 */}
      <motion.div variants={itemVariants} className="mt-6">
        <LazyIPMap ipData={currentData} />
      </motion.div>

      {/* BGP 对等关系对话框 */}
      {selectedASN && (
        <BGPPeersDialog
          asn={selectedASN.asn}
          asnName={selectedASN.name}
          isOpen={isBGPDialogOpen}
          onClose={handleBGPDialogClose}
        />
      )}
    </motion.div>
  );
}
