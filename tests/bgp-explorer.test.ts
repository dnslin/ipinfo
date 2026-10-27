import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NeighborExplorer from "../components/bgp/neighbor-explorer";
import { NeighborList, NeighborPagination } from "../components/bgp/neighbor-list";
import { countBGPPositions, filterBGPNeighbors, getBGPNeighbors, paginateBGPNeighbors, sortBGPNeighbors } from "../lib/bgp-explorer";
import type { BGPPeer, ProcessedBGPData } from "../lib/bgp-api";

const peer = (asn: number, name = `AS${asn}`): BGPPeer => ({ asn, name, description: "", country_code: "" });
const data: ProcessedBGPData = {
  centerAsn: 15169,
  centerName: "GOOGLE",
  ipv4Peers: [peer(174), peer(13335, "Cloudflare")],
  ipv6Peers: [peer(13335, "Cloudflare"), { ...peer(64512), description: "测试网络", country_code: "CN" }],
  allPeers: [peer(174), peer(13335, "Cloudflare"), { ...peer(64512), description: "测试网络", country_code: "CN" }],
};

test("full neighbour list keeps all ASNs and both protocol memberships", () => {
  const entries = getBGPNeighbors(data);
  assert.deepEqual(entries.map(entry => entry.asn), [174, 13335, 64512]);
  assert.deepEqual(entries.find(entry => entry.asn === 13335)?.protocols, ["ipv4", "ipv6"]);
});

test("search accepts ASN, AS prefix, name and description without changing source data", () => {
  const entries = getBGPNeighbors(data);
  for (const query of ["13335", " AS13335 ", "cloudflare"]) {
    assert.deepEqual(filterBGPNeighbors(entries, query, "both").map(entry => entry.asn), [13335]);
  }
  assert.deepEqual(filterBGPNeighbors(entries, "测试", "both").map(entry => entry.asn), [64512]);
  assert.equal(entries.length, 3);
  assert.equal(data.allPeers.length, 3);
});

test("protocol filters retain dual-stack neighbours in both subsets", () => {
  const entries = getBGPNeighbors(data);
  assert.deepEqual(filterBGPNeighbors(entries, "", "ipv4").map(entry => entry.asn), [174, 13335]);
  assert.deepEqual(filterBGPNeighbors(entries, "", "ipv6").map(entry => entry.asn), [13335, 64512]);
  assert.equal(filterBGPNeighbors(entries, "174", "ipv6").length, 0);
});

test("all 294 neighbours can be reached across pages with no truncation or duplication", () => {
  const allPeers = Array.from({ length: 294 }, (_, index) => peer(index + 1));
  const entries = getBGPNeighbors({ ...data, allPeers, ipv4Peers: allPeers, ipv6Peers: [] });
  const firstPage = paginateBGPNeighbors(entries, 1);
  const visited = Array.from({ length: firstPage.pageCount }, (_, index) => paginateBGPNeighbors(entries, index + 1))
    .flatMap(page => page.items.map(entry => entry.asn));
  assert.equal(firstPage.total, 294);
  assert.deepEqual(visited, allPeers.map(entry => entry.asn));
  assert.equal(new Set(visited).size, 294);
  assert.equal(paginateBGPNeighbors(entries, firstPage.pageCount).end, 294);
});

test("pagination moves to an existing page when filtering reduces the result set", () => {
  const entries = filterBGPNeighbors(getBGPNeighbors(data), "Cloudflare", "both");
  const page = paginateBGPNeighbors(entries, 15);
  assert.equal(page.page, 1);
  assert.deepEqual(page.items.map(entry => entry.asn), [13335]);
  assert.equal(page.start, 1);
  assert.equal(page.end, 1);
});

test("no matching neighbours has an explicit empty page", () => {
  const page = paginateBGPNeighbors([], 1);
  assert.equal(page.total, 0);
  assert.equal(page.pageCount, 1);
  assert.equal(page.start, 0);
  assert.equal(page.end, 0);
  assert.deepEqual(page.items, []);
});

test("unspecified neighbour protocols remain in the full list without being labelled IPv4 or IPv6", () => {
  const entries = getBGPNeighbors({ ...data, allPeers: [peer(6939)], ipv4Peers: [], ipv6Peers: [] });
  assert.deepEqual(entries.map(entry => entry.asn), [6939]);
  assert.deepEqual(entries[0].protocols, []);
  assert.equal(filterBGPNeighbors(entries, "", "both").length, 1);
  assert.equal(filterBGPNeighbors(entries, "", "ipv4").length, 0);
  assert.equal(filterBGPNeighbors(entries, "", "ipv6").length, 0);
});

