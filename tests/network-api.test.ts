import assert from "node:assert/strict";
import { Resolver } from "node:dns/promises";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/network/route";

afterEach(() => mock.restoreAll());
const query = (ip: string) => GET(new NextRequest(`http://localhost/api/network?ip=${ip}`));

test("an upstream connection failure is not cached as a successful network lookup", async () => {
  mock.method(Resolver.prototype, "reverse", async () => ["dns.example"]);
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.startsWith("https://rdap.org/")) return new Response(null, { status: 404 });
    throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT", address: "193.0.6.150", port: 443 }) });
  });
  const response = await query("9.9.9.9");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.equal(body.routing.ok, false);
  assert.match(body.routing.error, /超时.*193\.0\.6\.150/);
  assert.deepEqual(body.ptr, { ok: true, data: ["dns.example"] });
});

test("a failed RPKI request keeps its diagnostic and can be retried immediately", async () => {
  mock.method(Resolver.prototype, "reverse", async () => []);
  let rpkiAttempts = 0;
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.startsWith("https://rdap.org/")) return new Response(null, { status: 404 });
    if (url.includes("/network-info/")) return Response.json({ status: "ok", data: { prefix: "1.0.0.0/24", asns: [13335] } });
    rpkiAttempts += 1;
    if (rpkiAttempts === 1) throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT", address: "193.0.6.150", port: 443 }) });
    return Response.json({ status: "ok", data: { status: "valid", validating_roas: [] } });
  });
  const first = await query("1.0.0.1");
  const body = await first.json();
  assert.equal(body.routing.ok, true);
  assert.match(body.routing.data.rpkiError, /193\.0\.6\.150/);
  assert.match(first.headers.get("cache-control") ?? "", /no-store/);
  const second = await query("1.0.0.1");
  assert.equal((await second.json()).routing.data.rpki.status, "valid");
  assert.match(second.headers.get("cache-control") ?? "", /public.*max-age=1800/);
  assert.equal(rpkiAttempts, 2);
});
