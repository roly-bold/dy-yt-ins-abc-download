"use client";

import { useState, useCallback } from "react";
import { MagicInput } from "@/components/MagicInput";
import { FormatGrid } from "@/components/FormatGrid";
import { DownloadManager } from "@/components/DownloadManager";
import { PlatformIndicator } from "@/components/PlatformIndicator";
import { CookieUpload } from "@/components/CookieUpload";
import { VideoInfo, DownloadState, Platform, ApiAnalyzeResponse } from "@/lib/types";

export default function Home() {
  const [phase, setPhase] = useState<"input" | "parsing" | "formats" | "error">("input");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [downloads, setDownloads] = useState<DownloadState[]>([]);
  const [cookies, setCookies] = useState("");
  const [cookieToken, setCookieToken] = useState<string | null>(null);

  const handleSubmit = useCallback(async (url: string, detectedPlatform: Platform) => {
    setPhase("parsing");
    setPlatform(detectedPlatform);
    setError("");

    try {
      const body: Record<string, string> = { url };
      if (cookies.trim()) {
        body.cookies = cookies;
      }

      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: ApiAnalyzeResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Failed to analyze video");
        setPhase("error");
        return;
      }

      if (data.cookieToken) {
        setCookieToken(data.cookieToken);
      }

      if (data.videoInfo) {
        setVideoInfo(data.videoInfo);
        setPhase("formats");
      } else {
        setError("No formats found for this video");
        setPhase("error");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
      setPhase("error");
    }
  }, [cookies]);

  const handleDownload = useCallback(
    async (formatId: string) => {
      if (!videoInfo) return;

      const downloadId = `${Date.now()}`;
      const newDownload: DownloadState = {
        id: downloadId,
        url: videoInfo.url,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        platform: videoInfo.platform,
        format: formatId,
        progress: 0,
        speed: "",
        eta: "",
        status: "queued",
      };

      setDownloads((prev) => [newDownload, ...prev]);

      try {
        setDownloads((prev) =>
          prev.map((d) => (d.id === downloadId ? { ...d, status: "downloading" } : d))
        );

        let downloadUrl = `/api/download?url=${encodeURIComponent(videoInfo.url)}&format=${formatId}`;
        if (cookieToken) {
          downloadUrl += `&cookieToken=${encodeURIComponent(cookieToken)}`;
        }

        // Navigate to download URL — server responds with Content-Disposition: attachment so browser downloads without leaving the page
        window.location.href = downloadUrl;

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId ? { ...d, progress: 100, status: "complete" } : d
          )
        );
      } catch (err: unknown) {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId
              ? {
                  ...d,
                  status: "error",
                  error: err instanceof Error ? err.message : "Download failed",
                }
              : d
          )
        );
      }
    },
    [videoInfo, cookieToken]
  );

  const handleCancel = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleReset = useCallback(() => {
    setPhase("input");
    setVideoInfo(null);
    setError("");
    setPlatform("unknown");
    setCookieToken(null);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <PlatformIndicator platform={phase === "input" ? "unknown" : platform} />

      <main className="flex flex-col flex-1 items-center justify-center px-4 pb-32">
        <div
          className="w-full transition-all duration-500 ease-out"
          style={{ maxWidth: "var(--grid-max)" }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-[#f0f0f0] mb-3"
              style={{ fontFamily: "var(--font-heading)" }}>
              ClipGrab
            </h1>
            <p className="text-[#999] text-lg">
              Download videos from Instagram, Twitter/X, and YouTube
            </p>
          </div>

          {/* Magic Input */}
          <div className="mb-8">
            <MagicInput
              onSubmit={handleSubmit}
              isLoading={phase === "parsing"}
              error={error}
            />
            <CookieUpload cookies={cookies} onChange={setCookies} />
          </div>

          {/* Parsing State */}
          {phase === "parsing" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-64 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: "60%",
                    background: `var(--color-platform-primary, var(--color-accent))`,
                  }}
                />
              </div>
              <p
                className="text-[#999] text-sm transition-opacity"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Reading video metadata...
              </p>
            </div>
          )}

          {/* Error State */}
          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 py-8 animate-fade-in-up">
              <div className="w-16 h-16 rounded-full bg-[#1e1e1e] flex items-center justify-center border border-red-500/20">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-[#f0f0f0] text-center max-w-md">{error || "Something went wrong"}</p>
              <button
                onClick={handleReset}
                className="mt-2 px-6 py-2 text-sm text-[#999] bg-[#1e1e1e] rounded-full hover:bg-[#2a2a2a] transition-colors"
              >
                Try another link
              </button>
            </div>
          )}

          {/* Format Grid */}
          {phase === "formats" && videoInfo && (
            <FormatGrid
              videoInfo={videoInfo}
              onSelect={handleDownload}
            />
          )}
        </div>

        {/* Download Manager */}
        {downloads.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50">
            <DownloadManager downloads={downloads} onCancel={handleCancel} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[#555] text-xs">
        Powered by yt-dlp. For personal use only.
      </footer>
    </div>
  );
}
