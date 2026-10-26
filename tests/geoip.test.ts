import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { City, Asn, Reader } from "@maxmind/geoip2-node";
import { DataMerger } from "../lib/geoip/merger";
import { DatabaseDownloader, databaseDownloader, type DatabaseStatus } from "../lib/geoip/downloader";
import { GeoIPService } from "../lib/geoip";
import { GeoIPReader, geoIPReader } from "../lib/geoip/reader";
import { StartupCheckService, startupCheckService } from "../lib/geoip/startup-check";
import { POST as initializeDatabase } from "../app/api/init/route";
import type { RawQueryResult } from "../lib/geoip/types";

function maxmind(city: Record<string, unknown>): RawQueryResult {
  return {
    sourceInfo: { source: "maxmind", timestamp: 0 },
    cityData: Object.assign(new City({}), city),
    asnData: { autonomousSystemNumber: 15169, autonomousSystemOrganization: "GOOGLE" },
  };
}

function geocn(data: Record<string, unknown>): RawQueryResult {
  return {
    sourceInfo: { source: "geocn", timestamp: 0 },
    cityData: data,
  };
}

test("MaxMind conversion retains city, province, postal, timezone and coordinate source", async () => {
  const result = await DataMerger.merge("8.8.8.8", [maxmind({
    country: { isoCode: "US", names: { en: "United States" } },
    subdivisions: [{ isoCode: "CA", names: { en: "California" } }],
    city: { names: { en: "Mountain View" } },
    location: { latitude: 37.4, longitude: -122.1, timeZone: "America/Los_Angeles", accuracyRadius: 50 },
    postal: { code: "94035" },
  })]);

  assert.equal(result.city, "Mountain View");
  assert.equal(result.province, "California");
  assert.equal(result.provinceCode, "CA");
  assert.equal(result.postal, "94035");
  assert.equal(result.timezone, "America/Los_Angeles");
  assert.equal(result.location.source, "MaxMind");
  assert.equal(result.location.accuracy_radius, 50);
  assert.equal(result.as?.number, 15169);
});

test("current GeoCN division codes resolve official districts without inventing coordinates or accuracy", async () => {
  const result = await DataMerger.merge("114.114.114.114", [
    maxmind({
      country: { isoCode: "CN", names: { "zh-CN": "中国" } },
      registeredCountry: { isoCode: "US", names: { en: "United States" } },
      city: { names: { "zh-CN": "旧城市" } },
      location: { latitude: 32.06, longitude: 118.79, accuracyRadius: 200 },
    }),
    geocn({ division_code: 320102, isp: "电信", type: "宽带" }),
  ]);

  assert.equal(result.province, "江苏省");
  assert.equal(result.city, "南京市");
  assert.equal(result.district, "玄武区");
  assert.equal(result.districtCode, "320102");
  assert.deepEqual(result.regions_short, ["江苏", "南京", "玄武"]);
  assert.equal(result.source, "GeoCN");
  assert.equal(result.isp, "电信");
  assert.equal(result.type, "宽带");
  assert.equal(result.accuracy, "low");
  assert.deepEqual(result.location, { latitude: 32.06, longitude: 118.79, accuracy_radius: 200, source: "MaxMind" });
});

test("unknown GeoCN division codes preserve MaxMind locality and precision", async () => {
  const result = await DataMerger.merge("114.114.114.114", [
    maxmind({
      country: { isoCode: "CN", names: { "zh-CN": "中国" } },
      city: { names: { "zh-CN": "南京" } },
      location: { latitude: 32, longitude: 118, accuracyRadius: 500 },
    }),
    geocn({ division_code: 999999, isp: "电信" }),
  ]);

  assert.equal(result.city, "南京");
  assert.deepEqual(result.regions, ["南京"]);
  assert.equal(result.source, "MaxMind");
  assert.equal(result.accuracy, "low");
  assert.equal(result.isp, "电信");
});

test("GeoCN uint64 division codes decoded as BigInt resolve without a query failure", async () => {
  const result = await DataMerger.merge("240e:476::", [
    maxmind({ country: { isoCode: "CN", names: { en: "China", "zh-CN": "中国" } } }),
    geocn({ division_code: BigInt(510104), isp: "电信", type: "基站" }),
  ]);
  assert.equal(result.province, "四川省");
  assert.equal(result.city, "成都市");
  assert.equal(result.district, "锦江区");
  assert.equal(result.type, "基站");
});

