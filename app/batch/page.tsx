import type { Metadata } from "next";
import BatchQuery from "@/components/batch-query";

export const metadata: Metadata = {
  title: "批量查询 - IP-Search",
  description: "一次查询最多 100 个 IP 地址或域名，导出 CSV",
};

export default function BatchPage() {
  return <BatchQuery />;
}
