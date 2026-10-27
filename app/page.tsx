"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";
import { useIPQueryStore } from "@/lib/store";
import IPQueryForm from "@/components/ip-query-form";
import IPInfoCard from "@/components/ip-info-card";
import VersionSwitcher from "@/components/version-switcher";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  const { ipData, isLoading, error, executeQuery } = useIPQueryStore();
  useEffect(() => { executeQuery(); }, [executeQuery]);

  return (
    <div className="site-page">
      <header className="site-header">
        <VersionSwitcher />
        <ThemeToggle />
      </header>
      <main className="site-main">
        <section aria-labelledby="query-heading" className="query-section">
          <h1 id="query-heading" className="sr-only">IP 地址查询</h1>
          <IPQueryForm />
        </section>
        {isLoading ? (
          <div role="status" aria-label="正在查询 IP 信息" className="ui-card p-6 sm:p-7">
            <div className="h-7 w-44 rounded-md bg-[rgb(var(--color-surface-hover))]" />
            <div className="mt-4 h-4 w-64 max-w-full rounded-md bg-[rgb(var(--color-surface-hover))]" />
            <div className="mt-7 grid gap-5 sm:grid-cols-2"><div className="h-48 rounded-xl bg-[rgb(var(--color-surface-hover))]" /><div className="h-48 rounded-xl bg-[rgb(var(--color-surface-hover))]" /></div>
            <span className="mt-4 block text-xs text-[rgb(var(--color-text-muted))]">正在查询 IP 信息…</span>
          </div>
        ) : ipData ? <IPInfoCard key={ipData.ip} ipData={ipData} /> : (
          <div className="ui-card ui-empty-state py-16">
            <Search className="mx-auto mb-4 h-7 w-7 text-[rgb(var(--color-text-muted))]" />
            <p className="font-medium text-[rgb(var(--color-text-primary))]">{error ? "暂时无法获取 IP 信息" : "从一个 IP 地址开始"}</p>
            <p className="mt-2 text-sm">输入地址查询，或选择“查询我的 IP”</p>
          </div>
        )}
      </main>
      <footer className="site-footer">
        IP Search <span aria-hidden="true">·</span> IP 定位由数据库估算，实际位置与精度可能因网络而异
      </footer>
    </div>
  );
}
