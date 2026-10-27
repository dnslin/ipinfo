"use client";

import { Suspense, lazy } from "react";
import type { LatLngTuple } from "leaflet";
import MapErrorBoundary from "./map-error-boundary";

const StageMapView = lazy(() => import("./stage-map-view"));

export default function StageMap({ center, radius }: { center: LatLngTuple | null; radius?: number }) {
  if (!center) return <div className="stage-map-empty" />;
  return (
    <MapErrorBoundary fallback={<div className="stage-map-empty" role="img" aria-label="地图暂时无法显示" />}>
      <Suspense fallback={<div className="stage-map-empty" />}>
        <StageMapView center={center} radius={radius} />
      </Suspense>
    </MapErrorBoundary>
  );
}
