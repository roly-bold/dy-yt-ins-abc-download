import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { analyzeVideo, classifyStderr, YtDlpError, SpawnError, TimeoutError } from "@/lib/yt-dlp";
import { spawn } from "child_process";
import { Readable } from "stream";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = body.url as string | undefined;

    if (!url) {
      return NextResponse.json({ error: "URL is required", code: "MISSING_URL" }, { status: 400 });
    }

    const validation = validateUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error, code: "INVALID_URL" }, { status: 400 });
    }

    const { videoInfo, formats } = await analyzeVideo(validation.normalizedUrl);

    return NextResponse.json({ videoInfo, formats, platform: validation.platform });
  } catch (err: unknown) {
    if (err instanceof YtDlpError) {
      const { httpStatus, userMessage } = err.classify();
      return NextResponse.json({ error: userMessage }, { status: httpStatus });
    }
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: "Video analysis timed out. Please try again." }, { status: 504 });
    }
    if (err instanceof SpawnError) {
      return NextResponse.json({ error: "Download engine unavailable. Please try again later." }, { status: 500 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Unable to parse video information. The format may be unsupported." }, { status: 422 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const formatId = request.nextUrl.searchParams.get("format");

  if (!url || !formatId) {
    return NextResponse.json({ error: "URL and format are required" }, { status: 400 });
  }

  const validation = validateUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let filename = "video.mp4";
  let aborted = false;

  const child = spawn(
    "yt-dlp",
    [
      validation.normalizedUrl,
      "-f",
      formatId,
      "-o",
      "-",
      "--no-playlist",
      "--print-to-stderr",
      "FILENAME:%(title).100s.%(ext)s",
    ],
    { shell: false, stdio: ["ignore", "pipe", "pipe"] }
  );

  // Listen on stderr for filename parsing — this is separate from stdout
  child.stderr!.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    const match = text.match(/FILENAME:(.+)/);
    if (match) {
      filename = match[1].trim().replace(/[<>:"/\\|?*]/g, "_");
    }
  });

  // Handle cleanup
  const timeout = setTimeout(() => {
    aborted = true;
    child.kill("SIGTERM");
  }, 300_000);

  child.on("close", () => clearTimeout(timeout));

  request.signal.addEventListener("abort", () => {
    aborted = true;
    child.kill("SIGTERM");
  });

  // Convert Node.js stdout to Web ReadableStream via Node.js API
  // Readable.toWeb() puts the source in paused mode and pulls on demand
  // We call it IMMEDIATELY after spawn to avoid buffer overflow
  const webStream = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
