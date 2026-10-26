// 地图组件专用类型定义

import type { LatLngTuple } from "leaflet";
import type { IPInfo } from "../store";

// 地图主题类型
export type MapTheme = "light" | "dark" | "auto";

// 地图瓦片提供商
export interface TileProvider {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

// 浏览器直接请求底图，保留 Referer、HTTP 缓存与可见署名。
const openStreetMap: TileProvider = {
  name: "OpenStreetMap",
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

export const MAP_TILE_PROVIDERS: Record<MapTheme, TileProvider> = {
  light: openStreetMap,
  dark: openStreetMap,
  auto: openStreetMap,
};

// 地图配置选项
export interface MapConfig {
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  zoomControl: boolean;
  attributionControl: boolean;
  scrollWheelZoom: boolean;
  doubleClickZoom: boolean;
  dragging: boolean;
  touchZoom: boolean;
}

// 默认地图配置
export const DEFAULT_MAP_CONFIG: MapConfig = {
  defaultZoom: 10,
  minZoom: 2,
  maxZoom: 18,
  zoomControl: false,
  attributionControl: false,
  scrollWheelZoom: true,
  doubleClickZoom: true,
  dragging: true,
  touchZoom: true,
};

// 标记样式配置
export interface MarkerStyle {
  color: string;
  fillColor: string;
  weight: number;
  opacity: number;
  fillOpacity: number;
  radius: number;
}

// 精度级别对应的缩放级别
export const ACCURACY_ZOOM_LEVELS = {
  high: 13,
  medium: 10,
  low: 7,
} as const;

// 精度半径对应的缩放级别
export function getZoomByAccuracy(
  accuracy: IPInfo["accuracy"],
  accuracyRadius?: number
): number {
  if (accuracyRadius) {
    if (accuracyRadius <= 1) return 15;
    if (accuracyRadius <= 5) return 13;
    if (accuracyRadius <= 10) return 12;
    if (accuracyRadius <= 50) return 10;
    if (accuracyRadius <= 100) return 8;
    return 6;
  }

  return ACCURACY_ZOOM_LEVELS[accuracy];
}

// 坐标验证
export interface CoordinateValidation {
  isValid: boolean;
  reason?: string;
}

export function validateCoordinates(
  lat: number | null,
  lng: number | null
): CoordinateValidation {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { isValid: false, reason: "未提供有效坐标" };
  }
  // 检查基本范围
  if (lat < -90 || lat > 90) {
    return { isValid: false, reason: "纬度超出有效范围 (-90, 90)" };
  }

  if (lng < -180 || lng > 180) {
    return { isValid: false, reason: "经度超出有效范围 (-180, 180)" };
  }

  return { isValid: true };
}

// 地图边界
export interface MapBounds {
  northEast: LatLngTuple;
  southWest: LatLngTuple;
}

// 根据坐标和精度计算地图边界
export function calculateMapBounds(
  lat: number,
  lng: number,
  accuracyRadius?: number
): MapBounds {
  const radius = accuracyRadius || 10; // 默认10km
  const kmToDegree = 0.009; // 大约1km = 0.009度

  const latOffset = radius * kmToDegree;
  const lngOffset = (radius * kmToDegree) / Math.cos((lat * Math.PI) / 180);

  return {
    northEast: [lat + latOffset, lng + lngOffset],
    southWest: [lat - latOffset, lng - lngOffset],
  };
}

// 地图事件类型
export interface MapEventHandlers {
  onZoomChange?: (zoom: number) => void;
  onCenterChange?: (center: LatLngTuple) => void;
  onMarkerClick?: (ipData: IPInfo) => void;
  onMapClick?: (coordinates: LatLngTuple) => void;
}

// 地图加载状态
export type MapLoadingState = "idle" | "loading" | "loaded" | "error";

// 地图组件Props类型
export interface MapComponentProps {
  ipData: IPInfo;
  theme?: MapTheme;
  config?: Partial<MapConfig>;
  className?: string;
  onLoadingStateChange?: (state: MapLoadingState) => void;
  eventHandlers?: MapEventHandlers;
}

// 地图错误类型
export class MapError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_COORDINATES"
      | "TILE_LOAD_FAILED"
      | "MARKER_ERROR"
      | "UNKNOWN",
    public coordinates?: LatLngTuple
  ) {
    super(message);
    this.name = "MapError";
  }
}
