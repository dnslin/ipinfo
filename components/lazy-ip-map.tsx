"use client";

import { Suspense, lazy } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { IPInfo } from "@/lib/store";
import MapErrorBoundary from "./map-error-boundary";

const IPLocationMap = lazy(() => import("./ip-location-map"));

export default function LazyIPMap({ ipData, className = "" }: { ipData: IPInfo; className?: string }) {
  return (
    <MapErrorBoundary>
      <Suspense fallback={<div className={`ui-card overflow-hidden ${className}`}><div className="ui-section-heading border-b border-[rgb(var(--color-border-light))] px-5 py-5"><MapPin />地图位置</div><div className="ui-empty-state flex h-64 items-center justify-center gap-2 text-sm md:h-80"><Loader2 className="h-4 w-4 animate-spin" />正在加载地图…</div></div>}>
        <IPLocationMap ipData={ipData} className={className} />
      </Suspense>
    </MapErrorBoundary>
  );
}
