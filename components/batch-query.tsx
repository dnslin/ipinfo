"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "./theme-toggle";
import { parseBatchInput, toCSV, type BatchRow } from "@/lib/batch";

const MAX_BATCH = 100;
const EXAMPLE = "8.8.8.8\n1.1.1.1\n2001:4860:4860::8888\nexample.com";

function place(row: Extract<BatchRow, { ok: true }>): string {
  const data = row.data;
  if (data.source === "Local") return "本地网络";
  return [...new Set([data.country, data.province, data.city, data.district].filter(Boolean))].join(" · ") || "未提供";
}

export default function BatchQuery() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const targets = useMemo(() => parseBatchInput(input), [input]);
  const over = targets.length > MAX_BATCH;
  const failed = rows?.filter((row) => !row.ok).length ?? 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || targets.length === 0 || over) return;
    setLoading(true);
    try {
      const response = await fetch("/api/query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ips: targets }),
      });
      const body: { results?: BatchRow[]; error?: string } = await response.json();
      if (!response.ok || !body.results) throw new Error(body.error || `查询失败（${response.status}）`);
      setRows(body.results);
    } catch (error) {
      toast.error("批量查询失败", { description: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!rows) return;
    const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ip-batch-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyTable = async () => {
    if (!rows) return;
    try {
      await navigator.clipboard.writeText(toCSV(rows).replace(/^\uFEFF/, ""));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("无法访问剪贴板");
    }
  };

  return (
    <div className="site-page batch-page">
      <header className="batch-nav">
        <Link href="/" className="site-brand"><span className="site-brand-mark" aria-hidden="true" />IP Search</Link>
        <div className="site-nav-end"><ThemeToggle /></div>
      </header>

      <main className="batch-main">
        <div className="batch-heading">
          <Link href="/" className="batch-back"><ArrowLeft />返回单个查询</Link>
          <h1>批量查询</h1>
          <p>每行一个 IP 地址或域名，也可以用空格或逗号分隔，# 之后的内容会被忽略。一次最多 {MAX_BATCH} 条，重复项只查询一次。</p>
        </div>

        <form className="batch-form" onSubmit={submit} aria-busy={loading}>
          <textarea
            value={input} onChange={(event) => setInput(event.target.value)}
            className="batch-input font-mono" rows={8} spellCheck={false} autoCapitalize="none" autoComplete="off"
            placeholder={EXAMPLE} aria-label="要查询的 IP 地址或域名" aria-describedby="batch-count"
          />
          <div className="batch-form-foot">
            <p id="batch-count" className="batch-count" data-over={over || undefined}>
              {targets.length === 0 ? "尚未输入" : `${targets.length} 条${over ? `，超出上限 ${targets.length - MAX_BATCH} 条` : ""}`}
            </p>
            <div className="batch-form-actions">
              {!input && <button type="button" className="id-button" onClick={() => setInput(EXAMPLE)}>填入示例</button>}
              <button type="submit" className="id-button id-button-primary" disabled={loading || targets.length === 0 || over}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}{loading ? "查询中" : "开始查询"}
              </button>
            </div>
          </div>
        </form>

        {rows && (
          <section className="batch-results" aria-labelledby="batch-results-title">
            <div className="batch-results-head">
              <h2 id="batch-results-title">结果 <span>{rows.length} 条{failed > 0 && `，${failed} 条失败`}</span></h2>
              <div className="batch-form-actions">
                <button type="button" className="id-button" onClick={copyTable}>
                  <span className="icon-swap" data-done={copied || undefined} aria-hidden="true"><Copy /><Check /></span>{copied ? "已复制" : "复制 CSV"}
                </button>
                <button type="button" className="id-button" onClick={exportCSV}><Download />导出 CSV</button>
              </div>
            </div>
            <div className="batch-table-wrap">
              <table className="batch-table">
                <thead>
                  <tr><th scope="col">查询</th><th scope="col">IP</th><th scope="col">位置</th><th scope="col">运营商</th><th scope="col">ASN</th><th scope="col">时区</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => row.ok ? (
                    <tr key={row.query}>
                      <td className="font-mono">{row.query}</td>
                      <td className="font-mono"><Link href={`/?q=${encodeURIComponent(row.data.ip)}`}>{row.data.ip}</Link></td>
                      <td>{place(row)}</td>
                      <td>{row.data.isp || row.data.as?.info || row.data.as?.name || "—"}</td>
                      <td className="font-mono">{row.data.as?.number ? `AS${row.data.as.number}` : "—"}</td>
                      <td className="font-mono">{row.data.timezone ?? "—"}</td>
                    </tr>
                  ) : (
                    <tr key={row.query} data-error>
                      <td className="font-mono">{row.query}</td>
                      <td colSpan={5}>{row.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
