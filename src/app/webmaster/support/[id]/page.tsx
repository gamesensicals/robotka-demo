import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import AutoRefresh from "@/components/support/AutoRefresh";
import MarkRead from "@/components/support/MarkRead";
import Thread from "@/components/support/Thread";
import { TICKET_PRIORITIES, WEBMASTER } from "@/server/events";
import { getTicket, ticketMessages } from "@/server/queries";
import { wmDelete, wmMarkRead, wmReply, wmSetPriority, wmSetStatus } from "../actions";

export default async function WebmasterTicket({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, , { t, date }] = await Promise.all([params, requireWebmaster(), getT()]);
  const tk = getTicket(id, WEBMASTER);
  if (!tk) notFound();
  const s = t.support;
  const open = tk.status === "open";

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: s.title, href: "/webmaster/support" }, { label: tk.subject }]} />
      <AutoRefresh />
      {tk.unread > 0 && <MarkRead action={wmMarkRead} ticketId={id} />}
      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{tk.subject}</span>
          <span className="title-stats">
            <Link href={`/webmaster/companies/${tk.company_id}`}>{tk.company_name}</Link>{" "}
            <span className={`badge ${open ? "badge-paid" : "badge-closed"}`}>{s.statuses[tk.status]}</span>
          </span>
        </h2>
        <Thread messages={ticketMessages(id)} mine="webmaster" />
        {open ? (
          <form action={wmReply} className="panel-body reply">
            <input type="hidden" name="id" value={id} />
            <textarea name="body" required maxLength={10000} rows={3} placeholder={s.replyPh} aria-label={s.reply} />
            <div className="actions"><button className="primary">{s.send}</button></div>
          </form>
        ) : (
          <div className="panel-body"><p className="muted">{s.closedNote}{tk.delete_after ? ` ${s.deletesOn(date(tk.delete_after))}.` : ""}</p></div>
        )}
        <div className="panel-foot ticket-tools">
          <form action={wmSetPriority} className="actions">
            <input type="hidden" name="id" value={id} />
            <label className="inline">{s.priority}{" "}
              <select name="priority" defaultValue={tk.priority}>
                {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{s.priorities[p]}</option>)}
              </select>
            </label>
            <button>{t.common.save}</button>
          </form>
          <form action={wmSetStatus} className="actions">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={open ? "closed" : "open"} />
            {open
              ? <ConfirmSubmit label={s.close} question={t.confirm.closeTicketQ} yes={s.close} no={t.confirm.cancel} />
              : <button>{s.reopen}</button>}
            <ConfirmSubmit label={s.delete} question={t.confirm.deleteTicketQ} yes={s.delete} no={t.confirm.cancel} className="danger" formAction={wmDelete} />
          </form>
        </div>
      </section>
      <p className="muted small-note">{s.autoRules}</p>
    </>
  );
}
