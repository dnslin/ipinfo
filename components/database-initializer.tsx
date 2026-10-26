"use client";

import { useEffect } from "react";

export default function DatabaseInitializer() {
  useEffect(() => {
    const initialize = async () => {
      try {
        const response = await fetch("/api/init");
        const status = await response.json();
        if (response.ok && status.data?.canQuery) return;

        const initialized = await fetch("/api/init", { method: "POST" });
        const result = await initialized.json();
        if (!initialized.ok || !result.data?.canQuery) {
          console.error("数据库初始化失败:", result.error ?? "基础数据库不可用");
        } else if (!result.data.isReady) {
          console.warn(result.message, result.data.error);
        }
      } catch (error) {
        console.error("数据库初始化请求失败:", error);
      }
    };

    const timer = setTimeout(initialize, 1000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
