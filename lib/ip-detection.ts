import { NextRequest } from "next/server";

// 代理检测结果接口
export interface ProxyDetectionResult {
  headerIP: string | null;
  domesticIP: string | null;
  foreignIP: string | null;
  isUsingProxy: boolean;
  proxyType: "direct" | "domestic" | "foreign" | "mixed" | "unknown";
  confidence: number; // 检测置信度 0-1
  errors: string[]; // API调用错误信息
  detectionTime: number; // 检测耗时(ms)
}

// 外部IP检测源配置
export interface IPDetectionSource {
  name: string;
  url: string;
  parser: (response: string) => string | null;
  timeout: number;
}

// IPv6 交给浏览器与服务端共有的 URL 解析器处理压缩和映射格式。
export function detectIPVersion(ip: string): "IPv4" | "IPv6" | "invalid" {
  if (typeof ip !== "string") return "invalid";
  const cleanIP = ip.trim();
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;
  if (ipv4Regex.test(cleanIP)) return "IPv4";
  if (!cleanIP.includes(":") || !/^[0-9a-fA-F:.]+$/.test(cleanIP)) return "invalid";
  try {
    new URL(`http://[${cleanIP}]/`);
    return "IPv6";
  } catch {
    return "invalid";
  }
}

/**
 * 从包含多个IP的头部中提取第一个公网IP
 * @param headerValue 头部值，可能包含多个用逗号分隔的IP
 * @returns 第一个有效的公网IP，如果没有则返回null
 */
function extractPublicIPFromForwardedHeader(
  headerValue: string
): string | null {
  const ips = headerValue.split(",").map((ip) => ip.trim());

  // 首先尝试找到第一个有效的公网IP
  for (const ip of ips) {
    const version = detectIPVersion(ip);
    const isPrivate = isPrivateIP(ip);

    // 优先返回有效的公网IP
    if (version !== "invalid" && !isPrivate) {
      return ip;
    }
  }

  // 如果没有找到公网IP，返回第一个有效IP（即使是私有的）
  for (const ip of ips) {
    if (detectIPVersion(ip) !== "invalid") {
      return ip;
    }
  }

  return null;
}

/**
 * 获取客户端真实IP地址（增强版）
 * 支持CDN环境下的真实IP检测，包括智能的多IP处理和回退机制
 * @param request NextRequest对象
 * @returns 客户端真实IP地址或null
 */
