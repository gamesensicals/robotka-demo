import Link from "next/link";
import { requireSupport } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { TICKET_PRIORITIES } from "@/server/events";
import { companyTickets } from "@/server/queries";
import { openTicket } from "./actions";

export default async function Support() {
  const [{ company, user, has, canOpen }, { t, date }] = await Promise.all([requireSupport(), getT()]);
  const s = t.support;
  const tickets = companyTickets(company.id, user.id, has("support"));

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: s.title }]} />
      <section className="panel">
        <h2 className="panel-title">{s.title}</h2>
        <table>
          <thead><tr><th>{s.subject}</th><th>{s.priority}</th><th>{t.common.status}</th><th>{s.lastActivity}</th></tr></thead>
          <tbody>
            {tickets.length === 0 && <tr><td colSpan={4} className="empty">{s.noTickets}</td></tr>}
            {tickets.map((tk) => (
              <tr key={tk.id}>
                <td>
                  <Link href={`/admin/support/${tk.id}`} className="row-title">{tk.subject}</Link>
                  {!!tk.opened_by_webmaster && <span className="badge badge-sent from-wm">{s.fromWebmaster}</span>}
                  {tk.unread > 0 && <span className="unread-dot" title={s.unread}>{tk.unread}</span>}
                  <span className="muted">{s.messagesCount(tk.messages)}</span>
                </td>
                <td><span className={`badge badge-${tk.priority}`}>{s.priorities[tk.priority]}</span></td>
                <td>
                  <span className={`badge ${tk.status === "open" ? "badge-paid" : "badge-closed"}`}>{s.statuses[tk.status]}</span>
                  {tk.delete_after && <span className="muted by">{s.deletesOn(date(tk.delete_after))}</span>}
                </td>
                <td className="nowrap">{date(tk.last_activity_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="panel-body"><p className="muted small-note">{s.autoRules}</p></div>
      </section>

      {canOpen && <details className="panel create" open={tickets.length === 0}>
        <summary className="panel-title">＋ {s.newTicket}</summary>
        <form action={openTicket} className="panel-body">
          <div className="fields">
            <label className="field wide">{s.subject} <input name="subject" required maxLength={200} /></label>
            <label className="field">{s.priority}
              <select name="priority" defaultValue="normal">
                {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{s.priorities[p]}</option>)}
              </select>
            </label>
            <label className="field wide">{s.message} <textarea name="body" required maxLength={10000} rows={5} /></label>
          </div>
          <div className="actions" style={{ marginTop: 12 }}><button className="primary">{s.send}</button></div>
        </form>
      </details>}
    </>
  );
}
