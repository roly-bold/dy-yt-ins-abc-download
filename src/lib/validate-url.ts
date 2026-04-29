import { Platform } from "./types";

interface PlatformPattern {
  platform: Platform;
  patterns: RegExp[];
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  {
    platform: "instagram",
    patterns: [
      /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv|stories)\/[^/?\s]+/i,
    ],
  },
  {
    platform: "twitter",
    patterns: [
      /^https?:\/\/(www\.|mobile\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/i,
    ],
  },
  {
    platform: "youtube",
    patterns: [
      /^https?:\/\/(www\.|m\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/i,
    ],
  },
];

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/,
  /^fe80:/,
  /^::1$/,
];

function isPrivateIP(hostname: string): boolean {
  // Check if it looks like an IP address
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  if (!ipv4.test(hostname) && !ipv6.test(hostname)) return false;
  return PRIVATE_IP_RANGES.some((range) => range.test(hostname));
}

const BLOCKED_PROTOCOLS = ["file:", "ftp:", "gopher:", "data:", "javascript:"];

export function validateUrl(input: string): {
  valid: boolean;
  platform: Platform;
  normalizedUrl: string;
  error?: string;
} {
  try {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: "",
        error: "Please enter a URL",
      };
    }

    if (trimmed.length > 2048) {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: "",
        error: "URL is too long",
      };
    }

    const url = new URL(trimmed);

    if (BLOCKED_PROTOCOLS.some((p) => url.protocol === p)) {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: "",
        error: "Unsupported URL protocol",
      };
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: "",
        error: "Only HTTP and HTTPS URLs are supported",
      };
    }

    if (isPrivateIP(url.hostname)) {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: "",
        error: "Internal network URLs are not allowed",
      };
    }

    let detectedPlatform: Platform = "unknown";

    for (const { platform, patterns } of PLATFORM_PATTERNS) {
      if (patterns.some((p) => p.test(trimmed))) {
        detectedPlatform = platform;
        break;
      }
    }

    if (detectedPlatform === "unknown") {
      return {
        valid: false,
        platform: "unknown",
        normalizedUrl: trimmed,
        error:
          "Unsupported platform. Currently supports Instagram, Twitter/X, and YouTube.",
      };
    }

    return {
      valid: true,
      platform: detectedPlatform,
      normalizedUrl: trimmed,
    };
  } catch {
    return {
      valid: false,
      platform: "unknown",
      normalizedUrl: "",
      error: "Invalid URL format",
    };
  }
}
