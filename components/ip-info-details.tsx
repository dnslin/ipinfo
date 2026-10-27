"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { IPInfo } from "@/lib/store";

function LocalTime({ timezone }: { timezone: string }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("zh-CN", { timeZone: timezone, hour12: false }));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timezone]);
  return <span className="tabular-nums">{time || "—"}</span>;
}

function Stat({ label, children, hint, mono = false }: { label: string; children: ReactNode; hint?: ReactNode; mono?: boolean }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{children}</dd>
      {hint && <dd className="stat-hint">{hint}</dd>}
    </div>
  );
}

function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return <div className="detail-row"><dt>{label}</dt><dd className={mono ? "font-mono" : undefined}>{children}</dd></div>;
}

export function networkName(data: IPInfo): string | undefined {
  return data.isp || data.as?.info || data.as?.name;
}

export function locationParts(data: IPInfo): string[] {
  return [...new Set([data.country, data.province, data.city, data.district, data.meituan?.areaName].filter((part): part is string => Boolean(part)))];
}

export function StatStrip({ data, onOpenBGP }: { data: IPInfo; onOpenBGP: (asn: number, name: string | undefined, trigger: HTMLButtonElement) => void }) {
  const asn = data.as?.number;
  const operator = networkName(data);
  const { latitude, longitude, accuracy_radius } = data.location;
  const isLocal = data.source === "Local";
  const coordinateHint = accuracy_radius !== undefined
    ? `精度半径约 ${accuracy_radius} km`
    : latitude !== null ? "数据源未提供精度半径" : isLocal ? "本地地址没有公网坐标" : "数据库未提供坐标";

  return (
    <dl className="stat-strip" aria-label="网络与位置摘要">
      <Stat label="运营商 / 组织" hint={data.as?.name && data.as.name !== operator ? data.as.name : undefined}>{operator ?? "未提供"}</Stat>
      <Stat label="ASN" hint={asn ? "查看 BGP 邻接" : "数据源未提供"}>
        {asn ? (
          <button type="button" onClick={(event) => onOpenBGP(asn, data.as?.name, event.currentTarget)} className="stat-link" title="查看 BGP 邻接关系" aria-label={`查看 AS${asn} 的 BGP 邻接关系`}>
            AS{asn}<ArrowUpRight />
          </button>
        ) : "未提供"}
      </Stat>
      <Stat label="坐标" mono hint={coordinateHint}>{latitude === null || longitude === null ? "未提供" : `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`}</Stat>
      <Stat label="时区" mono hint={data.timezone ? <>当地时间 <LocalTime timezone={data.timezone} /></> : undefined}>{data.timezone ?? "未提供"}</Stat>
    </dl>
  );
}

export function LocationDetails({ data }: { data: IPInfo }) {
  const parts = data.source === "Local" ? ["本地网络"] : locationParts(data);
  const codes = [
    ["国家代码", data.countryCode && data.countryCode !== "PRIVATE" ? data.countryCode : undefined],
    ["省份代码", data.provinceCode],
    ["城市代码", data.cityCode],
    ["地区代码", data.districtCode],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <section className="detail-section" aria-labelledby="location-title">
      <h2 id="location-title">地理位置</h2>
      {parts.length > 0 ? (
        <ol className="region-list">
          {parts.map((part, index) => <li key={part}><span className="font-mono">{String(index + 1).padStart(2, "0")}</span>{part}</li>)}
        </ol>
      ) : <p className="detail-empty">地区信息未提供</p>}
      {(data.postal || data.meituan?.detail || codes.length > 0) && (
        <dl className="detail-rows">
          {data.postal && <Row label="邮政编码" mono>{data.postal}</Row>}
          {data.meituan?.detail && <Row label="补充地址">{data.meituan.detail}</Row>}
          {codes.map(([label, value]) => <Row key={label} label={label} mono>{value}</Row>)}
        </dl>
      )}
    </section>
  );
}

export function NetworkDetails({ data, sourceName }: { data: IPInfo; sourceName: string }) {
  const coordinateSource = data.location.source;
  return (
    <section className="detail-section" aria-labelledby="network-title">
      <h2 id="network-title">网络与注册</h2>
      <dl className="detail-rows">
        {data.as?.name && <Row label="所属组织">{data.as.name}</Row>}
        {(data.isp || data.as?.info) && <Row label="运营商">{data.isp || data.as?.info}</Row>}
        {data.type && <Row label="网络类型">{data.type}</Row>}
        {data.net && <Row label="网络段" mono>{data.net}</Row>}
        {data.registered_country && <Row label="注册国家">{data.registered_country.name} <span className="font-mono text-xs text-[rgb(var(--color-text-muted))]">{data.registered_country.code}</span></Row>}
        <Row label="数据来源">地区 · {sourceName}{data.source !== "Local" && <>，坐标 · {coordinateSource ?? "未提供"}</>}</Row>
      </dl>
      {data.source === "GeoCN" && coordinateSource === "MaxMind" && <p className="detail-note">地区与坐标来自不同数据库，地图按 MaxMind 估算坐标展示。</p>}
    </section>
  );
}
