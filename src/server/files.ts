import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SyncError } from "./sync";

// DEMO: fotky a logá ležia na disku servera (DATA_DIR/files). Pri hodinovom resete sa zmažú.
// Prehliadač ich načíta cez /files/<kľúč> s podpisom (rovnaký princíp ako v ostrej Robotke).

export const filesDir = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "files");
/** Cesta na disku; kľúč nesmie vyjsť z priečinka so súbormi. */
export function filePath(key: string): string | null {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) return null;
  return path.join(filesDir(), key);
}
const fileRoute = (key: string) => `/files/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function putFile(key: string, file: File, _contentType?: string): Promise<void> {
  const p = filePath(key);
  if (!p) throw new SyncError("invalid");
  try {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("[files] save failed:", e);
    throw new SyncError("sync_down");
  }
}

export async function deleteFile(key: string): Promise<void> {
  const p = filePath(key);
  if (p) rmSync(p, { force: true });
}

export const readStoredFile = (key: string): Buffer | null => {
  const p = filePath(key);
  try {
    return p ? readFileSync(p) : null;
  } catch {
    return null;
  }
};

const filesSecret = () => process.env.FILES_SECRET || process.env.SESSION_SECRET || "robotka-demo";
const signRead = (key: string, exp: number) => createHmac("sha256", filesSecret()).update(`${key}:${exp}`).digest("hex");

/** Podpísaný odkaz na čítanie (platí do ďalšieho resetu, aj tak sa súbory každú hodinu mažú). */
export function signedFileUrl(key: string): string {
  const exp = Math.floor(Date.now() / 1000) + 2 * 3600;
  return `${fileRoute(key)}?exp=${exp}&sig=${signRead(key, exp)}`;
}
export const validReadSig = (key: string, exp: number, sig: string) => exp * 1000 > Date.now() && safeEq(sig, signRead(key, exp));
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ───────── Nahrávanie priamo z prehliadača ─────────
// Server podpíše presný kľúč, veľkosť a typ; prehliadač súbor pošle rovno do hubu
// (nejde cez server aplikácie, takže nezáleží na veľkosti tela požiadavky Next.js).

// v deme menšie limity (disk na free hostingu je malý)
export const MEDIA_LIMITS = { image: 8_000_000, video: 25_000_000, pdf: 10_000_000 } as const;
export type MediaKind = keyof typeof MEDIA_LIMITS;
export const mediaKind = (type: string): MediaKind | null =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type === "application/pdf" ? "pdf" : null;

/** Odkaz na jedno nahratie (PUT) platný 30 minút. */
export function presignPut(key: string, size: number, type: string): string {
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const sig = createHmac("sha256", filesSecret()).update(`PUT\n${key}\n${exp}\n${size}\n${type}`).digest("hex");
  const q = new URLSearchParams({ exp: String(exp), size: String(size), type, sig });
  return `${fileRoute(key)}?${q}`;
}
export const validPutSig = (key: string, exp: number, size: number, type: string, sig: string) =>
  exp * 1000 > Date.now() && safeEq(sig, createHmac("sha256", filesSecret()).update(`PUT\n${key}\n${exp}\n${size}\n${type}`).digest("hex"));

/** Potvrdenka, že kľúč, veľkosť a typ pochádzajú zo servera (aby sa nedala podvrhnúť veľkosť pre úložisko). */
export const uploadToken = (key: string, size: number, type: string) =>
  createHmac("sha256", filesSecret()).update(`COMMIT\n${key}\n${size}\n${type}`).digest("hex");

export function validUploadToken(key: string, size: number, type: string, token: string): boolean {
  const expected = Buffer.from(uploadToken(key, size, type));
  const got = Buffer.from(token);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Bezpečná prípona súboru pre kľúč v R2. */
export const extOf = (name: string, fallback: string) =>
  name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || fallback;

// Povolené formáty loga (aj SVG – hub ho servíruje s prísnou CSP, takže v ňom nebeží žiadny skript).
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif", "image/avif"];
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.svg,.webp,.gif,.avif," + LOGO_TYPES.join(",");
const LOGO_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

/** Typ loga podľa MIME alebo prípony (niektoré prehliadače pri SVG neposielajú typ). null = nepovolené. */
export function logoType(file: File): string | null {
  if (LOGO_TYPES.includes(file.type)) return file.type;
  return LOGO_EXT[extOf(file.name, "")] ?? null;
}
