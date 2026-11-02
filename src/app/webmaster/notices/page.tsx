import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { isoToLocal, localToIso } from "@/lib/tz";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr, textOf } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { type Notice, allNotices } from "@/server/queries";

const BACK = "/webmaster/notices";
const AUDIENCES = ["all", "owners", "members"] as const;

async function saveNotice(formData: FormData) {
  "use server";
  await requireWebmaster();
  const starts = localToIso(String(formData.get("starts_at") ?? ""));
  const ends = localToIso(String(formData.get("ends_at") ?? ""));
  const audience = String(formData.get("audience"));
  if (!starts || !ends || ends <= starts) fail(BACK, "notice_dates");
  if (!(AUDIENCES as readonly string[]).includes(audience)) fail(BACK, "invalid");
  const texts = { text_sk: textOf(formData, "text_sk"), text_en: textOf(formData, "text_en"), text_cs: textOf(formData, "text_cs") };
  if (!texts.text_sk && !texts.text_en && !texts.text_cs) fail(BACK, "notice_text");
  await submitOr(BACK, {
    type: "notice.save",
    notice: {
      id: String(formData.get("id") || "") || randomUUID(),
      starts_at: starts!, ends_at: ends!,
      audience: audience as Notice["audience"],
      dismissible: formData.get("dismissible") === "on",
      ...texts,
    },
  }, WEBMASTER);
  redirect(`${BACK}?ok=notice_saved`);
}

async function deleteNotice(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(BACK, { type: "notice.delete", noticeId: String(formData.get("id")) }, WEBMASTER);
  redirect(`${BACK}?ok=notice_deleted`);
}

export default async function NoticesPage() {
  const [, { t, dateTime }] = await Promise.all([requireWebmaster(), getT()]);
  const nt = t.notices;
  const notices = allNotices();
  const now = new Date().toISOString();
  const state = (n: Notice) => (n.ends_at <= now ? "ended" : n.starts_at > now ? "planned" : "active");
  const badge = { active: "badge-paid", planned: "badge-draft", ended: "badge-cancelled" } as const;
  const hour = 3_600_000;
  const defaults = { starts: isoToLocal(new Date(Math.ceil(Date.now() / hour) * hour).toISOString()), ends: isoToLocal(new Date(Math.ceil(Date.now() / hour) * hour + 24 * hour).toISOString()) };

  const form = (n?: Notice) => (
    <form action={saveNotice} className="panel-body notice-form">
      {n && <input type="hidden" name="id" value={n.id} />}
      <div className="fields">
        <label className="field">{nt.from} <input type="datetime-local" name="starts_at" required defaultValue={n ? isoToLocal(n.starts_at) : defaults.starts} /></label>
        <label className="field">{nt.to} <input type="datetime-local" name="ends_at" required defaultValue={n ? isoToLocal(n.ends_at) : defaults.ends} /></label>
        <label className="field">{nt.audience}
          <select name="audience" defaultValue={n?.audience ?? "all"}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{nt.audiences[a]}</option>)}
          </select>
        </label>
      </div>
      <p className="muted small-note">{nt.timeHint}</p>
      <label className="check" style={{ margin: "10px 0" }}>
        <input type="checkbox" name="dismissible" defaultChecked={n ? !!n.dismissible : true} /> {nt.dismissible}
      </label>
      <div className="fields">
        <label className="field wide">{nt.textSk} <textarea name="text_sk" rows={3} maxLength={4000} defaultValue={n?.text_sk ?? ""} /></label>
        <label className="field wide">{nt.textEn} <textarea name="text_en" rows={3} maxLength={4000} defaultValue={n?.text_en ?? ""} /></label>
        <label className="field wide">{nt.textCs} <textarea name="text_cs" rows={3} maxLength={4000} defaultValue={n?.text_cs ?? ""} /></label>
      </div>
      <p className="muted small-note">{nt.textHint}</p>
      <div className="actions" style={{ marginTop: 12 }}><button className="primary">{t.common.save}</button></div>
    </form>
  );

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: nt.title }]} />

      <details className="panel create" open={notices.length === 0}>
        <summary className="panel-title">＋ {nt.newNotice}</summary>
        {form()}
      </details>

      <section className="panel">
        <h2 className="panel-title">{nt.title}</h2>
        <div className="table-wrap">
          <table className="notices-table">
            <thead><tr><th>{nt.when}</th><th>{nt.audience}</th><th>{nt.text}</th><th>{t.common.status}</th><th /></tr></thead>
            <tbody>
              {notices.length === 0 && <tr><td colSpan={5} className="empty">{nt.empty}</td></tr>}
              {notices.map((n) => {
                const st = state(n);
                return [
                  <tr key={n.id}>
                    <td className="nowrap">{dateTime(n.starts_at)}<span className="muted by">– {dateTime(n.ends_at)}</span></td>
                    <td className="m-left">{nt.audiences[n.audience]}<span className="muted by">{n.dismissible ? nt.canClose : nt.cannotClose}</span></td>
                    <td className="notice-preview">{n.text_sk || n.text_en || n.text_cs}</td>
                    <td><span className={`badge ${badge[st]}`}>{nt.states[st]}</span></td>
                    <td className="num">
                      <form action={deleteNotice}>
                        <input type="hidden" name="id" value={n.id} />
                        <ConfirmSubmit label={t.common.delete} className="danger small" question={t.confirm.deleteNoticeQ} yes={t.common.delete} no={t.confirm.cancel} />
                      </form>
                    </td>
                  </tr>,
                  <tr key={`${n.id}-edit`} className="perm-row">
                    <td colSpan={5}>
                      <details className="perms">
                        <summary>{nt.edit}</summary>
                        {form(n)}
                      </details>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <div className="panel-body"><p className="muted small-note">{nt.hint}</p></div>
      </section>
    </>
  );
}
