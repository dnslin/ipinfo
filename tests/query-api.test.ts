import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/query/route";
import { geoIPService } from "../lib/geoip";

afterEach(() => mock.restoreAll());

test("automatic IP results cannot be cached across visitors", async () => {
  mock.method(geoIPService, "queryIPInfo", async (ip: string) => ({
    ip, country: "美国", countryCode: "US", source: "MaxMind", accuracy: "low", ipVersion: "IPv4",
    location: { latitude: 30, longitude: 120, source: "MaxMind" },
  }));
  for (const ip of ["8.8.8.8", "1.1.1.1"]) {
    const response = await GET(new NextRequest("http://localhost/api/query", { headers: { "x-forwarded-for": ip } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ip, ip);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
  }
});
