"use client";

import { useState, useCallback, useRef } from "react";

interface CookieUploadProps {
  cookies: string;
  onChange: (cookies: string) => void;
}

export function CookieUpload({ cookies, onChange }: CookieUploadProps) {
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(() => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsText(file);
  }, [onChange]);

  return (
    <div className="w-full max-w-[var(--content-max)] mx-auto mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-[#666] hover:text-[#999] transition-colors mx-auto"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        YouTube Cookies {cookies ? "(loaded)" : "(optional)"}
      </button>

      {expanded && (
        <div
          className="mt-3 p-4 rounded-2xl border border-white/[0.06] animate-fade-in-up"
          style={{ background: "rgba(20, 20, 20, 0.6)" }}
        >
          <p className="text-xs text-[#777] mb-3 leading-relaxed">
            Some YouTube videos require browser cookies to bypass bot detection.
            Export cookies using a browser extension like{" "}
            <a
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3ea6ff] hover:underline"
            >
              Get cookies.txt LOCALLY
            </a>
            , then paste the contents below or upload the file.
          </p>

          <textarea
            value={cookies}
            onChange={(e) => onChange(e.target.value)}
            placeholder="# Netscape HTTP Cookie File&#10;# Paste your YouTube cookies here..."
            className="w-full h-28 bg-[#0a0a0a] border border-white/[0.08] rounded-xl p-3 text-xs text-[#999] font-mono resize-y outline-none focus:border-white/[0.2] transition-colors"
            spellCheck={false}
          />

          <div className="flex items-center gap-3 mt-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs text-[#999] bg-[#1a1a1a] rounded-lg border border-white/[0.06] hover:border-white/[0.15] transition-colors"
            >
              Upload cookies.txt
            </button>
            {cookies && (
              <button
                onClick={() => onChange("")}
                className="px-3 py-1.5 text-xs text-red-400/70 bg-[#1a1a1a] rounded-lg border border-red-500/10 hover:border-red-500/30 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
