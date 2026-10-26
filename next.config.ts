import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mmdb-lib"],
  // 保留请求来源，避免本地 IP 被归一为 localhost 后触发外部转发。
  skipProxyUrlNormalize: true,

  // 静态文件配置
  async headers() {
    return [
      {
        source: "/api/query",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=300", // 缓存5分钟
          },
        ],
      },
    ];
  },
};

export default nextConfig;

