import Link from "next/link";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { matches } from "@/lib/search";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/server/events";
import { listInvoices } from "@/server/queries";
import InvoiceTable from "./invoice-table";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ company }, { t, money, date }, sp] = await Promise.all([requirePerm("invoices.view"), getT(), searchParams]);
  const all = listInvoices(company.id);
  const q = (sp.q ?? "").trim();
  const status = INVOICE_STATUSES.includes(sp.status as InvoiceStatus) ? (sp.status as InvoiceStatus) : "";
  // hľadá sa v čísle, zákazníkovi, sume (aj „441,00“) a dátume
  const invoices = all.filter(
    (i) => (!status || i.status === status) &&
      matches(q, i.number, i.customer_name, money(Number(i.total_gross)), String(i.total_gross), date(i.issue_date), t.invoiceStatus[i.status])
  );
  const filtered = q !== "" || status !== "";
  const back = `/admin/invoices${filtered ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}` : ""}`;

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: t.invoices.title }]} />
      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={t.search.invoicesPlaceholder} aria-label={t.search.search} />
        <select name="status" defaultValue={status} aria-label={t.common.status}>
          <option value="">{t.search.allStatuses}</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t.invoiceStatus[s]}</option>)}
        </select>
        <button>{t.search.search}</button>
        {filtered && <Link href="/admin/invoices">{t.search.clear}</Link>}
        <Link href="/admin/invoices/new" className="button primary" style={{ marginLeft: "auto" }}>＋ {t.invoices.newInvoice}</Link>
      </form>
      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{t.invoices.title}</span>
          {filtered && <span className="title-stats">{t.search.found(invoices.length, all.length)}</span>}
        </h2>
        <InvoiceTable invoices={invoices} actions={{ back }} />
        <div className="panel-body"><p className="muted small-note">{t.invoices.deleteRules}</p></div>
      </section>
    </>
  );
}
