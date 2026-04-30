import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { fileStore } from "../prepare/route";

export async function GET(request: NextRequest) {
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const entry = fileStore.get(fileId);
  if (!entry || entry.expires < Date.now()) {
    if (entry) fileStore.delete(fileId);
    return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
  }

  try {
    const fileBuffer = await readFile(entry.path);
    const name = entry.path.split("/").pop() || "video.mp4";
    const safeName = name.replace(/[<>:"/\\|?*]/g, "_");

    // Clean up after serving
    fileStore.delete(fileId);
    const dir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    try {
      await unlink(entry.path);
      const { rmdir } = await import("fs/promises");
      await rmdir(dir);
    } catch { /* ignore cleanup errors */ }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(`[file] error:`, err instanceof Error ? err.message : String(err));
    fileStore.delete(fileId);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
