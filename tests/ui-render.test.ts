import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IPInfoCard from "../components/ip-info-card";
import { TextGenerateEffect } from "../components/ui/text-generate-effect";
import type { IPInfo } from "../lib/store";

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
  assert.match(html, /纬度: 未提供/);
  assert.match(html, /经度: 未提供/);
});

test("an anycast record without a country or city explains the missing location", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, { ipData: { ...ipData, country: "", countryCode: "" } }));
  assert.ok(html.includes("地区信息未提供"), "the location section must explain an unknown location");
});

test("IPv6 title offers breaks between groups without changing the copyable IP text", () => {
  const ip = "2001:4860:4860::8888";
  const html = renderToStaticMarkup(createElement(TextGenerateEffect, { words: ip }));
  assert.match(html, /2001:<\/span><wbr/);
  assert.equal(html.replace(/<[^>]*>/g, ""), ip);
});

test("local address results identify their actual source instead of a GeoIP database", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, {
    ipData: { ...ipData, ip: "127.0.0.1", country: "本地网络", countryCode: "PRIVATE", source: "Local" },
  }));
  assert.match(html, /本地地址分类/);
  assert.doesNotMatch(html, />MaxMind</);
});

test("local IPv6 classification comes from the query result rather than repeated string rules", () => {
  const html = renderToStaticMarkup(createElement(IPInfoCard, {
    ipData: { ...ipData, ip: "fe90::1", country: "本地网络", countryCode: "PRIVATE", source: "Local", ipVersion: "IPv6" },
  }));
  assert.doesNotMatch(html, />溯源</);
  assert.match(html, /title="私有地址"/);
});
