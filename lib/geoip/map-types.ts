// 地图组件专用类型定义

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
