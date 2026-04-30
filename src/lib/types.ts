export type Platform = "instagram" | "twitter" | "youtube" | "unknown";

export interface VideoFormat {
  id: string;
  ext: string;
  resolution: string;
  fps: number | null;
  fileSize: string | null;
  tbr: number | null;
  vcodec: string;
  acodec: string;
  isAudioOnly: boolean;
  isVideoOnly: boolean;
}

export interface VideoInfo {
  platform: Platform;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  formats: VideoFormat[];
  url: string;
}

export interface DownloadState {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: Platform;
  format: string;
  progress: number;
  speed: string;
  eta: string;
  status: "queued" | "downloading" | "processing" | "complete" | "error";
  error?: string;
}

export interface ApiAnalyzeResponse {
  formats?: VideoFormat[];
  videoInfo?: VideoInfo;
  error?: string;
  platform?: Platform;
  cookieToken?: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  retryAfter?: number;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  twitter: "Twitter / X",
  youtube: "YouTube",
  unknown: "Unknown",
};

export const PLATFORM_PLACEHOLDERS: Record<Platform, string> = {
  instagram: "instagram.com/reel/...",
  twitter: "twitter.com/i/status/...",
  youtube: "youtube.com/watch?v=...",
  unknown: "Paste a video link...",
};
