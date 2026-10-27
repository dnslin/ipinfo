"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { DivIcon, point, type LatLngTuple } from "leaflet";
import { RefreshCw } from "lucide-react";
import { MAP_TILE_PROVIDERS } from "@/lib/geoip/map-types";
import { moveMapCamera } from "@/lib/map-camera";

const wideQuery = "(min-width: 761px)";
const subscribeWide = (onChange: () => void) => {
  const media = window.matchMedia(wideQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export function zoomForRadius(radius?: number): number {
  if (radius === undefined) return 5;
  if (radius <= 10) return 11;
  if (radius <= 50) return 9;
  if (radius <= 200) return 7;
  if (radius <= 500) return 6;
  return 5;
}

function Frame({ center, zoom, wide }: { center: LatLngTuple; zoom: number; wide: boolean }) {
  const map = useMap();
  const placed = useRef(false);
  useEffect(() => {
    // 宽屏时身份卡压在地图左侧，把标记放到右侧可见区域；窄屏时卡片叠在地图下沿，标记略向上。
    const size = map.getSize();
    const offset = wide ? point(-Math.min(260, size.x * 0.2), 0) : point(0, 40);
    const target = map.unproject(map.project(center, zoom).add(offset), zoom);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    moveMapCamera(map, target, zoom, placed.current && !reduceMotion);
    placed.current = true;
    return () => { map.stop(); };
  }, [map, center, zoom, wide]);
  return null;
}

export default function StageMapView({ center, radius }: { center: LatLngTuple; radius?: number }) {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const icon = useMemo(() => new DivIcon({ className: "stage-marker", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] }), []);
  const provider = MAP_TILE_PROVIDERS.auto;
  const zoom = zoomForRadius(radius);

  return (
    <div className="stage-map">
      <MapContainer center={center} zoom={zoom} zoomControl={false} attributionControl keyboard={false} scrollWheelZoom={false} maxZoom={provider.maxZoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          key={attempt} url={provider.url} attribution={provider.attribution} maxZoom={provider.maxZoom} className="stage-tiles"
          eventHandlers={{ loading: () => setTileError(false), tileerror: () => setTileError(true) }}
        />
        {/* 半径过大时圆圈会盖满视野，只在能说明范围时绘制。 */}
        {radius !== undefined && radius <= 500 && <Circle center={center} radius={radius * 1000} interactive={false} pathOptions={{ className: "stage-radius" }} />}
        <Marker key={center.join(",")} position={center} icon={icon} keyboard={false} interactive={false} />
        <Frame center={center} zoom={zoom} wide={wide} />
      </MapContainer>
      {tileError && (
        <button type="button" className="stage-tile-retry" onClick={() => { setTileError(false); setAttempt((value) => value + 1); }}>
          <RefreshCw className="h-3.5 w-3.5" />底图加载失败，重试
        </button>
      )}
    </div>
  );
}
