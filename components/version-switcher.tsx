"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getHostname = () => window.location.hostname;

export default function VersionSwitcher() {
  const hostname = useSyncExternalStore(subscribe, getHostname, () => "");
  const local = !hostname || hostname === "localhost" || hostname.endsWith(".localhost") || /^[\d.]+$/.test(hostname) || hostname.includes(":");
  const base = hostname.replace(/^(?:ip|ip4|ip6)\./, "");
  const current = hostname.startsWith("ip4.") ? "v4" : hostname.startsWith("ip6.") ? "v6" : "auto";
  const versions = [
    { id: "auto", label: "自动", title: "自动检测 IP 版本", domain: "ip" },
    { id: "v4", label: "IPv4", title: "使用 IPv4 入口", domain: "ip4" },
    { id: "v6", label: "IPv6", title: "使用 IPv6 入口", domain: "ip6" },
  ];

  return (
    <nav aria-label="IP 连接版本" className="flex w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-hover))] p-0.5 min-[380px]:w-auto">
      {versions.map((version) => {
        const active = current === version.id;
        const className = `inline-flex min-h-[42px] flex-1 items-center justify-center rounded-[9px] px-3 text-xs font-medium min-[380px]:flex-none ${active ? "bg-[rgb(var(--color-surface))] text-[rgb(var(--color-accent-text))] shadow-sm" : "text-[rgb(var(--color-text-secondary))]"}`;
        return local ? (
          <button key={version.id} type="button" className={className} aria-current={active ? "page" : undefined} disabled={!active} title="本地预览使用当前网络连接">{version.label}</button>
        ) : (
          <a key={version.id} href={`https://${version.domain}.${base}`} className={className} aria-current={active ? "page" : undefined} title={version.title}>{version.label}</a>
        );
      })}
    </nav>
  );
}
