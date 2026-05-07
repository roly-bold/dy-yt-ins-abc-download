import { NextRequest, NextResponse } from "next/server";
import { validateUrl } from "@/lib/validate-url";
import { getCookies } from "@/lib/cookie-store";
import { spawn } from "child_process";
import { mkdtemp, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const fileStore = new Map<string, { path: string; expires: number }>();
const FILE_TTL = 300_000;

function gcFileStore() {
  const now = Date.now();
  for (const [id, entry] of fileStore) {
    if (entry.expires < now) fileStore.delete(id);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const url = request.nextUrl.searchParams.get("url");
  const formatId = request.nextUrl.searchParams.get("format");
  const cookieToken = request.nextUrl.searchParams.get("cookieToken");

  console.log(`[prepare] format=${formatId}, cookieToken=${cookieToken ? "yes" : "no"}, url=${url?.substring(0, 80)}...`);

  if (!url || !formatId) {
    return NextResponse.json({ error: "URL and format are required" }, { status: 400 });
  }

  const validation = validateUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let tmpDir = "";
  let cookiesPath: string | undefined;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), "clipgrab-"));
    const outputPath = join(tmpDir, "video.%(ext)s");

    if (cookieToken) {
      const entry = getCookies(cookieToken);
      if (entry) {
        const cookieDir = await mkdtemp(join(tmpdir(), "cookies-"));
        cookiesPath = join(cookieDir, "cookies.txt");
        await writeFile(cookiesPath, entry.cookies, "utf-8");
        console.log(`[prepare] using cookies from token: ${cookieToken}`);
      }
    }

    console.log(`[prepare] temp dir: ${tmpDir}`);
    await runDownload(validation.normalizedUrl, formatId, outputPath, request.signal, cookiesPath);

    const { readdir } = await import("fs/promises");
    const files = await readdir(tmpDir);
    if (files.length === 0) {
      return NextResponse.json({ error: "Download produced no output" }, { status: 502 });
    }

    const filePath = join(tmpDir, files[0]);
    gcFileStore();
    const fileId = randomUUID();
    fileStore.set(fileId, { path: filePath, expires: Date.now() + FILE_TTL });

    const elapsed = Date.now() - startTime;
    console.log(`[prepare] done: fileId=${fileId}, file=${files[0]}, ${elapsed}ms`);

    return NextResponse.json({ fileId });
  } catch (err: unknown) {
    const elapsed = Date.now() - startTime;
    console.error(`[prepare] error ${elapsed}ms:`, err instanceof Error ? err.message : String(err));

    // Cleanup temp dir on error (but NOT the file — that goes to fileStore)
    if (tmpDir) {
      try {
        const { readdir: rd, unlink: unl, rmdir } = await import("fs/promises");
        const files = await rd(tmpDir);
        for (const f of files) await unl(join(tmpDir, f));
        await rmdir(tmpDir);
      } catch { /* ignore */ }
    }
    if (cookiesPath) {
      try {
        const dir = cookiesPath.substring(0, cookiesPath.lastIndexOf("/"));
        await unlink(cookiesPath);
        const { rmdir } = await import("fs/promises");
        await rmdir(dir);
      } catch { /* ignore */ }
    }

    return NextResponse.json({ error: "Download preparation failed" }, { status: 502 });
  }
}

function runDownload(
  url: string,
  formatId: string,
  outputPath: string,
  signal: AbortSignal,
  cookiesPath?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [url, "-f", formatId, "-o", outputPath, "--no-playlist", "--no-mtime", "--js-runtimes", "deno:/usr/local/bin/deno"];
    if (cookiesPath) {
      args.push("--cookies", cookiesPath);
    } else {
      args.push("--extractor-args", "youtube:player_client=web,mweb,android");
    }

    console.log(`[prepare-yt-dlp] spawning: -f ${formatId} ${url.substring(0, 60)}... cookies=${cookiesPath ? "yes" : "no"}`);

    const child = spawn("yt-dlp", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });

    const stderrChunks: string[] = [];
    child.stderr!.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()));

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Download timed out"));
    }, 300_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      const stderr = stderrChunks.join("");
      console.log(`[prepare-yt-dlp] exit ${code}, stderr_len=${stderr.length}`);
      if (stderr) console.error(`[prepare-yt-dlp] stderr: ${stderr.substring(0, 300)}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `yt-dlp exit ${code}`));
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
    }, { once: true });
  });
}
