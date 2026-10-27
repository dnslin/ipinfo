import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CACHE_DIRECTORY = join(process.cwd(), ".next", "cache", "map-tiles");
const WEEK = 7 * 24 * 60 * 60;
const TILE_HEADERS = ["content-type", "cache-control", "expires", "etag", "last-modified"];
const inFlight = new Map<string, Promise<CachedTile>>();

interface CachedTile {
  body: string;
  headers: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
  age: number;
}

function expiresAt(headers: Headers, now: number, age: number): number {
  const control = headers.get("cache-control") ?? "";
  if (/\bno-cache\b/i.test(control)) return now;
  const maxAge = control.match(/(?:^|,)\s*s-maxage=(\d+)/i) ?? control.match(/(?:^|,)\s*max-age=(\d+)/i);
  if (maxAge) return now + Math.max(0, Number(maxAge[1]) - age) * 1000;
  const expires = Date.parse(headers.get("expires") ?? "");
  return Number.isFinite(expires) ? expires : now + WEEK * 1000;
}

async function refreshTile(tilePath: string, referer: string, path: string, cached?: CachedTile): Promise<CachedTile> {
  const headers = new Headers({
    "User-Agent": "IPInfo (+https://github.com/dnslin/ipinfo)",
    Referer: referer,
  });
  if (cached?.headers.etag) headers.set("If-None-Match", cached.headers.etag);
  if (cached?.headers["last-modified"]) headers.set("If-Modified-Since", cached.headers["last-modified"]);
  const response = await fetch(`https://tile.openstreetmap.org/${tilePath}`, {
    headers,
    // 不用原生 cache:no-store，避免 HTTP 客户端自动向 OSM 发送 no-cache。
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200 && !(response.status === 304 && cached)) {
    throw new Error(`OpenStreetMap 瓦片请求失败（HTTP ${response.status}，${tilePath}）`);
  }

  const tileHeaders = new Headers(response.status === 304 ? cached!.headers : undefined);
  for (const header of TILE_HEADERS) {
    const value = response.headers.get(header);
    if (value !== null) tileHeaders.set(header, value);
  }
  if (!tileHeaders.get("content-type")?.startsWith("image/png")) {
    throw new Error(`OpenStreetMap 未返回 PNG 瓦片（${tilePath}）`);
  }
  if (!tileHeaders.has("cache-control") && !tileHeaders.has("expires")) {
    tileHeaders.set("cache-control", `public, max-age=${WEEK}`);
  }
  const now = Date.now();
  const age = Math.max(0, Number(response.headers.get("age")) || 0);
  cached = {
    body: response.status === 304 ? cached!.body : Buffer.from(await response.arrayBuffer()).toString("base64"),
    headers: Object.fromEntries(tileHeaders),
    cachedAt: now,
    expiresAt: expiresAt(tileHeaders, now, age),
    age,
  };
  try {
    if (/\b(?:no-store|private)\b/i.test(tileHeaders.get("cache-control") ?? "")) {
      await rm(path, { force: true });
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(cached));
    }
  } catch (error) {
    console.error(`写入地图瓦片缓存失败（${path}）:`, error);
  }
  return cached;
}

/** 只缓存当前视口真正请求的 OSM 瓦片；过期使用上游校验标识重验。 */
export async function fetchMapTile(tilePath: string, referer: string, cacheDirectory = CACHE_DIRECTORY): Promise<{ body: Buffer; headers: Headers }> {
  const path = join(cacheDirectory, tilePath.replaceAll("/", "-") + ".json");
  let cached: CachedTile | undefined;
  try {
    cached = JSON.parse(await readFile(path, "utf8")) as CachedTile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error(`读取地图瓦片缓存失败（${path}）:`, error);
  }

  if (!cached || cached.expiresAt <= Date.now()) {
    // 同一实例合并同文件的冷请求和重验，避免重复出站与交错写入。
    let pending = inFlight.get(path);
    if (!pending) {
      pending = refreshTile(tilePath, referer, path, cached).finally(() => inFlight.delete(path));
      inFlight.set(path, pending);
    }
    cached = await pending;
  }

  const headers = new Headers(cached.headers);
  headers.set("age", String(cached.age + Math.floor((Date.now() - cached.cachedAt) / 1000)));
  return { body: Buffer.from(cached.body, "base64"), headers };
}
