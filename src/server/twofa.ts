import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TWOFA_COOKIE, TWOFA_SECONDS, createPendingValue, verifyPending } from "@/lib/session";
import { config } from "./config";
import { WEBMASTER } from "./events";
import { userTotp } from "./queries";
import { openSecret } from "./secret";
import { looksLikeRecovery, recoveryHash, verifyTotp } from "./totp";

// Dvojstupňové prihlásenie: kto ho má zapnuté, druhý krok po hesle a overenie kódu.

/** Rozpracované zapnutie (zašifrovaný kľúč) a práve vytvorené záložné kódy – obe najviac 10 minút. */
export const SETUP_COOKIE = "robotka_2fa_setup";
export const CODES_COOKIE = "robotka_2fa_codes";

/** Kľúč a hashe záložných kódov (webmaster: z Konfigurácie alebo .env). null = vypnuté. */
export function secondFactor(userId: string): { secret: string; recovery: string[] } | null {
  if (userId === WEBMASTER) {
    const secret = config("webmaster_totp");
    if (!secret) return null;
    return { secret, recovery: JSON.parse(config("webmaster_totp_recovery") || "[]") as string[] };
  }
  const t = userTotp(userId);
  const secret = openSecret(t?.totp_secret);
  return secret ? { secret, recovery: JSON.parse(t?.totp_recovery ?? "[]") as string[] } : null;
}

/** Po správnom hesle: ak má človek zapnutý druhý krok, pošle ho naň (inak nič neurobí). */
export async function requireSecondStep(userId: string, next: string) {
  if (!secondFactor(userId)) return;
  (await cookies()).set(TWOFA_COOKIE, await createPendingValue(userId), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: TWOFA_SECONDS,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  });
  redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
}

/** Koho kód práve overujeme (null = vypršalo). */
export async function pendingUser(): Promise<string | null> {
  return verifyPending((await cookies()).get(TWOFA_COOKIE)?.value);
}

/** Overí kód z aplikácie alebo záložný kód. Pri záložnom vráti jeho hash (treba ho zneplatniť). */
export function checkCode(userId: string, input: string): { ok: false } | { ok: true; recoveryHash?: string } {
  const f = secondFactor(userId);
  if (!f) return { ok: false };
  if (verifyTotp(f.secret, input)) return { ok: true };
  if (looksLikeRecovery(input)) {
    const h = recoveryHash(userId, input);
    if (f.recovery.includes(h)) return { ok: true, recoveryHash: h };
  }
  return { ok: false };
}
