import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBGPTopology, pickTopologyNeighbors } from "../lib/bgp-graph";
import { getBGPNeighbors } from "../lib/bgp-explorer";
import type { BGPPeer, BGPPosition, ProcessedBGPData } from "../lib/bgp-api";

const peer = (asn: number, position: BGPPosition, power: number): BGPPeer => ({ asn, name: `AS${asn}`, description: "", country_code: "", position, power });
const many = (start: number, count: number, position: BGPPosition) => Array.from({ length: count }, (_, index) => peer(start + index, position, count - index));
const data = (allPeers: BGPPeer[]): ProcessedBGPData => ({ centerAsn: 15169, centerName: "Google LLC", ipv4Peers: allPeers, ipv6Peers: [], allPeers });

test("the topology keeps the strongest neighbours per direction and reports the rest as hidden", () => {
  const neighbors = getBGPNeighbors(data([...many(100, 20, "upstream"), ...many(200, 3, "downstream"), ...many(300, 10, "uncertain")]));
  const topology = buildBGPTopology(neighbors, "all", null, 400, 340);
  const byPosition = (position: BGPPosition) => topology.nodes.filter(node => node.position === position).map(node => node.asn);
  assert.deepEqual(byPosition("upstream"), [100, 101, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(byPosition("downstream"), [200, 201, 202]);
  assert.equal(byPosition("uncertain").length, 4);
  assert.equal(topology.hidden, 33 - topology.nodes.length);
});

test("upstream nodes sit above the target and downstream nodes below it", () => {
  const neighbors = getBGPNeighbors(data([...many(100, 5, "upstream"), ...many(200, 5, "downstream")]));
  const topology = buildBGPTopology(neighbors, "all", null, 400, 340);
  for (const node of topology.nodes) {
    if (node.position === "upstream") assert.ok(node.y < topology.center.y);
    else assert.ok(node.y > topology.center.y);
  }
});

test("a selected neighbour outside the strongest set is still drawn", () => {
  const neighbors = getBGPNeighbors(data(many(100, 20, "upstream")));
  const picked = pickTopologyNeighbors(neighbors, "all", 119);
  assert.equal(picked.length, 8);
  assert.ok(picked.some(neighbor => neighbor.asn === 119));
});

test("filtering to one direction spreads it around the full circle within the canvas", () => {
  const neighbors = getBGPNeighbors(data(many(100, 30, "downstream")));
  const topology = buildBGPTopology(neighbors, "downstream", null, 320, 300);
  assert.equal(topology.nodes.length, 16);
  assert.ok(topology.nodes.some(node => node.y < topology.center.y));
  assert.ok(topology.nodes.every(node => node.x - node.r >= 0 && node.x + node.r <= 320 && node.y - node.r >= 0 && node.y + node.r <= 300));
});

test("no neighbours produces an empty topology instead of invented relationships", () => {
  const topology = buildBGPTopology([], "all", null, 400, 340);
  assert.deepEqual(topology.nodes, []);
  assert.equal(topology.hidden, 0);
});
