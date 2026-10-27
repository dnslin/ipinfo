import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBatchInput, toCSV } from "../lib/batch";
import type { IPInfo } from "../lib/store";

test("batch input splits on lines, spaces and commas, drops comments and duplicates", () => {
  assert.deepEqual(parseBatchInput("8.8.8.8, 1.1.1.1\n# 注释\n\nexample.com  8.8.8.8 # 重复\r\n2001:db8::1；9.9.9.9"), ["8.8.8.8", "1.1.1.1", "example.com", "2001:db8::1", "9.9.9.9"]);
});

test("CSV export has a BOM, escapes quotes and commas, and neutralises formulas", () => {
  const data = { ip: "8.8.8.8", country: "美国", countryCode: "US", isp: '=HYPERLINK("x")', source: "MaxMind", accuracy: "low", ipVersion: "IPv4",
    as: { number: 15169, name: "Google, LLC" }, location: { latitude: 37.751, longitude: -97.822, source: "MaxMind" } } as IPInfo;
  const csv = toCSV([{ query: "8.8.8.8", ok: true, data }, { query: "bad", ok: false, error: "无效的 IP 地址或域名" }]);
  assert.ok(csv.startsWith("\uFEFF查询,IP,"));
  const [, first, second] = csv.trimEnd().split("\r\n");
  assert.match(first, /"'=HYPERLINK\(""x""\)"/);
  assert.match(first, /"Google, LLC"/);
  assert.match(first, /,-97\.822,/);
  assert.match(second, /^bad,+无效的 IP 地址或域名$/);
});
