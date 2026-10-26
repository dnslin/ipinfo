import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { checkPrivateIP, detectIPVersion, getClientIP, isPrivateIP } from "../lib/ip-detection";

test("equivalent IPv6 and IPv4-mapped private addresses are classified consistently", () => {
  for (const ip of ["::1", "0:0:0:0:0:0:0:1", "fe80::1", "fe90::1", "febf::1", "fc00::1", "fd12::1", "::ffff:192.168.1.1", "::ffff:7f00:1", "100.64.1.1"]) {
    assert.equal(checkPrivateIP(ip).isPrivate, true, ip);
    assert.equal(isPrivateIP(ip), true, ip);
  }
  for (const ip of ["2001:4860:4860::8888", "::ffff:8.8.8.8", "fc0::1", "fec0::1"]) {
    assert.equal(checkPrivateIP(ip).isPrivate, false, ip);
    assert.equal(isPrivateIP(ip), false, ip);
  }
});

test("IP validation rejects ambiguous IPv4 and malformed IPv6 literals", () => {
  for (const ip of ["010.0.0.1", "fe80:%eth0", "::1]/path[", "127.1", "1.2.3.999", "2001::db8::1"]) {
    assert.equal(detectIPVersion(ip), "invalid", ip);
  }
  assert.equal(detectIPVersion("::ffff:8.8.8.8"), "IPv6");
});

test("the server's URL hostname is not mistaken for a visitor IP", () => {
  assert.equal(getClientIP(new NextRequest("https://8.8.8.8/api/query")), null);
  assert.equal(getClientIP(new NextRequest("https://example.test/api/query", { headers: { "X-Forwarded-For": "8.8.8.8, 192.168.1.1" } })), "8.8.8.8");
});
