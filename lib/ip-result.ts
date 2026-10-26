import type { IPInfo } from "./store";

// Location providers do not own ASN, network or registration metadata.
export function mergeIPLocation(original: IPInfo, location: IPInfo): IPInfo {
  return {
    ...location,
    ip: original.ip,
    ipVersion: original.ipVersion,
    as: original.as,
    isp: original.isp,
    net: original.net,
    type: original.type,
    registered_country: original.registered_country,
    proxyDetection: original.proxyDetection,
  };
}
