import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { submitOr } from "@/server/actions";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/server/events";
import { signedFileUrl } from "@/server/files";
import { payBySquare, qrDataUrl, vatBreakdown } from "@/server/invoice-doc";
import { getInvoice, getJob, invoiceBuyer, invoiceItems, loginName, userById } from "@/server/queries";
import { deleteInvoice } from "../actions";
import PrintButton from "./print-button";

async function correctInvoice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.edit", "invoices.create");
  const id = String(formData.get("id"));
  const newId = randomUUID();
  await submitOr(`/admin/invoices/${id}`, { type: "invoice.correct", companyId: company.id, invoiceId: id, newId }, user.id);
  redirect(`/admin/invoices/${newId}/edit?ok=invoice_corrected`);
}

async function setStatus(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.status");
  const id = String(formData.get("id"));
  const back = `/admin/invoices/${id}`;
  await submitOr(back, { type: "invoice.setStatus", companyId: company.id, invoiceId: id, status: String(formData.get("status")) as InvoiceStatus }, user.id);
  redirect(`${back}?ok=saved`);
}

// Faktúra na obrazovke a pri tlači; rovnaké rozloženie má aj PDF (src/server/invoice-doc.ts).
export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ company, has }, { t, money, date, dateTime }] = await Promise.all([requirePerm("invoices.view"), getT()]);

  const inv = getInvoice(company.id, id);
  if (!inv) notFound();
  const items = invoiceItems(company.id, id);
  const c = invoiceBuyer(company.id, inv);
  const job = inv.job_id ? getJob(company.id, inv.job_id) : inv.job_title ? { title: inv.job_title } : undefined;
  const corrected = inv.corrected_by ? getInvoice(company.id, inv.corrected_by) : undefined;
  const editor = inv.updated_by ? userById(inv.updated_by) : undefined;
  const logoUrl = company.logo_path ? signedFileUrl(company.logo_path) : null;
  const pay = await payBySquare(company, inv);
  const qr = pay ? await qrDataUrl(pay) : null;
  const vat = company.is_vat_payer ? vatBreakdown(items) : [];
  const ti = t.invoices;
  const immediate = inv.status === "draft" || inv.status === "cancelled";
  const back = `/admin/invoices/${id}`;
  const stamp = inv.status === "paid" ? ti.stampPaid : inv.status === "cancelled" ? ti.stampCancelled : inv.status === "draft" ? ti.stampDraft : null;
  const qty = (n: number) => new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(n);

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: ti.title, href: "/admin/invoices" }, { label: inv.number }]} />

      <section className="panel no-print">
        <div className="panel-body actions">
          <a href={`/admin/invoices/${id}/pdf`} className="button primary">{ti.downloadPdf}</a>
          <PrintButton label={ti.print} pdfUrl={`/admin/invoices/${id}/pdf`} />
          <a href={`/admin/invoices/${id}/xml`} className="button" title={ti.xmlHint}>{ti.downloadXml}</a>
          {has("invoices.status") && <form action={setStatus} className="actions">
            <input type="hidden" name="id" value={id} />
            <select name="status" defaultValue={inv.status} aria-label={t.common.status} style={{ width: "auto" }}>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t.invoiceStatus[s]}</option>)}
            </select>
            <button>{t.common.changeStatus}</button>
          </form>}
          {inv.status === "draft" && has("invoices.edit") && <Link href={`/admin/invoices/${id}/edit`} className="button">{ti.edit}</Link>}
          {(inv.status === "sent" || inv.status === "paid") && has("invoices.edit") && has("invoices.create") && (
            <form action={correctInvoice}>
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmit label={ti.correct} question={t.confirm.correctQ(inv.number)} yes={ti.correct} no={t.confirm.cancel} />
            </form>
          )}
          <span className="spacer" />
          {immediate && has("invoices.delete") && (
            <form action={deleteInvoice}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              <ConfirmSubmit label={ti.deleteInvoice} className="danger" question={ti.deleteNowQ(inv.number)} yes={t.common.delete} no={t.confirm.cancel} />
            </form>
          )}
        </div>
      </section>

      {(editor || corrected) && (
        <p className="muted small-note no-print">
          {editor && inv.updated_at && ti.editedBy(dateTime(inv.updated_at), loginName({ ...editor, role: null }))}
          {corrected && <> {ti.correctedBy} <Link href={`/admin/invoices/${corrected.id}`}>{corrected.number}</Link></>}
        </p>
      )}

      <article className="paper invoice">
        {stamp && <div className={`inv-stamp inv-stamp-${inv.status}`} aria-hidden>{stamp}</div>}

        <header className="inv-head">
          <div className="inv-brand">
            {logoUrl ? <img src={logoUrl} alt={company.name} /> : <strong>{company.name}</strong>}
          </div>
          <div className="inv-title">
            <span>{ti.invoice}</span>
            <strong>{inv.number}</strong>
            {company.is_vat_payer && <small>{ti.taxDocument}</small>}
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
          <div><span>{ti.issueDate}</span><strong>{date(inv.issue_date)}</strong></div>
          <div><span>{ti.deliveryDate}</span><strong>{date(inv.delivery_date)}</strong></div>
          <div className="inv-due"><span>{ti.dueDate}</span><strong>{date(inv.due_date)}</strong></div>
          <div><span>{ti.variableSymbol}</span><strong>{inv.variable_symbol}</strong></div>
        </div>
        {job && <p className="inv-job">{ti.job}: <strong>{job.title}</strong></p>}

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
          <section className="inv-card inv-pay">
            <div>
              <h2>{ti.payment}</h2>
              <dl>
                <dt>{ti.iban}</dt><dd>{company.iban ?? "–"}</dd>
                <dt>{ti.variableSymbol}</dt><dd>{inv.variable_symbol}</dd>
                <dt>{ti.dueDate}</dt><dd>{date(inv.due_date)}</dd>
                <dt>{ti.toPay}</dt><dd>{money(Number(inv.total_gross))}</dd>
              </dl>
            </div>
            {qr && (
              <figure className="inv-qr">
                <img src={qr} alt="PAY by square" />
                <figcaption>{ti.scanToPay}</figcaption>
              </figure>
            )}
          </section>
          <section className="inv-totals">
            {/* jedna sadzba: len súčty; viac sadzieb: malá tabuľka podľa sadzieb */}
            {company.is_vat_payer && vat.length > 1 && (
              <table className="inv-vat">
                <thead><tr><th>{ti.colVat}</th><th className="num">{ti.base}</th><th className="num">{ti.vat}</th></tr></thead>
                <tbody>
                  {vat.map((v) => (
                    <tr key={v.rate}><td>{v.rate} %</td><td className="num">{money(v.base)}</td><td className="num">{money(v.vat)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {company.is_vat_payer ? (
              <>
                <p><span>{ti.totalNet}</span><span>{money(Number(inv.total_net))}</span></p>
                <p><span>{vat.length === 1 ? ti.vatAmount(vat[0].rate) : ti.totalVat}</span><span>{money(Number(inv.total_vat))}</span></p>
              </>
            ) : (
              <p><span>{ti.totalPlain}</span><span>{money(Number(inv.total_net))}</span></p>
            )}
            {!!inv.reverse_charge && <p className="inv-rc"><strong>{ti.reverseCharge}</strong></p>}
            <div className="inv-grand">
              <span>{ti.toPay}</span>
              <strong>{money(Number(inv.total_gross))}</strong>
            </div>
          </section>
        </div>

        {inv.note && <p className="inv-note">{inv.note}</p>}
        {company.invoice_footer && <footer>{company.invoice_footer}</footer>}
      </article>
    </>
  );
}
