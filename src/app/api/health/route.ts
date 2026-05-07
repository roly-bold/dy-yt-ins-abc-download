import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  const diagnostics: Record<string, unknown> = {};

  // Check yt-dlp
  try {
    const version = execSync("yt-dlp --version", { stdio: "pipe", timeout: 5000 }).toString().trim();
    diagnostics.ytDlpVersion = version;
    diagnostics.ytDlp = true;
  } catch {
    diagnostics.ytDlp = false;
  }

  // Check Deno
  try {
    const denoVersion = execSync("deno --version", { stdio: "pipe", timeout: 5000 }).toString().trim().split("\n")[0];
    diagnostics.deno = denoVersion;
  } catch {
    diagnostics.deno = false;
  }

  // Check EJS components (try to list yt-dlp's bundled extractors/scripts)
  try {
    const pyCheck = execSync(
      "python3 -c \"import yt_dlp; print(yt_dlp.version.__version__)\"",
      { stdio: "pipe", timeout: 5000 }
    ).toString().trim();
    diagnostics.pythonYtDlp = pyCheck;
  } catch {
    diagnostics.pythonYtDlp = false;
  }

  // Quick yt-dlp self-test with a known URL
  try {
    const testOutput = execSync(
      'yt-dlp --dump-json --no-playlist --playlist-items 1 "https://www.youtube.com/watch?v=jNQXAC9IVRw" 2>&1',
      { stdio: "pipe", timeout: 30000 }
    ).toString().trim();

    try {
      const json = JSON.parse(testOutput);
      diagnostics.testVideo = { title: json.title, id: json.id };
    } catch {
      diagnostics.testStderr = testOutput.substring(0, 800);
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    diagnostics.testError = {
      message: e.message?.substring(0, 300),
      stderr: e.stderr?.toString().substring(0, 800),
      stdout: e.stdout?.toString().substring(0, 300),
    };
  }

  // Check disk space
  try {
    const df = execSync("df -h /tmp", { stdio: "pipe", timeout: 3000 }).toString().trim();
    diagnostics.disk = df.split("\n")[1]?.split(/\s+/);
  } catch {
    diagnostics.disk = false;
  }

  return NextResponse.json(diagnostics);
}
