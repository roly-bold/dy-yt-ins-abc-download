"use client";

import { Platform } from "@/lib/types";
import { useEffect, useState } from "react";

interface PlatformIndicatorProps {
  platform: Platform;
}

export function PlatformIndicator({ platform }: PlatformIndicatorProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (platform !== "unknown") {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [platform]);

  if (!visible) return null;

  const colors: Record<Platform, { primary: string; gradient: string }> = {
    instagram: {
      primary: "#e1306c",
      gradient: "linear-gradient(90deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
    },
    twitter: {
      primary: "#1da1f2",
      gradient: "linear-gradient(90deg, #1da1f2, #0d8bd9)",
    },
    youtube: {
      primary: "#ff0000",
      gradient: "linear-gradient(90deg, #ff0000, #cc0000)",
    },
    unknown: {
      primary: "var(--color-accent)",
      gradient: "linear-gradient(90deg, #00ff41, #00cc33)",
    },
  };

  const c = colors[platform];

  return (
    <div className="fixed top-0 left-0 right-0 z-40 animate-fade-in-up">
      <div
        className="h-[2px] w-full"
        style={{ background: c.gradient }}
      />
    </div>
  );
}
