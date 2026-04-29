import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  try {
    execSync("yt-dlp --version", { stdio: "pipe", timeout: 5000 });
    return NextResponse.json({ status: "ok", ytDlp: true });
  } catch {
    return NextResponse.json({ status: "degraded", ytDlp: false }, { status: 503 });
  }
}
