import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PROBES, parseProbeResponse, probeAddress, readProbeConfig } from "../lib/dual-stack";

test("probe responses accept JSON or plain text and reject the wrong protocol", () => {
  assert.equal(parseProbeResponse('{"ip":"203.0.113.9"}', "IPv4"), "203.0.113.9");
  assert.equal(parseProbeResponse("2001:db8::1\n", "IPv6"), "2001:db8::1");
  assert.equal(parseProbeResponse("203.0.113.9", "IPv6"), null);
  assert.equal(parseProbeResponse("<html>", "IPv4"), null);
});

test("probe config falls back to public endpoints and accepts self-hosted overrides", () => {
  assert.deepEqual(readProbeConfig({}), DEFAULT_PROBES);
  const config = readProbeConfig({ IPV6_PROBE_URLS: " https://ip6.example.com/api/ip , https://b.example/ip " });
  assert.deepEqual(config.ipv6, ["https://ip6.example.com/api/ip", "https://b.example/ip"]);
  assert.deepEqual(config.ipv4, DEFAULT_PROBES.ipv4);
});

test("probing returns the first endpoint that answers with the requested protocol", async () => {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    if (url === "a") throw new TypeError("network unreachable");
    if (url === "b") return new Response("203.0.113.9");
    return new Response('{"ip":"2001:db8::2"}');
  }) as unknown as typeof fetch;
  assert.equal(await probeAddress(["a", "b", "c"], "IPv6", 100, fetcher), "2001:db8::2");
  assert.deepEqual(calls.sort(), ["a", "b", "c"]);
  assert.equal(await probeAddress(["a"], "IPv4", 100, fetcher), null);
});

test("an unreachable protocol gives up after one timeout", async () => {
  const hanging = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  })) as unknown as typeof fetch;
  const started = Date.now();
  assert.equal(await probeAddress(["a", "b", "c"], "IPv6", 50, hanging), null);
  assert.ok(Date.now() - started < 500);
});
