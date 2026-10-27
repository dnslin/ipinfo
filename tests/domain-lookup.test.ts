import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Resolver } from "node:dns/promises";
import { NextRequest } from "next/server";
import { normalizeDomain } from "../lib/domain";
import { lookupTarget } from "../lib/lookup";
import { geoIPService } from "../lib/geoip";
import { POST } from "../app/api/query/route";
import type { IPInfo } from "../lib/store";

afterEach(() => mock.restoreAll());

const info = (ip: string): IPInfo => ({
  ip, country: "美国", countryCode: "US", source: "MaxMind", accuracy: "low", ipVersion: ip.includes(":") ? "IPv6" : "IPv4",
  location: { latitude: 30, longitude: 120, source: "MaxMind" },
});

test("domain input accepts URLs and IDNs but rejects internal names and bare words", () => {
  assert.equal(normalizeDomain("https://Www.Example.org/path?x=1"), "www.example.org");
  assert.equal(normalizeDomain("中文.中国"), "xn--fiq228c.xn--fiqs8s");
  assert.equal(normalizeDomain("example.com."), "example.com");
  for (const value of ["localhost", "printer.local", "router.lan", "intranet", "1.2.3.4", "-bad.com", "a..com", "user@example.com"]) {
    assert.equal(normalizeDomain(value), null, value);
  }
});

test("a domain query looks up its first public address and lists all resolved addresses", async () => {
  mock.method(Resolver.prototype, "resolve4", async () => ["10.0.0.1", "93.184.216.34"]);
  mock.method(Resolver.prototype, "resolve6", async () => ["2606:2800:220:1:248:1893:25c8:1946"]);
  mock.method(geoIPService, "queryIPInfo", async (ip: string) => info(ip));
  const result = await lookupTarget("lookup-one.example.net");
  assert.equal(result.ip, "93.184.216.34");
  assert.deepEqual(result.resolvedFrom, { domain: "lookup-one.example.net", addresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] });
});

test("domains that only resolve to private or reserved addresses are not looked up", async () => {
  mock.method(Resolver.prototype, "resolve4", async () => ["192.168.1.10", "198.18.0.5"]);
  mock.method(Resolver.prototype, "resolve6", async () => { throw Object.assign(new Error("no data"), { code: "ENODATA" }); });
  const lookup = mock.method(geoIPService, "queryIPInfo", async (ip: string) => info(ip));
  await assert.rejects(lookupTarget("internal-only.example.net"), /只解析到内网或保留地址/);
  assert.equal(lookup.mock.callCount(), 0);
});

test("batch queries return one entry per unique target and keep failures separate", async () => {
  mock.method(geoIPService, "queryIPInfo", async (ip: string) => info(ip));
  const response = await POST(new NextRequest("http://localhost/api/query", {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.20" },
    body: JSON.stringify({ ips: ["8.8.8.8", " 8.8.8.8 ", "not a target", "1.1.1.1"] }),
  }));
  assert.equal(response.status, 200);
  const { results } = await response.json();
  assert.deepEqual(results.map((item: { query: string; ok: boolean }) => [item.query, item.ok]), [["8.8.8.8", true], ["not a target", false], ["1.1.1.1", true]]);
});

test("batch queries are capped at 100 targets", async () => {
  const ips = Array.from({ length: 101 }, (_, index) => `10.0.${Math.floor(index / 256)}.${index % 256}`);
  const response = await POST(new NextRequest("http://localhost/api/query", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ips }),
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /最多 100 条/);
});
