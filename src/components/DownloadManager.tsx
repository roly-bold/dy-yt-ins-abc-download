"use client";

import { DownloadState } from "@/lib/types";

interface DownloadManagerProps {
  downloads: DownloadState[];
  onCancel: (id: string) => void;
}

export function DownloadManager({ downloads, onCancel }: DownloadManagerProps) {
  if (downloads.length === 0) return null;

  return (
    <div
      className="mx-auto max-w-[var(--grid-max)] rounded-t-2xl border border-white/[0.06] overflow-hidden"
      style={{
        background: "rgba(14, 14, 14, 0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
        <span className="text-xs font-medium text-[#999] uppercase tracking-wider">
          Downloads ({downloads.length})
        </span>
      </div>

      {/* Download list */}
      <div className="max-h-[280px] overflow-y-auto">
        {downloads.map((d) => (
          <DownloadItem key={d.id} download={d} onCancel={() => onCancel(d.id)} />
        ))}
      </div>
    </div>
  );
}

function DownloadItem({
  download,
  onCancel,
}: {
  download: DownloadState;
  onCancel: () => void;
}) {
  const isActive = download.status === "downloading" || download.status === "queued" || download.status === "processing";
  const isComplete = download.status === "complete";
  const isError = download.status === "error";

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 border-b border-white/[0.03] transition-colors ${
        isComplete ? "animate-complete-glow" : ""
      }`}
    >
      {/* Thumbnail */}
      {download.thumbnail ? (
        <img
          src={download.thumbnail}
          alt=""
          className="w-10 h-10 object-cover rounded-lg shrink-0 bg-[#1e1e1e]"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[#1e1e1e] shrink-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-[#555]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l-4 4m0 0l-4-4m4 4V3" />
          </svg>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#f0f0f0] truncate">{download.title}</p>
        <div className="flex items-center gap-2">
          {isActive && (
            <>
              {/* Asymmetric progress bar */}
              <div className="flex-1 h-1 rounded-full bg-[#1e1e1e] overflow-hidden max-w-[120px]">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(download.progress || 5, 100)}%`,
                    background: isError ? "#ef4444" : "var(--color-accent)",
                  }}
                />
              </div>
              <span className="text-[10px] text-[#999] font-mono">
                {download.status === "processing" ? "Processing..." : `${download.progress || 0}%`}
              </span>
            </>
          )}
          {isComplete && (
            <span className="text-xs text-[var(--color-accent)]" style={{ fontFamily: "var(--font-mono)" }}>
              Complete
            </span>
          )}
          {isError && (
            <span className="text-xs text-red-400 truncate max-w-[200px]">
              {download.error || "Failed"}
            </span>
          )}
          {/* Show format label for queued */}
          {download.status === "queued" && (
            <span className="text-xs text-[#999]">Queued...</span>
          )}
        </div>
      </div>

      {/* Cancel/Remove button */}
      <button
        onClick={onCancel}
        className="shrink-0 p-2 rounded-lg opacity-0 hover:opacity-100 transition-opacity duration-200 hover:bg-white/[0.06]"
        style={{ opacity: isActive ? undefined : 0.5 }}
        aria-label={isActive ? "Cancel download" : "Remove"}
      >
        <svg className="w-4 h-4 text-[#999]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
