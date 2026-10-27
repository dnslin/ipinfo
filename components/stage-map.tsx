"use client";

import { Suspense, lazy, useState } from "react";
import type { LatLngTuple } from "leaflet";
import MapErrorBoundary from "./map-error-boundary";
import type { MapFocus } from "./map-focus";

const StageMapView = lazy(() => import("./stage-map-view"));

export default function StageMap({ focus }: { focus: MapFocus | null }) {
  // 记住上一次有效坐标：无坐标结果只盖一层底纹，地图不卸载，下次查询才能从原位置飞过去。
  const [last, setLast] = useState<{ center: LatLngTuple; radius?: number } | null>(null);
  if (focus?.center && (focus.center !== last?.center || focus.radius !== last?.radius)) {
    setLast({ center: focus.center, radius: focus.radius });
  }
  const hasLocation = Boolean(focus?.center);

  return (
    <div className="stage-backdrop" aria-hidden={!hasLocation}>
      {last && (
        <MapErrorBoundary fallback={<div className="stage-map-empty" data-visible />}>
          <Suspense fallback={null}>
            <StageMapView center={last.center} radius={last.radius} />
          </Suspense>
        </MapErrorBoundary>
      )}
      <div className="stage-map-empty" data-visible={!hasLocation || undefined} />
      <div className="stage-fade" aria-hidden="true" />
    </div>
  );
}
