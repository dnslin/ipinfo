import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { MeituanAPIService } from "../lib/meituan-api";
import { NextRequest } from "next/server";
import { POST } from "../app/api/meituan/route";

afterEach(() => mock.restoreAll());

test("Meituan's HTTP 200 no-location response becomes a distinct missing-data result with server diagnostics", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: { code: 404, message: "Can Not Loc" } }));
  const diagnostics = mock.method(console, "info", () => {});
  await assert.rejects(MeituanAPIService.queryIPLocation("223.5.5.5"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "美团未收录此IP");
    assert.equal("code" in error && error.code, "MEITUAN_LOCATION_NOT_FOUND");
    return true;
  });
  assert.match(JSON.stringify(diagnostics.mock.calls.map((call) => call.arguments)), /Can Not Loc/);
});

function request(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/meituan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip }),
  });
}

test("Meituan API returns a concise structured 404 for an upstream business 404", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: { code: 404, type: "Data Not found", message: "Can Not Loc" } }));
  const response = await POST(request("223.5.5.5"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: "MEITUAN_LOCATION_NOT_FOUND", error: "美团未收录此IP" });
});

test("Meituan transport failures remain unavailable errors rather than missing IP data", async () => {
  mock.method(globalThis, "fetch", async () => new Response("Bad Gateway", { status: 502 }));
  const response = await POST(request("223.5.5.5"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "MEITUAN_UPSTREAM_UNAVAILABLE", error: "美团服务暂时不可用，请稍后重试" });
});

test("malformed client JSON is not reported as a Meituan service outage", async () => {
  const response = await POST(new NextRequest("http://localhost/api/meituan", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "无效的JSON请求体" });
});

test("an address detail response does not claim more precise IP coordinates", async () => {
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    return url.includes("/locate/")
      ? Response.json({ data: { ip: "223.5.5.5", lat: 30.2, lng: 120.2, fromwhere: "ip", rgeo: { country: "中国", province: "浙江省", city: "杭州市", district: "", adcode: "330100" } } })
      : Response.json({ data: { areaName: "城区", detail: "附近道路", lat: 30.2, lng: 120.2 } });
  });
  const result = await MeituanAPIService.enhancedIPQuery("223.5.5.5");
  assert.equal(result.location.source, "MeiTuan");
  assert.equal(result.accuracy, "medium");
  assert.equal(result.meituan?.detail, "附近道路");
});
