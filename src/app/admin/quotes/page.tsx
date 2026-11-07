import Link from "next/link";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import StatusDot from "@/components/StatusDot";
import { matches } from "@/lib/search";
import { QUOTE_BADGE, QUOTE_STATUSES, type QuoteStatus } from "@/server/events";
import { listQuotes } from "@/server/queries";

export default async function Quotes({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ company, has }, { t, money, date }, sp] = await Promise.all([requirePerm("invoices.view"), getT(), searchParams]);
  const tq = t.quotes;
  const all = listQuotes(company.id);
  const q = (sp.q ?? "").trim();
  const status = QUOTE_STATUSES.includes(sp.status as QuoteStatus) ? (sp.status as QuoteStatus) : "";
  const quotes = all.filter((x) => (!status || x.status === status) &&
    matches(q, x.number, x.customer_name, money(Number(x.total_gross)), String(x.total_gross), date(x.issue_date), tq.statuses[x.status]));
  const filtered = q !== "" || status !== "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: tq.title }]} />
      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={tq.searchPh} aria-label={t.search.search} />
        <select name="status" defaultValue={status} aria-label={t.common.status}>
          <option value="">{t.search.allStatuses}</option>
          {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{tq.statuses[s]}</option>)}
        </select>
        <button>{t.search.search}</button>
        {filtered && <Link href="/admin/quotes">{t.search.clear}</Link>}
        {has("invoices.create") && <Link href="/admin/quotes/new" className="button primary" style={{ marginLeft: "auto" }}>＋ {tq.newQuote}</Link>}
      </form>
      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{tq.title}</span>
          {filtered && <span className="title-stats">{t.search.found(quotes.length, all.length)}</span>}
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th className="dotcol" /><th>{tq.number}</th><th>{t.common.customer}</th><th>{tq.validUntil}</th><th className="num">{tq.amount}</th><th>{t.common.status}</th></tr>
            </thead>
            <tbody>
              {quotes.length === 0 && <tr><td colSpan={6} className="empty">{filtered ? t.search.nothing : tq.empty}</td></tr>}
              {quotes.map((x) => {
                const expired = (x.status === "draft" || x.status === "sent") && x.valid_until < today;
                return (
                  <tr key={x.id}>
                    <td className="dotcol"><StatusDot active={x.status === "draft" || x.status === "sent"} /></td>
                    <td><Link href={`/admin/quotes/${x.id}`} className="row-title">{x.number}</Link><span className="muted">{date(x.issue_date)}</span></td>
                    <td className="m-left">{x.customer_name ?? ""}</td>
                    <td className="nowrap">{date(x.valid_until)}{expired && <span className="muted by">{tq.expired}</span>}</td>
                    <td className="num">{money(Number(x.total_gross))}</td>
                    <td><span className={`badge ${QUOTE_BADGE[x.status]}`}>{tq.statuses[x.status]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
