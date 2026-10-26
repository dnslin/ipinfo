"use client";

import { useTheme } from "@/lib/theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={{
        "--normal-bg": "rgb(var(--color-surface))",
        "--normal-text": "rgb(var(--color-text-primary))",
        "--normal-border": "rgb(var(--color-border))",
      } as React.CSSProperties}
      {...props}
    />
  );
};

export { Toaster };
