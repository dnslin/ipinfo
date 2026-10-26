'use client';

import React, { useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme';

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  // 圆形扩散切换主题效果
  const toggleThemeWithAnimation = (event: React.MouseEvent) => {
    // 检查浏览器是否支持 View Transitions API
    const isAppearanceTransition = typeof document.startViewTransition === 'function'
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isAppearanceTransition) {
      // 如果不支持，直接切换主题
      const newTheme = resolvedTheme === "dark" ? "light" : "dark";
      setTheme(newTheme);
      return;
    }

    const isDark = resolvedTheme === "dark";
    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    try {
      const transition = document.startViewTransition?.(async () => {
        const newTheme = isDark ? "light" : "dark";
        setTheme(newTheme);

        // 等待更长时间确保 DOM 更新完成
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      if (transition && typeof transition.ready?.then === 'function') {
        transition.ready
          .then(() => {
            const clipPath = [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ];
            document.documentElement.animate(
              {
                clipPath: isDark
                  ? [...clipPath].reverse()
                  : clipPath,
              },
              {
                duration: 600,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                pseudoElement: isDark
                  ? '::view-transition-old(root)'
                  : '::view-transition-new(root)',
              },
            );
          })
          .catch((err: unknown) => {
            console.error("Theme transition error:", err);
            // 错误发生时也没关系，主题已经成功切换
          });
      }
    } catch (e: unknown) {
      console.error("Failed to start view transition:", e);
      // 发生错误时回退到普通切换
      const newTheme = isDark ? "light" : "dark";
      setTheme(newTheme);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <motion.button
      onClick={toggleThemeWithAnimation}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="
        relative p-2 rounded-lg
        bg-[rgb(var(--color-surface))]/80 backdrop-blur-sm
        hover:bg-[rgb(var(--color-surface-hover))]
        border border-[rgb(var(--color-border))]/50
        shadow-sm hover:shadow-md hover:border-[rgb(var(--color-border))]
        transition-all duration-200
        group overflow-hidden
      "
      title={`切换到${resolvedTheme === 'light' ? '暗色' : '浅色'}模式`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {resolvedTheme === 'dark' ? (
          <motion.div
            key="sun"
            initial={{ rotate: -180, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 180, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Sun className="w-4 h-4 text-amber-500 group-hover:text-amber-600" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ rotate: 180, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -180, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Moon className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 微妙的背景光晕效果 */}
      <motion.div
        className={`
          absolute inset-0 rounded-lg blur-sm -z-10 opacity-0
          ${resolvedTheme === 'light' ? 'bg-amber-400' : 'bg-blue-400'}
        `}
        whileHover={{ 
          opacity: 0.1,
          scale: 1.2 
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.button>
  );
}

// 紧凑版主题切换器（用于移动端或空间受限的地方）
export function CompactThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  const toggleTheme = () => {
    const newTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="
        p-1.5 rounded-md
        bg-[rgb(var(--color-surface))] hover:bg-[rgb(var(--color-surface-hover))]
        border border-[rgb(var(--color-border))]
        transition-all duration-200
        group
      "
      title={`切换到${resolvedTheme === 'light' ? '暗色' : '浅色'}模式`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {resolvedTheme === 'dark' ? (
          <motion.div
            key="sun-compact"
            initial={{ scale: 0.8, opacity: 0, rotate: -45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0, rotate: 45 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 20 
            }}
          >
            <Sun className="w-3 h-3 text-amber-500 group-hover:text-amber-600 transition-colors" />
          </motion.div>
        ) : (
          <motion.div
            key="moon-compact"
            initial={{ scale: 0.8, opacity: 0, rotate: 45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0, rotate: -45 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 20 
            }}
          >
            <Moon className="w-3 h-3 text-blue-400 group-hover:text-blue-300 transition-colors" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
