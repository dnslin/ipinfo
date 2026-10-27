import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IPInfoCard from "../components/ip-info-card";
import { IPAddress } from "../components/ip-address";
import { type IPInfo, useIPQueryStore } from "../lib/store";

const ipData: IPInfo = {
  ip: "1.1.1.1",
  country: "美国",
  countryCode: "US",
  location: { latitude: null, longitude: null, source: null },
  accuracy: "low",
  source: "MaxMind",
  ipVersion: "IPv4",
};

test("IP results render missing coordinates explicitly instead of crashing or showing zero", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData }));
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /纬度 未提供/);
  assert.match(text, /经度 未提供/);
});

test("an anycast record without a country or city explains the missing location", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: { ...ipData, country: "", countryCode: "" } }));
  assert.ok(html.includes("地区信息未提供"), "the location section must explain an unknown location");
});

test("IPv6 title offers breaks between groups without changing the copyable IP text", () => {
  const ip = "2001:4860:4860::8888";
  const html = renderToStaticMarkup(createElement(IPAddress, { value: ip }));
  assert.match(html, /2001:<\/span><wbr/);
  assert.equal(html.replace(/<[^>]*>/g, ""), ip);
});

test("local address results identify their actual source instead of a GeoIP database", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, {
    ipData: { ...ipData, ip: "127.0.0.1", country: "本地网络", countryCode: "PRIVATE", source: "Local" },
  }));
  assert.match(html, /本地地址分类/);
  assert.doesNotMatch(html, />MaxMind</);
  assert.doesNotMatch(html, /更多信息/, "local records without metadata must not show an empty disclosure");
});

test("local IPv6 classification comes from the query result rather than repeated string rules", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, {
    ipData: { ...ipData, ip: "fe90::1", country: "本地网络", countryCode: "PRIVATE", source: "Local", ipVersion: "IPv6" },
  }));
  assert.doesNotMatch(html, />美团溯源</);
  assert.match(html, /title="私有地址"/);
});

test("additional IP information comes before the map in the reading and keyboard order", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: { ...ipData, timezone: "Asia/Shanghai" } }));
  assert.ok(html.indexOf("地理位置") < html.indexOf("网络信息"));
  assert.ok(html.indexOf("网络信息") < html.indexOf("更多信息"));
  assert.ok(html.indexOf("更多信息") < html.indexOf("地图位置"));
});

test("the compact result keeps detailed location, network and registration information", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: {
    ...ipData, country: "中国", countryCode: "CN", province: "浙江省", city: "杭州市",
    location: { latitude: 0, longitude: 0, accuracy_radius: 20, source: "MaxMind" },
    postal: "310000", meituan: { detail: "文一路 100 号" },
    as: { number: 45102, name: "Alibaba (US) Technology Co., Ltd." },
    isp: "阿里云国际", net: "223.5.5.0/24", type: "数据中心",
    timezone: "Asia/Shanghai", registered_country: { code: "US", name: "美国" },
    provinceCode: "ZJ", cityCode: "HZ", districtCode: "XH",
  } }));
  for (const detail of ["杭州市", "0.0000°", "310000", "文一路 100 号", "AS45102", "Alibaba (US) Technology Co., Ltd.", "阿里云国际", "223.5.5.0/24", "数据中心", "Asia/Shanghai", "注册国家", "ZJ", "HZ", "XH"]) {
    assert.ok(html.replace(/<[^>]*>/g, "").includes(detail), `result retains ${detail}`);
  }
});

test("automatic public results retain proxy detection and its diagnostic details", () => {
  const initial = useIPQueryStore.getInitialState();
  const wasAutoDetected = initial.isAutoDetected;
  // Server rendering reads this initial snapshot, not later client updates.
  initial.isAutoDetected = true;
  try {
    const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: {
      ...ipData, proxyDetection: {
        headerIP: "1.1.1.1", domesticIP: null, foreignIP: "1.1.1.1",
        isUsingProxy: false, proxyType: "direct", confidence: 0.9,
        errors: ["国内探测源超时"], detectionTime: 1000,
      },
    } }));
    assert.match(html, /当前连接 IP/);
    assert.match(html, />代理检测<\/button>/);
    for (const detail of ["请求来源", "国内探测源", "国外探测源", "置信度 90%", "国内探测源超时", "1000"]) {
      assert.ok(html.replace(/<[^>]*>/g, "").includes(detail), `proxy results retain ${detail}`);
    }
  } finally { initial.isAutoDetected = wasAutoDetected; }
});

test("automatic local results do not offer public-network proxy detection", () => {
  const initial = useIPQueryStore.getInitialState();
  const wasAutoDetected = initial.isAutoDetected;
  initial.isAutoDetected = true;
  try {
    const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: {
      ...ipData, ip: "127.0.0.1", source: "Local", country: "本地网络", countryCode: "PRIVATE",
    } }));
    assert.match(html, /当前连接 IP/);
    assert.doesNotMatch(html, />代理检测<\/button>/);
  } finally { initial.isAutoDetected = wasAutoDetected; }
});
