import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { detectProxy, detectProxyClient, IP_DETECTION_SOURCES } from "../lib/ip-detection";
import { GET, POST } from "../app/api/proxy-detection/route";

afterEach(() => mock.restoreAll());

function externalIPs(domestic: string, foreign: string) {
  return mock.method(globalThis, "fetch", async (url: string) => new Response(
    url.includes("ipip.net") ? `当前 IP：${domestic}  来自于：中国` : foreign,
  ));
}

test("a normal IPv4/IPv6 split is inconclusive rather than evidence of a proxy", async () => {
  externalIPs("8.8.8.8", "2001:4860:4860::8888");
  const result = await detectProxyClient("1.1.1.1");
  assert.equal(result.proxyType, "unknown");
  assert.equal(result.isUsingProxy, false);
  assert.ok(result.errors.some((message) => message.includes("IPv4") && message.includes("IPv6")));
});

test("equivalent public IP spellings do not produce a proxy mismatch", async () => {
  externalIPs("8.8.8.8", "::ffff:8.8.8.8");
  const result = await detectProxyClient("8.8.8.8");
  assert.equal(result.proxyType, "direct");
  assert.equal(result.isUsingProxy, false);
  assert.equal(result.foreignIP, "8.8.8.8");
});

test("a failed source cannot be reported as a successful direct connection", async () => {
  externalIPs("8.8.8.8", "<html>service unavailable</html>");
  const result = await detectProxyClient("8.8.8.8");
  assert.equal(result.proxyType, "unknown");
  assert.equal(result.foreignIP, null);
  assert.ok(result.errors.some((message) => message.includes("IPINFO.IO") && message.includes("公网 IP")));
});

test("private probe results cannot be used to infer a public proxy", async () => {
  externalIPs("192.168.1.1", "8.8.8.8");
  const result = await detectProxyClient("8.8.8.8");
  assert.equal(result.proxyType, "unknown");
  assert.equal(result.domesticIP, null);
  assert.ok(result.errors.some((message) => message.includes("IPIP.NET")));
});

test("the timeout covers a source that sends headers but never finishes its response body", async () => {
  const timeouts = IP_DETECTION_SOURCES.map((source) => source.timeout);
  IP_DETECTION_SOURCES.forEach((source) => { source.timeout = 20; });
  mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("body timed out", "TimeoutError")));
    },
  })));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      detectProxyClient("8.8.8.8"),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("probe body did not time out")), 500); }),
    ]);
    assert.equal(result.proxyType, "unknown");
    assert.equal(result.domesticIP, null);
    assert.equal(result.foreignIP, null);
    assert.equal(result.errors.filter((message) => message.includes("body timed out")).length, 2);
  } finally {
    clearTimeout(deadline);
    IP_DETECTION_SOURCES.forEach((source, index) => { source.timeout = timeouts[index]; });
  }
});

test("server-side detection never compares the visitor with the server's own egress", async () => {
  const external = externalIPs("1.1.1.1", "8.8.8.8");
  const result = await detectProxy(new NextRequest("https://example.test/api/proxy-detection", {
    headers: { "x-forwarded-for": "9.9.9.9" },
  }));
  assert.equal(external.mock.callCount(), 0);
  assert.equal(result.headerIP, "9.9.9.9");
  assert.equal(result.domesticIP, null);
  assert.equal(result.foreignIP, null);
  assert.equal(result.proxyType, "unknown");
  assert.ok(result.errors.some((message) => message.includes("浏览器")));
});

test("per-visitor proxy API responses are never shared across visitors", async () => {
  externalIPs("1.1.1.1", "8.8.8.8");
  for (const [index, method] of [GET, POST].entries()) {
    const response = await method(new NextRequest("https://example.test/api/proxy-detection", {
      method: index === 0 ? "GET" : "POST",
      headers: { "x-forwarded-for": `9.9.9.${index + 1}`, "content-type": "application/json" },
      ...(index === 1 ? { body: JSON.stringify({ enableProxyDetection: true }) } : {}),
    }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
  }
});

test("the API analyzes browser observations against this request without contacting external sources", async () => {
  const external = externalIPs("4.4.4.4", "4.4.4.4");
  const response = await POST(new NextRequest("https://example.test/api/proxy-detection", {
    method: "POST",
    headers: { "x-forwarded-for": "8.8.8.8", "content-type": "application/json" },
    body: JSON.stringify({ enableProxyDetection: true, domesticIP: "8.8.8.8", foreignIP: "1.1.1.1" }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(external.mock.callCount(), 0);
  assert.equal(result.headerIP, "8.8.8.8");
  assert.equal(result.domesticIP, "8.8.8.8");
  assert.equal(result.foreignIP, "1.1.1.1");
  assert.equal(result.proxyType, "foreign");
});

test("the API normalizes equivalent IPv6 samples before comparing the observations", async () => {
  const external = externalIPs("4.4.4.4", "4.4.4.4");
  const response = await POST(new NextRequest("https://example.test/api/proxy-detection", {
    method: "POST",
    headers: { "x-forwarded-for": "2001:4860:4860::8888", "content-type": "application/json" },
    body: JSON.stringify({ enableProxyDetection: true, domesticIP: "2001:4860:4860:0:0:0:0:8888", foreignIP: "2001:4860:4860::8888" }),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(external.mock.callCount(), 0);
  assert.equal(result.proxyType, "direct");
  assert.equal(result.domesticIP, "2001:4860:4860::8888");
});

test("the API rejects malformed or non-public browser observations", async () => {
  externalIPs("1.1.1.1", "8.8.8.8");
  for (const domesticIP of ["not an IP", "127.0.0.1", 123, {}, []]) {
    const response = await POST(new NextRequest("https://example.test/api/proxy-detection", {
      method: "POST",
      headers: { "x-forwarded-for": "8.8.8.8", "content-type": "application/json" },
      body: JSON.stringify({ enableProxyDetection: true, domesticIP, foreignIP: "1.1.1.1" }),
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /domesticIP.*公网 IP/);
  }
});