export function getClientIP(request: NextRequest): string | null {
  // 扩展的CDN头部列表，按优先级排序
  const headers = [
    // 最可靠的单IP头部
    "cf-connecting-ip", // Cloudflare - 最可靠
    "eo-connecting-ip", // 腾讯云EdgeOne CDN - 从日志中发现
    "x-real-ip", // Nginx代理常用
    "true-client-ip", // Akamai, CloudFlare Enterprise
    "x-client-ip", // Apache mod_remoteip

    // Vercel和其他平台专用
    "x-vercel-forwarded-for", // Vercel
    "x-forwarded-for", // 标准头部，但可能包含多个IP

    // 其他常见头部
    "x-forwarded",
    "forwarded-for",
    "forwarded",
    "x-cluster-client-ip", // 集群环境
    "x-original-forwarded-for", // 某些代理
  ];

  // 尝试每个头部
  for (const headerName of headers) {
    // 尝试多种大小写组合，因为不同的CDN可能使用不同的大小写
    const headerVariations = [
      headerName, // 原始小写
      headerName.toLowerCase(), // 确保小写
      headerName
        .split("-")
        .map(
          (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        )
        .join("-"), // 首字母大写：Eo-Connecting-Ip
      headerName.toUpperCase(), // 全大写
    ];

    let headerValue: string | null = null;

    // 尝试所有大小写变体
    for (const variation of headerVariations) {
      headerValue = request.headers.get(variation);
      if (headerValue) {
        break;
      }
    }

    if (!headerValue) {
      continue;
    }

    // 处理可能包含多个IP的头部，优先获取公网IP
    const extractedIP = extractPublicIPFromForwardedHeader(headerValue);

    if (extractedIP && detectIPVersion(extractedIP) !== "invalid") {
      return extractedIP;
    }
  }

  return null;
}

// 验证IP地址格式
export function isValidIP(ip: string): boolean {
  return detectIPVersion(ip) !== "invalid";
}

// 私有IP检查结果接口
export interface PrivateIPCheckResult {
  isPrivate: boolean;
  type: string;
  message: string;
  description: string;
}

// 检查IPv4地址是否为私有或不可达地址
function checkPrivateIPv4(ip: string): PrivateIPCheckResult {
  const parts = ip.split(".").map(Number);
  const [a, b, c, d] = parts;

  // 私有地址（RFC1918）
  if (a === 10) {
    return {
      isPrivate: true,
      type: "private_rfc1918",
      message: "这是一个私有IP地址（RFC1918）",
      description:
        "10.0.0.0/8 网段是为私有网络保留的地址，无法查询其公网地理位置信息。这类地址通常用于企业内网、家庭网络等私有环境。",
    };
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return {
      isPrivate: true,
      type: "private_rfc1918",
      message: "这是一个私有IP地址（RFC1918）",
      description:
        "172.16.0.0/12 网段是为私有网络保留的地址，无法查询其公网地理位置信息。这类地址通常用于企业内网等私有环境。",
    };
  }

  if (a === 192 && b === 168) {
    return {
      isPrivate: true,
      type: "private_rfc1918",
      message: "这是一个私有IP地址（RFC1918）",
      description:
        "192.168.0.0/16 网段是为私有网络保留的地址，无法查询其公网地理位置信息。这类地址最常用于家庭路由器和小型办公网络。",
    };
  }

  // 回环地址
  if (a === 127) {
    return {
      isPrivate: true,
      type: "loopback",
      message: "这是一个回环地址",
      description:
        "127.0.0.0/8 网段是回环地址，指向本机自身，无法查询地理位置信息。最常见的是 127.0.0.1（localhost）。",
    };
  }

  // 链路本地地址（APIPA）
  if (a === 169 && b === 254) {
    return {
      isPrivate: true,
      type: "link_local",
      message: "这是一个链路本地地址（APIPA）",
      description:
        "169.254.0.0/16 网段是自动私有IP地址（APIPA），当设备无法获取DHCP地址时自动分配，无法查询地理位置信息。",
    };
  }

  // 共享地址空间（CGNAT, RFC6598）
  if (a === 100 && b >= 64 && b <= 127) {
    return {
      isPrivate: true,
      type: "shared_cgnat",
      message: "这是一个共享地址空间（CGNAT）",
      description:
        "100.64.0.0/10 网段是运营商级NAT（CGNAT）使用的共享地址空间，无法查询准确的地理位置信息。",
    };
  }

  // 多播地址
  if (a >= 224 && a <= 239) {
    return {
      isPrivate: true,
      type: "multicast",
      message: "这是一个多播地址",
      description:
        "224.0.0.0/4 网段是多播地址，用于一对多的网络通信，无法查询地理位置信息。",
    };
  }

  // 保留地址（除广播地址）
  if (a >= 240 && !(a === 255 && b === 255 && c === 255 && d === 255)) {
    return {
      isPrivate: true,
      type: "reserved",
      message: "这是一个保留地址",
      description:
        "240.0.0.0/4 网段是为未来使用保留的地址，无法查询地理位置信息。",
    };
  }

  // 广播地址
  if (a === 255 && b === 255 && c === 255 && d === 255) {
    return {
      isPrivate: true,
      type: "broadcast",
      message: "这是广播地址",
      description:
        "255.255.255.255 是有限广播地址，用于向本地网络中的所有设备发送数据，无法查询地理位置信息。",
    };
  }

  // 0.0.0.0 特殊地址
  if (a === 0 && b === 0 && c === 0 && d === 0) {
    return {
      isPrivate: true,
      type: "unspecified",
      message: "这是未指定地址",
      description:
        '0.0.0.0 是未指定地址，通常表示"本机上的任意地址"，无法查询地理位置信息。',
    };
  }

  return {
    isPrivate: false,
    type: "public",
    message: "",
    description: "",
  };
}

// 检查IPv6地址是否为私有或不可达地址
function checkPrivateIPv6(ip: string): PrivateIPCheckResult {
  const normalizedIP = new URL(`http://[${ip.trim()}]/`).hostname.slice(1, -1);
  const firstWord = parseInt(normalizedIP.split(":")[0] || "0", 16);

  if (normalizedIP.startsWith("::ffff:")) {
    const words = normalizedIP.slice(7).split(":").map((word) => parseInt(word, 16));
    const ipv4 = [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join(".");
    return checkPrivateIPv4(ipv4);
  }

  // 回环地址
  if (normalizedIP === "::1") {
    return {
      isPrivate: true,
      type: "loopback",
      message: "这是IPv6回环地址",
      description:
        "::1 是IPv6的回环地址，等同于IPv4的127.0.0.1，指向本机自身，无法查询地理位置信息。",
    };
  }

  // 未指定地址
  if (normalizedIP === "::" || normalizedIP === "0:0:0:0:0:0:0:0") {
    return {
      isPrivate: true,
      type: "unspecified",
      message: "这是IPv6未指定地址",
      description:
        ":: 是IPv6的未指定地址，等同于IPv4的0.0.0.0，无法查询地理位置信息。",
    };
  }

  // 链路本地地址
  if ((firstWord & 0xffc0) === 0xfe80) {
    return {
      isPrivate: true,
      type: "link_local",
      message: "这是IPv6链路本地地址",
      description:
        "fe80::/10 网段是IPv6链路本地地址，仅在本地网络链路内有效，无法查询地理位置信息。",
    };
  }

  // 唯一本地地址（ULA）
  if ((firstWord & 0xfe00) === 0xfc00) {
    return {
      isPrivate: true,
      type: "unique_local",
      message: "这是IPv6唯一本地地址（ULA）",
      description:
        "fc00::/7 网段是IPv6唯一本地地址，类似于IPv4的私有地址，用于私有网络，无法查询地理位置信息。",
    };
  }

  // 多播地址
  if (normalizedIP.startsWith("ff")) {
    return {
      isPrivate: true,
      type: "multicast",
      message: "这是IPv6多播地址",
      description:
        "ff00::/8 网段是IPv6多播地址，用于一对多的网络通信，无法查询地理位置信息。",
    };
  }

  return {
    isPrivate: false,
    type: "public",
    message: "",
    description: "",
  };
}

// 检查IP地址是否为私有或不可达地址
export function checkPrivateIP(ip: string): PrivateIPCheckResult {
  const version = detectIPVersion(ip);

  if (version === "invalid") {
    return {
      isPrivate: true,
      type: "invalid",
      message: "IP地址格式无效",
      description: "请输入有效的IPv4或IPv6地址格式。",
    };
  }

  if (version === "IPv4") {
    return checkPrivateIPv4(ip);
  } else {
    return checkPrivateIPv6(ip);
  }
}

// 判断是否为私有/内网IP
export function isPrivateIP(ip: string): boolean {
  return checkPrivateIP(ip).isPrivate;
}

// 外部IP检测源配置
export const IP_DETECTION_SOURCES: IPDetectionSource[] = [
  {
    name: "国内源(IPIP.NET)",
    url: "https://myip.ipip.net/",
    parser: (response: string) => {
      // 解析格式：当前 IP：14.118.135.203  来自于：中国 广东 中山  电信
      const match = response.match(/当前 IP：(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    timeout: 5000,
  },
  {
    name: "国外源(IPINFO.IO)",
    url: "https://ipinfo.io/ip",
    parser: (response: string) => {
      // 返回纯IP地址
      const ip = response.trim();
      return detectIPVersion(ip) !== "invalid" ? ip : null;
    },
    timeout: 5000,
  },
];

/**
 * 从外部API获取IP地址
 * @param source IP检测源配置
 * @returns Promise<string | null> 获取到的IP地址或null
 */
async function fetchExternalIP(
  source: IPDetectionSource
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), source.timeout);

    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return source.parser(text);
  } catch (error) {
    console.error(`获取外部IP失败 (${source.name}):`, error);
    return null;
  }
}

/**
 * 分析代理类型
 * @param headerIP 从HTTP headers获取的IP
 * @param domesticIP 从国内API获取的IP
 * @param foreignIP 从国外API获取的IP
 * @returns 代理类型和置信度
 */
function analyzeProxyType(
  headerIP: string | null,
  domesticIP: string | null,
  foreignIP: string | null
): { proxyType: ProxyDetectionResult["proxyType"]; confidence: number } {
  const ips = [headerIP, domesticIP, foreignIP].filter(Boolean);

  // 如果获取的IP数量不足，置信度较低
  if (ips.length < 2) {
    return { proxyType: "unknown", confidence: 0.3 };
  }

  // 所有IP都相同 - 直连
  if (ips.length >= 2 && ips.every((ip) => ip === ips[0])) {
    return { proxyType: "direct", confidence: 0.9 };
  }

  // 分析不同的组合
  if (headerIP && domesticIP && foreignIP) {
    if (headerIP === domesticIP && headerIP !== foreignIP) {
      // headers IP = 国内IP ≠ 国外IP，可能使用国外代理
      return { proxyType: "foreign", confidence: 0.8 };
    }

    if (headerIP === foreignIP && headerIP !== domesticIP) {
      // headers IP = 国外IP ≠ 国内IP，可能使用国内代理
      return { proxyType: "domestic", confidence: 0.8 };
    }

    if (
      headerIP !== domesticIP &&
      headerIP !== foreignIP &&
      domesticIP !== foreignIP
    ) {
      // 三个IP都不同，复杂的代理环境
      return { proxyType: "mixed", confidence: 0.7 };
    }
  }

  // 其他情况
  return { proxyType: "unknown", confidence: 0.5 };
}

/**
 * 检测代理使用情况（服务端版本）
 * @param request NextRequest对象，用于获取headers中的IP
 * @returns Promise<ProxyDetectionResult> 代理检测结果
 */
export async function detectProxy(
  request?: NextRequest
): Promise<ProxyDetectionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // 1. 获取headers中的IP
  const headerIP = request ? getClientIP(request) : null;

  // 2. 并行获取外部IP
  const externalIPPromises = IP_DETECTION_SOURCES.map(async (source) => {
    try {
      const ip = await fetchExternalIP(source);
      return { source: source.name, ip };
    } catch (error) {
      const errorMsg = `${source.name} 获取失败: ${
        error instanceof Error ? error.message : "未知错误"
      }`;
      errors.push(errorMsg);
      return { source: source.name, ip: null };
    }
  });

  const results = await Promise.allSettled(externalIPPromises);

  // 3. 提取结果
  let domesticIP: string | null = null;
  let foreignIP: string | null = null;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const { source, ip } = result.value;
      if (source.includes("国内")) {
        domesticIP = ip;
      } else if (source.includes("国外")) {
        foreignIP = ip;
      }
    } else {
      errors.push(
        `${IP_DETECTION_SOURCES[index].name} 请求失败: ${result.reason}`
      );
    }
  });

  // 4. 分析代理类型
  const { proxyType, confidence } = analyzeProxyType(
    headerIP,
    domesticIP,
    foreignIP
  );

  // 5. 判断是否使用代理
  const isUsingProxy = proxyType !== "direct" && proxyType !== "unknown";

  const detectionTime = Date.now() - startTime;

  return {
    headerIP,
    domesticIP,
    foreignIP,
    isUsingProxy,
    proxyType,
    confidence,
    errors,
    detectionTime,
  };
}

