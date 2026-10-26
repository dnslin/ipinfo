import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mmdb-lib"],
  // 保留请求来源，避免本地 IP 被归一为 localhost 后触发外部转发。
  skipProxyUrlNormalize: true,

};

export default nextConfig;

