import { config, panelValue } from "./config";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { argon2id, argon2Verify } from "hash-wasm";
import { SESSION_COOKIE, SESSION_DAYS, createSessionValue } from "@/lib/session";
import { WEBMASTER } from "./events";

// Heslá: Argon2id (hash-wasm, bez natívnych balíkov – funguje aj na Alpine).
// Hash ide v udalosti cez hub na všetky servery, takže sa dá prihlásiť na ktoromkoľvek z nich.

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456, // KiB, odporúčanie OWASP
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$argon2")) {
    try {
      return await argon2Verify({ password, hash: stored });
    } catch {
      return false;
    }
  }
  // staršie heslá zo vzorky (scrypt)
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, "base64"), expected.length), expected);
}

// ───────── Webmaster ─────────
// Účet webmastra nie je v databáze: e-mail a Argon2 hash hesla sú v .env
// (WEBMASTER_EMAIL, WEBMASTER_PASSWORD_HASH) alebo v paneli (Konfigurácia). Hash vytvorí `npm run hash-password`.
// Hash môže byť priamo "$argon2id$..." alebo v base64 (bez znakov $, ktoré .env a Docker radi rozbijú).

/** E-mail webmastra: z panelu (Konfigurácia), inak z .env. */
export const webmasterEmail = () => config("webmaster_email")?.trim().toLowerCase() || null;

const decodeHash = (raw: string | null | undefined): string | null => {
  const v = raw?.trim();
  if (!v) return null;
  if (v.startsWith("$argon2")) return v;
  const decoded = Buffer.from(v, "base64").toString("utf8");
  return decoded.startsWith("$argon2") ? decoded : null;
};

/**
 * Prihlasovacie údaje webmastra: z panelu aj z .env. Platia oba páry, takže keď sa niečo v paneli
 * pokazí, webmaster sa vždy dostane dnu údajmi z .env.
 */
function webmasterLogins(): { email: string; hash: string }[] {
  const out: { email: string; hash: string }[] = [];
  const envEmail = process.env.WEBMASTER_EMAIL?.trim().toLowerCase();
  const envHash = decodeHash(process.env.WEBMASTER_PASSWORD_HASH);
  const panelEmail = panelValue("webmaster_email")?.trim().toLowerCase() || envEmail;
  const panelHash = decodeHash(panelValue("webmaster_password_hash")) || envHash;
  if (panelEmail && panelHash) out.push({ email: panelEmail, hash: panelHash });
  if (envEmail && envHash) out.push({ email: envEmail, hash: envHash });
  return out;
}

export async function isWebmasterLogin(email: string, password: string): Promise<boolean> {
  for (const l of webmasterLogins()) {
    if (email !== l.email) continue;
    try {
      if (await argon2Verify({ password, hash: l.hash })) return true;
    } catch {
      // zlý hash – skús ďalší
    }
  }
  return false;
}

export async function startSession(userId: string) {
  // webmaster má kratšiu reláciu (1 deň)
  const days = userId === WEBMASTER ? 1 : SESSION_DAYS;
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(userId, days), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: days * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
