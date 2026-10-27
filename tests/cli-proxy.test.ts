import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { formatText, isCLIRequest } from "../lib/cli-format";
import { GET as cli } from "../app/api/cli/route";
import { GET as cliPath } from "../app/api/cli/[...slug]/route";
import { geoIPService } from "../lib/geoip";
import type { IPInfo } from "../lib/store";

afterEach(() => mock.restoreAll());

const curl = { "user-agent": "curl/8.7.1" };
const browser = { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15" };
const rewriteOf = (response: Response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target) : null;
};

test("command-line clients are recognised by their user agent", () => {
  for (const agent of ["curl/8.7.1", "Wget/1.21", "HTTPie/3.2", "Mozilla/5.0 (Windows NT; Windows NT 10.0) WindowsPowerShell/5.1"]) assert.equal(isCLIRequest(agent), true, agent);
  assert.equal(isCLIRequest(browser["user-agent"]), false);
  assert.equal(isCLIRequest(null), false);
});

test("curl on the homepage receives the plain IP while browsers get the page", () => {
  const plain = rewriteOf(proxy(new NextRequest("http://localhost/", { headers: curl })));
  assert.equal(plain?.pathname, "/api/cli/ip");
  const page = proxy(new NextRequest("http://localhost/", { headers: browser }));
  assert.equal(rewriteOf(page), null);
  assert.match(page.headers.get("vary") ?? "", /User-Agent/);
});

test("path shortcuts rewrite for the CLI and redirect browsers to a shareable query", () => {
  const text = rewriteOf(proxy(new NextRequest("http://localhost/8.8.8.8", { headers: curl })));
  assert.equal(text?.pathname, "/api/cli/text/8.8.8.8");
  const json = rewriteOf(proxy(new NextRequest("http://localhost/2001:4860:4860::8888/json", { headers: browser })));
  assert.equal(decodeURIComponent(json?.pathname ?? ""), "/api/cli/json/2001:4860:4860::8888");
  const redirect = proxy(new NextRequest("http://localhost/example.com", { headers: browser }));
  assert.equal(redirect.status, 307);
  assert.equal(new URL(redirect.headers.get("location")!).search, "?q=example.com");
});

test("static files and app pages are not mistaken for lookup targets", () => {
  for (const path of ["/robots.txt", "/batch", "/api/query"]) {
    const response = proxy(new NextRequest(`http://localhost${path}`, { headers: curl }));
    assert.equal(rewriteOf(response), null, path);
    assert.equal(response.headers.get("location"), null, path);
  }
});

const info: IPInfo = {
  ip: "8.8.8.8", country: "美国", countryCode: "US", isp: "Google", source: "MaxMind", accuracy: "low", ipVersion: "IPv4",
  as: { number: 15169, name: "Google LLC" }, timezone: "America/Chicago",
  location: { latitude: 37.751, longitude: -97.822, accuracy_radius: 1000, source: "MaxMind" },
};

test("text output aligns Chinese labels by display width and omits missing fields", () => {
  const lines = formatText(info).trimEnd().split("\n");
  assert.equal(lines[0], "IP      8.8.8.8 (IPv4)");
  assert.equal(lines[2], "运营商  Google");
  assert.ok(lines.every((line) => !line.includes("undefined")));
  assert.ok(!lines.some((line) => line.startsWith("网络段")));
});

test("the CLI route serves text, JSON and plain-IP formats", async () => {
  mock.method(geoIPService, "queryIPInfo", async () => info);
  const call = (search: string) => cli(new NextRequest(`http://localhost/api/cli${search}`, { headers: { ...curl, "x-real-ip": "203.0.113.50" } }));
  const ip = await call("?format=ip");
  assert.equal(await ip.text(), "203.0.113.50\n");
  const text = await call("?q=8.8.8.8");
  assert.match(text.headers.get("content-type") ?? "", /text\/plain/);
  assert.match(await text.text(), /AS15169 Google LLC/);
  const json = await call("?q=8.8.8.8&format=json");
  assert.equal((await json.json()).ip, "8.8.8.8");
  const invalid = await call("?q=nope");
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /^错误: /);
});

test("the path form of the CLI route matches what the proxy rewrites to", async () => {
  mock.method(geoIPService, "queryIPInfo", async () => info);
  const call = (slug: string[]) => cliPath(new NextRequest(`http://localhost/api/cli/${slug.join("/")}`, { headers: { "x-real-ip": "203.0.113.50" } }), { params: Promise.resolve({ slug }) });
  assert.equal(await (await call(["ip"])).text(), "203.0.113.50\n");
  assert.equal((await (await call(["json", "8.8.8.8"])).json()).ip, "8.8.8.8");
  assert.equal((await call(["bogus"])).status, 404);
});
