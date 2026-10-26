import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBGPGraph } from "../lib/bgp-graph";
import type { BGPPeer, ProcessedBGPData } from "../lib/bgp-api";

const peer = (asn: number): BGPPeer => ({ asn, name: `AS${asn}`, description: "", country_code: "" });
const data: ProcessedBGPData = {
  centerAsn: 15169,
  centerName: "GOOGLE",
  ipv4Peers: [peer(174), peer(13335)],
  ipv6Peers: [peer(13335), peer(64512)],
  allPeers: [peer(174), peer(13335), peer(64512)],
};

test("BGP graph includes every reported peer without a hardcoded ASN whitelist", () => {
  const graph = buildBGPGraph(data, "both");
  assert.deepEqual(graph.nodes.filter(node => !node.isCenter).map(node => node.asn), [174, 13335, 64512]);
  assert.equal(graph.nodes.filter(node => node.asn === 13335).length, 1);
});

test("dual-stack peers retain separate IPv4 and IPv6 connections", () => {
  const graph = buildBGPGraph(data, "both");
  assert.deepEqual(graph.links.filter(link => link.target === "as13335").map(link => link.protocolType), ["ipv4", "ipv6"]);
});

test("protocol filters include every matching peer and exclude other protocols", () => {
  assert.deepEqual(buildBGPGraph(data, "ipv4").nodes.filter(node => !node.isCenter).map(node => node.asn), [174, 13335]);
  assert.deepEqual(buildBGPGraph(data, "ipv6").nodes.filter(node => !node.isCenter).map(node => node.asn), [13335, 64512]);
  assert.ok(buildBGPGraph(data, "ipv6").links.every(link => link.protocolType === "ipv6"));
});

test("empty BGP results show the target without inventing peers or its country", () => {
  const graph = buildBGPGraph({ ...data, ipv4Peers: [], ipv6Peers: [], allPeers: [] }, "both");
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].asn, 15169);
  assert.equal(graph.nodes[0].countryCode, "");
  assert.equal(graph.links.length, 0);
});
