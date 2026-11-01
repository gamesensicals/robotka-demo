import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { filePath, readStoredFile, validPutSig, validReadSig } from "@/server/files";

// DEMO: súbory zo servera (namiesto hubu a R2). Čítanie aj nahratie len s podpisom zo servera.
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  svg: "image/svg+xml", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", pdf: "application/pdf",
};

const keyOf = async (params: Promise<{ key: string[] }>) => (await params).key.map(decodeURIComponent).join("/");

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = await keyOf(params);
  const u = new URL(req.url);
  if (!validReadSig(key, Number(u.searchParams.get("exp")), u.searchParams.get("sig") ?? "")) return new Response("Forbidden", { status: 403 });
  const body = readStoredFile(key);
  if (!body) return new Response("Not found", { status: 404 });
  const type = TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=3600",
      // SVG bez skriptov
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = await keyOf(params);
  const u = new URL(req.url);
  const size = Number(u.searchParams.get("size"));
  const type = u.searchParams.get("type") ?? "";
  if (!validPutSig(key, Number(u.searchParams.get("exp")), size, type, u.searchParams.get("sig") ?? "")) return new Response("Forbidden", { status: 403 });
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length !== size) return new Response("Wrong size", { status: 400 });
  const p = filePath(key);
  if (!p) return new Response("Bad key", { status: 400 });
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, body);
  return new Response(null, { status: 200 });
}
