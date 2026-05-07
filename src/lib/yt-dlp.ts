import { spawn, ChildProcess } from "child_process";
import { VideoFormat, VideoInfo, Platform } from "./types";

const MAX_CONCURRENT = 3;
const FORMAT_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 300000;
const MAX_BUFFER = 10 * 1024 * 1024;

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.permits = max;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

const formatCache = new Map<string, { data: VideoInfo; expires: number }>();
const CACHE_TTL_MS = 300_000;

function getCacheKey(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname + (u.searchParams.get("v") || "");
  } catch {
    return url;
  }
}

function spawnYtDlp(
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn("yt-dlp", args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const stdoutTimer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new TimeoutError("yt-dlp timed out"));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_BUFFER) {
        child.kill("SIGTERM");
        reject(new Error("yt-dlp output exceeded max buffer"));
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(stdoutTimer);
      if (code === 0 || code === null) {
        resolve({ stdout, stderr });
      } else if (stdout.length > 0) {
        // yt-dlp may exit non-zero on warnings but still produce valid output
        resolve({ stdout, stderr });
      } else {
        reject(new YtDlpError("yt-dlp exited with error", code, stderr));
      }
    });

    child.on("error", (err) => {
      clearTimeout(stdoutTimer);
      reject(new SpawnError(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

export class SpawnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpawnError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class YtDlpError extends Error {
  code: number | null;
  stderr: string;

  constructor(message: string, code: number | null, stderr: string) {
    super(message + (stderr ? ` [stderr: ${stderr.substring(0, 500)}]` : ""));
    this.name = "YtDlpError";
    this.code = code;
    this.stderr = stderr;
  }

  classify(): { httpStatus: number; userMessage: string } {
    const combined = this.stderr.toLowerCase();
    if (combined.includes("sign in") || combined.includes("bot")) {
      return {
        httpStatus: 403,
        userMessage:
          "YouTube bot detection triggered. This video requires browser cookies when accessed from cloud servers. Expand the YouTube Cookies section below the input bar, paste your cookies, and try again.",
      };
    }
    if (combined.includes("403") || combined.includes("forbidden")) {
      return {
        httpStatus: 429,
        userMessage:
          "This platform is rate-limiting requests. Please try again in a few minutes.",
      };
    }
    if (combined.includes("404") || combined.includes("not found")) {
      return {
        httpStatus: 404,
        userMessage:
          "Video not found. It may have been removed or is private.",
      };
    }
    if (
      combined.includes("private") ||
      combined.includes("login") ||
      combined.includes("age")
    ) {
      return {
        httpStatus: 403,
        userMessage:
          "This video is private, age-restricted, or requires login. Try uploading browser cookies to access it.",
      };
    }
    if (combined.includes("no space")) {
      return {
        httpStatus: 507,
        userMessage: "Not enough disk space to process this download.",
      };
    }
    return {
      httpStatus: 502,
      userMessage:
        "Download engine encountered an error. Please try again.",
    };
  }
}

export function classifyStderr(stderr: string): {
  httpStatus: number;
  userMessage: string;
} {
  const combined = stderr.toLowerCase();
  if (combined.includes("sign in") || combined.includes("bot")) {
    return {
      httpStatus: 403,
      userMessage:
        "YouTube bot detection triggered. This video requires browser cookies when accessed from cloud servers. Expand the YouTube Cookies section below the input bar, paste your cookies, and try again.",
    };
  }
  if (combined.includes("403") || combined.includes("forbidden")) {
    return {
      httpStatus: 429,
      userMessage:
        "This platform is rate-limiting requests. Please try again in a few minutes.",
    };
  }
  if (combined.includes("404") || combined.includes("not found")) {
    return {
      httpStatus: 404,
      userMessage:
        "Video not found. It may have been removed or is private.",
    };
  }
  if (
    combined.includes("private") ||
    combined.includes("login") ||
    combined.includes("age")
  ) {
    return {
      httpStatus: 403,
      userMessage: "This video is private, age-restricted, or requires login. Try uploading browser cookies to access it.",
    };
  }
  if (combined.includes("no space")) {
    return {
      httpStatus: 507,
      userMessage: "Not enough disk space to process this download.",
    };
  }
  return {
    httpStatus: 502,
    userMessage: "Download engine encountered an error. Please try again.",
  };
}

function parseResolutionHeight(res: string | null | undefined): number {
  if (!res || res === "audio only") return 0;
  const match = res.match(/(\d+)p/) || res.match(/x(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseFormats(json: Record<string, unknown>): VideoFormat[] {
  const formats = json.formats as Array<Record<string, unknown>> | undefined;
  if (!formats || !Array.isArray(formats)) return [];

  const parsed: VideoFormat[] = [];

  for (const f of formats) {
    const ext = f.ext as string | undefined;
    if (!ext || !["mp4", "webm", "m4a", "mp3", "aac", "opus"].includes(ext)) continue;

    const vcodec = (f.vcodec as string) || "none";
    const acodec = (f.acodec as string) || "none";

    parsed.push({
      id: (f.format_id as string) || "unknown",
      ext: ext,
      resolution: (f.resolution as string) || (vcodec !== "none" ? "video" : "audio only"),
      fps: (f.fps as number) || null,
      fileSize: f.filesize ? formatFileSize(f.filesize as number) : null,
      tbr: (f.tbr as number) || null,
      vcodec,
      acodec,
      isAudioOnly: vcodec === "none",
      isVideoOnly: acodec === "none",
    });
  }

  // Sort: video formats by resolution height descending, then audio by bitrate descending
  return parsed.sort((a, b) => {
    const aH = parseResolutionHeight(a.resolution);
    const bH = parseResolutionHeight(b.resolution);
    if (bH !== aH) return bH - aH;
    return (b.tbr || 0) - (a.tbr || 0);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function analyzeVideo(
  url: string,
  cookiesPath?: string
): Promise<{ videoInfo: VideoInfo; formats: VideoFormat[] }> {
  const cacheKey = getCacheKey(url);
  const cached = formatCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { videoInfo: cached.data, formats: cached.data.formats };
  }

  await semaphore.acquire();
  try {
    let lastError: Error | null = null;

    // Retry once for transient YouTube bot-detection failures
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const args = [
          url,
          "--dump-json",
          "--no-playlist",
          "--js-runtimes", "deno:/usr/local/bin/deno",

        ];
        if (cookiesPath) {
          args.push("--cookies", cookiesPath);
        } else {
          args.push("--extractor-args", "youtube:player_client=web,mweb,android");
        }
        const { stdout } = await spawnYtDlp(args, FORMAT_TIMEOUT_MS);

        const json = JSON.parse(stdout);

        const videoInfo: VideoInfo = {
          platform: detectPlatformFromJson(json),
          title: (json.title as string) || "Untitled",
          thumbnail: (json.thumbnail as string) || "",
          duration: (json.duration as number) || 0,
          uploader: (json.uploader as string) || "Unknown",
          formats: [],
          url,
        };

        const formats = parseFormats(json);
        videoInfo.formats = formats;

        formatCache.set(cacheKey, {
          data: videoInfo,
          expires: Date.now() + CACHE_TTL_MS,
        });

        return { videoInfo, formats };
      } catch (err) {
        lastError = err as Error;
        // Only retry on YtDlpError (not timeout, spawn, or parse errors)
        if (!(err instanceof YtDlpError) || attempt >= 1) throw err;
        // Small delay before retry
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    throw lastError!;
  } finally {
    semaphore.release();
  }
}

function detectPlatformFromJson(json: Record<string, unknown>): Platform {
  const extractor = (json.extractor as string || "").toLowerCase();
  if (extractor.includes("instagram")) return "instagram";
  if (extractor.includes("twitter") || extractor.includes("x.com"))
    return "twitter";
  if (extractor.includes("youtube")) return "youtube";
  return "unknown";
}

export async function downloadVideo(
  url: string,
  formatId: string,
  onProgress?: (progress: string) => void
): Promise<{
  child: ChildProcess;
  title: string;
  ext: string;
}> {
  await semaphore.acquire();

  const args = [
    url,
    "-f",
    formatId,
    "-o",
    "-",
    "--no-playlist",
    "--progress-template",
    "%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.speed)s|%(progress.eta)s",
    "--print",
    "FILENAME:%(title)s|%(ext)s",
  ];

  const child = spawn("yt-dlp", args, {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let released = false;

  const releaseSemaphore = () => {
    if (!released) {
      released = true;
      semaphore.release();
    }
  };

  const downloadTimer = setTimeout(() => {
    child.kill("SIGTERM");
    releaseSemaphore();
  }, DOWNLOAD_TIMEOUT_MS);

  child.on("close", () => {
    clearTimeout(downloadTimer);
    releaseSemaphore();
  });

  child.on("error", () => {
    clearTimeout(downloadTimer);
    releaseSemaphore();
  });

  const abortController = new AbortController();

  // Parse progress from stderr
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.startsWith("FILENAME:")) {
      // Parse title from stdout
    } else if (onProgress) {
      onProgress(text);
    }
  });

  const title = url;
  const ext = "mp4";

  return { child, title, ext };
}

export { semaphore, MAX_CONCURRENT };
