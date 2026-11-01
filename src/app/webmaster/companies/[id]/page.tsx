import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { fmtBytes } from "@/lib/format";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { MIN_PASSWORD, fail, submitOr, textOf } from "@/server/actions";
import { hashPassword } from "@/server/auth";
import { monthEstimate } from "@/server/credits";
import { TICKET_PRIORITIES, type TicketAudience, type TicketPriority, WEBMASTER } from "@/server/events";
import { deleteFile } from "@/server/files";
import { startBypass } from "../../bypass-actions";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import TeamTable from "@/components/team/TeamTable";
import { companyFiles, creditHistory, getCompany, isReadOnly, listMembers, loginName, pendingTopups } from "@/server/queries";

const backOf = (formData: FormData) => `/webmaster/companies/${String(formData.get("company_id"))}`;
const idOf = (formData: FormData) => String(formData.get("company_id"));

async function addCredit(formData: FormData) {
  "use server";
  await requireWebmaster();
  const back = backOf(formData);
  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(",", ".")) * 100);
  if (!Number.isFinite(amount) || amount === 0) fail(back, "invalid");
  await submitOr(back, {
    type: "credit.add",
    companyId: idOf(formData),
    amount_cents: amount,
    kind: formData.get("kind") === "adjust" || amount < 0 ? "adjust" : "topup",
    note: textOf(formData, "note"),
    ref: null,
    topupRequestId: textOf(formData, "topup_id"),
  }, WEBMASTER);
  redirect(`${back}?ok=credit_added`);
}

async function cancelTopup(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(backOf(formData), { type: "topup.cancel", companyId: idOf(formData), requestId: String(formData.get("topup_id")) }, WEBMASTER);
  redirect(`${backOf(formData)}?ok=topup_cancelled`);
}

async function setSuspended(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(backOf(formData), { type: "company.setSuspended", companyId: idOf(formData), suspended: formData.get("suspended") === "1" }, WEBMASTER);
  redirect(`${backOf(formData)}?ok=${formData.get("suspended") === "1" ? "suspended" : "unsuspended"}`);
}


async function setBlocked(formData: FormData) {
  "use server";
  await requireWebmaster();
  const blocked = formData.get("blocked") === "1";
  await submitOr(backOf(formData), { type: "company.setBlocked", companyId: idOf(formData), blocked }, WEBMASTER);
  redirect(`${backOf(formData)}?ok=${blocked ? "blocked" : "unblocked"}`);
}

/** Zmaže firmu so všetkými údajmi a účtami; súbory potom zmaže z úložiska. */
async function deleteCompany(formData: FormData) {
  "use server";
  await requireWebmaster();
  const id = idOf(formData);
  const files = companyFiles(id);
  await submitOr(backOf(formData), { type: "company.delete", companyId: id }, WEBMASTER);
  for (const f of files) await deleteFile(f);
  redirect("/webmaster?ok=company_deleted");
}

/** Webmaster začne chat s firmou: celá firma, podpora (majitelia + oprávnenie) alebo vybraní ľudia. */
async function openChat(formData: FormData) {
  "use server";
  await requireWebmaster();
  const back = backOf(formData);
  const audience = String(formData.get("audience")) as TicketAudience;
  const ticketId = randomUUID();
  await submitOr(back, {
    type: "ticket.open",
    companyId: idOf(formData),
    ticket: { id: ticketId, subject: String(formData.get("subject") ?? ""), priority: String(formData.get("priority") ?? "normal") as TicketPriority },
    message: { id: randomUUID(), body: String(formData.get("body") ?? "") },
    audience,
    recipients: audience === "people" ? formData.getAll("recipient").map(String) : [],
  }, WEBMASTER);
  redirect(`/webmaster/support/${ticketId}?ok=ticket_opened`);
}

async function newCode(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(backOf(formData), { type: "company.newCode", companyId: idOf(formData) }, WEBMASTER);
  redirect(`${backOf(formData)}?ok=code_changed`);
}



async function setPrimaryOwner(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(backOf(formData), { type: "company.setPrimaryOwner", companyId: idOf(formData), userId: String(formData.get("user_id")) }, WEBMASTER);
  redirect(`${backOf(formData)}?ok=primary_changed`);
}


