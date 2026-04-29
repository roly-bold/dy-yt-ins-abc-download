import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { analyzeVideo, classifyStderr, YtDlpError, SpawnError, TimeoutError } from "@/lib/yt-dlp";

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

  try {
    const { spawn } = require("child_process");
    const child = spawn(
      "yt-dlp",
      [
        validation.normalizedUrl,
        "-f",
        formatId,
        "-o",
        "-",
        "--no-playlist",
        "--print",
        "FILENAME:%(title).100s.%(ext)s",
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] }
    );

    let filename = "video.mp4";
    const stderrChunks: string[] = [];

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      const match = text.match(/FILENAME:(.+)/);
      if (match) {
        filename = match[1].trim().replace(/[<>:"/\\|?*]/g, "_");
      }
    });

    let aborted = false;

    const stream = new ReadableStream({
      start(controller) {
        child.stdout.on("data", (chunk: Buffer) => {
          if (!aborted) controller.enqueue(new Uint8Array(chunk));
        });

        child.stdout.on("end", () => {
          if (!aborted) controller.close();
        });

        child.on("error", (err: Error) => {
          if (!aborted) controller.error(err);
        });

        const timeout = setTimeout(() => {
          aborted = true;
          child.kill("SIGTERM");
          controller.error(new Error("Download timed out"));
        }, 300_000);

        child.on("close", () => {
          clearTimeout(timeout);
          if (!aborted) {
            try { controller.close(); } catch { /* already closed */ }
          }
        });

        request.signal.addEventListener("abort", () => {
          aborted = true;
          child.kill("SIGTERM");
          clearTimeout(timeout);
        });
      },
      cancel() {
        aborted = true;
        child.kill("SIGTERM");
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const stderr = "";
    const classified = classifyStderr(stderr);
    return NextResponse.json({ error: classified.userMessage }, { status: classified.httpStatus });
  }
}
