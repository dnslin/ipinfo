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

test("relationship view shows only the explicitly selected neighbour and target ASN", () => {
  const graph = buildBGPGraph(data, 13335, "both");
  assert.ok(graph);
  assert.deepEqual(graph.nodes.map(node => node.asn), [15169, 13335]);
  assert.equal(graph.nodes.filter(node => node.asn === 13335).length, 1);
});

test("selected dual-stack neighbour retains both observed connections", () => {
  const graph = buildBGPGraph(data, 13335, "both");
  assert.ok(graph);
  assert.deepEqual(graph.links.map(link => link.protocolType), ["ipv4", "ipv6"]);
  assert.ok(graph.links.every(link => link.target === "as13335"));
});

test("relationship protocol filter never substitutes a different neighbour", () => {
  const graph = buildBGPGraph(data, 13335, "ipv6");
  assert.ok(graph);
  assert.deepEqual(graph.nodes.map(node => node.asn), [15169, 13335]);
  assert.deepEqual(graph.links.map(link => link.protocolType), ["ipv6"]);
  assert.equal(buildBGPGraph(data, 174, "ipv6"), null);
});

test("unknown ASN or empty data does not generate an invented relationship", () => {
  assert.equal(buildBGPGraph(data, 99999, "both"), null);
  assert.equal(buildBGPGraph({ ...data, ipv4Peers: [], ipv6Peers: [], allPeers: [] }, 13335), null);
});

test("mobile relationships keep both complete nodes inside the viewport", () => {
  const graph = buildBGPGraph(data, 13335, "both", 288, 320);
  assert.ok(graph);
  assert.equal(graph.nodes[0].x, graph.nodes[1].x);
  assert.ok(graph.nodes[0].y < graph.nodes[1].y);
  assert.ok(graph.nodes.every(node => node.x >= 0 && node.x + node.width <= 288));
});

test("an observed neighbour without protocol counts still has a neutral relationship", () => {
  const unspecified = { ...data, ipv4Peers: [], ipv6Peers: [], allPeers: [peer(13335)] };
  const graph = buildBGPGraph(unspecified, 13335, "both");
  assert.ok(graph);
  assert.deepEqual(graph.nodes.map(node => node.asn), [15169, 13335]);
  assert.deepEqual(graph.links.map(link => link.protocolType), ["unknown"]);
  assert.equal(buildBGPGraph(unspecified, 13335, "ipv4"), null);
  assert.equal(buildBGPGraph(unspecified, 13335, "ipv6"), null);
});
