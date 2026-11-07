import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { TWOFA_COOKIE } from "@/lib/session";
import { startSession } from "@/server/auth";
import { fail, submitOr } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { blocked, failKey, hit } from "@/server/ratelimit";
import { checkCode, pendingUser, secondFactor } from "@/server/twofa";

// Prihlásenie, druhý krok: kód z aplikácie v mobile alebo záložný kód.
const safeNext = (v: unknown) => {
  const s = String(v ?? "/");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

async function verify(formData: FormData) {
  "use server";
  const next = safeNext(formData.get("next"));
  const back = `/login/2fa?next=${encodeURIComponent(next)}`;
  const userId = await pendingUser();
  if (!userId) fail("/login", "twofa_expired");
  // limit pokusov na IP aj na účet (6-miestny kód sa nedá skúšať donekonečna)
  const ipKey = await failKey("2fa");
  const userKey = `2fa:${userId}`;
  if (blocked(ipKey, 10, 10 * 60_000) || blocked(userKey, 6, 15 * 60_000)) fail(back, "too_many");
  const res = checkCode(userId, String(formData.get("code") ?? ""));
  if (!res.ok) {
    hit(ipKey);
    hit(userKey);
    fail(back, "wrong_code");
  }
  if (res.recoveryHash) {
    // záložný kód platí raz
    if (userId === WEBMASTER) {
      const left = (secondFactor(WEBMASTER)?.recovery ?? []).filter((h) => h !== res.recoveryHash);
      await submitOr(back, { type: "config.set", patch: { webmaster_totp_recovery: JSON.stringify(left) } }, WEBMASTER);
    } else {
      await submitOr(back, { type: "user.totp.useRecovery", hash: res.recoveryHash }, userId);
    }
  }
  (await cookies()).delete(TWOFA_COOKIE);
  await startSession(userId);
  redirect(next);
}

export default async function TwoFactor({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, { t }] = await Promise.all([searchParams, getT()]);
  if (!(await pendingUser())) redirect("/login?error=twofa_expired");
  const l = t.login;
  return (
    <form action={verify} className="panel narrow">
      <h2 className="panel-title">{l.twoFaTitle}</h2>
      <div className="panel-body">
        <input type="hidden" name="next" value={safeNext(next)} />
        <p className="muted">{l.twoFaText}</p>
        <div className="fields">
          <label className="field wide">{l.twoFaCode}
            <input name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={20} placeholder="123456" />
          </label>
        </div>
        <p className="muted small-note" style={{ marginTop: 8 }}>{l.twoFaRecoveryHint}</p>
        <div className="actions spread" style={{ marginTop: 14 }}>
          <button className="primary">{l.twoFaVerify}</button>
          <Link href="/login">{l.twoFaBack}</Link>
        </div>
      </div>
    </form>
  );
}
