"use client";

import { createContext, useContext } from "react";
import type { LatLngTuple } from "leaflet";

export interface MapFocus {
  center: LatLngTuple | null;
  radius?: number;
}

// 地图常驻在页面上，结果卡片通过它告知当前要展示的位置；查询之间地图保持挂载，才能飞到新位置。
export const MapFocusContext = createContext<(focus: MapFocus) => void>(() => {});

export const useSetMapFocus = () => useContext(MapFocusContext);
