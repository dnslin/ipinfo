"use client";

import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { readURLQuery, useIPQueryStore } from "@/lib/store";
import SiteNav from "@/components/site-nav";
import IPInfoCard from "@/components/ip-info-card";
import StageMap from "@/components/stage-map";
import { ResultStage } from "@/components/result-stage";
import { MapFocusContext, type MapFocus } from "@/components/map-focus";
import DatabaseStatusLine from "@/components/database-status";

export default function Home() {
  const { ipData, isLoading, error, executeQuery } = useIPQueryStore();
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  // 地址栏的 ?q= 是可分享的查询目标；前进后退时按地址栏重新查询，不再写入历史。
  useEffect(() => {
    executeQuery(readURLQuery(), { history: "replace" });
    const onPopState = () => executeQuery(readURLQuery(), { history: false });
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [executeQuery]);

  return (
    <MapFocusContext.Provider value={setMapFocus}>
      <div className="site-page">
        <h1 className="sr-only">IP 地址查询</h1>
        <div className="site-top">
          <StageMap focus={mapFocus} />
          <SiteNav />
          {isLoading ? (
            <ResultStage>
              <div role="status" aria-label="正在查询 IP 信息" className="id-card id-card-loading"><span /><span /><span /></div>
            </ResultStage>
          ) : ipData ? <IPInfoCard key={ipData.ip} ipData={ipData} /> : (
            <ResultStage>
              <div className="id-card">
                <p className="id-eyebrow">{error ? "查询失败" : "开始查询"}</p>
                <p className="id-empty-title">{error ? "暂时无法获取 IP 信息" : "从一个 IP 地址开始"}</p>
                <p className="id-empty-text">{error ?? "在上方输入 IPv4、IPv6 地址或域名，或查询你当前的 IP。"}</p>
                <div className="id-actions">
                  <button type="button" className="id-button id-button-primary" onClick={() => executeQuery()}><LocateFixed />查询我的 IP</button>
                  <button type="button" className="id-button font-mono" onClick={() => executeQuery("8.8.8.8")}>8.8.8.8</button>
                </div>
              </div>
            </ResultStage>
          )}
        </div>
        <footer className="site-footer">
          <p>IP Search <span aria-hidden="true">·</span> IP 定位由数据库估算，实际位置与精度可能因网络而异</p>
          <DatabaseStatusLine />
        </footer>
      </div>
    </MapFocusContext.Provider>
  );
}