test("province-level GeoCN division codes do not invent a city", async () => {
  const result = await DataMerger.merge("114.114.114.114", [
    maxmind({ country: { isoCode: "CN", names: { en: "China" } } }),
    geocn({ division_code: 320000 }),
  ]);
  assert.equal(result.province, "江苏省");
  assert.equal(result.city, undefined);
  assert.deepEqual(result.regions, ["江苏省"]);
});

test("missing MaxMind coordinates stay unknown while real zero coordinates are retained", async () => {
  const unknown = await DataMerger.merge("8.8.8.8", [maxmind({ country: { isoCode: "US" } })]);
  assert.deepEqual(unknown.location, { latitude: null, longitude: null, source: null });
  assert.equal(unknown.accuracy, "low");

  const zero = await DataMerger.merge("8.8.4.4", [maxmind({ location: { latitude: 0, longitude: 0, accuracyRadius: 10 } })]);
  assert.deepEqual(zero.location, { latitude: 0, longitude: 0, accuracy_radius: 10, source: "MaxMind" });
  assert.equal(zero.accuracy, "high");
});

test("database validation accepts small valid MMDBs and rejects large invalid files", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ipinfo-db-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "GeoLite2-City.mmdb"), tinyMMDB);
  writeFileSync(join(directory, "GeoLite2-ASN.mmdb"), "not a database");
  truncateSync(join(directory, "GeoLite2-ASN.mmdb"), 12 * 1024 * 1024);

  const statuses = await new DatabaseDownloader(directory).checkDatabases();
  assert.equal(statuses.find((db) => db.name === "GeoLite2-City.mmdb")?.isValid, true);
  assert.equal(statuses.find((db) => db.name === "GeoLite2-ASN.mmdb")?.isValid, false);
});

test("concurrent cold starts share downloads and retain a usable City database when optional sources fail", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ipinfo-db-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(String(url));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return String(url).endsWith("/GeoLite2-City.mmdb")
      ? new Response(tinyMMDB)
      : new Response("unavailable", { status: 503 });
  });
  const downloader = new DatabaseDownloader(directory);
  const outcomes = await Promise.allSettled([
    downloader.downloadMissingDatabases(),
    downloader.downloadMissingDatabases(),
  ]);

  assert.ok(outcomes.every((outcome) => outcome.status === "fulfilled"));
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => url.startsWith("https://github.com/") && url.includes("/releases/latest/download/")));
  const statuses = await downloader.checkDatabases();
  assert.equal(statuses.find((db) => db.name === "GeoLite2-City.mmdb")?.isValid, true);
  assert.equal(statuses.filter((db) => !db.isValid).length, 2);
});

function databaseStatuses(validNames: string[]): DatabaseStatus[] {
  return ["GeoLite2-City.mmdb", "GeoLite2-ASN.mmdb", "GeoCN.mmdb"].map((name) => ({
    name, exists: validNames.includes(name), size: 100, lastModified: null, isValid: validNames.includes(name),
  }));
}

test("initialization API reports unavailable databases as a failure and preserves the cause", async (t) => {
  startupCheckService.reset();
  t.after(() => startupCheckService.reset());
  t.mock.method(databaseDownloader, "checkDatabases", async () => databaseStatuses([]));
  t.mock.method(databaseDownloader, "downloadMissingDatabases", async () => { throw new Error("upstream HTTP 503"); });
  t.mock.method(geoIPReader, "refresh", async () => { throw new Error("upstream HTTP 503"); });

  const response = await initializeDatabase();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.match(body.error, /upstream HTTP 503/);
  assert.equal(startupCheckService.getStatus().isReady, false);
});

