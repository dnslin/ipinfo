import type { IPInfo } from "./store";

export type BatchRow = { query: string; ok: true; data: IPInfo } | { query: string; ok: false; error: string };

// 每行一个或多个目标，可用空格、逗号、分号分隔；# 之后视为注释。保留首次出现的顺序。
export function parseBatchInput(text: string): string[] {
  const targets = text.split(/\r?\n/).flatMap((line) => line.replace(/#.*$/, "").split(/[\s,;，；]+/)).map((item) => item.trim()).filter(Boolean);
  return [...new Set(targets)];
}

const COLUMNS: [string, (row: BatchRow) => string | number | undefined][] = [
  ["查询", (row) => row.query],
  ["IP", (row) => row.ok ? row.data.ip : undefined],
  ["版本", (row) => row.ok ? row.data.ipVersion : undefined],
  ["国家/地区", (row) => row.ok ? row.data.country : undefined],
  ["国家代码", (row) => row.ok && row.data.countryCode !== "PRIVATE" ? row.data.countryCode : undefined],
  ["省份", (row) => row.ok ? row.data.province : undefined],
  ["城市", (row) => row.ok ? row.data.city : undefined],
  ["区县", (row) => row.ok ? row.data.district : undefined],
  ["运营商", (row) => row.ok ? row.data.isp || row.data.as?.info : undefined],
  ["ASN", (row) => row.ok ? row.data.as?.number : undefined],
  ["AS 组织", (row) => row.ok ? row.data.as?.name : undefined],
  ["网络段", (row) => row.ok ? row.data.net : undefined],
  ["纬度", (row) => row.ok ? row.data.location.latitude ?? undefined : undefined],
  ["经度", (row) => row.ok ? row.data.location.longitude ?? undefined : undefined],
  ["精度半径(km)", (row) => row.ok ? row.data.location.accuracy_radius : undefined],
  ["时区", (row) => row.ok ? row.data.timezone : undefined],
  ["数据来源", (row) => row.ok ? row.data.source : undefined],
  ["错误", (row) => row.ok ? undefined : row.error],
];

function cell(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  let text = String(value);
  // 防止表格软件把 =、+、-、@ 开头的内容当作公式执行
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 带 BOM 的 UTF-8 CSV，Excel 打开中文不乱码。
export function toCSV(rows: BatchRow[]): string {
  const lines = [COLUMNS.map(([name]) => name).join(","), ...rows.map((row) => COLUMNS.map(([, read]) => cell(read(row))).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
