import assert from "node:assert/strict";
import { test } from "node:test";
import type { LatLng, LatLngExpression, Map, ZoomPanOptions } from "leaflet";
import { moveMapCamera } from "../lib/map-camera";

function camera(start: [number, number], distance: number) {
  let center = { lat: start[0], lng: start[1] };
  let zoom = 9;
  let flight: { from: typeof center; to: LatLngExpression; options: ZoomPanOptions } | undefined;
  const map = {
    getCenter: () => center as LatLng,
    getZoom: () => zoom,
    distance: () => distance,
    setView: (target: LatLngExpression, targetZoom: number) => {
      const value = Array.isArray(target) ? { lat: target[0], lng: target[1] } : target;
      center = { lat: value.lat, lng: value.lng };
      zoom = targetZoom;
      return map as unknown as Map;
    },
    flyTo: (target: LatLngExpression, targetZoom: number, options: ZoomPanOptions) => {
      flight = { from: { ...center }, to: target, options };
      zoom = targetZoom;
      return map as unknown as Map;
    },
  };
  return { map, center: () => center, flight: () => flight };
}

test("cross-continent moves stay animated and have more travel time than nearby moves", () => {
  const nearby = camera([30, 120], 50_000);
  const distant = camera([30, 120], 12_000_000);
  moveMapCamera(nearby.map, { lat: 31, lng: 121 }, 9, true);
  moveMapCamera(distant.map, { lat: 40, lng: -74 }, 9, true);
  assert.equal(distant.flight()?.options.animate, true);
  assert.ok(distant.flight()!.options.duration! > nearby.flight()!.options.duration!);
  assert.ok(distant.flight()!.options.duration! <= 2);
});

test("crossing the date line takes the nearby world copy and lands at the original coordinates", () => {
  const view = camera([10, 179], 220_000);
  const destination = { lat: 10, lng: -179 };
  moveMapCamera(view.map, destination, 9, true);
  assert.equal(view.flight()?.from.lng, -181);
  assert.equal(view.flight()?.to, destination);
  assert.ok(Math.abs(destination.lng - view.flight()!.from.lng) < 180);
});

test("initial placement and reduced motion use the target immediately without a flight", () => {
  const view = camera([30, 120], 12_000_000);
  moveMapCamera(view.map, { lat: 40, lng: -74 }, 7, false);
  assert.deepEqual(view.center(), { lat: 40, lng: -74 });
  assert.equal(view.flight(), undefined);
});
