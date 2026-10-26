import divisionNames from "./divisions.json";

// Official GeoCN administrative names, imported 2026-10-26.
// https://github.com/ljxi/GeoCN/blob/main/data/full.txt
// https://github.com/ljxi/GeoCN/blob/main/data/short.txt
// Bundle the tables with the app so IP lookups do not depend on a geocoding API.
const names: Record<string, readonly string[]> = divisionNames;

export function resolveDivision(value?: number | bigint) {
  const code = Number(value);
  if (!code) return null;

  const provinceCode = String(Math.trunc(code / 10000) * 10000);
  const cityCode = String(Math.trunc(code / 100) * 100);
  const districtCode = String(code);
  const province = names[provinceCode];
  const city = cityCode !== provinceCode ? names[cityCode] : undefined;
  const district = districtCode !== cityCode ? names[districtCode] : undefined;
  if (!province) return null;

  return {
    province: province[0],
    provinceCode,
    city: city?.[0],
    cityCode: city ? cityCode : undefined,
    district: district?.[0],
    districtCode: district ? districtCode : undefined,
    regions: [...new Set([province[0], city?.[0], district?.[0]].filter((name): name is string => Boolean(name)))],
    regionsShort: [...new Set([province[1], city?.[1], district?.[1]].filter((name): name is string => Boolean(name)))],
  };
}
