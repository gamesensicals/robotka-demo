import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { config } from "@/server/config";
import { WEBMASTER_MAIL_KINDS, parseKinds } from "@/lib/mail-kinds";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr, textOf } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { mailSettings, processOutbox, sealSecret } from "@/server/mailer";
import { mailHistory, mailOf } from "@/server/queries";

const BACK = "/webmaster/mail";

async function saveMail(formData: FormData) {
  "use server";
  await requireWebmaster();
  const port = String(formData.get("smtp_port") ?? "").trim();
  if (port && !/^\d{1,5}$/.test(port)) fail(BACK, "invalid");
  const pass = String(formData.get("smtp_pass") ?? "");
  await submitOr(BACK, {
    type: "mail.settings",
    patch: {
      mail_enabled: formData.get("mail_enabled") === "on",
      smtp_host: textOf(formData, "smtp_host"),
      smtp_port: port ? Number(port) : null,
      smtp_secure: formData.get("smtp_secure") === "on",
      smtp_user: textOf(formData, "smtp_user"),
      // prázdne heslo = nechať pôvodné; do hubu ide len zašifrované
      ...(formData.get("clear_pass") === "on" ? { smtp_pass: null } : pass ? { smtp_pass: sealSecret(pass) } : {}),
      mail_from: textOf(formData, "mail_from"),
      mail_from_name: textOf(formData, "mail_from_name"),
      wm_notify_email: textOf(formData, "wm_notify_email"),
      wm_mail_off: WEBMASTER_MAIL_KINDS.filter((k) => formData.get(`wm_${k}`) !== "on"),
    },
  }, WEBMASTER);
  redirect(`${BACK}?ok=saved`);
}

/** Testovací e-mail sa odošle hneď (tento server si ho zarezervuje) a výsledok sa ukáže. */
async function sendTest(formData: FormData) {
  "use server";
  await requireWebmaster();
  const mailId = randomUUID();
  await submitOr(BACK, { type: "mail.test", mailId, to: String(formData.get("to") ?? "") }, WEBMASTER);
  for (let i = 0; i < 3 && mailOf(mailId)?.status === "pending"; i++) await processOutbox();
  const m = mailOf(mailId);
  redirect(m?.status === "sent" ? `${BACK}?ok=mail_sent` : `${BACK}?error=mail_failed`);
}

export default async function MailSettingsPage() {
  const [, { t, dateTime }] = await Promise.all([requireWebmaster(), getT()]);
  const m = t.mail;
  const s = mailSettings();
  const off = parseKinds(s.wm_mail_off);
  const history = mailHistory(50);
  const wmDefault = config("webmaster_email") ?? "";
  const badge = { sent: "badge-paid", pending: "badge-draft", failed: "badge-cancelled", skipped: "badge-sent" } as const;

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: m.title }]} />

      <form action={saveMail} className="panel">
        <h2 className="panel-title">{m.title}</h2>
        <div className="panel-body">
          <label className="check"><input type="checkbox" name="mail_enabled" defaultChecked={!!s.mail_enabled} /> {m.enabled}</label>
          <fieldset>
            <legend>{m.smtp}</legend>
            <div className="fields">
              <label className="field">{m.host} <input name="smtp_host" defaultValue={s.smtp_host ?? ""} placeholder="smtp.example.com" autoComplete="off" /></label>
              <label className="field">{m.port} <input name="smtp_port" inputMode="numeric" defaultValue={s.smtp_port ?? ""} placeholder="465" /></label>
              <label className="field">{m.user} <input name="smtp_user" defaultValue={s.smtp_user ?? ""} autoComplete="off" /></label>
              <label className="field">{m.password}
                <input name="smtp_pass" type="password" placeholder={s.smtp_pass ? m.passwordKept : ""} autoComplete="new-password" />
              </label>
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <label className="check"><input type="checkbox" name="smtp_secure" defaultChecked={!!s.smtp_secure} /> {m.secure}</label>
              {s.smtp_pass && <label className="check"><input type="checkbox" name="clear_pass" /> {m.clearPassword}</label>}
            </div>
            <p className="muted small-note">{m.passwordHint}</p>
          </fieldset>
          <fieldset>
            <legend>{m.sender}</legend>
            <div className="fields">
              <label className="field">{m.from} <input name="mail_from" type="email" defaultValue={s.mail_from ?? ""} placeholder="noreply@robotka.beer" /></label>
              <label className="field">{m.fromName} <input name="mail_from_name" defaultValue={s.mail_from_name ?? ""} placeholder="Robotka" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{m.webmasterNotes}</legend>
            <div className="fields">
              <label className="field wide">{m.notifyEmail} <input name="wm_notify_email" type="email" defaultValue={s.wm_notify_email ?? ""} placeholder={wmDefault} /></label>
            </div>
            <div className="perm-list" style={{ marginTop: 10 }}>
              {WEBMASTER_MAIL_KINDS.map((k) => (
                <label key={k} className="check"><input type="checkbox" name={`wm_${k}`} defaultChecked={!off.includes(k)} /> {m.kinds[k]}</label>
              ))}
            </div>
          </fieldset>
          <div className="actions"><button className="primary">{t.common.save}</button></div>
        </div>
      </form>

      <form action={sendTest} className="panel">
        <h2 className="panel-title">{m.test}</h2>
        <div className="panel-body">
          <div className="actions">
            <input name="to" type="email" required defaultValue={s.wm_notify_email || wmDefault} aria-label={m.testTo} style={{ maxWidth: 320 }} />
            <button className="primary" disabled={!s.smtp_host}>{m.sendTest}</button>
          </div>
          {!s.smtp_host && <p className="muted small-note">{m.fillFirst}</p>}
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{m.history}</h2>
        <div className="table-wrap">
          <table className="mail-history">
            <thead><tr><th>{t.common.date}</th><th>{m.kind}</th><th>{m.to}</th><th>{m.subject}</th><th>{t.common.status}</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={5} className="empty">{m.noHistory}</td></tr>}
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="nowrap">{dateTime(h.done_at ?? h.created_at)}</td>
                  <td>{m.kinds[h.kind as keyof typeof m.kinds] ?? h.kind}</td>
                  <td className="nowrap">{h.to_addr ?? h.recipient_email ?? (h.recipient === "webmaster" ? m.webmaster : h.recipient.includes("@") ? h.recipient : "–")}</td>
                  <td>{h.subject ?? ""}{h.error && <span className="muted by">{h.error}</span>}</td>
                  <td className="nowrap">
                    <span className={`badge ${badge[h.status]}`}>{m.status[h.status]}</span>
                    {h.status === "pending" && h.due_at > new Date().toISOString() && <span className="muted by">{m.dueAt(dateTime(h.due_at))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body"><p className="muted small-note">{m.historyHint}</p></div>
      </section>
    </>
  );
}
