"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, type LatLngTuple } from "leaflet";
import { MapPin, Globe, Copy, CheckCircle, Shield, LocateFixed } from "lucide-react";
import type { IPInfo } from "@/lib/store";
import { checkPrivateIP } from "@/lib/ip-detection";
import { useTheme } from "@/lib/theme";
import { validateCoordinates, getZoomByAccuracy, MAP_TILE_PROVIDERS } from "@/lib/geoip/map-types";

function MapView({ center, zoom }: { center: LatLngTuple; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);

  return (
    <button
      type="button"
      aria-label="重新定位到查询位置"
      title="重新定位到查询位置"
      className="absolute right-3 bottom-8 z-[1000] rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-2 text-[rgb(var(--color-text-secondary))] shadow-sm"
      onClick={(event) => {
        event.stopPropagation();
        map.setView(center, zoom, { animate: true });
      }}
    >
      <LocateFixed className="h-4 w-4" />
    </button>
  );
}

function createMarker(isDark: boolean) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" stroke="${isDark ? "#ef4444" : "#dc2626"}" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  return new Icon({
    iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });
}

export default function IPLocationMap({ ipData, className = "" }: { ipData: IPInfo; className?: string }) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  const { latitude, longitude, accuracy_radius, source } = ipData.location;
  const isPrivate = checkPrivateIP(ipData.ip).isPrivate;
  const center = useMemo<LatLngTuple | null>(() => {
    if (latitude === null || longitude === null || !validateCoordinates(latitude, longitude).isValid) return null;
    return [latitude, longitude];
  }, [latitude, longitude]);
  const icon = useMemo(() => createMarker(resolvedTheme === "dark"), [resolvedTheme]);
  const zoom = getZoomByAccuracy(ipData.accuracy, accuracy_radius);
  const provider = MAP_TILE_PROVIDERS[resolvedTheme];
  const location = [ipData.country, ipData.province, ipData.city, ipData.district].filter(Boolean).join(" · ");
  const accuracy = accuracy_radius !== undefined ? `精度半径: ~${accuracy_radius}km` : "坐标精度未提供";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyCoordinates = async () => {
    if (!center) return;
    try {
      await navigator.clipboard.writeText(`${center[0].toFixed(6)}, ${center[1].toFixed(6)}`);
      setCopied(true);
    } catch (error) {
      console.error("复制坐标失败:", error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className={`overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-glass-background))] shadow-lg ${className}`}
    >
      <div className="flex flex-col justify-between gap-3 border-b border-[rgb(var(--color-border))] px-4 py-3 md:flex-row md:items-center md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <MapPin className="h-5 w-5 shrink-0 text-green-500" />
          <div>
            <h3 className="font-semibold text-[rgb(var(--color-text-primary))]">地理位置</h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">{location || "地区信息未提供"}</p>
          </div>
        </div>
        {center && !isPrivate && (
          <button type="button" onClick={copyCoordinates} title="复制坐标" className="flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-sm text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))]">
            {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            <span className="font-mono">{center[0].toFixed(4)}°, {center[1].toFixed(4)}°</span>
          </button>
        )}
      </div>

      {center && !isPrivate ? (
        <>
          <div className="relative h-64 bg-[rgb(var(--color-surface-hover))] md:h-72">
            <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} zoomControl attributionControl scrollWheelZoom={false} maxZoom={provider.maxZoom}>
              <TileLayer
                key={`${provider.url}-${tileAttempt}`}
                url={provider.url} attribution={provider.attribution} maxZoom={provider.maxZoom}
                className="ip-map-tiles"
                eventHandlers={{ loading: () => setTileError(false), tileerror: () => setTileError(true) }}
              />
              <MapView center={center} zoom={zoom} />
              <Marker position={center} icon={icon}>
                <Popup className="custom-popup">
                  <div className="p-3 text-sm">
                    <p className="mb-2 font-semibold">{location || ipData.ip}</p>
                    <p>纬度: {center[0].toFixed(6)}°</p>
                    <p>经度: {center[1].toFixed(6)}°</p>
                    <p>{accuracy}</p>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
          {tileError && (
            <div role="status" className="flex items-center justify-between gap-3 border-t border-[rgb(var(--color-border))] px-4 py-3 text-sm text-[rgb(var(--color-text-secondary))]">
              <span>底图加载失败，坐标信息仍可查看。</span>
              <button type="button" className="shrink-0 text-blue-600 dark:text-blue-400" onClick={() => { setTileError(false); setTileAttempt((attempt) => attempt + 1); }}>重试底图</button>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-3 bg-[rgb(var(--color-surface-hover))] text-[rgb(var(--color-text-secondary))]">
          {isPrivate ? <Shield className="h-10 w-10" /> : <Globe className="h-10 w-10" />}
          <p>{isPrivate ? "本地网络地址没有公网地理位置" : "此 IP 的数据库记录未提供有效坐标"}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 bg-[rgb(var(--color-surface))] px-4 py-3 text-xs text-[rgb(var(--color-text-secondary))] md:px-6">
        <span>地区: {ipData.source === "Local" ? "本地地址分类" : ipData.source} · 坐标: {source ?? "未提供"}</span>
        <span>{center && !isPrivate ? accuracy : "无坐标"}</span>
      </div>
      {center && ipData.source === "GeoCN" && source === "MaxMind" && (
        <p className="border-t border-[rgb(var(--color-border))] px-4 py-2 text-xs text-[rgb(var(--color-text-secondary))] md:px-6">
          地区与坐标来自不同数据库，地图按 MaxMind 估算坐标展示。
        </p>
      )}
    </motion.div>
  );
}
