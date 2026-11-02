import Link from "next/link";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { TICKET_PRIORITIES } from "@/server/events";
import { redirect } from "next/navigation";
import { allTickets, companiesOverview } from "@/server/queries";
import SearchSelect from "@/components/SearchSelect";

/** Nový chat s firmou: výber firmy, formulár je pri firme (tam sa dajú vybrať ľudia). */
async function newChat(formData: FormData) {
  "use server";
  await requireWebmaster();
  const id = String(formData.get("company") ?? "");
  redirect(id ? `/webmaster/companies/${id}?chat=1#chat` : "/webmaster/support");
}

type Search = { q?: string; priority?: string; company?: string; status?: string };

export default async function WebmasterSupport({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, , { t, date }] = await Promise.all([searchParams, requireWebmaster(), getT()]);
  const s = t.support;
  const all = allTickets();
  const companies = [...new Map(all.map((tk) => [tk.company_id, tk.company_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = sp.status === "closed" || sp.status === "all" ? sp.status : sp.status === "open" ? "open" : "";
  const tickets = all.filter((tk) =>
    (!q || tk.subject.toLowerCase().includes(q) || tk.company_name.toLowerCase().includes(q)) &&
    (!sp.priority || tk.priority === sp.priority) &&
    (!sp.company || tk.company_id === sp.company) &&
    (!status || status === "all" || tk.status === status)
  );
  const filtered = !!(q || sp.priority || sp.company || status);

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: s.title }]} />
      <form action={newChat} className="panel toolbar">
        <SearchSelect
          name="company" required placeholder={t.webmaster.chooseCompany} noMatch={t.search.nothing} ariaLabel={t.webmaster.company}
          options={companiesOverview().map((c) => ({ value: c.id, label: c.name, hint: [c.ico, `VS ${c.vs}`, c.owner_email].filter(Boolean).join(" · ") }))}
        />
        <button className="primary">＋ {t.webmaster.newChat}</button>
      </form>
      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{s.title}</span>
          <span className="title-stats">{s.openCount(all.filter((tk) => tk.status === "open").length)}</span>
        </h2>
        <form className="toolbar" role="search">
          <input name="q" type="search" defaultValue={sp.q ?? ""} placeholder={s.searchPh} aria-label={s.searchPh} />
          <select name="priority" defaultValue={sp.priority ?? ""} aria-label={s.priority}>
            <option value="">{s.allPriorities}</option>
            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{s.priorities[p]}</option>)}
          </select>
          <SearchSelect
            name="company" defaultValue={sp.company ?? ""} emptyLabel={s.allCompanies} placeholder={t.search.typeToSearch} noMatch={t.search.nothing}
            ariaLabel={s.company} options={companies.map(([id, name]) => ({ value: id, label: name }))}
          />
          <select name="status" defaultValue={status} aria-label={t.common.status}>
            <option value="">{s.allStatuses}</option>
            <option value="open">{s.statuses.open}</option>
            <option value="closed">{s.statuses.closed}</option>
          </select>
          <button>{t.search.search}</button>
          {filtered && <Link href="/webmaster/support">{t.search.clear}</Link>}
        </form>
        <table>
          <thead><tr><th>{s.subject}</th><th>{s.company}</th><th>{s.priority}</th><th>{t.common.status}</th><th>{s.lastActivity}</th></tr></thead>
          <tbody>
            {tickets.length === 0 && <tr><td colSpan={5} className="empty">{s.noTickets}</td></tr>}
            {tickets.map((tk) => (
              <tr key={tk.id}>
                <td>
                  <Link href={`/webmaster/support/${tk.id}`} className="row-title">{tk.subject}</Link>
                  {tk.unread > 0 && <span className="unread-dot" title={s.unread}>{tk.unread}</span>}
                  <span className="muted">{s.messagesCount(tk.messages)}</span>
                </td>
                <td className="m-left"><Link href={`/webmaster/companies/${tk.company_id}`}>{tk.company_name}</Link></td>
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
    </>
  );
}
