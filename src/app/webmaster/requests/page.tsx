import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import { siteSettings } from "@/server/billing";
import { getDb } from "@/server/db";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { submitOr } from "@/server/actions";
import { WEBMASTER } from "@/server/events";
import { signedFileUrl } from "@/server/files";
import { accountRequests } from "@/server/queries";

const BACK = "/webmaster/requests";

async function setStatus(formData: FormData) {
  "use server";
  await requireWebmaster();
  const status = String(formData.get("status")) as "new" | "done" | "rejected";
  await submitOr(BACK, { type: "request.setStatus", requestId: String(formData.get("id")), status }, WEBMASTER);
  redirect(`${BACK}?ok=${status === "rejected" ? "request_rejected" : "saved"}`);
}

export default async function Requests() {
  const [, { t, date, credits }] = await Promise.all([requireWebmaster(), getT()]);
  const w = t.webmaster;
  const s = siteSettings(getDb());
  const requests = accountRequests();

  return (
    <>
      <Crumbs items={[{ label: w.title, href: "/webmaster" }, { label: w.requests }]} />
      <section className="panel">
        <h2 className="panel-title">{w.requests}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{w.company}</th><th>{w.contact}</th><th>{t.common.date}</th><th>{t.common.status}</th><th /></tr></thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={5} className="empty">{w.noRequests}</td></tr>}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.logo_path && <img src={signedFileUrl(r.logo_path)} alt="" className="req-logo" />}
                    <span className="row-title">{r.company_name}</span>
                    {r.ico && <span className="muted">{t.common.ico}: {r.ico}</span>}
                    {(r.people || r.storage_gb != null) && <span className="muted">{w.requestEstimate(r.people ?? 1, r.storage_gb ?? 0, credits((s.fee_mode === "per_user" ? (r.people ?? 1) : 1) * s.monthly_fee_cents + (r.storage_gb ?? 0) * s.storage_cents_per_gb))}</span>}
                    {r.message && <span className="muted" style={{ whiteSpace: "pre-line" }}>{r.message}</span>}
                  </td>
                  <td className="contact">
                    {r.contact_name}<br />
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                    {r.phone && <><br /><a href={`tel:${r.phone}`}>{r.phone}</a></>}
                  </td>
                  <td className="nowrap">{date(r.created_at)}</td>
                  <td><span className={`badge ${r.status === "new" ? "badge-open" : r.status === "done" ? "badge-paid" : "badge-cancelled"}`}>{w.requestStatus[r.status]}</span></td>
                  <td>
                    <div className="actions">
                      {r.status === "new" && <Link href={`/webmaster/companies/new?request=${r.id}`} className="button primary">{w.createCompany}</Link>}
                      {r.company_id && <Link href={`/webmaster/companies/${r.company_id}`} className="button">{w.openCompany}</Link>}
                      {!r.company_id && <form action={setStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value={r.status === "new" ? "rejected" : "new"} />
                        {r.status === "new"
                          ? <ConfirmSubmit label={w.reject} className="danger" question={t.confirm.rejectQ(r.company_name)} yes={w.reject} no={t.confirm.cancel} />
                          : <button>{w.reopen}</button>}
                      </form>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body"><p className="muted small-note">{w.requestsCleanup}</p></div>
      </section>
    </>
  );
}