export default async function CompanyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ chat?: string }> }) {
  const [{ id }, , { t, credits, date, locale }, sp] = await Promise.all([params, requireWebmaster(), getT(), searchParams]);
  const company = getCompany(id);
  if (!company) notFound();
  const w = t.webmaster;
  const c = t.credits;
  const members = listMembers(id);
  const pending = pendingTopups(id);
  const history = creditHistory(id, 50);
  const est = monthEstimate(company);
  const hidden = <input type="hidden" name="company_id" value={id} />;

  return (
    <>
      <Crumbs items={[{ label: w.title, href: "/webmaster" }, { label: company.name }]} />

      <section className="panel">
        <h2 className="panel-title">{company.name}</h2>
        <dl className="stats">
          <dt>{c.balance}</dt><dd className={company.credit_cents < 0 ? "neg" : undefined}>{credits(company.credit_cents)}</dd>
          <dt>{c.status}</dt><dd>{company.blocked ? <span className="badge badge-cancelled">{w.blockedState}</span> : company.suspended ? c.suspended : isReadOnly(company) ? c.readOnly : c.active}</dd>
          <dt>{c.storageNow}</dt><dd>{fmtBytes(company.storage_bytes, locale)}</dd>
          <dt>{c.nextCharge}</dt><dd>{credits(est.feeCents + est.storageCents)} <span className="muted">({est.gbMonths} {c.gbMonth})</span></dd>
          <dt>{c.vs}</dt><dd>{company.vs}</dd>
          <dt>{t.team.code}</dt><dd className="code-box">{company.login_code}</dd>
          <dt>{w.createdAt}</dt><dd>{date(company.created_at)}</dd>
          {company.ico && <><dt>{t.common.ico}</dt><dd>{company.ico}</dd></>}
        </dl>
        <div className="panel-body">
          <form action={newCode} className="actions" style={{ marginBottom: 12 }}>
            {hidden}
            <ConfirmSubmit label={t.employees.newCode} question={t.confirm.newCodeQ} yes={t.employees.newCode} no={t.confirm.cancel} />
            <span className="muted">{t.employees.newCodeHint}</span>
          </form>
          <form action={setSuspended} className="actions">
            {hidden}
            <input type="hidden" name="suspended" value={company.suspended ? "0" : "1"} />
            <ConfirmSubmit
              label={company.suspended ? w.unsuspend : w.suspend}
              className={company.suspended ? "primary" : "danger"}
              question={company.suspended ? t.confirm.unsuspendQ(company.name) : t.confirm.suspendQ(company.name)}
              yes={company.suspended ? w.unsuspend : w.suspend}
              no={t.confirm.cancel}
            />
            <span className="muted">{w.suspendHint}</span>
          </form>
          <form action={setBlocked} className="actions" style={{ marginTop: 12 }}>
            {hidden}
            <input type="hidden" name="blocked" value={company.blocked ? "0" : "1"} />
            <ConfirmSubmit
              label={company.blocked ? w.unblock : w.block}
              className={company.blocked ? "primary" : "danger"}
              question={company.blocked ? t.confirm.unblockQ(company.name) : t.confirm.blockQ(company.name)}
              yes={company.blocked ? w.unblock : w.block}
              no={t.confirm.cancel}
            />
            <span className="muted">{w.blockHint}</span>
          </form>
          <form action={startBypass} className="actions" style={{ marginTop: 12 }}>
            {hidden}
            <button>{w.bypass}</button>
            <span className="muted">{w.bypassHint}</span>
          </form>
        </div>
      </section>

      <details className="panel create" id="chat" open={sp.chat === "1"}>
        <summary className="panel-title">＋ {w.newChat}</summary>
        <form action={openChat} className="panel-body">
          {hidden}
          <div className="fields">
            <label className="field wide">{t.support.subject} <input name="subject" required maxLength={200} /></label>
            <label className="field">{t.support.priority}
              <select name="priority" defaultValue="normal">
                {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{t.support.priorities[p]}</option>)}
              </select>
            </label>
            <label className="field">{w.chatAudience}
              <select name="audience" defaultValue="support">
                {(["support", "company", "people"] as const).map((a) => <option key={a} value={a}>{w.audiences[a]}</option>)}
              </select>
            </label>
          </div>
          <fieldset style={{ marginTop: 12 }}>
            <legend>{w.chatPeople}</legend>
            <div className="perm-list">
              {members.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" name="recipient" value={m.id} /> {loginName(m)} <span className="muted">· {t.role[m.role]}</span>
                </label>
              ))}
            </div>
            <p className="muted small-note">{w.chatPeopleHint}</p>
          </fieldset>
          <div className="fields" style={{ marginTop: 12 }}>
            <label className="field wide">{t.support.message} <textarea name="body" required maxLength={10000} rows={5} /></label>
          </div>
          <p className="muted small-note">{w.chatHint}</p>
          <div className="actions" style={{ marginTop: 12 }}><button className="primary">{t.support.send}</button></div>
        </form>
      </details>

      {pending.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">{w.pendingTopups}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.common.date}</th><th className="num">{c.amount}</th><th /></tr></thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.created_at)}</td>
                    <td className="num">{credits(p.amount_cents)}</td>
                    <td>
                      <div className="actions">
                        <form action={addCredit}>
                          {hidden}
                          <input type="hidden" name="topup_id" value={p.id} />
                          <input type="hidden" name="amount" value={(p.amount_cents / 100).toFixed(2)} />
                          <input type="hidden" name="note" value={w.bankTransfer} />
                          <button className="primary">{w.confirmPayment}</button>
                        </form>
                        <form action={cancelTopup}>{hidden}<input type="hidden" name="topup_id" value={p.id} /><ConfirmSubmit label={c.cancel} className="danger" question={t.confirm.cancelTopupQ} yes={c.cancel} no={t.confirm.cancel} /></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <form action={addCredit} className="panel">
        <h2 className="panel-title">{w.addCredit}</h2>
        <div className="panel-body">
          {hidden}
          <div className="fields">
            <label className="field">{w.amountSigned} <input name="amount" inputMode="decimal" required /></label>
            <label className="field">{w.kind}
              <select name="kind" defaultValue="topup">
                <option value="topup">{t.tx.topup}</option>
                <option value="adjust">{t.tx.adjust}</option>
              </select>
            </label>
            <label className="field wide">{w.note} <input name="note" maxLength={500} /></label>
          </div>
          <div className="actions" style={{ marginTop: 14 }}><button className="primary">{w.addCredit}</button></div>
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{t.employees.title}</h2>
        <TeamTable
          companyId={id}
          primaryOwnerId={company.primary_owner_id}
          members={members}
          me={{ id: null, isWebmaster: true, isOwner: false, perms: [] }}
          back={`/webmaster/companies/${id}`}
          extra={(m) =>
            m.id !== company.primary_owner_id && m.role === "owner" && (
              <form action={setPrimaryOwner}>
                {hidden}<input type="hidden" name="user_id" value={m.id} />
                <ConfirmSubmit label={t.employees.makePrimary} className="small" question={t.confirm.primaryQ(loginName(m))} yes={t.employees.makePrimary} no={t.confirm.cancel} />
              </form>
            )
          }
        />
      </section>

      <section className="panel">
        <h2 className="panel-title">{c.history}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t.common.date}</th><th>{w.kind}</th><th>{w.note}</th><th className="num">{c.amount}</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={4} className="empty">{c.noTx}</td></tr>}
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{date(h.at)}</td>
                  <td>{t.tx[h.kind]}</td>
                  <td>{h.kind === "storage" && h.note ? `${h.note.split(":")[0]} · ${h.note.split(":")[1]} ${c.gbMonth}` : h.note === "card" ? c.byCard : h.note === "card refund" ? c.cardRefund : h.note ?? ""}</td>
                  <td className={`num ${h.amount_cents < 0 ? "neg" : "pos"}`}>{h.amount_cents > 0 ? "+" : ""}{credits(h.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel danger-zone">
        <h2 className="panel-title">{w.deleteCompany}</h2>
        <div className="panel-body">
          <p className="muted">{w.deleteHint}</p>
          <form action={deleteCompany} className="actions">
            {hidden}
            <ConfirmSubmit
              label={w.deleteCompany}
              className="danger"
              question={t.confirm.deleteCompanyQ(company.name, members.length)}
              yes={t.common.delete}
              no={t.confirm.cancel}
            />
          </form>
        </div>
      </section>
    </>
  );
}
