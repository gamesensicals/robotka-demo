import Link from "next/link";
import { requireWebmaster } from "@/lib/company";
import { fmtBytes } from "@/lib/format";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import StatusDot from "@/components/StatusDot";
import { matches } from "@/lib/search";
import { accountRequests, allPendingTopups, companiesOverview } from "@/server/queries";

export default async function WebmasterHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [, { t, credits, date, locale }, sp] = await Promise.all([requireWebmaster(), getT(), searchParams]);
  const w = t.webmaster;
  const companies = companiesOverview();
  const q = (sp.q ?? "").trim();
  // hľadanie podľa názvu, IČO, variabilného symbolu alebo e-mailu majiteľa
  const shown = companies.filter((c) => matches(q, c.name, c.ico, c.vs, c.owner_emails));
  const newRequests = accountRequests().filter((r) => r.status === "new").length;
  const topups = allPendingTopups();
  const sum = (f: (c: (typeof companies)[number]) => number) => companies.reduce((s, c) => s + f(c), 0);

  return (
    <>
      <Crumbs items={[{ label: w.title }]} />
      <section className="panel">
        <h2 className="panel-title">{w.title}</h2>
        <dl className="stats">
          <dt>{w.companiesCount}</dt><dd>{companies.length}</dd>
          <dt>{w.readOnlyCount}</dt><dd>{companies.filter((c) => c.suspended || c.blocked || c.credit_cents < 0).length}</dd>
          <dt>{w.totalStorage}</dt><dd>{fmtBytes(sum((c) => c.storage_bytes), locale)}</dd>
          <dt>{w.totalCredit}</dt><dd>{credits(sum((c) => c.credit_cents))}</dd>
          <dt>{w.newRequests}</dt><dd>{newRequests > 0 ? <Link href="/webmaster/requests">{newRequests}</Link> : 0}</dd>
          <dt>{w.pendingTopups}</dt><dd>{topups.length}</dd>
        </dl>
      </section>

      {topups.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">{w.pendingTopups}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{w.company}</th><th>{t.credits.vs}</th><th>{t.common.date}</th><th className="num">{t.credits.amount}</th></tr></thead>
              <tbody>
                {topups.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/webmaster/companies/${p.company_id}`} className="row-title">{p.company_name}</Link></td>
                    <td className="m-left">{p.vs}</td>
                    <td>{date(p.created_at)}</td>
                    <td className="num">{credits(p.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={t.search.companiesPlaceholder} aria-label={t.search.search} />
        <button>{t.search.search}</button>
        {q && <Link href="/webmaster">{t.search.clear}</Link>}
      </form>

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{w.companies}</span>
          {q && <span className="title-stats">{t.search.found(shown.length, companies.length)}</span>}
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="dotcol" /><th>{w.company}</th><th>{w.owner}</th><th className="num">{w.storage}</th>
                <th className="num">{w.balance}</th><th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="empty">{q ? t.search.nothing : w.noCompanies}</td></tr>}
              {shown.map((c) => {
                const ro = Boolean(c.suspended) || Boolean(c.blocked) || c.credit_cents < 0;
                return (
                  <tr key={c.id}>
                    <td className="dotcol"><StatusDot active={!ro} /></td>
                    <td>
                      <Link href={`/webmaster/companies/${c.id}`} className="row-title">{c.name}</Link>
                      <span className="muted">{t.credits.vs} {c.vs}{c.ico ? ` · ${t.common.ico} ${c.ico}` : ""} · {date(c.created_at)} · {c.members} {w.usersShort}</span>
                    </td>
                    <td className="m-left">{c.owner_email ?? ""}</td>
                    <td className="num">{fmtBytes(c.storage_bytes, locale)}</td>
                    <td className={`num ${c.credit_cents < 0 ? "neg" : ""}`}>{credits(c.credit_cents)}</td>
                    <td>
                      <span className={`badge ${c.blocked || c.suspended ? "badge-cancelled" : ro ? "badge-draft" : "badge-paid"}`}>
                        {c.blocked ? w.blockedState : c.suspended ? t.credits.suspended : ro ? t.credits.readOnly : t.credits.active}
                      </span>
                    </td>
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
