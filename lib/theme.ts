"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

let currentTheme: Theme | undefined;
const themeChangeEvent = "ipinfo-theme-change";

const getSystemTheme = (): "light" | "dark" =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

const getThemeSnapshot = (): Theme => {
  currentTheme ??= getStoredTheme();
  return currentTheme;
};

const getServerTheme = (): Theme => "system";
const getServerSystemTheme = (): "light" | "dark" => "light";

const subscribeToTheme = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== "theme" && event.key !== null) return;
    currentTheme = getStoredTheme();
    applyTheme(currentTheme === "system" ? getSystemTheme() : currentTheme);
    onChange();
  };
  window.addEventListener(themeChangeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(themeChangeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
};

const subscribeToSystemTheme = (onChange: () => void) => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (getThemeSnapshot() === "system") applyTheme(getSystemTheme());
    onChange();
  };
  mediaQuery.addEventListener("change", onSystemChange);
  return () => mediaQuery.removeEventListener("change", onSystemChange);
};

const applyTheme = (resolvedTheme: "light" | "dark") => {
  const root = document.documentElement;
  if (root.classList.contains(resolvedTheme) && root.style.colorScheme === resolvedTheme) return;
  root.classList.add("theme-changing");
  root.classList.toggle("light", resolvedTheme === "light");
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
  // 先结算新颜色，再恢复元素自身的交互过渡，避免换肤时叠加颜色渐变。
  root.getBoundingClientRect();
  root.classList.remove("theme-changing");
};

export const setTheme = (theme: Theme) => {
  currentTheme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (error) {
    console.warn("保存主题失败:", error);
  }
  applyTheme(theme === "system" ? getSystemTheme() : theme);
  window.dispatchEvent(new Event(themeChangeEvent));
};

export const toggleTheme = () => {
  const theme = getThemeSnapshot();
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
  setTheme(resolvedTheme === "light" ? "dark" : "light");
};

export const useTheme = (): ThemeContextValue => {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerTheme);
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, getServerSystemTheme);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const savedTheme = getThemeSnapshot();
    applyTheme(savedTheme === "system" ? getSystemTheme() : savedTheme);
  }, [theme, systemTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
  };
};