test("initialization distinguishes basic querying from complete supplemental data", async (t) => {
  const partial = databaseStatuses(["GeoLite2-City.mmdb"]);
  t.mock.method(databaseDownloader, "checkDatabases", async () => partial);
  t.mock.method(databaseDownloader, "downloadMissingDatabases", async () => partial);
  t.mock.method(geoIPReader, "refresh", async () => {});
  const service = new StartupCheckService();

  await service.performStartupCheck();
  assert.equal(service.getStatus().canQuery, true);
  assert.equal(service.getStatus().isReady, false);
  assert.equal(service.getStatus().databases.filter((database) => !database.isValid).length, 2);
});

test("failed initialization can retry successfully", async (t) => {
  let available = false;
  t.mock.method(databaseDownloader, "checkDatabases", async () => databaseStatuses(available ? ["GeoLite2-City.mmdb", "GeoLite2-ASN.mmdb", "GeoCN.mmdb"] : []));
  t.mock.method(databaseDownloader, "downloadMissingDatabases", async () => { throw new Error("offline"); });
  t.mock.method(geoIPReader, "refresh", async () => { if (!available) throw new Error("offline"); });
  const service = new StartupCheckService();

  await assert.rejects(() => service.performStartupCheck(), /offline/);
  available = true;
  await service.performStartupCheck();
  assert.equal(service.getStatus().isReady, true);
  assert.equal(service.getStatus().canQuery, true);
  assert.equal(service.getStatus().error, null);
});

test("private addresses do not require a database and never invent a map position", async (t) => {
  t.mock.method(geoIPReader, "initialize", async () => { throw new Error("database unavailable"); });
  const result = await new GeoIPService().queryIPInfo("127.0.0.1");
  assert.equal(result.country, "私有网络");
  assert.equal(result.source, "Local");
  assert.deepEqual(result.location, { latitude: null, longitude: null, source: null });
});

test("queries arriving while optional readers open wait for the same complete initialization", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ipinfo-reader-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixturePath = join(directory, "test.mmdb");
  writeFileSync(fixturePath, tinyMMDB);
  const cityReader = await Reader.open(fixturePath);
  const asnReader = await Reader.open(fixturePath);
  t.mock.method(cityReader, "city", () => new City({}));
  t.mock.method(asnReader, "asn", () => new Asn({ autonomous_system_number: 15169, autonomous_system_organization: "GOOGLE" }));
  t.mock.method(databaseDownloader, "downloadMissingDatabases", async () => databaseStatuses(["GeoLite2-City.mmdb", "GeoLite2-ASN.mmdb"]));

  let openASN!: () => void;
  let asnStarted!: () => void;
  const waitForASN = new Promise<void>((resolve) => { openASN = resolve; });
  const started = new Promise<void>((resolve) => { asnStarted = resolve; });
  t.after(() => openASN());
  t.mock.method(Reader, "open", async (filepath: string) => {
    if (filepath.endsWith("GeoLite2-ASN.mmdb")) {
      asnStarted();
      await waitForASN;
      return asnReader;
    }
    return cityReader;
  });

  const reader = new GeoIPReader();
  const first = reader.queryIP("8.8.8.8");
  await started;
  let secondCompleted = false;
  const second = reader.queryIP("8.8.4.4").then((result) => { secondCompleted = true; return result; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(secondCompleted, false);
  openASN();
  for (const result of await Promise.all([first, second])) {
    assert.equal(result[0].asnData?.autonomousSystemNumber, 15169);
  }
});

test("POST initialization retries missing supplemental databases after basic querying already works", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ipinfo-retry-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixturePath = join(directory, "test.mmdb");
  writeFileSync(fixturePath, tinyMMDB);
  const cityReader = await Reader.open(fixturePath);
  const asnReader = await Reader.open(fixturePath);
  t.mock.method(cityReader, "city", () => new City({}));
  t.mock.method(asnReader, "asn", () => new Asn({ autonomous_system_number: 15169, autonomous_system_organization: "GOOGLE" }));
  t.mock.method(Reader, "open", async (filepath: string) => filepath.endsWith("GeoLite2-ASN.mmdb") ? asnReader : cityReader);
  let asnAvailable = false;
  const statuses = () => databaseStatuses(asnAvailable ? ["GeoLite2-City.mmdb", "GeoLite2-ASN.mmdb"] : ["GeoLite2-City.mmdb"]);
  t.mock.method(databaseDownloader, "checkDatabases", async () => statuses());
  t.mock.method(databaseDownloader, "downloadMissingDatabases", async () => statuses());
  geoIPReader.destroy();
  startupCheckService.reset();
  t.after(() => { geoIPReader.destroy(); startupCheckService.reset(); });

  assert.equal((await initializeDatabase()).status, 200);
  assert.equal((await geoIPReader.queryIP("8.8.8.8"))[0].asnData, undefined);
  asnAvailable = true;
  assert.equal((await initializeDatabase()).status, 200);
  assert.equal((await geoIPReader.queryIP("8.8.8.8"))[0].asnData?.autonomousSystemNumber, 15169);
});

