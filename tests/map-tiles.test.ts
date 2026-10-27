import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { fetchMapTile } from "../lib/map-tiles";
import { GET } from "../app/api/map/[z]/[x]/[y]/route";
import { MAP_TILE_PROVIDERS } from "../lib/geoip/map-types";

afterEach(() => mock.restoreAll());

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function directory(t: { after: (fn: () => Promise<void>) => void }) {
  const path = await mkdtemp(join(tmpdir(), "ipinfo-map-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("browser maps request a same-origin tile and retain OpenStreetMap attribution", () => {
  assert.equal(MAP_TILE_PROVIDERS.auto.url, "/api/map/{z}/{x}/{y}.png");
  assert.match(MAP_TILE_PROVIDERS.auto.attribution, /openstreetmap.org\/copyright/);
});

test("a fresh tile is reused from disk without another upstream request", async (t) => {
  const cacheDir = await directory(t);
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    assert.match(headers.get("user-agent")!, /IPInfo.*github.com\/dnslin\/ipinfo/);
    assert.equal(headers.get("referer"), "https://ip.example/");
    assert.equal(headers.get("cache-control"), null);
    assert.equal(options.cache, undefined);
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600", etag: '"tile-1"' } });
  });
  const first = await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  const second = await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  assert.deepEqual(first.body, Buffer.from(png));
  assert.deepEqual(second.body, first.body);
  assert.equal(second.headers.get("etag"), '"tile-1"');
  assert.equal(second.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("concurrent cold requests share one tile fetch and leave a complete reusable cache record", async (t) => {
  const cacheDir = await directory(t);
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    const version = ++calls;
    const body = Buffer.alloc(version === 1 ? 50_000 : 12_000, version);
    await setTimeout(15);
    return new Response(body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
  });
  const tiles = await Promise.all(Array.from({ length: 8 }, () => fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir)));
  assert.equal(calls, 1);
  assert.ok(tiles.every((tile) => tile.body.equals(tiles[0].body)));
  const record = JSON.parse(await readFile(join(cacheDir, "9-425-208.png.json"), "utf8"));
  assert.deepEqual(Buffer.from(record.body, "base64"), tiles[0].body);
  assert.deepEqual((await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir)).body, tiles[0].body);
  assert.equal(calls, 1);
});

test("concurrent upstream failure is shared and a later request can retry", async (t) => {
  const cacheDir = await directory(t);
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    const version = ++calls;
    await setTimeout(15);
    return version === 1 ? new Response(null, { status: 503 }) : new Response(png, { headers: { "content-type": "image/png" } });
  });
  const failed = await Promise.allSettled(Array.from({ length: 4 }, () => fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir)));
  assert.ok(failed.every((result) => result.status === "rejected" && /503/.test(String(result.reason))));
  assert.equal(calls, 1);
  assert.deepEqual((await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir)).body, Buffer.from(png));
  assert.equal(calls, 2);
});

test("in-flight requests for the same tile in different cache directories stay independent", async (t) => {
  const first = await directory(t);
  const second = await directory(t);
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    await setTimeout(15);
    return new Response(png, { headers: { "content-type": "image/png" } });
  });
  await Promise.all([fetchMapTile("9/425/208.png", "https://ip.example/", first), fetchMapTile("9/425/208.png", "https://ip.example/", second)]);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("expired tiles revalidate with both validators and keep their body after HTTP 304", async (t) => {
  const cacheDir = await directory(t);
  let calls = 0;
  mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls += 1;
    if (calls === 1) return new Response(png, { headers: {
      "content-type": "image/png", "cache-control": "public, max-age=0",
      etag: '"tile-1"', "last-modified": "Mon, 26 Oct 2026 00:00:00 GMT",
    } });
    const headers = new Headers(options.headers);
    assert.equal(headers.get("if-none-match"), '"tile-1"');
    assert.equal(headers.get("if-modified-since"), "Mon, 26 Oct 2026 00:00:00 GMT");
    return new Response(null, { status: 304, headers: { "cache-control": "public, max-age=7200" } });
  });
  await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  const result = await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  assert.deepEqual(result.body, Buffer.from(png));
  assert.equal(result.headers.get("cache-control"), "public, max-age=7200");
  await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  assert.equal(calls, 2);
});

test("upstream errors and no-store responses are not cached", async (t) => {
  const cacheDir = await directory(t);
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) return new Response("Unavailable", { status: 503 });
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  });
  await assert.rejects(fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir), /503/);
  await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  assert.equal(calls, 3);
});

test("tiles without upstream freshness information use the required seven-day cache", async (t) => {
  const cacheDir = await directory(t);
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(png, { headers: { "content-type": "image/png" } }));
  const first = await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  const second = await fetchMapTile("9/425/208.png", "https://ip.example/", cacheDir);
  assert.equal(first.headers.get("cache-control"), "public, max-age=604800");
  assert.deepEqual(second.body, first.body);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("the map endpoint returns PNG data and supports browser conditional requests", async () => {
  mock.method(globalThis, "fetch", async () => new Response(png, { headers: {
    "content-type": "image/png", "cache-control": "no-store", etag: '"map-route-fixture"',
  } }));
  const context = { params: Promise.resolve({ z: "19", x: "524287", y: "524287.png" }) };
  const response = await GET(new NextRequest("https://ip.example/api/map/19/524287/524287.png"), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(png));
  const unchanged = await GET(new NextRequest("https://ip.example/api/map/19/524287/524287.png", {
    headers: { "If-None-Match": 'W/"map-route-fixture"' },
  }), context);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
});

test("invalid tile coordinates are rejected without an upstream request", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch"); });
  for (const [z, x, y] of [["20", "0", "0.png"], ["1", "2", "0.png"], ["1", "0", "2.png"], ["1", "0", "0.jpg"], ["-1", "0", "0.png"]]) {
    const response = await GET(new NextRequest(`https://ip.example/api/map/${z}/${x}/${y}`), { params: Promise.resolve({ z, x, y }) });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});
