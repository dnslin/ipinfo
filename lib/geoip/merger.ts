import type { IPInfo } from "../store";
import { detectIPVersion } from "../ip-detection";
import { resolveDivision } from "./divisions";
import {
  CHINESE_ISP_ASN_MAP,
  GeoIPError,
  LANGUAGE_PRIORITY,
  SPECIAL_REGIONS_MAP,
  type GeoCNResult,
  type MaxMindCityResult,
  type Names,
  type RawQueryResult,
} from "./types";

function localizedName(names?: Names): string | undefined {
  for (const language of LANGUAGE_PRIORITY) {
    const name = names?.[language as keyof Names];
    if (name) return name;
  }
  return undefined;
}

function countryName(names?: Names): string {
  const name = localizedName(names) ?? "";
  return SPECIAL_REGIONS_MAP[name] ?? name;
}

function coordinateAccuracy(radius?: number): IPInfo["accuracy"] {
  if (radius === undefined) return "low";
  if (radius <= 10) return "high";
  if (radius <= 100) return "medium";
  return "low";
}

export class DataMerger {
  static async merge(ip: string, results: RawQueryResult[]): Promise<IPInfo> {
    const maxmind = results.find((result) => result.sourceInfo.source === "maxmind");
    if (!maxmind?.cityData) {
      throw new GeoIPError("缺少MaxMind城市数据源", "MERGE_FAILED");
    }

    const city = maxmind.cityData as MaxMindCityResult;
    const asn = maxmind.asnData;
    const latitude = city.location?.latitude;
    const longitude = city.location?.longitude;
    const hasCoordinates = typeof latitude === "number" && typeof longitude === "number";
    const province = localizedName(city.subdivisions?.[0]?.names);
    const cityName = localizedName(city.city?.names);
    const regions = [...new Set([
      ...(city.subdivisions ?? []).map((subdivision) => localizedName(subdivision.names)),
      cityName,
    ].filter((name): name is string => Boolean(name)))];

    const info: IPInfo = {
      ip,
      ipVersion: detectIPVersion(ip) as "IPv4" | "IPv6",
      country: countryName(city.country?.names),
      countryCode: city.country?.isoCode ?? "",
      province,
      provinceCode: city.subdivisions?.[0]?.isoCode,
      city: cityName,
      regions,
      timezone: city.location?.timeZone,
      postal: city.postal?.code,
      source: "MaxMind",
      accuracy: hasCoordinates ? coordinateAccuracy(city.location?.accuracyRadius) : "low",
      location: hasCoordinates
        ? { latitude, longitude, accuracy_radius: city.location?.accuracyRadius, source: "MaxMind" }
        : { latitude: null, longitude: null, source: null },
    };

    if (asn) {
      info.as = {
        number: asn.autonomousSystemNumber,
        name: asn.autonomousSystemOrganization,
        info: asn.autonomousSystemNumber ? CHINESE_ISP_ASN_MAP[asn.autonomousSystemNumber] : undefined,
      };
    }
    if (city.registeredCountry) {
      info.registered_country = {
        code: city.registeredCountry.isoCode ?? "",
        name: countryName(city.registeredCountry.names),
      };
    }

    const geocn = results.find((result) => result.sourceInfo.source === "geocn");
    if (info.countryCode === "CN" && geocn?.cityData) {
      this.supplementWithGeoCN(info, geocn.cityData as GeoCNResult);
    }
    return info;
  }

  private static supplementWithGeoCN(info: IPInfo, data: GeoCNResult): void {
    const division = resolveDivision(data.division_code);
    if (division) {
      info.province = division.province;
      info.provinceCode = division.provinceCode;
      info.city = division.city;
      info.cityCode = division.cityCode;
      info.district = division.district;
      info.districtCode = division.districtCode;
      info.regions = division.regions;
      info.regions_short = division.regionsShort;
      info.source = "GeoCN";
    }
    if (data.isp) {
      info.isp = data.isp;
      info.as = { ...info.as, info: data.isp };
    }
    if (data.type) info.type = data.type;
    // GeoCN provides administrative divisions, not coordinates or an accuracy radius.
  }
}
