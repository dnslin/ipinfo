"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// 检测系统主题偏好
const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

// 从localStorage获取保存的主题
const getStoredTheme = (): Theme => {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem("theme") as Theme;
    return stored || "system";
  } catch {
    return "system";
  }
};

const subscribeToSystemTheme = (onChange: () => void) => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const getServerSystemTheme = (): "light" | "dark" => "light";

// 应用主题到DOM
const applyTheme = (resolvedTheme: "light" | "dark") => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
};

export const useTheme = (): ThemeContextValue => {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // 设置主题
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);

    // 保存到localStorage
    try {
      localStorage.setItem("theme", newTheme);
    } catch (error) {
      console.warn("Failed to save theme to localStorage:", error);
    }

    // 应用解析后的主题
    const newResolvedTheme = newTheme === "system" ? getSystemTheme() : newTheme;
    applyTheme(newResolvedTheme);
  };

  // 切换主题（在light和dark之间切换）
  const toggleTheme = () => {
    const newTheme = resolvedTheme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  // 将初始化和系统配色变化同步到页面
  useEffect(() => {
    applyTheme(theme === "system" ? getSystemTheme() : theme);
  }, [theme, systemTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
};

// 主题切换动画的CSS类
export const themeTransition = "transition-colors duration-300 ease-in-out";
