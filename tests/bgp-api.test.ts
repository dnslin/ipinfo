import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/bgp/[asn]/route";

const query = (asn = "15169") => GET(
  new NextRequest(`http://localhost/api/bgp/${asn}`),
  { params: Promise.resolve({ asn }) },
);

afterEach(() => mock.restoreAll());

test("RIPE RIS observations are grouped by protocol and repeated ASNs are deduplicated", async () => {
  let upstreamURL: URL | undefined;
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/as-names/")) return Response.json({ status: "ok", data: { names: { 15169: "GOOGLE - Google LLC", 174: "COGENT-174 - Cogent Communications, US", 13335: "AS13335 - Cloudflare, Inc." } } });
    upstreamURL = new URL(url);
    return Response.json({
      status: "ok",
      data: {
        neighbours: [
          { asn: 174, type: "left", power: 2, v4_peers: 8, v6_peers: 0 },
          { asn: 13335, type: "left", power: 2, v4_peers: 3, v6_peers: 4 },
          { asn: 174, type: "right", power: 1, v4_peers: 0, v6_peers: 2 },
          { asn: 64512, type: "uncertain", power: 0, v4_peers: 0, v6_peers: 0 },
        ],
      },
    });
  });

  const response = await query();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(upstreamURL?.origin, "https://stat.ripe.net");
  assert.equal(upstreamURL?.pathname, "/data/asn-neighbours/data.json");
  assert.equal(upstreamURL?.searchParams.get("resource"), "AS15169");
  assert.equal(upstreamURL?.searchParams.get("sourceapp"), "ipinfo");
  assert.equal(data.centerAsn, 15169);
  assert.equal(data.centerName, "Google LLC");
  assert.deepEqual(data.ipv4Peers.map((peer: { asn: number }) => peer.asn), [174, 13335]);
  assert.deepEqual(data.ipv6Peers.map((peer: { asn: number }) => peer.asn), [13335, 174]);
  assert.deepEqual(data.allPeers.map((peer: { asn: number }) => peer.asn), [174, 13335]);
  // 左右两侧都出现的邻居方向记为不确定，观测计数合并
  assert.deepEqual(data.allPeers[0], {
    asn: 174,
    name: "Cogent Communications",
    description: "COGENT-174",
    country_code: "US",
    power: 2,
    v4Peers: 8,
    v6Peers: 2,
    position: "uncertain",
  });
  assert.equal(data.allPeers[1].position, "upstream");
  assert.equal(data.allPeers[1].name, "Cloudflare, Inc.");
  assert.equal(data.allPeers[1].description, "");
});

test("large ASN observations without protocol counters remain visible without inventing protocols", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ status: "ok", data: { neighbours: [
    { asn: 10352, type: "left" },
    { asn: 10796, type: "left" },
    { asn: 10352, type: "right" },
    { asn: 174, type: "left", v4_peers: 5 },
  ] } }));
  const response = await query("6939");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.allPeers.map((peer: { asn: number }) => peer.asn), [10352, 10796, 174]);
  assert.deepEqual(data.ipv4Peers.map((peer: { asn: number }) => peer.asn), [174]);
  assert.deepEqual(data.ipv6Peers, []);
});

test("AS name lookup failures keep the neighbour data", async () => {
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/as-names/")) throw new TypeError("network down");
    return Response.json({ status: "ok", data: { neighbours: [{ asn: 174, type: "right", power: 3, v4_peers: 1, v6_peers: 0 }] } });
  });
  const response = await query();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.centerName, "AS15169");
  assert.equal(data.allPeers[0].name, "AS174");
  assert.equal(data.allPeers[0].position, "downstream");
});

test("an ASN with no RIS observations returns an empty result", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({
    status: "ok",
    data: { neighbours: [] },
  }));

  const response = await query("4294967295");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    centerAsn: 4294967295,
    centerName: "AS4294967295",
    ipv4Peers: [],
    ipv6Peers: [],
    allPeers: [],
  });
});

test("ASN parameters must be plain positive integers within the supported range", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({
    status: "ok",
    data: { neighbours: [] },
  }));

  for (const asn of ["15169junk", "1.5", "+1", "1e3", "invalid", "0", "-1", "4294967296"]) {
    const response = await query(asn);
    assert.equal(response.status, 400, asn);
    assert.deepEqual(await response.json(), { error: "无效的 ASN 编号" });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("malformed upstream observations fail explicitly instead of producing empty or invalid peers", async () => {
  for (const payload of [
    { status: "ok", data: {} },
    { status: "ok", data: { neighbours: null } },
    { status: "ok", data: { neighbours: [{ asn: 174, v4_peers: "3", v6_peers: 0 }] } },
    { status: "ok", data: { neighbours: [{ asn: 174, v4_peers: null }] } },
    { status: "ok", data: { neighbours: [{ asn: -1, v4_peers: 3, v6_peers: 0 }] } },
    { status: "ok", data: { neighbours: [{ asn: 174, v4_peers: 3, v6_peers: -1 }] } },
  ]) {
    mock.method(globalThis, "fetch", async () => Response.json(payload));
    const response = await query();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /RIPEstat.*数据格式/);
    mock.restoreAll();
  }
});

test("an unsuccessful RIPEstat result is not treated as valid BGP data", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({
    status: "error",
    data: {},
  }));

  const response = await query();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /RIPEstat/);
});

test("upstream HTTP failures retain the upstream status in the error", async () => {
  mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));

  const response = await query();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /RIPEstat.*503/);
});

test("an upstream connection failure returns a gateway error", async () => {
  mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });

  const response = await query();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /RIPEstat/);
});

test("an upstream timeout is reported as a gateway timeout", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new DOMException("The operation timed out", "TimeoutError");
  });

  const response = await query();
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /RIPEstat.*超时/);
});
