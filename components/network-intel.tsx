"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { RegistrationInfo, RoutingInfo, RPKIStatus, Section } from "@/lib/network-intel";

interface NetworkIntel {
  ptr: Section<string[]>;
  routing: Section<RoutingInfo | null>;
  registration: Section<RegistrationInfo | null>;
}

const RPKI_LABELS: Record<RPKIStatus, { text: string; tone: "good" | "bad" | "neutral" }> = {
  valid: { text: "有效（Valid）", tone: "good" },
  invalid_asn: { text: "无效：起源 AS 不匹配", tone: "bad" },
  invalid_length: { text: "无效：前缀长度超出 ROA", tone: "bad" },
  unknown: { text: "未签发 ROA（NotFound）", tone: "neutral" },
};

const date = (value?: string) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : undefined;

function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return <div className="detail-row"><dt>{label}</dt><dd className={mono ? "font-mono" : undefined}>{children}</dd></div>;
}

function Pending() {
  return <span className="intel-pending" aria-hidden="true" />;
}

// 外部数据源较慢，主结果先显示，这部分随后加载；每一项单独说明失败原因。
export function NetworkIntelSections({ ip }: { ip: string }) {
  const [state, setState] = useState<{ ip: string; data: NetworkIntel | null; error: string | null }>({ ip, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/network?ip=${encodeURIComponent(ip)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `查询失败（${response.status}）`);
        setState({ ip, data: body, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ ip, data: null, error: error instanceof Error ? error.message : "查询失败" });
      });
    return () => controller.abort();
  }, [ip]);

  const current = state.ip === ip ? state : { data: null, error: null };
  const { data, error } = current;
  const loading = !data && !error;
  const fail = (section?: Section<unknown>) => error ?? (section && !section.ok ? section.error : null);

  const ptr = data?.ptr;
  const routing = data?.routing.ok ? data.routing.data : null;
  const registration = data?.registration.ok ? data.registration.data : null;
  const rpki = routing?.rpki ? RPKI_LABELS[routing.rpki.status] : null;

  return (
    <div className="detail-grid" aria-busy={loading}>
      <section className="detail-section" aria-labelledby="routing-title">
        <h2 id="routing-title">路由与反向解析</h2>
        <dl className="detail-rows">
          <Row label="反向解析" mono>
            {loading ? <Pending /> : fail(ptr) ? <span className="intel-error">{fail(ptr)}</span>
              : ptr?.ok && ptr.data.length ? ptr.data.join(", ") : <span className="intel-muted">没有 PTR 记录</span>}
          </Row>
          {loading ? <Row label="BGP 前缀"><Pending /></Row> : fail(data?.routing) ? (
            <Row label="BGP 前缀"><span className="intel-error">{fail(data?.routing)}</span></Row>
          ) : routing ? (
            <>
              <Row label="BGP 前缀" mono>{routing.prefix}</Row>
              <Row label="起源 AS" mono>{routing.originAsns.length ? routing.originAsns.map((asn) => `AS${asn}`).join(", ") : "未观测到"}</Row>
              <Row label="RPKI">
                {rpki ? <span className="intel-badge" data-tone={rpki.tone}>{rpki.text}</span>
                  : routing.rpkiError ? <span className="intel-error">RPKI 验证查询失败</span> : <span className="intel-muted">无法判定</span>}
                {routing.originAsns.length > 1 && <span className="intel-muted intel-note">多起源前缀，按 AS{routing.originAsns[0]} 判定</span>}
              </Row>
            </>
          ) : <Row label="BGP 前缀"><span className="intel-muted">全球路由表中未宣告</span></Row>}
        </dl>
        <p className="detail-note">前缀与 RPKI 来自 RIPEstat 的 RIS 观测与 RPKI 验证。</p>
      </section>

      <section className="detail-section" aria-labelledby="registration-title">
        <h2 id="registration-title">注册信息（RDAP）</h2>
        {loading ? (
          <dl className="detail-rows"><Row label="网段"><Pending /></Row><Row label="所属机构"><Pending /></Row></dl>
        ) : fail(data?.registration) ? (
          <p className="detail-empty intel-error">{fail(data?.registration)}</p>
        ) : registration ? (
          <dl className="detail-rows">
            {registration.organization && <Row label="所属机构">{registration.organization}</Row>}
            {registration.name && <Row label="网段名称" mono>{registration.name}</Row>}
            {(registration.cidrs.length > 0 || registration.range) && <Row label="地址范围" mono>{registration.cidrs.join(", ") || registration.range}</Row>}
            {registration.type && <Row label="分配类型">{registration.type}</Row>}
            {registration.country && <Row label="注册国家" mono>{registration.country}</Row>}
            {registration.abuseEmails.length > 0 && (
              <Row label="滥用举报">{registration.abuseEmails.map((email) => <a key={email} className="intel-link font-mono" href={`mailto:${email}`}>{email}</a>)}</Row>
            )}
            {(registration.registered || registration.lastChanged) && (
              <Row label="注册时间">{date(registration.registered) ?? "未提供"}{registration.lastChanged && <span className="intel-muted"> · 更新于 {date(registration.lastChanged)}</span>}</Row>
            )}
            {(registration.registry || registration.link) && (
              <Row label="注册机构">
                {registration.link
                  ? <a className="intel-link" href={registration.link} target="_blank" rel="noreferrer">{registration.registry ?? "RDAP 记录"}<ArrowUpRight /></a>
                  : registration.registry}
              </Row>
            )}
          </dl>
        ) : <p className="detail-empty">没有找到注册记录</p>}
      </section>
    </div>
  );
}
