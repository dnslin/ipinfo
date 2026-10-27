import type { LatLngLiteral, Map } from "leaflet";

type CameraMap = Pick<Map, "getCenter" | "getZoom" | "setView" | "flyTo" | "distance">;

export function moveMapCamera(map: CameraMap, target: LatLngLiteral, zoom: number, animate: boolean) {
  if (!animate) {
    map.setView(target, zoom, { animate: false });
    return;
  }
  const start = map.getCenter();
  // 以目标所在的世界副本为准，跨日期变更线时只飞两地之间的短路程。
  // 最终仍使用原始坐标，保证标记和精度圆圈留在同一个世界副本。
  const longitude = start.lng + 360 * Math.round((target.lng - start.lng) / 360);
  if (longitude !== start.lng) {
    map.setView([start.lat, longitude], map.getZoom(), { animate: false });
  }
  const distance = map.distance(start, target);
  const duration = distance < 500_000 ? 0.8 : distance < 3_000_000 ? 1.2 : 1.8;
  map.flyTo(target, zoom, { animate: true, duration });
}
