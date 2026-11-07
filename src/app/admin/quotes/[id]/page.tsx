import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { QUOTE_STATUSES } from "@/server/events";
import { signedFileUrl } from "@/server/files";
import { vatBreakdown } from "@/server/invoice-doc";
import { getInvoice, getJob, getQuote, invoiceBuyer, quoteItems } from "@/server/queries";
import PrintButton from "../../invoices/[id]/print-button";
import { deleteQuote, quoteToInvoice, quoteToJob, setQuoteStatus } from "../actions";

// Cenová ponuka na obrazovke (rovnaký vzhľad ako faktúra); PDF: src/server/invoice-doc.ts (kind "quote").
export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ company, has }, { t, money, date }] = await Promise.all([requirePerm("invoices.view"), getT()]);
  const q = getQuote(company.id, id);
  if (!q) notFound();
  const items = quoteItems(company.id, id);
  const c = invoiceBuyer(company.id, q);
  const job = q.job_id ? getJob(company.id, q.job_id) : undefined;
  const invoice = q.invoice_id ? getInvoice(company.id, q.invoice_id) : undefined;
  const logoUrl = company.logo_path ? signedFileUrl(company.logo_path) : null;
  const vat = company.is_vat_payer ? vatBreakdown(items) : [];
  const ti = t.invoices;
  const tq = t.quotes;
  const today = new Date().toISOString().slice(0, 10);
  const open = q.status === "draft" || q.status === "sent";
  const stamp = q.status === "accepted" ? tq.stampAccepted : q.status === "rejected" ? tq.stampRejected : q.status === "draft" ? ti.stampDraft : null;
  const stampClass = q.status === "accepted" ? "paid" : q.status === "rejected" ? "cancelled" : "draft";
  const qty = (n: number) => new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(n);
  const hidden = <input type="hidden" name="id" value={id} />;

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: tq.title, href: "/admin/quotes" }, { label: q.number }]} />

      <section className="panel no-print">
        <div className="panel-body actions">
          <a href={`/admin/quotes/${id}/pdf`} className="button primary">{ti.downloadPdf}</a>
          <PrintButton label={ti.print} pdfUrl={`/admin/quotes/${id}/pdf`} />
          {has("invoices.status") && <form action={setQuoteStatus} className="actions">
            {hidden}
            <select name="status" defaultValue={q.status} aria-label={t.common.status} style={{ width: "auto" }}>
              {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{tq.statuses[s]}</option>)}
            </select>
            <button>{t.common.changeStatus}</button>
          </form>}
          {open && has("invoices.edit") && <Link href={`/admin/quotes/${id}/edit`} className="button">{tq.edit}</Link>}
          <span className="spacer" />
          {has("invoices.delete") && (
            <form action={deleteQuote}>
              {hidden}
              <ConfirmSubmit label={tq.deleteQuote} className="danger" question={tq.deleteQ(q.number)} yes={t.common.delete} no={t.confirm.cancel} />
            </form>
          )}
        </div>
        {/* po prijatí: zákazka a faktúra jedným klikom */}
        <div className="panel-body actions quote-next">
          {invoice ? (
            <span>{tq.invoiceLink}: <Link href={`/admin/invoices/${invoice.id}`}>{invoice.number}</Link></span>
          ) : has("invoices.create") && (
            <form action={quoteToInvoice}>
              {hidden}
              <ConfirmSubmit label={tq.toInvoice} className="primary" question={tq.toInvoiceQ(q.number)} yes={tq.toInvoice} no={t.confirm.cancel} />
            </form>
          )}
          {job ? (
            <span>{ti.job}: <Link href={`/jobs/${job.id}`}>{job.title}</Link></span>
          ) : has("jobs.create") && has("invoices.edit") && (
            <details className="inline-details">
              <summary className="button">{tq.toJob}</summary>
              <form action={quoteToJob} className="actions">
                {hidden}
                <input name="title" required maxLength={200} defaultValue={tq.jobFromQuote(q.number)} aria-label={tq.jobTitle} style={{ minWidth: 240 }} />
                <button className="primary">{tq.toJob}</button>
              </form>
            </details>
          )}
        </div>
      </section>

      <article className="paper invoice">
        {stamp && <div className={`inv-stamp inv-stamp-${stampClass}`} aria-hidden>{stamp}</div>}
        <header className="inv-head">
          <div className="inv-brand">
            {logoUrl ? <img src={logoUrl} alt={company.name} /> : <strong>{company.name}</strong>}
          </div>
          <div className="inv-title">
            <span>{tq.quote}</span>
            <strong>{q.number}</strong>
          </div>
        </header>

        <div className="inv-parties">
          <section className="inv-card">
            <h2>{ti.supplier}</h2>
            <p className="inv-name">{company.name}</p>
            <p>
              {company.address && <>{company.address}<br /></>}
              {(company.zip || company.city) && <>{company.zip} {company.city}<br /></>}
              {company.ico && <>{t.common.ico}: {company.ico}<br /></>}
              {company.dic && <>{t.common.dic}: {company.dic}<br /></>}
              {company.ic_dph && <>{t.common.icDph}: {company.ic_dph}<br /></>}
              {!company.is_vat_payer && <>{ti.notVatPayer}<br /></>}
              {company.email && <>{company.email}<br /></>}
              {company.phone && <>{company.phone}</>}
            </p>
          </section>
          <section className="inv-card">
            <h2>{ti.buyer}</h2>
            {c ? (
              <>
                <p className="inv-name">{c.name}</p>
                <p>
                  {c.address && <>{c.address}<br /></>}
                  {(c.zip || c.city) && <>{c.zip} {c.city}<br /></>}
                  {c.ico && <>{t.common.ico}: {c.ico}<br /></>}
                  {c.dic && <>{t.common.dic}: {c.dic}<br /></>}
                  {c.ic_dph && <>{t.common.icDph}: {c.ic_dph}<br /></>}
                  {c.email && <>{c.email}<br /></>}
                  {c.phone && <>{c.phone}</>}
                </p>
              </>
            ) : <p className="inv-name">–</p>}
          </section>
        </div>

        <div className="inv-dates">
          <div><span>{ti.issueDate}</span><strong>{date(q.issue_date)}</strong></div>
          <div className="inv-due"><span>{tq.validUntil}</span><strong>{date(q.valid_until)}</strong>{open && q.valid_until < today && <small className="neg">{tq.expired}</small>}</div>
        </div>
        {(job || q.job_title) && <p className="inv-job">{ti.job}: <strong>{job?.title ?? q.job_title}</strong></p>}

        <table className="inv-items">
          <thead>
            <tr>
              <th>#</th><th>{ti.colItem}</th><th className="num">{ti.qty}</th><th>{ti.unit}</th>
              <th className="num">{ti.unitPriceShort}</th><th className="num">{ti.colVat}</th><th className="num">{ti.colLineNet}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={it.id}>
                <td className="muted">{n + 1}</td>
                <td data-label={ti.colItem}>{it.name}</td>
                <td className="num" data-label={ti.qty}>{qty(Number(it.quantity))}</td>
                <td data-label={ti.unit}>{it.unit}</td>
                <td className="num" data-label={ti.unitPriceShort}>{money(Number(it.unit_price))}</td>
                <td className="num" data-label={ti.colVat}>{Number(it.vat_rate)} %</td>
                <td className="num" data-label={ti.colLineNet}><strong>{money(Number(it.quantity) * Number(it.unit_price))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-bottom">
          <section />
          <section className="inv-totals">
            {company.is_vat_payer && vat.length > 1 && (
              <table className="inv-vat">
                <thead><tr><th>{ti.colVat}</th><th className="num">{ti.base}</th><th className="num">{ti.vat}</th></tr></thead>
                <tbody>{vat.map((v) => <tr key={v.rate}><td>{v.rate} %</td><td className="num">{money(v.base)}</td><td className="num">{money(v.vat)}</td></tr>)}</tbody>
              </table>
            )}
            {company.is_vat_payer ? (
              <>
                <p><span>{ti.totalNet}</span><span>{money(Number(q.total_net))}</span></p>
                <p><span>{vat.length === 1 ? ti.vatAmount(vat[0].rate) : ti.totalVat}</span><span>{money(Number(q.total_vat))}</span></p>
              </>
            ) : <p><span>{ti.totalPlain}</span><span>{money(Number(q.total_net))}</span></p>}
            {!!q.reverse_charge && <p className="inv-rc"><strong>{ti.reverseCharge}</strong></p>}
            <div className="inv-grand"><span>{tq.total}</span><strong>{money(Number(q.total_gross))}</strong></div>
          </section>
        </div>

        {q.note && <p className="inv-note">{q.note}</p>}
        {company.invoice_footer && <footer>{company.invoice_footer}</footer>}
      </article>
    </>
  );
}
