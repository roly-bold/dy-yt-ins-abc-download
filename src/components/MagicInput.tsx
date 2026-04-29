"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Platform, PLATFORM_PLACEHOLDERS } from "@/lib/types";
import { validateUrl } from "@/lib/validate-url";

interface MagicInputProps {
  onSubmit: (url: string, platform: Platform) => void;
  isLoading: boolean;
  error: string;
}

export function MagicInput({ onSubmit, isLoading, error }: MagicInputProps) {
  const [value, setValue] = useState("");
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.clipboard?.readText().then((text) => {
      const result = validateUrl(text);
      if (result.valid) {
        setClipboardUrl(text);
      }
    }).catch(() => {
      // Clipboard access denied, no action needed
    });
  }, []);

  useEffect(() => {
    if (error) {
      setLocalError(error);
    }
  }, [error]);

  const handleSubmit = useCallback(() => {
    const result = validateUrl(value || clipboardUrl || "");
    if (!result.valid) {
      setLocalError(result.error || "Please enter a valid URL");
      return;
    }
    setLocalError("");
    onSubmit(result.normalizedUrl, result.platform);
  }, [value, clipboardUrl, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePasteClipboard = useCallback(() => {
    if (clipboardUrl) {
      setValue(clipboardUrl);
      const result = validateUrl(clipboardUrl);
      if (result.valid) {
        onSubmit(result.normalizedUrl, result.platform);
      }
    }
  }, [clipboardUrl, onSubmit]);

  const currentPlatform = value ? validateUrl(value).platform : "unknown";

  return (
    <div className="w-full max-w-[var(--content-max)] mx-auto">
      {/* Input Container */}
      <div className="relative group">
        {/* Glow gradient background for frosted glass */}
        <div
          className="absolute -inset-1 rounded-2xl opacity-30 blur-xl transition-opacity duration-500"
          style={{
            background:
              currentPlatform === "instagram"
                ? "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
                : currentPlatform === "twitter"
                  ? "linear-gradient(135deg, #1da1f2, #0d8bd9)"
                  : currentPlatform === "youtube"
                    ? "linear-gradient(135deg, #ff0000, #cc0000)"
                    : "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
          }}
        />

        <div
          className={`relative flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all duration-300 ${
            isLoading
              ? "animate-breathe border-white/10"
              : localError
                ? "animate-shake border-red-500/30"
                : "border-white/[0.08] hover:border-white/[0.15]"
          }`}
          style={{
            background: "rgba(20, 20, 20, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          {/* Search icon */}
          <svg
            className="w-5 h-5 shrink-0 text-[#555]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setLocalError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              currentPlatform !== "unknown"
                ? PLATFORM_PLACEHOLDERS[currentPlatform]
                : "Paste a link from Instagram, Twitter/X, or YouTube..."
            }
            className="flex-1 bg-transparent text-[#f0f0f0] placeholder-[#555] outline-none text-base"
            style={{ fontFamily: "var(--font-body)" }}
            disabled={isLoading}
            autoFocus
          />

          {/* Platform indicator dot */}
          {currentPlatform !== "unknown" && !isLoading && (
            <div
              className="w-2 h-2 rounded-full shrink-0 animate-scale-in"
              style={{
                background:
                  currentPlatform === "instagram"
                    ? "var(--color-instagram)"
                    : currentPlatform === "twitter"
                      ? "var(--color-twitter)"
                      : "var(--color-youtube)",
              }}
            />
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || (!value && !clipboardUrl)}
            className="shrink-0 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "var(--color-text-primary)",
            }}
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-20" />
                <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              "Download"
            )}
          </button>
        </div>

        {/* Clipboard button */}
        {clipboardUrl && !value && !isLoading && (
          <button
            onClick={handlePasteClipboard}
            className="mt-3 mx-auto flex items-center gap-2 px-4 py-2 text-xs text-[#999] bg-[#141414] rounded-full border border-white/[0.06] hover:border-white/[0.12] hover:text-[#f0f0f0] transition-all duration-200 animate-fade-in-up"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Paste link from clipboard
          </button>
        )}
      </div>

      {/* Error message */}
      {localError && (
        <p className="mt-3 text-sm text-red-400 text-center animate-fade-in-up">
          {localError}
        </p>
      )}
    </div>
  );
}
