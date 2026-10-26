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
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const applyTheme = (resolvedTheme: "light" | "dark") => {
  document.documentElement.classList.toggle("light", resolvedTheme === "light");
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
};

const setTheme = (theme: Theme) => {
  currentTheme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (error) {
    console.warn("保存主题失败:", error);
  }
  applyTheme(theme === "system" ? getSystemTheme() : theme);
  window.dispatchEvent(new Event(themeChangeEvent));
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
    toggleTheme: () => setTheme(resolvedTheme === "light" ? "dark" : "light"),
  };
};

export const themeTransition = "transition-colors duration-300 ease-in-out";
