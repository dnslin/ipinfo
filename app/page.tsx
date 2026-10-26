"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Globe2, Search } from "lucide-react";
import { useIPQueryStore } from "@/lib/store";
import IPQueryForm from "@/components/ip-query-form";
import IPInfoCard from "@/components/ip-info-card";
import VersionSwitcher from "@/components/version-switcher";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  const { ipData, isLoading, error, executeQuery } = useIPQueryStore();
  useEffect(() => { executeQuery(); }, [executeQuery]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto grid max-w-[1144px] grid-cols-[1fr_auto] items-center gap-3 px-4 py-5 min-[380px]:grid-cols-[1fr_auto_auto] sm:px-6 sm:py-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight" aria-label="IP Search 首页">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgb(var(--color-accent-soft))] text-[rgb(var(--color-accent-text))]"><Globe2 className="h-5 w-5" /></span>
          <span>IP Search</span>
        </Link>
        <div className="col-span-2 row-start-2 min-[380px]:col-span-1 min-[380px]:col-start-2 min-[380px]:row-start-1"><VersionSwitcher /></div>
        <div className="col-start-2 row-start-1 min-[380px]:col-start-3"><ThemeToggle /></div>
      </header>
      <main className="mx-auto max-w-[1144px] px-4 pb-8 sm:px-6">
        <section aria-labelledby="query-heading" className="pb-7 pt-6 text-center sm:pb-9 sm:pt-10">
          <h1 id="query-heading" className="text-[26px] font-semibold tracking-tight sm:text-[32px]">IP 地址查询</h1>
          <p className="mb-6 mt-2 text-sm text-[rgb(var(--color-text-secondary))]">查看地理位置、运营商与网络邻接信息</p>
          <IPQueryForm />
        </section>
        {isLoading ? (
          <div role="status" aria-label="正在查询 IP 信息" className="ui-card p-6 sm:p-8">
            <div className="h-7 w-44 rounded-md bg-[rgb(var(--color-surface-hover))]" />
            <div className="mt-4 h-4 w-64 max-w-full rounded-md bg-[rgb(var(--color-surface-hover))]" />
            <div className="mt-7 grid gap-5 sm:grid-cols-2"><div className="h-48 rounded-xl bg-[rgb(var(--color-surface-hover))]" /><div className="h-48 rounded-xl bg-[rgb(var(--color-surface-hover))]" /></div>
            <span className="mt-4 block text-xs text-[rgb(var(--color-text-muted))]">正在查询 IP 信息…</span>
          </div>
        ) : ipData ? <IPInfoCard ipData={ipData} /> : (
          <div className="ui-card ui-empty-state py-16">
            <Search className="mx-auto mb-4 h-7 w-7 text-[rgb(var(--color-text-muted))]" />
            <p className="font-medium text-[rgb(var(--color-text-primary))]">{error ? "暂时无法获取 IP 信息" : "从一个 IP 地址开始"}</p>
            <p className="mt-2 text-sm">输入地址查询，或选择“查询我的 IP”</p>
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-[1144px] px-4 pb-7 pt-3 text-center text-xs text-[rgb(var(--color-text-muted))] sm:px-6">
        IP 定位由数据库估算，实际位置与精度可能因网络而异
      </footer>
    </div>
  );
}
