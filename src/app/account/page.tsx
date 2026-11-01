import { redirect } from "next/navigation";
import { getViewer } from "@/lib/company";
import { MAIL_LANGS, OWNER_MAIL_KINDS, parseKinds } from "@/lib/mail-kinds";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { MIN_PASSWORD, fail, submitOr } from "@/server/actions";
import { hashPassword, verifyPassword } from "@/server/auth";
import { loginName, passwordHashOf, userMailPrefs } from "@/server/queries";

const BACK = "/account";

async function changePassword(formData: FormData) {
  "use server";
  const viewer = await getViewer();
  if (!viewer || viewer.isWebmaster) redirect("/login");
  const hash = passwordHashOf(viewer.user.id);
  const next = String(formData.get("new") ?? "");
  if (!hash || !(await verifyPassword(String(formData.get("current") ?? ""), hash))) fail(BACK, "wrong_password");
  if (next.length < MIN_PASSWORD) fail(BACK, "weak_password");
  if (next !== String(formData.get("repeat") ?? "")) fail(BACK, "password_mismatch");
  await submitOr(BACK, { type: "user.setPassword", userId: viewer.user.id, password_hash: await hashPassword(next) }, viewer.user.id);
  redirect(`${BACK}?ok=password_changed`);
}

/** E-mailové upozornenia: čo chodí a v akom jazyku (len majitelia – členovia tímu e-mail nemajú). */
async function saveMailPrefs(formData: FormData) {
  "use server";
  const viewer = await getViewer();
  if (!viewer || viewer.isWebmaster || !viewer.user.email) redirect("/login");
  await submitOr(BACK, {
    type: "mail.prefs",
    off: OWNER_MAIL_KINDS.filter((k) => formData.get(`mail_${k}`) !== "on"),
    lang: String(formData.get("mail_lang") ?? "sk"),
  }, viewer.user.id);
  redirect(`${BACK}?ok=saved`);
}

export default async function Account() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { t } = await getT();
  const a = t.account;
  return (
    <>
      <Crumbs items={[{ label: a.title }]} />
      <section className="panel">
        <h2 className="panel-title">{a.title}</h2>
        <dl className="stats">
          <dt>{viewer.role === "member" && viewer.user.username ? t.team.username : t.common.email}</dt><dd>{loginName({ ...viewer.user, role: viewer.role })}</dd>
          {viewer.company && <><dt>{t.common.company}</dt><dd>{viewer.company.name}</dd></>}
          {viewer.company && viewer.role === "member" && <><dt>{t.team.code}</dt><dd>{viewer.company.login_code}</dd></>}
          <dt>{a.role}</dt><dd>{viewer.isWebmaster ? t.nav.webmaster : viewer.role ? t.role[viewer.role] : "–"}</dd>
        </dl>
      </section>
      {!viewer.isWebmaster && viewer.user.email && (() => {
        const prefs = userMailPrefs(viewer.user.id);
        const off = parseKinds(prefs?.mail_off);
        return (
          <form action={saveMailPrefs} className="panel">
            <h2 className="panel-title">{a.mailTitle}</h2>
            <div className="panel-body">
              <div className="perm-list">
                {OWNER_MAIL_KINDS.map((k) => (
                  <label key={k} className="check"><input type="checkbox" name={`mail_${k}`} defaultChecked={!off.includes(k)} /> {t.mail.kinds[k]}</label>
                ))}
              </div>
              <p className="muted small-note">{a.mailAlways}</p>
              <div className="actions">
                <label className="field">{a.mailLang}
                  <select name="mail_lang" defaultValue={prefs?.mail_lang ?? "sk"}>
                    {MAIL_LANGS.map((l) => <option key={l} value={l}>{a.langs[l]}</option>)}
                  </select>
                </label>
              </div>
              <div className="actions" style={{ marginTop: 12 }}><button className="primary">{t.common.save}</button></div>
            </div>
          </form>
        );
      })()}
      {/* DEMO: heslo sa nemení, aby si ostatní mohli demo skúšať tými istými údajmi */}
      <section className="panel"><h2 className="panel-title">{a.changePassword}</h2><div className="panel-body"><p className="muted">{t.demo.passwordNote}</p></div></section>
      {false && (
        <form action={changePassword} className="panel">
          <h2 className="panel-title">{a.changePassword}</h2>
          <div className="panel-body">
            <fieldset>
              <legend>{a.changePassword}</legend>
              <div className="fields">
                <label className="field wide">{a.current} <input name="current" type="password" required autoComplete="current-password" /></label>
                <label className="field">{a.new} <input name="new" type="password" minLength={10} required autoComplete="new-password" /></label>
                <label className="field">{a.repeat} <input name="repeat" type="password" minLength={10} required autoComplete="new-password" /></label>
              </div>
            </fieldset>
            <div className="actions"><button className="primary">{t.common.save}</button></div>
          </div>
        </form>
      )}
    </>
  );
}
