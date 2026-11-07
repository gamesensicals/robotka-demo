"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/company";
import { isWebmasterLogin, verifyPassword, webmasterEmail } from "@/server/auth";
import { fail, submitOr } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { passwordHashOf } from "@/server/queries";
import { openSecret, sealSecret } from "@/server/secret";
import { newRecoveryCodes, newTotpSecret, recoveryHash, verifyTotp } from "@/server/totp";
import { CODES_COOKIE, SETUP_COOKIE, checkCode, secondFactor } from "@/server/twofa";

// Zapnutie / vypnutie dvojstupňového prihlásenia (Môj účet; webmaster v Konfigurácii).
// Komu sa to deje, sa nikdy neberie z formulára – len z prihlásenia.

const TEN_MIN = 600;
const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: TEN_MIN, secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false" };

/** Kto mení svoje dvojstupňové prihlásenie a kam sa vrátiť. */
async function who(formData: FormData): Promise<{ owner: string; back: string }> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (formData.get("scope") === "webmaster") {
    if (!v.isWebmaster) redirect("/login");
    return { owner: WEBMASTER, back: "/webmaster/config#twofa" };
  }
  if (v.isWebmaster) redirect("/webmaster/config#twofa");
  return { owner: v.user.id, back: "/account#twofa" };
}
const withOk = (back: string, ok: string) => back.replace("#", `?ok=${ok}#`);

/** Uloží kľúč a hashe záložných kódov (používateľ: udalosť; webmaster: Konfigurácia). */
async function store(owner: string, back: string, secret: string, codes: string[]) {
  const hashes = codes.map((c) => recoveryHash(owner, c));
  if (owner === WEBMASTER) {
    await submitOr(back, { type: "config.set", patch: { webmaster_totp: sealSecret(secret), webmaster_totp_recovery: JSON.stringify(hashes) } }, WEBMASTER);
  } else {
    await submitOr(back, { type: "user.totp.set", secret: sealSecret(secret), recovery: hashes }, owner);
  }
  (await cookies()).set(CODES_COOKIE, sealSecret(JSON.stringify({ owner, codes })), cookieOpts);
}

export async function beginTwoFa(formData: FormData) {
  const { back } = await who(formData);
  (await cookies()).set(SETUP_COOKIE, sealSecret(newTotpSecret()), cookieOpts);
  redirect(back);
}

export async function cancelTwoFa(formData: FormData) {
  const { back } = await who(formData);
  (await cookies()).delete(SETUP_COOKIE);
  redirect(back);
}

export async function confirmTwoFa(formData: FormData) {
  const { owner, back } = await who(formData);
  const secret = openSecret((await cookies()).get(SETUP_COOKIE)?.value);
  if (!secret) fail(back, "twofa_expired");
  if (!verifyTotp(secret, String(formData.get("code") ?? ""))) fail(back, "wrong_code");
  await store(owner, back, secret, newRecoveryCodes());
  (await cookies()).delete(SETUP_COOKIE);
  redirect(withOk(back, "totp_on"));
}

export async function newTwoFaCodes(formData: FormData) {
  const { owner, back } = await who(formData);
  const f = secondFactor(owner);
  if (!f) redirect(back);
  if (!checkCode(owner, String(formData.get("code") ?? "")).ok) fail(back, "wrong_code");
  await store(owner, back, f.secret, newRecoveryCodes());
  redirect(withOk(back, "totp_codes"));
}

export async function disableTwoFa(formData: FormData) {
  const { owner, back } = await who(formData);
  const password = String(formData.get("password") ?? "");
  const passOk = owner === WEBMASTER
    ? await isWebmasterLogin(webmasterEmail() ?? "", password)
    : await verifyPassword(password, passwordHashOf(owner) ?? "");
  if (!passOk) fail(back, "wrong_password");
  if (!checkCode(owner, String(formData.get("code") ?? "")).ok) fail(back, "wrong_code");
  if (owner === WEBMASTER) {
    await submitOr(back, { type: "config.set", patch: { webmaster_totp: null, webmaster_totp_recovery: null } }, WEBMASTER);
  } else {
    await submitOr(back, { type: "user.totp.clear", userId: owner }, owner);
  }
  redirect(withOk(back, "totp_off"));
}

export async function dismissTwoFaCodes(formData: FormData) {
  const { back } = await who(formData);
  (await cookies()).delete(CODES_COOKIE);
  redirect(back);
}
