import assert from "node:assert/strict";
import { createServer, get } from "node:http";
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
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
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

test("IPv4 and IPv6 subdomains preserve forced version rewrites", async () => {
  for (const [subdomain, version] of [["ip4", "v4"], ["ip6", "v6"]]) {
    const response = await new Promise((resolve, reject) => {
      get(`${baseURL}/api/init`, {
        headers: { host: `${subdomain}.example.test` },
        signal: AbortSignal.timeout(5_000),
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response));
      }).on("error", reject);
    });
    assert.equal(response.statusCode, 200);
    const rewrittenURL = new URL(response.headers["x-middleware-rewrite"], baseURL);
    assert.equal(rewrittenURL.searchParams.get("ipVersion"), version);
    assert.equal(rewrittenURL.searchParams.get("forceVersion"), "true");
    assert.equal(rewrittenURL.origin, baseURL);
  }
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
  assert.deepEqual(await response.json(), { error: "无效的IP地址格式" });
});

test("async ASN route parameters are validated before external requests", async () => {
  for (const asn of ["invalid", "0", "4294967296"]) {
    const response = await request(`/api/bgp/${asn}`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "无效的 ASN 编号" });
  }
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
