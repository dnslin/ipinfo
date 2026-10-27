import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRegistration, parseRouting } from "../lib/network-intel";
import { classifyWebRTC, parseCandidate } from "../lib/webrtc";

test("routing combines the announced prefix with its RPKI validation", () => {
  const routing = parseRouting(
    { data: { asns: ["21859", "137702"], prefix: "114.114.112.0/21" } },
    { data: { status: "valid", validating_roas: [{ origin: "21859", prefix: "114.114.112.0/20", validity: "valid", max_length: 24 }] } },
  );
  assert.deepEqual(routing, { prefix: "114.114.112.0/21", originAsns: [21859, 137702], rpki: { status: "valid", roas: [{ origin: 21859, prefix: "114.114.112.0/20", maxLength: 24 }] } });
  assert.equal(parseRouting({ data: { asns: [], prefix: null } }, null), null, "unannounced addresses have no routing");
  assert.equal(parseRouting({ data: { asns: ["1"], prefix: "1.0.0.0/24" } }, { data: { status: "surprise" } })?.rpki, null);
});

test("RDAP registration reads the registrant, nested abuse contacts and the registry", () => {
  const registration = parseRegistration({
    handle: "NET-8-8-8-0-2", name: "GOGL", startAddress: "8.8.8.0", endAddress: "8.8.8.255", type: "DIRECT ALLOCATION", port43: "whois.arin.net",
    cidr0_cidrs: [{ v4prefix: "8.8.8.0", length: 24 }],
    entities: [{
      roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Google LLC"]]],
      entities: [{ roles: ["abuse"], vcardArray: ["vcard", [["fn", {}, "text", "Abuse"], ["email", {}, "text", "network-abuse@google.com"]]] }],
    }],
    events: [{ eventAction: "registration", eventDate: "2023-12-28T17:24:33-05:00" }, { eventAction: "last changed", eventDate: "2023-12-28T17:24:56-05:00" }],
    links: [{ rel: "self", href: "https://rdap.arin.net/registry/ip/8.8.8.0" }],
  });
  assert.equal(registration?.organization, "Google LLC");
  assert.deepEqual(registration?.cidrs, ["8.8.8.0/24"]);
  assert.deepEqual(registration?.abuseEmails, ["network-abuse@google.com"]);
  assert.equal(registration?.registry, "ARIN");
  assert.equal(registration?.registered, "2023-12-28T17:24:33-05:00");
});

test("APNIC records without a registrant fall back to the description remark", () => {
  const registration = parseRegistration({
    name: "XFInfo", country: "CN", port43: "whois.apnic.net",
    remarks: [{ title: "description", description: ["NanJing XinFeng Information Technologies, Inc.", "Room 207"] }],
    entities: [{ roles: ["abuse"], vcardArray: ["vcard", [["email", {}, "text", "ipas@cnnic.cn"], ["email", { pref: "1" }, "text", "ipas@cnnic.cn"]]] }],
  });
  assert.equal(registration?.organization, "NanJing XinFeng Information Technologies, Inc.");
  assert.deepEqual(registration?.abuseEmails, ["ipas@cnnic.cn"]);
  assert.equal(registration?.registry, "APNIC");
});

test("ICE candidates are parsed and a public address that differs from the page's exit is a leak", () => {
  const candidates = [
    "candidate:842163049 1 udp 1677729535 203.0.113.7 61234 typ srflx raddr 0.0.0.0 rport 0 generation 0",
    "candidate:1 1 udp 2122260223 4b8e1c6a-1111-2222-3333-444455556666.local 54400 typ host generation 0",
    "candidate:2 1 udp 2122260223 192.168.1.20 54401 typ host",
    "not a candidate",
  ].map(parseCandidate).filter((item) => item !== null);
  assert.equal(candidates.length, 3);
  const leak = classifyWebRTC(candidates, ["198.51.100.1", null]);
  assert.equal(leak.status, "leak");
  assert.deepEqual(leak.leakedIPs, ["203.0.113.7"]);
  assert.deepEqual(leak.localIPs, ["192.168.1.20"]);
  assert.equal(leak.mdnsHidden, true);
  assert.equal(classifyWebRTC(candidates, ["203.0.113.7"]).status, "consistent");
  assert.equal(classifyWebRTC([], ["203.0.113.7"]).status, "no-public");
});
