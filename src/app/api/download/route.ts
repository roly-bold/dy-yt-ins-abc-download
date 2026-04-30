import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { analyzeVideo, classifyStderr, YtDlpError, SpawnError, TimeoutError } from "@/lib/yt-dlp";
import { spawn } from "child_process";
import { mkdtemp, readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const cookieStore = new Map<string, { cookies: string; expires: number }>();
const COOKIE_TOKEN_TTL = 600_000; // 10 minutes

function gcCookieStore() {
  const now = Date.now();
  for (const [token, entry] of cookieStore) {
    if (entry.expires < now) cookieStore.delete(token);
  }
}

function storeCookies(cookies: string): string {
  gcCookieStore();
  const token = randomUUID();
  cookieStore.set(token, { cookies, expires: Date.now() + COOKIE_TOKEN_TTL });
  return token;
}

async function writeCookiesFile(cookies: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cookies-"));
  const path = join(dir, "cookies.txt");
  await writeFile(path, cookies, "utf-8");
  return path;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let cookiesPath: string | undefined;
  try {
    const body = await request.json();
    const url = body.url as string | undefined;
    const cookies = body.cookies as string | undefined;

    console.log(`[POST] analyze request: url=${url?.substring(0, 80)}..., cookies=${cookies ? "yes" : "no"}`);

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

    if (cookies && cookies.trim().length > 0) {
      cookiesPath = await writeCookiesFile(cookies);
      console.log(`[POST] cookies file: ${cookiesPath}`);
    }

    const { videoInfo, formats } = await analyzeVideo(validation.normalizedUrl, cookiesPath);

    const elapsed = Date.now() - startTime;
    console.log(`[POST] success: ${formats.length} formats, ${elapsed}ms`);

    const response: Record<string, unknown> = { videoInfo, formats, platform: validation.platform };
    if (cookies && cookies.trim().length > 0) {
      response.cookieToken = storeCookies(cookies);
    }

    return NextResponse.json(response);
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
  } finally {
    if (cookiesPath) {
      try {
        const dir = cookiesPath.substring(0, cookiesPath.lastIndexOf("/"));
        await unlink(cookiesPath);
        const { rmdir } = await import("fs/promises");
        await rmdir(dir);
      } catch { /* ignore cleanup errors */ }
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const url = request.nextUrl.searchParams.get("url");
  const formatId = request.nextUrl.searchParams.get("format");
  const cookieToken = request.nextUrl.searchParams.get("cookieToken");

  console.log(`[GET] download request: format=${formatId}, cookieToken=${cookieToken ? "yes" : "no"}, url=${url?.substring(0, 80)}...`);

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
  let cookiesPath: string | undefined;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "clipgrab-"));
    tmpFile = join(tmpDir, "video.%(ext)s");

    console.log(`[GET] temp dir: ${tmpDir}`);

    if (cookieToken) {
      const entry = cookieStore.get(cookieToken);
      if (entry && entry.expires > Date.now()) {
        cookiesPath = await writeCookiesFile(entry.cookies);
        console.log(`[GET] using cookies from token: ${cookieToken}`);
      } else {
        console.log(`[GET] cookie token expired or not found: ${cookieToken}`);
      }
    }

    await runYtDlp(validation.normalizedUrl, formatId, tmpFile, request.signal, cookiesPath);

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
        const { readdir, unlink: unl, rmdir } = await import("fs/promises");
        const files = await readdir(tmpDir);
        for (const f of files) await unl(join(tmpDir, f));
        await rmdir(tmpDir);
      } catch { /* ignore cleanup errors */ }
    }
    if (cookiesPath) {
      try {
        const dir = cookiesPath.substring(0, cookiesPath.lastIndexOf("/"));
        await unlink(cookiesPath);
        const { rmdir } = await import("fs/promises");
        await rmdir(dir);
      } catch { /* ignore cleanup errors */ }
    }
  }
}

function runYtDlp(
  url: string,
  formatId: string,
  outputPath: string,
  signal: AbortSignal,
  cookiesPath?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [url, "-f", formatId, "-o", outputPath, "--no-playlist", "--no-mtime", "--js-runtimes", "deno:/usr/local/bin/deno", "--remote-components", "ejs:github"];
    if (cookiesPath) {
      args.push("--cookies", cookiesPath);
    } else {
      args.push("--extractor-args", "youtube:player_client=android,ios,web");
    }

    console.log(`[yt-dlp] spawning: -f ${formatId} -o ${outputPath} ${url.substring(0, 60)}... cookies=${cookiesPath ? "yes" : "no"}`);

    const child = spawn("yt-dlp", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });

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
