import assert from "node:assert/strict";
import { test } from "node:test";
import type { IPInfo } from "../lib/store";
import { mergeIPLocation } from "../lib/ip-result";

const original: IPInfo = {
  ip: "223.5.5.5", ipVersion: "IPv4", country: "中国", countryCode: "CN",
  city: "杭州市", postal: "310000", timezone: "Asia/Shanghai", regions: ["浙江省", "杭州市"],
  provinceCode: "330000", as: { number: 45102, name: "Alibaba" }, isp: "阿里云", type: "IDC",
  source: "GeoCN", accuracy: "medium", registered_country: { code: "CN", name: "中国" },
  location: { latitude: 30.2, longitude: 120.2, accuracy_radius: 20, source: "MaxMind" },
};
const supplement: IPInfo = {
  ip: "223.5.5.5", ipVersion: "IPv4", country: "中国", countryCode: "CN", city: "上海市", district: "黄浦区",
  source: "MeiTuan", accuracy: "medium", location: { latitude: 31.2, longitude: 121.4, source: "MeiTuan" },
};

test("a supplementary location does not inherit an old location's postal, timezone or regions", () => {
  const result = mergeIPLocation(original, supplement);
  assert.equal(result.city, "上海市");
  for (const field of ["postal", "timezone", "regions", "provinceCode"] as const) assert.equal(result[field], undefined, field);
  assert.deepEqual(result.location, supplement.location);
});

test("changing the location preserves the IP's network and registration information", () => {
  const result = mergeIPLocation(original, supplement);
  assert.deepEqual(result.as, original.as);
  assert.equal(result.isp, "阿里云");
  assert.equal(result.type, "IDC");
  assert.deepEqual(result.registered_country, original.registered_country);
});
