import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCoordinates } from "../lib/geoip/map-types";

test("unknown and non-finite coordinates do not create a map", () => {
  for (const [latitude, longitude] of [
    [null, null], [null, 120], [30, null],
    [NaN, 120], [30, Infinity], [-91, 120], [30, 181],
  ]) {
    assert.equal(validateCoordinates(latitude, longitude).isValid, false);
  }
});

test("known coordinates on the equator and prime meridian remain valid", () => {
  for (const [latitude, longitude] of [[0, 0], [0, 120], [30, 0], [37.386, -122.0838]]) {
    assert.equal(validateCoordinates(latitude, longitude).isValid, true);
  }
});
