import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { analyzeVideo, classifyStderr, YtDlpError, SpawnError, TimeoutError } from "@/lib/yt-dlp";
import { spawn } from "child_process";
import { mkdtemp, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const url = body.url as string | undefined;

    console.log(`[POST] analyze request: url=${url?.substring(0, 80)}...`);

    if (!url) {
      console.log("[POST] missing URL");
      return NextResponse.json({ error: "URL is required", code: "MISSING_URL" }, { status: 400 });
    }

    const validation = validateUrl(url);
    if (!validation.valid) {
      console.log(`[POST] invalid URL: ${validation.error}`);
      return NextResponse.json({ error: validation.error, code: "INVALID_URL" }, { status: 400 });
    }

    console.log(`[POST] validated: platform=${validation.platform}, normalized=${validation.normalizedUrl.substring(0, 80)}`);

    const { videoInfo, formats } = await analyzeVideo(validation.normalizedUrl);

    const elapsed = Date.now() - startTime;
    console.log(`[POST] success: ${formats.length} formats, ${elapsed}ms`);

    return NextResponse.json({ videoInfo, formats, platform: validation.platform });
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    console.error(`[POST] error after ${elapsed}ms:`, err instanceof Error ? err.message : String(err));

    if (err instanceof YtDlpError) {
      const { httpStatus, userMessage } = err.classify();
      console.error(`[POST] YtDlpError: code=${err.code} httpStatus=${httpStatus} stderr_len=${err.stderr.length}`);
      console.error(`[POST] full stderr: ${err.stderr.substring(0, 500)}`);
      return NextResponse.json({ error: userMessage }, { status: httpStatus });
    }
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: "Video analysis timed out. Please try again." }, { status: 504 });
    }
    if (err instanceof SpawnError) {
      return NextResponse.json({ error: "Download engine unavailable. Please try again later." }, { status: 500 });
    }
    if (err instanceof SyntaxError) {
      console.error(`[POST] SyntaxError parsing JSON`);
      return NextResponse.json({ error: "Unable to parse video information. The format may be unsupported." }, { status: 422 });
    }
    console.error(`[POST] unhandled error:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const url = request.nextUrl.searchParams.get("url");
  const formatId = request.nextUrl.searchParams.get("format");

  console.log(`[GET] download request: format=${formatId}, url=${url?.substring(0, 80)}...`);

  if (!url || !formatId) {
    console.log("[GET] missing params");
    return NextResponse.json({ error: "URL and format are required" }, { status: 400 });
  }

  const validation = validateUrl(url);
  if (!validation.valid) {
    console.log(`[GET] invalid URL: ${validation.error}`);
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let tmpDir = "";
  let tmpFile = "";

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "clipgrab-"));
    tmpFile = join(tmpDir, "video.%(ext)s");

    console.log(`[GET] temp dir: ${tmpDir}`);

    await runYtDlp(validation.normalizedUrl, formatId, tmpFile, request.signal);

    const { readdir } = await import("fs/promises");
    const files = await readdir(tmpDir);
    console.log(`[GET] files in temp: ${files.join(", ") || "(none)"}`);

    if (files.length === 0) {
      console.error("[GET] no output files");
      return NextResponse.json({ error: "Download produced no output" }, { status: 502 });
    }

    const outputFile = join(tmpDir, files[0]);
    const fileBuffer = await readFile(outputFile);
    const safeName = files[0].replace(/[<>:"/\\|?*]/g, "_");

    const elapsed = Date.now() - startTime;
    console.log(`[GET] success: ${fileBuffer.length} bytes, ${safeName}, ${elapsed}ms`);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    console.error(`[GET] error after ${elapsed}ms:`, err instanceof Error ? err.message : String(err));

    if (err instanceof Error) {
      const msg = err.message || "Download failed";
      if (msg.includes("timed out")) {
        return NextResponse.json({ error: "Download timed out. Please try again." }, { status: 504 });
      }
      if (msg.includes("Client disconnected")) {
        return NextResponse.json({ error: "Download cancelled" }, { status: 499 });
      }
      const classified = classifyStderr(msg);
      return NextResponse.json({ error: classified.userMessage }, { status: classified.httpStatus });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  } finally {
    // Cleanup temp files
    if (tmpDir) {
      try {
        const { readdir, unlink, rmdir } = await import("fs/promises");
        const files = await readdir(tmpDir);
        for (const f of files) await unlink(join(tmpDir, f));
        await rmdir(tmpDir);
      } catch { /* ignore cleanup errors */ }
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
    console.log(`[yt-dlp] spawning: -f ${formatId} -o ${outputPath} ${url.substring(0, 60)}...`);

    const child = spawn(
      "yt-dlp",
      [url, "-f", formatId, "-o", outputPath, "--no-playlist", "--no-mtime", "--js-runtimes", "deno:/usr/local/bin/deno", "--extractor-args", "youtube:player_client=android"],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] }
    );

    const stderrChunks: string[] = [];

    child.stderr!.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    const timeout = setTimeout(() => {
      console.error(`[yt-dlp] timeout after 300s`);
      child.kill("SIGTERM");
      reject(new Error("Download timed out"));
    }, 300_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      const stderr = stderrChunks.join("");
      console.log(`[yt-dlp] exit code ${code}, stderr_len=${stderr.length}`);
      if (stderr) console.error(`[yt-dlp] stderr: ${stderr.substring(0, 500)}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`[yt-dlp] spawn error: ${err.message}`);
      reject(err);
    });

    signal.addEventListener("abort", () => {
      console.log("[yt-dlp] client aborted");
      child.kill("SIGTERM");
      clearTimeout(timeout);
      reject(new Error("Client disconnected"));
    });
  });
}
