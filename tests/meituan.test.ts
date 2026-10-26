import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { MeituanAPIService } from "../lib/meituan-api";

afterEach(() => mock.restoreAll());

test("Meituan's HTTP 200 error response retains the upstream reason", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: { code: 404, message: "Can Not Loc" } }));
  await assert.rejects(MeituanAPIService.queryIPLocation("223.5.5.5"), /Can Not Loc/);
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