test("a 19414-neighbour ASN remains completely pageable while each page stays bounded", () => {
  const allPeers = Array.from({ length: 19414 }, (_, index) => peer(index + 1));
  const entries = getBGPNeighbors({ ...data, allPeers, ipv4Peers: [], ipv6Peers: [] });
  const first = paginateBGPNeighbors(entries, 1);
  const last = paginateBGPNeighbors(entries, first.pageCount);
  const visited = Array.from({ length: first.pageCount }, (_, index) => paginateBGPNeighbors(entries, index + 1).items)
    .flatMap(page => page.map(entry => entry.asn));
  assert.equal(first.items.length, 20);
  assert.equal(last.end, 19414);
  assert.equal(visited.length, 19414);
  assert.equal(new Set(visited).size, 19414);
});

const render = (value: ProcessedBGPData) => renderToStaticMarkup(createElement(NeighborExplorer, { data: value, onDrill: () => {} }));

test("unknown protocols are explained in the row and summary rather than shown as zero relations", () => {
  const unspecified = { ...data, allPeers: [peer(6939)], ipv4Peers: [], ipv6Peers: [] };
  const neighbors = getBGPNeighbors(unspecified);
  const row = renderToStaticMarkup(createElement(NeighborList, { neighbors, targetAsn: 15169, selectedAsn: null, maxPower: 0, onSelect: () => {} }));
  const explorer = render(unspecified);
  assert.ok(row.includes("协议未提供"));
  assert.ok(explorer.includes("上游未提供协议信息"));
  assert.ok(!explorer.includes("IPv4 0"));
  assert.ok(!explorer.includes("IPv6 0"));
});

test("partial protocol coverage names the known counts and unlabelled neighbours", () => {
  const partial = { ...data, allPeers: [...data.allPeers, peer(6939)] };
  assert.ok(render(partial).includes("IPv4 2 · IPv6 2 · 协议未提供 1"));
});

test("a large default explorer renders only its current page of neighbours", () => {
  const allPeers = Array.from({ length: 19414 }, (_, index) => peer(index + 1));
  const explorer = render({ ...data, allPeers, ipv4Peers: [], ipv6Peers: [] });
  assert.equal(explorer.match(/<li(?:\s|>)/g)?.length, 20);
});

test("large neighbour sets use a bounded page input instead of a mobile picker with hundreds of options", () => {
  const allPeers = Array.from({ length: 11125 }, (_, index) => peer(index + 1));
  const page = paginateBGPNeighbors(getBGPNeighbors({ ...data, allPeers, ipv4Peers: [], ipv6Peers: [] }), 1);
  const html = renderToStaticMarkup(createElement(NeighborPagination, { page, onPageChange: () => {} }));
  assert.ok(html.includes('type="number"'));
  assert.ok(html.includes('min="1"'));
  assert.ok(html.includes('max="557"'));
  assert.ok(!html.includes("<select"));
});

test("path direction is counted, filterable and defaults to uncertain when RIS omits it", () => {
  const directed: ProcessedBGPData = { ...data, allPeers: [
    { ...peer(174), position: "upstream", power: 9 },
    { ...peer(13335, "Cloudflare"), position: "downstream", power: 2 },
    peer(64512),
  ] };
  const entries = getBGPNeighbors(directed);
  assert.deepEqual(countBGPPositions(entries), { upstream: 1, downstream: 1, uncertain: 1 });
  assert.deepEqual(filterBGPNeighbors(entries, "", "both", "downstream").map(entry => entry.asn), [13335]);
  assert.deepEqual(filterBGPNeighbors(entries, "", "both", "uncertain").map(entry => entry.asn), [64512]);
});

test("strongest observations sort first with ASN as a stable tie-breaker", () => {
  const entries = getBGPNeighbors({ ...data, allPeers: [{ ...peer(3), power: 1 }, { ...peer(2), power: 5 }, { ...peer(1), power: 1 }] });
  assert.deepEqual(sortBGPNeighbors(entries, "power").map(entry => entry.asn), [2, 1, 3]);
  assert.deepEqual(sortBGPNeighbors(entries, "asn").map(entry => entry.asn), [1, 2, 3]);
});

test("the explorer hides strength sorting and bars when RIS provides no observation strength", () => {
  const html = render(data);
  assert.ok(!html.includes("按观测强度"));
  assert.ok(!html.includes("bgp-power-bar"));
  const strong = render({ ...data, allPeers: data.allPeers.map((item, index) => ({ ...item, power: index + 1 })) });
  assert.ok(strong.includes("按观测强度"));
  assert.ok(strong.includes("bgp-power-bar"));
});

test("unnamed neighbours say so instead of repeating the ASN as a name", () => {
  const html = renderToStaticMarkup(createElement(NeighborList, { neighbors: getBGPNeighbors(data), targetAsn: 15169, selectedAsn: null, maxPower: 0, onSelect: () => {} }));
  assert.ok(html.includes("Cloudflare"));
  assert.equal(html.match(/名称未提供/g)?.length, 2);
});
