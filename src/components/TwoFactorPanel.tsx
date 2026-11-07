import { cookies } from "next/headers";
import QRCode from "qrcode";
import { getT } from "@/i18n";
import { beginTwoFa, cancelTwoFa, confirmTwoFa, disableTwoFa, dismissTwoFaCodes, newTwoFaCodes } from "@/app/account/twofa-actions";
import { configSource } from "@/server/config";
import { WEBMASTER } from "@/server/events";
import { userTotp } from "@/server/queries";
import { openSecret } from "@/server/secret";
import { otpauthUrl } from "@/server/totp";
import { CODES_COOKIE, SETUP_COOKIE, secondFactor } from "@/server/twofa";

/** Dvojstupňové prihlásenie: zapnutie (QR kód), záložné kódy, vypnutie. owner = id používateľa alebo webmaster. */
export default async function TwoFactorPanel({ owner, account }: { owner: string; account: string }) {
  const [{ t, date }, jar] = await Promise.all([getT(), cookies()]);
  const f = t.twoFa;
  const scope = <input type="hidden" name="scope" value={owner === WEBMASTER ? "webmaster" : "user"} />;
  const factor = secondFactor(owner);
  const since = owner === WEBMASTER ? null : userTotp(owner)?.totp_at;
  const fromEnv = owner === WEBMASTER && configSource("webmaster_totp") === "env";
  // práve zapnuté / nové záložné kódy: ukážu sa raz (kým ich človek nepotvrdí, najviac 10 minút)
  let codes: string[] | null = null;
  try {
    const c = JSON.parse(openSecret(jar.get(CODES_COOKIE)?.value) ?? "null") as { owner: string; codes: string[] } | null;
    if (c?.owner === owner) codes = c.codes;
  } catch { /* poškodená cookie = nič */ }
  const setupSecret = !factor ? openSecret(jar.get(SETUP_COOKIE)?.value) : null;
  const qr = setupSecret ? await QRCode.toDataURL(otpauthUrl(account, setupSecret), { margin: 1, width: 200 }) : null;

  return (
    <section className="panel" id="twofa">
      <h2 className="panel-title spread-title">
        <span>{f.title}</span>
        <span className="title-stats">{factor ? (since ? f.onSince(date(since)) : f.on) : f.off}</span>
      </h2>
      <div className="panel-body">
        {codes ? (
          <>
            <h3 className="twofa-h">{f.codesTitle}</h3>
            <p className="muted">{f.codesHint}</p>
            <ul className="twofa-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
            <form action={dismissTwoFaCodes} className="actions">{scope}<button className="primary">{f.saved}</button></form>
          </>
        ) : factor ? (
          <>
            {owner !== WEBMASTER || !fromEnv ? <p className="muted">{f.left(factor.recovery.length)}</p> : <p className="muted">{f.envNote}</p>}
            {!fromEnv && (
              <div className="cols-2 twofa-forms">
                <form action={newTwoFaCodes}>
                  {scope}
                  <fieldset>
                    <legend>{f.newCodes}</legend>
                    <p className="muted small-note">{f.newCodesHint}</p>
                    <div className="fields">
                      <label className="field wide">{f.code} <input name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={20} /></label>
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}><button>{f.newCodes}</button></div>
                  </fieldset>
                </form>
                <form action={disableTwoFa}>
                  {scope}
                  <fieldset>
                    <legend>{f.disable}</legend>
                    <p className="muted small-note">{f.disableHint}</p>
                    <div className="fields">
                      <label className="field">{f.password} <input name="password" type="password" required autoComplete="current-password" /></label>
                      <label className="field">{f.code} <input name="code" required autoComplete="one-time-code" maxLength={20} /></label>
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}><button className="danger">{f.disable}</button></div>
                  </fieldset>
                </form>
              </div>
            )}
          </>
        ) : setupSecret && qr ? (
          <form action={confirmTwoFa}>
            {scope}
            <p>{f.scan}</p>
            <div className="twofa-setup">
              <img src={qr} alt="QR" width={200} height={200} />
              <p className="muted small-note">{f.key}: <code className="twofa-key">{setupSecret.replace(/(.{4})/g, "$1 ").trim()}</code></p>
            </div>
            <p style={{ marginTop: 12 }}>{f.enter}</p>
            <div className="fields">
              <label className="field">{f.code} <input name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="123456" /></label>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="primary">{f.confirm}</button>
              <button formAction={cancelTwoFa} formNoValidate>{f.cancel}</button>
            </div>
          </form>
        ) : (
          <form action={beginTwoFa}>
            {scope}
            <p className="muted">{f.intro}</p>
            <div className="actions"><button className="primary">{f.enable}</button></div>
          </form>
        )}
      </div>
    </section>
  );
}
