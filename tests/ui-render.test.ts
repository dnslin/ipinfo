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
  assert.match(text, /坐标 未提供 数据库未提供坐标/);
  assert.match(text, /此 IP 的数据库记录未提供有效坐标/);
  assert.doesNotMatch(text, /0\.0000/);
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
  assert.match(html, /本地网络地址没有公网地理位置/);
});

test("local IPv6 classification comes from the query result rather than repeated string rules", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, {
    ipData: { ...ipData, ip: "fe90::1", country: "本地网络", countryCode: "PRIVATE", source: "Local", ipVersion: "IPv6" },
  }));
  assert.doesNotMatch(html, />美团溯源</);
  assert.match(html, /title="私有地址"/);
});

test("the result reads as identity, then summary, then the full record", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: { ...ipData, timezone: "Asia/Shanghai" } }));
  const order = ["IP 查询结果", "运营商 / 组织", "地理位置", "网络与注册"].map((label) => html.indexOf(label));
  assert.ok(order.every((index) => index >= 0), "every result section is rendered");
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
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

test("long IPv6 results size the title by length and widen the identity card", () => {
  const ip = "2409:8a55:3a2b:1c40:5d3e:8f21:a6b7:9c01";
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: { ...ipData, ip, ipVersion: "IPv6" } }));
  assert.match(html, /data-long="true"/);
  assert.match(html, new RegExp(`--ip-chars:${ip.length}`));
  const short = renderToStaticMarkup(createElement(IPInfoCard, { ipData }));
  assert.doesNotMatch(short, /data-long/);
});

test("each administrative level keeps its name and code on one row", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: {
    ...ipData, country: "中国", countryCode: "CN", province: "广东省", provinceCode: "440000",
    city: "深圳市", cityCode: "440300", district: "坪山区", districtCode: "440310", source: "GeoCN",
  } }));
  const rows = [...html.matchAll(/<div class="detail-row region-row">(.*?)<\/div>/g)].map((match) => match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  assert.deepEqual(rows, ["国家/地区 中国 CN", "省份 广东省 440000", "城市 深圳市 440300", "区县 坪山区 440310"]);
});

test("a municipality whose province and city share a name lists it once", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: {
    ...ipData, country: "中国", countryCode: "CN", province: "北京市", city: "北京市", district: "海淀区", source: "GeoCN",
  } }));
  assert.equal(html.match(/<div class="detail-row region-row">/g)?.length, 3);
});
