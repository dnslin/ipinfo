"use client";

import { useEffect, useState } from "react";

interface HealthDatabase { name: string; isValid: boolean; version?: string; buildDate?: string }
interface Health { databases: HealthDatabase[]; update: { intervalHours: number; lastCheckedAt: string | null } }

const LABELS: Record<string, string> = { "GeoLite2-City.mmdb": "City", "GeoLite2-ASN.mmdb": "ASN", "GeoCN.mmdb": "GeoCN" };
const day = (value?: string) => value ? new Date(value).toISOString().slice(0, 10) : undefined;

// 页脚的数据库版本：让访客知道数据有多新。构建日期来自 MMDB 元数据，版本来自发布标签。
export default function DatabaseStatusLine() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((body: Health) => { if (Array.isArray(body?.databases)) setHealth(body); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!health) return null;

  const update = health.update.intervalHours ? `每 ${health.update.intervalHours} 小时检查更新` : "自动更新已关闭";
  return (
    <p className="site-footer-db" title={update}>
      数据库
      {health.databases.map((database) => (
        <span key={database.name} data-missing={!database.isValid || undefined}>
          {LABELS[database.name] ?? database.name}{" "}
          <span className="font-mono">{database.isValid ? (day(database.buildDate) ?? database.version ?? "可用") : "不可用"}</span>
        </span>
      ))}
    </p>
  );
}
