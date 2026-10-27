"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { toast } from "sonner";
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
  return [...new Set([data.country, data.province, data.city, data.district].filter((part): part is string => Boolean(part)))];
}

export function StatStrip({ data, onOpenBGP }: { data: IPInfo; onOpenBGP: (asn: number, name: string | undefined, trigger: HTMLButtonElement) => void }) {
  const asn = data.as?.number;
  const operator = networkName(data);
  const { latitude, longitude, accuracy_radius } = data.location;
  const isLocal = data.source === "Local";
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const copyCoordinates = async () => {
    if (latitude === null || longitude === null) return;
    try {
      await navigator.clipboard.writeText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("无法访问剪贴板，请手动复制坐标");
    }
  };
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
      <Stat label="坐标" mono hint={copied ? "坐标已复制" : coordinateHint}>
        {latitude === null || longitude === null ? "未提供" : (
          <button type="button" onClick={copyCoordinates} className="stat-copy" title="复制坐标" aria-label={copied ? "坐标已复制" : "复制坐标"}>
            {`${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`}
            <span className="icon-swap" data-done={copied || undefined} aria-hidden="true"><Copy /><Check /></span>
          </button>
        )}
      </Stat>
      <Stat label="时区" mono hint={data.timezone ? <>当地时间 <LocalTime timezone={data.timezone} /></> : undefined}>{data.timezone ?? "未提供"}</Stat>
    </dl>
  );
}

interface RegionLevel { label: string; name?: string; code?: string }

// 每一级行政区占一行：级别 | 名称 | 代码，名称与代码同行，和下方的明细行共用一条左边线。
export function regionLevels(data: IPInfo): RegionLevel[] {
  if (data.source === "Local") return [{ label: "网络", name: "本地网络" }];
  const levels: RegionLevel[] = [
    { label: "国家/地区", name: data.country || undefined, code: data.countryCode && data.countryCode !== "PRIVATE" ? data.countryCode : undefined },
    { label: "省份", name: data.province, code: data.provinceCode },
    { label: "城市", name: data.city, code: data.cityCode },
    { label: "区县", name: data.district, code: data.districtCode },
  ];
  // 直辖市等情况下省、市同名，只保留上一级。
  return levels.filter((level, index) => (level.name || level.code) && level.name !== levels[index - 1]?.name);
}

export function LocationDetails({ data }: { data: IPInfo }) {
  const levels = regionLevels(data);
  return (
    <section className="detail-section" aria-labelledby="location-title">
      <h2 id="location-title">地理位置</h2>
      {levels.length > 0 ? (
        <dl className="detail-rows region-rows">
          {levels.map((level) => (
            <div key={level.label} className="detail-row region-row">
              <dt>{level.label}</dt>
              <dd>{level.name ?? "未提供"}</dd>
              {level.code && <dd className="region-code font-mono">{level.code}</dd>}
            </div>
          ))}
        </dl>
      ) : <p className="detail-empty">地区信息未提供</p>}
      {data.postal && (
        <dl className="detail-rows">
          <Row label="邮政编码" mono>{data.postal}</Row>
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