/**
 * 检测代理使用情况（客户端版本）
 * 直接在浏览器中调用外部API，用户可以在控制台看到网络请求
 * @param headerIP 从服务端获取的headers IP
 * @returns Promise<ProxyDetectionResult> 代理检测结果
 */
export async function detectProxyClient(
  headerIP: string | null = null
): Promise<ProxyDetectionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log("开始客户端代理检测...", { headerIP });

  // 并行获取外部IP
  const externalIPPromises = IP_DETECTION_SOURCES.map(async (source) => {
    try {
      console.log(`正在请求 ${source.name}: ${source.url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), source.timeout);

      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const ip = source.parser(text);

      console.log(`${source.name} 返回结果:`, { rawText: text, parsedIP: ip });

      return { source: source.name, ip };
    } catch (error) {
      const errorMsg = `${source.name} 获取失败: ${
        error instanceof Error ? error.message : "未知错误"
      }`;
      console.error(errorMsg, error);
      errors.push(errorMsg);
      return { source: source.name, ip: null };
    }
  });

  const results = await Promise.allSettled(externalIPPromises);

  // 提取结果
  let domesticIP: string | null = null;
  let foreignIP: string | null = null;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const { source, ip } = result.value;
      if (source.includes("国内")) {
        domesticIP = ip;
      } else if (source.includes("国外")) {
        foreignIP = ip;
      }
    } else {
      errors.push(
        `${IP_DETECTION_SOURCES[index].name} 请求失败: ${result.reason}`
      );
    }
  });

  // 分析代理类型
  const { proxyType, confidence } = analyzeProxyType(
    headerIP,
    domesticIP,
    foreignIP
  );

  // 判断是否使用代理
  const isUsingProxy = proxyType !== "direct" && proxyType !== "unknown";

  const detectionTime = Date.now() - startTime;

  const result = {
    headerIP,
    domesticIP,
    foreignIP,
    isUsingProxy,
    proxyType,
    confidence,
    errors,
    detectionTime,
  };

  console.log("客户端代理检测完成:", result);

  return result;
}