// Official MaxMind binary fixture (1141 bytes), kept inline for offline tests.
// https://github.com/maxmind/MaxMind-DB/blob/main/test-data/MaxMind-DB-test-ipv4-24.mmdb
const tinyMMDB = Buffer.from("AAABAAAzAAACAAAoAAADAACLAAAEAACLAAAFAAAlAAAGAACLAAAHAACLAACLAAAIAAAJAACLAAAKAACLAAALAACLAAAMAACLAAANAACLAAAOAACLAAAPAACLAACLAAAQAAARAACLAAASAACLAAATAACLAAAUAACLAAAVAACLAAAWAACLAAAXAACLAACLAAAYAAAZAACLAAAaAACLAAAbAAAgAAAcAADIAAAdAAC9AAAeAACyAAAfAACnAACLAACbAAAhAACLAAAiAACLAAAjAACLAAAkAACLAADUAACLAAAmAACLAACLAAAnAACLAACLAACLAAApAAAqAAAwAAArAACLAACLAAAsAAAtAACLAAAuAACLAAAvAACLAACLAACLAACLAAAxAACLAAAyAACLAAAvAAA0AABCAACLAAA1AAA2AACLAACLAAA3AAA4AABAAAA5AACLAACLAAA6AACLAAA7AACLAAA8AACLAAA9AACLAAA+AACLAAA/AACLAAAmAABBAACLAAAsAACLAABDAACLAABEAACLAABFAAB9AABGAABsAABHAACLAABIAACLAABJAABoAABKAABcAABLAACLAABMAACLAABNAACLAABOAACLAABPAACLAABQAACLAABRAACLAABSAACLAABTAACLAABUAACLAABVAACLAABWAACLAABXAAAnAABYAACLAABZAACLAABaAACLAABbAACLAAAnAACLAABdAACLAACLAABeAACLAABfAABgAACLAABhAACLAABiAACLAABjAACLAACLAABkAACLAABlAABmAACLAABnAACLAAAyAACLAABpAACLAACLAABqAABrAACLAACLAABaAACLAABtAABuAACLAABvAACLAABwAACLAABxAAByAACLAAAtAACLAABzAAB0AACLAAB1AACLAACLAAB2AACLAAB3AAB4AACLAACLAAB5AACLAAB6AAB7AACLAAB8AACLAACLAABbAAB+AACLAACLAAB/AACLAACAAACBAACLAACCAACLAACDAACLAACEAACLAACFAACLAACGAACLAACHAACLAACIAACLAACJAACLAACLAACKAACLAAArAAAAAAAAAAAAAAAAAAAAAOFCaXBHMS4xLjEuMeEgAUcxLjEuMS4y4SABRzEuMS4xLjThIAFHMS4xLjEuOOEgAUgxLjEuMS4xNuEgAUgxLjEuMS4zMqvN701heE1pbmQuY29t6VtiaW5hcnlfZm9ybWF0X21ham9yX3ZlcnNpb26hAltiaW5hcnlfZm9ybWF0X21pbm9yX3ZlcnNpb26gS2J1aWxkX2Vwb2NoBAJq2luJTWRhdGFiYXNlX3R5cGVEVGVzdEtkZXNjcmlwdGlvbuJCZW5NVGVzdCBEYXRhYmFzZUJ6aFVUZXN0IERhdGFiYXNlIENoaW5lc2VKaXBfdmVyc2lvbqEESWxhbmd1YWdlcwIEIG4gf0pub2RlX2NvdW50wYtLcmVjb3JkX3NpemWhGA==", "base64");
