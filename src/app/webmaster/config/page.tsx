import { hostname } from "node:os";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { MIN_PASSWORD, fail, submitOr } from "@/server/actions";
import { hashPassword, isWebmasterLogin, webmasterEmail } from "@/server/auth";
import { ENV_NAME, SECRET_KEYS, config, configSource } from "@/server/config";
import { type ConfigKey, WEBMASTER } from "@/server/events";
import { sealSecret } from "@/server/secret";

const BACK = "/webmaster/config";
/** Polia, ktoré sa dajú meniť (heslo webmastra má vlastný formulár). */
const EDITABLE: ConfigKey[] = ["polar_access_token", "polar_webhook_secret", "polar_product_id", "polar_server", "app_url", "webmaster_email", "dev_origins"];

async function saveConfig(formData: FormData) {
  "use server";
  await requireWebmaster();
  const patch: Partial<Record<ConfigKey, string | null>> = {};
  for (const k of EDITABLE) {
    if (formData.get(`clear_${k}`) === "on") { patch[k] = null; continue; }
    const v = String(formData.get(k) ?? "").trim();
    if (SECRET_KEYS.includes(k)) {
      if (v) patch[k] = sealSecret(v); // prázdne = nechať pôvodné
    } else if (k === "polar_server") {
      patch[k] = v === "production" || v === "sandbox" ? v : null;
    } else {
      patch[k] = v || null;
    }
  }
  if (patch.app_url && !/^https?:\/\/[^\s/]+/.test(patch.app_url)) fail(BACK, "invalid");
  if (patch.app_url) patch.app_url = patch.app_url.replace(/\/+$/, "");
  await submitOr(BACK, { type: "config.set", patch }, WEBMASTER);
  redirect(`${BACK}?ok=saved`);
}

async function changeWebmasterPassword(formData: FormData) {
  "use server";
  await requireWebmaster();
  const email = webmasterEmail() ?? "";
  const next = String(formData.get("new") ?? "");
  if (!(await isWebmasterLogin(email, String(formData.get("current") ?? "")))) fail(BACK, "wrong_password");
  if (next.length < MIN_PASSWORD) fail(BACK, "weak_password");
  if (next !== String(formData.get("repeat") ?? "")) fail(BACK, "password_mismatch");
  await submitOr(BACK, { type: "config.set", patch: { webmaster_password_hash: await hashPassword(next) } }, WEBMASTER);
  redirect(`${BACK}?ok=password_changed`);
}

/** Heslo z panelu zrušiť – platí zase heslo z .env. */
async function clearWebmasterPassword() {
  "use server";
  await requireWebmaster();
  await submitOr(BACK, { type: "config.set", patch: { webmaster_password_hash: null } }, WEBMASTER);
  redirect(`${BACK}?ok=saved`);
}

export default async function ConfigPage() {
  const [, { t }] = await Promise.all([requireWebmaster(), getT()]);
  const k = t.config;
  const src = (key: ConfigKey) => {
    const s = configSource(key);
    return <span className={`badge ${s === "panel" ? "badge-paid" : s === "env" ? "badge-sent" : "badge-draft"}`}>{k.sources[s ?? "none"]}</span>;
  };
  const label = (key: ConfigKey, text: string) => (
    <span className="cfg-label">{text} <code className="muted">{ENV_NAME[key]}</code> {src(key)}</span>
  );
  const clear = (key: ConfigKey) =>
    configSource(key) === "panel" && <label className="check small-note"><input type="checkbox" name={`clear_${key}`} /> {k.useEnv}</label>;
  const secret = (key: ConfigKey, text: string) => (
    <label className="field">{label(key, text)}
      <input name={key} type="password" autoComplete="new-password" placeholder={config(key) ? k.secretKept : ""} />
      {clear(key)}
    </label>
  );
  const plain = (key: ConfigKey, text: string, extra?: { placeholder?: string; type?: string }) => (
    <label className="field">{label(key, text)}
      <input name={key} type={extra?.type ?? "text"} defaultValue={configSource(key) === "panel" ? config(key) ?? "" : ""} placeholder={config(key) ?? extra?.placeholder ?? ""} />
      {clear(key)}
    </label>
  );
  const info: [string, string][] = [
    ["HUB_URL", process.env.HUB_URL ?? "–"],
    ["HUB_PUBLIC_URL", process.env.HUB_PUBLIC_URL || "–"],
    ["SERVER_NAME", process.env.SERVER_NAME || hostname()],
    ["DATA_DIR", process.env.DATA_DIR || "./data"],
    ["DOMAIN", process.env.DOMAIN || "–"],
  ];

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: k.title }]} />

      <form action={saveConfig} className="panel">
        <h2 className="panel-title">{k.title}</h2>
        <div className="panel-body">
          <p className="muted small-note">{k.hint}</p>
          <fieldset>
            <legend>{k.polar}</legend>
            <div className="fields">
              {secret("polar_access_token", k.polarToken)}
              {secret("polar_webhook_secret", k.polarWebhook)}
              {plain("polar_product_id", k.polarProduct)}
              <label className="field">{label("polar_server", k.polarServer)}
                <select name="polar_server" defaultValue={configSource("polar_server") === "panel" ? config("polar_server") : ""}>
                  <option value="">{k.fromEnv(process.env.POLAR_SERVER || "production")}</option>
                  <option value="production">production</option>
                  <option value="sandbox">sandbox</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{k.app}</legend>
            <div className="fields">
              {plain("app_url", k.appUrl, { placeholder: "https://robotka.beer" })}
              {plain("webmaster_email", k.webmasterEmail, { type: "email" })}
              {plain("dev_origins", k.devOrigins, { placeholder: "192.168.1.20" })}
            </div>
            <p className="muted small-note">{k.devHint}</p>
          </fieldset>
          <div className="actions"><button className="primary">{t.common.save}</button></div>
        </div>
      </form>

      <form action={changeWebmasterPassword} className="panel">
        <h2 className="panel-title spread-title"><span>{k.password}</span><span className="title-stats">{src("webmaster_password_hash")}</span></h2>
        <div className="panel-body">
          <div className="fields">
            <label className="field wide">{t.account.current} <input name="current" type="password" required autoComplete="current-password" /></label>
            <label className="field">{t.account.new} <input name="new" type="password" minLength={10} required autoComplete="new-password" /></label>
            <label className="field">{t.account.repeat} <input name="repeat" type="password" minLength={10} required autoComplete="new-password" /></label>
          </div>
          <p className="muted small-note">{k.passwordHint}</p>
          <div className="actions">
            <button className="primary">{t.common.save}</button>
            {configSource("webmaster_password_hash") === "panel" && (
              <button formAction={clearWebmasterPassword} formNoValidate className="small">{k.useEnv}</button>
            )}
          </div>
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{k.serverTitle}</h2>
        <dl className="stats">
          {info.map(([n, v]) => [<dt key={n}><code>{n}</code></dt>, <dd key={`${n}-v`}>{v}</dd>])}
        </dl>
        <div className="panel-body"><p className="muted small-note">{k.serverHint}</p></div>
      </section>
    </>
  );
}
