import { notFound } from "next/navigation";
import { requireSupport } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import AutoRefresh from "@/components/support/AutoRefresh";
import MarkRead from "@/components/support/MarkRead";
import Thread from "@/components/support/Thread";
import { ticketMessages, visibleTicket } from "@/server/queries";
import { markRead, replyTicket, setTicketStatus } from "../actions";

export default async function SupportTicket({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { company, user, has, bypass }, { t, date }] = await Promise.all([params, requireSupport(), getT()]);
  const tk = visibleTicket(id, company.id, user.id, has("support"));
  if (!tk) notFound();
  // chat od webmastra zatvára len webmaster
  const canClose = !tk.opened_by_webmaster && !bypass;
  const s = t.support;
  const open = tk.status === "open";

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: s.title, href: "/admin/support" }, { label: tk.subject }]} />
      <AutoRefresh />
      {tk.unread > 0 && <MarkRead action={markRead} ticketId={id} />}
      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{tk.subject}</span>
          <span className="title-stats">
            <span className={`badge badge-${tk.priority}`}>{s.priorities[tk.priority]}</span>{" "}
            <span className={`badge ${open ? "badge-paid" : "badge-closed"}`}>{s.statuses[tk.status]}</span>
          </span>
        </h2>
        <Thread messages={ticketMessages(id)} mine="company" />
        {open && !bypass ? (
          <form action={replyTicket} className="panel-body reply">
            <input type="hidden" name="id" value={id} />
            <textarea name="body" required maxLength={10000} rows={3} placeholder={s.replyPh} aria-label={s.reply} />
            <div className="actions"><button className="primary">{s.send}</button></div>
          </form>
        ) : (
          <div className="panel-body"><p className="muted">{s.closedNote}{tk.delete_after ? ` ${s.deletesOn(date(tk.delete_after))}.` : ""}</p></div>
        )}
        {canClose && <div className="panel-foot">
          <form action={setTicketStatus} className="actions" style={{ justifyContent: "flex-end" }}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={open ? "closed" : "open"} />
            {open
              ? <ConfirmSubmit label={s.close} question={t.confirm.closeTicketQ} yes={s.close} no={t.confirm.cancel} />
              : <button>{s.reopen}</button>}
          </form>
        </div>}
        {!!tk.opened_by_webmaster && <div className="panel-body"><p className="muted small-note">{s.fromWebmasterNote}</p></div>}
      </section>
      <p className="muted small-note">{s.autoRules}</p>
    </>
  );
}
