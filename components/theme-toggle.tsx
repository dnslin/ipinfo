"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const label = mounted
    ? `切换到${resolvedTheme === "light" ? "暗色" : "浅色"}模式`
    : "切换主题";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      aria-label={label}
      title={label}
      className="ui-button ui-icon-button"
    >
      {mounted ? (
        resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : <span className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
