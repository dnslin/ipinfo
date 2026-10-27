import { describeFetchError } from "./network";

// 公网 IP 的路由与注册信息：BGP 前缀与 RPKI 来自 RIPEstat，注册信息来自 RDAP（经 rdap.org 跳转到对应的 RIR）。

export type RPKIStatus = "valid" | "invalid_asn" | "invalid_length" | "unknown";

export interface RoutingInfo {
  prefix: string;
  originAsns: number[];
  rpki: { status: RPKIStatus; roas: { origin: number; prefix: string; maxLength: number }[] } | null;
  rpkiError?: boolean;
}

export interface RegistrationInfo {
  handle?: string;
  name?: string;
  range?: string;
  cidrs: string[];
  country?: string;
  type?: string;
  organization?: string;
  abuseEmails: string[];
  registered?: string;
  lastChanged?: string;
  registry?: string;
  link?: string;
}

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

const RIPESTAT = "https://stat.ripe.net/data";
const USER_AGENT = "ipinfo (+https://github.com/dnslin/ipinfo)";
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { value: unknown; expires: number }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.value as T;
  const value = await load();
  cache.set(key, { value, expires: Date.now() + TTL });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return value;
}

async function getJSON(url: string, timeout = 8000): Promise<unknown> {
  // rdap.org 会拒绝 Node 默认的 User-Agent
  const response = await fetch(url, { headers: { Accept: "application/rdap+json, application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeout) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const RPKI_STATUSES: RPKIStatus[] = ["valid", "invalid_asn", "invalid_length", "unknown"];

export function parseRouting(networkInfo: unknown, rpkiValidation: unknown): RoutingInfo | null {
  const data = (networkInfo as { data?: { prefix?: unknown; asns?: unknown } } | null)?.data;
  if (typeof data?.prefix !== "string" || !data.prefix) return null;
  const originAsns = Array.isArray(data.asns) ? data.asns.map(Number).filter((asn) => Number.isInteger(asn) && asn > 0) : [];
  const rpkiData = (rpkiValidation as { data?: { status?: unknown; validating_roas?: unknown } } | null)?.data;
  const status = RPKI_STATUSES.find((value) => value === rpkiData?.status);
  const roas = Array.isArray(rpkiData?.validating_roas) ? rpkiData.validating_roas.flatMap((roa: { origin?: unknown; prefix?: unknown; max_length?: unknown }) =>
    typeof roa?.prefix === "string" ? [{ origin: Number(roa.origin), prefix: roa.prefix, maxLength: Number(roa.max_length) }] : []) : [];
  return { prefix: data.prefix, originAsns, rpki: status ? { status, roas } : null };
}

export async function fetchRouting(ip: string): Promise<RoutingInfo | null> {
  const info = await cached(`network-info:${ip}`, () => getJSON(`${RIPESTAT}/network-info/data.json?resource=${ip}&sourceapp=ipinfo`));
  const routing = parseRouting(info, null);
  if (!routing || routing.originAsns.length === 0) return routing;
  // RPKI 按（起源 AS，前缀）判定；多起源时取第一个，界面会说明。失败不缓存，下次重试。
  try {
    const key = `AS${routing.originAsns[0]}:${routing.prefix}`;
    const rpki = await cached(`rpki:${key}`, () => getJSON(`${RIPESTAT}/rpki-validation/data.json?resource=AS${routing.originAsns[0]}&prefix=${encodeURIComponent(routing.prefix)}&sourceapp=ipinfo`, 10_000));
    return parseRouting(info, rpki);
  } catch {
    return { ...routing, rpkiError: true };
  }
}

type VCardEntry = [string, Record<string, unknown>, string, unknown];
interface RDAPEntity { roles?: string[]; handle?: string; vcardArray?: [string, VCardEntry[]]; entities?: RDAPEntity[] }
interface RDAPNetwork {
  handle?: string; name?: string; startAddress?: string; endAddress?: string; country?: string; type?: string; port43?: string;
  cidr0_cidrs?: { v4prefix?: string; v6prefix?: string; length?: number }[];
  entities?: RDAPEntity[]; events?: { eventAction?: string; eventDate?: string }[];
  remarks?: { title?: string; description?: string[] }[];
  links?: { rel?: string; href?: string }[];
}

const vcard = (entity: RDAPEntity, field: string) => entity.vcardArray?.[1]?.filter((entry) => entry[0] === field).map((entry) => String(entry[3])) ?? [];

function flatten(entities: RDAPEntity[] = []): RDAPEntity[] {
  return entities.flatMap((entity) => [entity, ...flatten(entity.entities)]);
}

const REGISTRIES: [RegExp, string][] = [[/arin/i, "ARIN"], [/ripe/i, "RIPE NCC"], [/apnic/i, "APNIC"], [/lacnic/i, "LACNIC"], [/afrinic/i, "AFRINIC"]];

export function parseRegistration(payload: unknown): RegistrationInfo | null {
  if (!payload || typeof payload !== "object") return null;
  const network = payload as RDAPNetwork;
  const entities = flatten(network.entities);
  const withRole = (role: string) => entities.filter((entity) => entity.roles?.includes(role));
  const event = (action: string) => network.events?.find((item) => item.eventAction === action)?.eventDate;
  const self = network.links?.find((link) => link.rel === "self")?.href;
  const registrySource = `${network.port43 ?? ""} ${self ?? ""}`;
  const organization = withRole("registrant").flatMap((entity) => vcard(entity, "fn"))[0]
    ?? network.remarks?.find((remark) => remark.title === "description")?.description?.[0];

  return {
    handle: network.handle,
    name: network.name,
    range: network.startAddress && network.endAddress ? `${network.startAddress} - ${network.endAddress}` : undefined,
    cidrs: (network.cidr0_cidrs ?? []).flatMap((cidr) => {
      const prefix = cidr.v4prefix ?? cidr.v6prefix;
      return prefix && cidr.length !== undefined ? [`${prefix}/${cidr.length}`] : [];
    }),
    country: network.country,
    type: network.type,
    organization,
    abuseEmails: [...new Set(withRole("abuse").flatMap((entity) => vcard(entity, "email")))],
    registered: event("registration"),
    lastChanged: event("last changed"),
    registry: REGISTRIES.find(([pattern]) => pattern.test(registrySource))?.[1],
    link: self,
  };
}

export async function fetchRegistration(ip: string): Promise<RegistrationInfo | null> {
  return cached(`rdap:${ip}`, async () => parseRegistration(await getJSON(`https://rdap.org/ip/${ip}`, 10_000)));
}

export async function settle<T>(task: Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await task };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || (error as NodeJS.ErrnoException).code === "ETIMEOUT");
    return { ok: false, error: timedOut ? "查询超时" : error instanceof Error ? describeFetchError(error) : "查询失败" };
  }
}
