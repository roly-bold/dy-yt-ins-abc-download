"use client";

import { VideoInfo, VideoFormat } from "@/lib/types";
import { useState } from "react";

interface FormatGridProps {
  videoInfo: VideoInfo;
  onSelect: (formatId: string) => void;
}

function FormatCard({
  format,
  isAudio,
  onSelect,
  accentColor,
}: {
  format: VideoFormat;
  isAudio: boolean;
  onSelect: () => void;
  accentColor: string;
}) {
  const [pressed, setPressed] = useState(false);

  const label = isAudio
    ? format.ext.toUpperCase()
    : format.resolution || format.ext.toUpperCase();

  const sublabel = format.fileSize
    ? format.fileSize
    : format.tbr
      ? `${Math.round(format.tbr)} kbps`
      : "";

  return (
    <button
      onClick={onSelect}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className="relative flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-white/[0.06] transition-all duration-200 hover:border-white/[0.15] min-h-[120px] select-none"
      style={{
        background: "rgba(20, 20, 20, 0.6)",
        backdropFilter: "blur(8px)",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 150ms var(--ease-out)",
        touchAction: "manipulation",
      }}
    >
      {/* Accent glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${accentColor}10, transparent 70%)`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
      />

      <span
        className="text-2xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-heading)", color: accentColor }}
      >
        {label}
      </span>
      {sublabel && (
        <span className="text-xs text-[#999]" style={{ fontFamily: "var(--font-mono)" }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

export function FormatGrid({ videoInfo, onSelect }: FormatGridProps) {
  const video = videoInfo.formats.filter((f) => !f.isAudioOnly && f.resolution !== "audio only");
  const audio = videoInfo.formats.filter((f) => f.isAudioOnly);

  const platformColor =
    videoInfo.platform === "instagram"
      ? "var(--color-instagram)"
      : videoInfo.platform === "twitter"
        ? "var(--color-twitter)"
        : "var(--color-youtube)";

  return (
    <div className="animate-fade-in-up">
      {/* Video info header */}
      <div className="flex items-start gap-4 mb-8 p-4 rounded-2xl"
        style={{ background: "rgba(20, 20, 20, 0.4)" }}>
        {videoInfo.thumbnail && (
          <img
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            className="w-24 h-16 object-cover rounded-lg shrink-0"
            style={{ borderRadius: "var(--radius-lg)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h2
            className="text-[#f0f0f0] font-medium truncate mb-1"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {videoInfo.title}
          </h2>
          <p className="text-sm text-[#999]">
            {videoInfo.uploader}
            {videoInfo.duration > 0 && (
              <> &middot; {Math.floor(videoInfo.duration / 60)}:{String(videoInfo.duration % 60).padStart(2, "0")}</>
            )}
          </p>
        </div>
      </div>

      {/* Video formats */}
      {video.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-[#999] mb-3 uppercase tracking-wider">Video</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {video.slice(0, 6).map((f) => (
              <FormatCard
                key={f.id}
                format={f}
                isAudio={false}
                onSelect={() => onSelect(f.id)}
                accentColor={platformColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* Audio formats */}
      {audio.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-[#999] mb-3 uppercase tracking-wider">Audio</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {audio.slice(0, 4).map((f) => (
              <FormatCard
                key={f.id}
                format={f}
                isAudio={true}
                onSelect={() => onSelect(f.id)}
                accentColor="var(--color-accent)"
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick Download — best quality */}
      <div className="mt-8 text-center">
        <button
          onClick={() => {
            const best = videoInfo.formats.find(
              (f) => !f.isAudioOnly && !f.isVideoOnly
            ) || videoInfo.formats[0];
            if (best) onSelect(best.id);
          }}
          className="px-8 py-3 text-sm font-medium rounded-2xl transition-all duration-200 hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${platformColor}20, ${platformColor}08)`,
            color: platformColor,
            border: `1px solid ${platformColor}30`,
          }}
        >
          Quick Download — Best Quality
        </button>
      </div>
    </div>
  );
}
