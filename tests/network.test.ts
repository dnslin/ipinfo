import assert from "node:assert/strict";
import { test } from "node:test";
import * as net from "node:net";
import { CONNECT_ATTEMPT_TIMEOUT, configureOutboundConnections, describeFetchError, isFetchTimeout } from "../lib/network";

test("the dual-stack attempt timeout is raised from Node's 250 ms default but an explicit setting is kept", (t) => {
  const original = net.getDefaultAutoSelectFamilyAttemptTimeout();
  t.after(() => net.setDefaultAutoSelectFamilyAttemptTimeout(original));
  net.setDefaultAutoSelectFamilyAttemptTimeout(250);
  configureOutboundConnections();
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), CONNECT_ATTEMPT_TIMEOUT);
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
  configureOutboundConnections();
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), 5000);
});

test("fetch failures name every address that was tried", () => {
  const attempt = (code: string, address: string) => Object.assign(new Error(code), { code, address, port: 443 });
  const cause = Object.assign(new AggregateError([attempt("ETIMEDOUT", "193.0.6.150"), attempt("ENETUNREACH", "2001:67c:2e8:22::c100:696")]), { code: "ETIMEDOUT" });
  const error = new TypeError("fetch failed", { cause });
  assert.equal(describeFetchError(error), "fetch failed: ETIMEDOUT 193.0.6.150:443, ENETUNREACH [2001:67c:2e8:22::c100:696]:443");
  assert.equal(describeFetchError(new TypeError("fetch failed", { cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }) })), "fetch failed: ECONNREFUSED");
  assert.equal(describeFetchError(new Error("HTTP 500")), "HTTP 500");
});

test("connection timeouts retain their classification through fetch's nested causes", () => {
  const timeout = Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" });
  const unreachable = Object.assign(new Error("IPv6 unavailable"), { code: "ENETUNREACH" });
  assert.equal(isFetchTimeout(new TypeError("fetch failed", { cause: new AggregateError([timeout, unreachable]) })), true);
  assert.equal(isFetchTimeout(new TypeError("fetch failed", { cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }) })), true);
  assert.equal(isFetchTimeout(new DOMException("timed out", "TimeoutError")), true);
  assert.equal(isFetchTimeout(unreachable), false);
  assert.equal(isFetchTimeout(new Error("HTTP 503")), false);
});
