import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";

let server;
let baseURL;

const request = (path, options) => fetch(new URL(path, baseURL), {
  ...options,
  signal: AbortSignal.timeout(5_000),
});

before(async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  baseURL = `http://127.0.0.1:${port}`;

  await cp("public", ".next/standalone/public", { recursive: true });
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  server = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), GEOIP_PRELOAD: "0", GEOIP_UPDATE_INTERVAL: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const readOutput = (chunk) => {
      output += chunk;
      if (output.includes("Ready in")) resolve();
    };
    server.stdout.on("data", readOutput);
    server.stderr.on("data", readOutput);
    server.stderr.pipe(process.stderr);
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Server exited (${code}): ${output}`)));
  });
}, { timeout: 30_000 });

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
});

test("production homepage and stylesheet are served through proxy", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /<title>IP-Search<\/title>/);
  const stylesheet = html.match(/href="([^\"]+\.css[^\"]*)"/);
  assert.ok(stylesheet, "homepage includes a built stylesheet");
  const asset = await request(stylesheet[1]);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /text\/css/);
});

test("database status can be read without starting downloads", async () => {
  const response = await request("/api/init");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.data.isReady, "boolean");
  assert.ok(Array.isArray(body.data.databases));
});

test("first-paint theme follows the system even when browser storage is unavailable", async () => {
  const html = await (await request("/")).text();
  const bootstrap = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .find((match) => match[1].includes("localStorage") && match[1].includes("matchMedia"))?.[1];
  assert.ok(bootstrap, "homepage contains its first-paint theme bootstrap");
  const classes = new Set();
  const root = { style: {}, classList: {
    add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
    toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
  } };
  runInNewContext(bootstrap, {
    localStorage: { get theme() { throw new Error("storage is unavailable"); }, getItem() { throw new Error("storage is unavailable"); } },
    window: { matchMedia: () => ({ matches: true }) },
    document: { documentElement: root },
  });
  assert.equal(classes.has("dark"), true);
  assert.equal(classes.has("light"), false);
  assert.equal(root.style.colorScheme, "dark");
});

test("connection echo works on a single host and exposes dual-stack probes", async () => {
  const response = await request("/api/ip", { headers: { "x-real-ip": "203.0.113.9" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.equal(body.ip, "203.0.113.9");
  assert.equal(body.version, "IPv4");
  assert.ok(body.probes.ipv4.length > 0 && body.probes.ipv6.length > 0);
});

test("IP query rejects invalid input and keeps API proxy headers", async () => {
  const response = await request("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ip: "not-an-ip" }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.deepEqual(await response.json(), { error: "无效的 IP 地址或域名", code: "INVALID_TARGET" });
});

test("async ASN route parameters are validated before external requests", async () => {
  for (const asn of ["invalid", "0", "4294967296"]) {
    const response = await request(`/api/bgp/${asn}`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "无效的 ASN 编号" });
  }
});

test("health check reports database state without downloading", async () => {
  const response = await request("/api/health");
  assert.ok([200, 503].includes(response.status));
  const body = await response.json();
  assert.ok(["ok", "degraded", "starting", "down"].includes(body.status));
  assert.equal(body.databases.length, 3);
  assert.equal(body.update.intervalHours, 0);
});

test("curl gets plain text from the homepage and shortcuts while browsers get HTML", async () => {
  const plain = await request("/", { headers: { "user-agent": "curl/8.7.1", "x-real-ip": "203.0.113.9" } });
  assert.equal(plain.status, 200);
  assert.match(plain.headers.get("content-type"), /text\/plain/);
  assert.equal(await plain.text(), "203.0.113.9\n");
  const page = await request("/", { headers: { "user-agent": "Mozilla/5.0" } });
  assert.match(page.headers.get("content-type"), /text\/html/);
  const redirect = await request("/1.1.1.1", { headers: { "user-agent": "Mozilla/5.0" }, redirect: "manual" });
  assert.equal(redirect.status, 307);
  assert.match(redirect.headers.get("location"), /\/\?q=1\.1\.1\.1$/);
});

test("batch page is served", async () => {
  const response = await request("/batch");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /批量查询/);
});

test("proxy detection requires explicit enablement", async () => {
  const response = await request("/api/proxy-detection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enableProxyDetection: false }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "代理检测未启用" });
});

test("proxy API compares browser samples without substituting the server's exit", async () => {
  const echo = await request("/api/proxy-detection", { headers: { "x-real-ip": "8.8.8.8" } });
  assert.match(echo.headers.get("cache-control"), /private.*no-store/);
  assert.equal((await echo.json()).proxyType, "unknown");
  const response = await request("/api/proxy-detection", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "8.8.8.8" },
    body: JSON.stringify({ enableProxyDetection: true, domesticIP: "8.8.8.8", foreignIP: "1.1.1.1" }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  const result = await response.json();
  assert.equal(result.headerIP, "8.8.8.8");
  assert.equal(result.proxyType, "foreign");
});

test("map route validates coordinates without requesting external tiles", async () => {
  const response = await request("/api/map/1/2/0.png");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "无效的地图瓦片坐标" });
});
