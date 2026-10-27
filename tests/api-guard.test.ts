import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { RateLimiter, guardRequest, requireToken } from "../lib/api-guard";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

const request = (ip: string, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/query", { headers: { "x-real-ip": ip, ...headers } });

test("the token bucket refills over time and reports when to retry", () => {
  let now = 0;
  const limiter = new RateLimiter(2, 60_000, () => now);
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("a").allowed, true);
  const denied = limiter.take("a");
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfter, 30);
  assert.equal(limiter.take("b").allowed, true, "buckets are per client");
  now = 30_000;
  assert.equal(limiter.take("a").allowed, true);
});

test("requests beyond the limit receive 429 with quota headers; a valid token bypasses the limit", async () => {
  process.env.API_RATE_LIMIT = "1";
  process.env.API_TOKEN = "secret-token";
  const first = guardRequest(request("198.51.100.1"));
  assert.ok(first instanceof Headers);
  assert.equal(first.get("x-ratelimit-remaining"), "0");
  const second = guardRequest(request("198.51.100.1"));
  assert.ok(second instanceof NextResponse);
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get("retry-after")) > 0);
  assert.equal((await second.json()).code, "RATE_LIMITED");
  assert.ok(guardRequest(request("198.51.100.1", { authorization: "Bearer secret-token" })) instanceof Headers);
  assert.ok(guardRequest(request("198.51.100.1", { authorization: "Bearer wrong-token!" })) instanceof NextResponse);
});

test("a rate limit of zero disables limiting", () => {
  process.env.API_RATE_LIMIT = "0";
  for (let index = 0; index < 5; index++) assert.ok(guardRequest(request("198.51.100.2")) instanceof Headers);
});

test("administrative operations need a configured and matching token", () => {
  delete process.env.API_TOKEN;
  assert.equal(requireToken(request("198.51.100.3"))?.status, 403);
  process.env.API_TOKEN = "secret-token";
  assert.equal(requireToken(request("198.51.100.3"))?.status, 401);
  assert.equal(requireToken(request("198.51.100.3", { "x-api-token": "secret-token" })), null);
});
