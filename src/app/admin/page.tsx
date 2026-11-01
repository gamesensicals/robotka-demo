import { requirePerm } from "@/lib/company";
import { ADMIN_PERMS } from "@/lib/perms";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { invoiceTotals, listInvoices } from "@/server/queries";
import InvoiceTable from "./invoices/invoice-table";

export default async function AdminHome() {
  const [{ company, has }, { t, money }] = await Promise.all([requirePerm(...ADMIN_PERMS), getT()]);
  if (!has("invoices.view")) {
    return (
      <>
        <Crumbs items={[{ label: t.admin.title }]} />
        <section className="panel">
          <h2 className="panel-title">{t.admin.title}</h2>
          <div className="panel-body"><p className="muted">{t.admin.pickFromMenu}</p></div>
        </section>
      </>
    );
  }
  const list = invoiceTotals(company.id);
  const recent = listInvoices(company.id, 5);

  const year = String(new Date().getFullYear());
  const unpaid = list.filter((i) => i.status === "draft" || i.status === "sent");
  const paidThisYear = list.filter((i) => i.status === "paid" && String(i.issue_date).startsWith(year));
  const sum = (rows: typeof list) => rows.reduce((s, i) => s + Number(i.total_gross), 0);

  return (
    <>
      <Crumbs items={[{ label: t.admin.title }]} />
      <section className="panel">
        <h2 className="panel-title">{t.admin.stats}</h2>
        <dl className="stats">
          <dt>{t.admin.unpaid}</dt><dd>{unpaid.length} · {money(sum(unpaid))}</dd>
          <dt>{t.admin.paidThisYear}</dt><dd>{money(sum(paidThisYear))}</dd>
          <dt>{t.admin.totalInvoices}</dt><dd>{list.length}</dd>
        </dl>
      </section>
      <section className="panel">
        <h2 className="panel-title">{t.admin.recentInvoices}</h2>
        <InvoiceTable invoices={recent} />
      </section>
    </>
  );
}
