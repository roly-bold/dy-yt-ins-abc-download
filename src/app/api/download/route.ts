import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { analyzeVideo, classifyStderr, YtDlpError, SpawnError, TimeoutError } from "@/lib/yt-dlp";
import { spawn } from "child_process";
import { mkdtemp, readFile, unlink, rmdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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

  let tmpDir = "";
  let tmpFile = "";

  try {
    // Create temp directory
    tmpDir = await mkdtemp(join(tmpdir(), "clipgrab-"));
    tmpFile = join(tmpDir, "video.%(ext)s");

    // Download to temp file, then read and stream
    await runYtDlp(validation.normalizedUrl, formatId, tmpFile, request.signal);

    // Find the actual downloaded file (extension may vary)
    const { readdir } = await import("fs/promises");
    const files = await readdir(tmpDir);
    if (files.length === 0) {
      return NextResponse.json({ error: "Download produced no output" }, { status: 502 });
    }

    const outputFile = join(tmpDir, files[0]);
    const fileBuffer = await readFile(outputFile);

    // Extract filename for Content-Disposition
    const safeName = files[0].replace(/[<>:"/\\|?*]/g, "_");

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      const msg = err.message || "Download failed";
      if (msg.includes("timed out")) {
        return NextResponse.json({ error: "Download timed out. Please try again." }, { status: 504 });
      }
      const classified = classifyStderr(msg);
      return NextResponse.json({ error: classified.userMessage }, { status: classified.httpStatus });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  } finally {
    // Cleanup temp files
    if (tmpDir) {
      try { await unlink(tmpFile); } catch { /* ignore */ }
      try {
        const { readdir, unlink: rm, rmdir: rd } = await import("fs/promises");
        const files = await readdir(tmpDir);
        for (const f of files) await rm(join(tmpDir, f));
        await rd(tmpDir);
      } catch { /* ignore */ }
    }
  }
}

function runYtDlp(
  url: string,
  formatId: string,
  outputPath: string,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "yt-dlp",
      [
        url,
        "-f",
        formatId,
        "-o",
        outputPath,
        "--no-playlist",
        "--no-mtime",
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] }
    );

    const stderrChunks: string[] = [];

    child.stderr!.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Download timed out"));
    }, 300_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        const stderr = stderrChunks.join("");
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    signal.addEventListener("abort", () => {
      child.kill("SIGTERM");
      clearTimeout(timeout);
      reject(new Error("Client disconnected"));
    });
  });
}
