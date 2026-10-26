"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Clock3, Globe2, MapPin, Network } from "lucide-react";
import type { IPInfo } from "@/lib/store";

function InfoRow({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-2 text-sm"><dt className="text-[rgb(var(--color-text-muted))]">{label}</dt><dd className={`min-w-0 break-words text-[rgb(var(--color-text-primary))] ${mono ? "font-mono text-[13px]" : ""}`}>{children}</dd></div>;
}

function LocalTime({ timezone }: { timezone: string }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleString("zh-CN", { timeZone: timezone, hour12: false }));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timezone]);
  return <span className="tabular-nums">{time || "—"}</span>;
}

export function LocationDetails({ data }: { data: IPInfo }) {
  const location = [data.country, data.province, data.city, data.district, data.meituan?.areaName].filter(Boolean);
  const uniqueLocation = [...new Set(location)].join(" · ");
  const { latitude, longitude, accuracy_radius } = data.location;
  return (
    <section className="ui-card p-5 sm:p-6" aria-labelledby="location-title">
      <h2 id="location-title" className="ui-section-heading"><MapPin />地理位置</h2>
      <p className="mb-5 mt-4 text-lg font-medium leading-relaxed">{uniqueLocation || "地区信息未提供"}</p>
      <dl className="divide-y divide-[rgb(var(--color-border-light))]">
        <InfoRow label="纬度" mono>{latitude === null ? "未提供" : `${latitude.toFixed(4)}°`}</InfoRow>
        <InfoRow label="经度" mono>{longitude === null ? "未提供" : `${longitude.toFixed(4)}°`}</InfoRow>
        <InfoRow label="估算精度">{accuracy_radius !== undefined ? `约 ${accuracy_radius} km 范围` : latitude === null ? "未提供坐标" : "数据源未提供精度半径"}</InfoRow>
        {data.postal && <InfoRow label="邮政编码" mono>{data.postal}</InfoRow>}
        {data.meituan?.detail && <InfoRow label="补充地址">{data.meituan.detail}</InfoRow>}
      </dl>
    </section>
  );
}

export function NetworkDetails({ data, onOpenBGP }: { data: IPInfo; onOpenBGP: (asn: number, name: string | undefined, trigger: HTMLButtonElement) => void }) {
  const asn = data.as?.number;
  return (
    <section className="ui-card p-5 sm:p-6" aria-labelledby="network-title">
      <h2 id="network-title" className="ui-section-heading"><Network />网络信息</h2>
      <dl className="mt-4 divide-y divide-[rgb(var(--color-border-light))]">
        {asn ? <InfoRow label="ASN"><button type="button" onClick={(event) => onOpenBGP(asn, data.as?.name, event.currentTarget)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[rgb(var(--color-accent-soft))] px-2.5 font-mono text-[13px] text-[rgb(var(--color-accent-text))]" title="查看 BGP 邻接关系" aria-label={`查看 AS${asn} 的 BGP 邻接关系`}>AS{asn}<ArrowUpRight className="h-3.5 w-3.5" /></button></InfoRow> : <InfoRow label="ASN">数据源未提供</InfoRow>}
        {data.as?.name && <InfoRow label="所属组织">{data.as.name}</InfoRow>}
        {(data.isp || data.as?.info) && <InfoRow label="运营商">{data.isp || data.as?.info}</InfoRow>}
        {data.type && <InfoRow label="网络类型">{data.type}</InfoRow>}
        {data.net && <InfoRow label="网络段" mono>{data.net}</InfoRow>}
      </dl>
    </section>
  );
}

export function AdditionalDetails({ data }: { data: IPInfo }) {
  const hasCodes = (data.countryCode && data.countryCode !== "PRIVATE") || data.provinceCode || data.cityCode || data.districtCode;
  if (!data.timezone && !data.registered_country && !hasCodes) return null;
  return (
    <details className="ui-card group p-5 sm:p-6">
      <summary className="flex min-h-8 list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Globe2 className="h-[17px] w-[17px] text-[rgb(var(--color-text-muted))]" />更多信息</span>
        <span className="text-xs text-[rgb(var(--color-text-muted))]"><span className="group-open:hidden">展开</span><span className="hidden group-open:inline">收起</span></span>
      </summary>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {data.timezone && <section><h3 className="ui-section-heading"><Clock3 />时区</h3><dl className="mt-2"><InfoRow label="时区名称" mono>{data.timezone}</InfoRow><InfoRow label="当地时间"><LocalTime timezone={data.timezone} /></InfoRow></dl></section>}
        {(data.registered_country || hasCodes) && <section><h3 className="ui-section-heading"><Globe2 />注册与区域</h3><dl className="mt-2">
          {data.registered_country && <InfoRow label="注册国家">{data.registered_country.name} <span className="font-mono text-xs text-[rgb(var(--color-text-muted))]">{data.registered_country.code}</span></InfoRow>}
          {data.countryCode && data.countryCode !== "PRIVATE" && <InfoRow label="国家代码" mono>{data.countryCode}</InfoRow>}
          {data.provinceCode && <InfoRow label="省份代码" mono>{data.provinceCode}</InfoRow>}
          {data.cityCode && <InfoRow label="城市代码" mono>{data.cityCode}</InfoRow>}
          {data.districtCode && <InfoRow label="地区代码" mono>{data.districtCode}</InfoRow>}
        </dl></section>}
      </div>
    </details>
  );
}
