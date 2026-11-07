import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import InvoiceForm from "@/components/InvoiceForm";
import { submitOr } from "@/server/actions";
import { itemsFromForm, quoteFromForm } from "@/server/invoice-form";
import { getJob, getQuote, quoteItems } from "@/server/queries";

async function updateQuote(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.edit");
  const id = String(formData.get("id"));
  const back = `/admin/quotes/${id}/edit`;
  const items = itemsFromForm(formData, company, back);
  await submitOr(back, { type: "quote.update", companyId: company.id, quoteId: id, quote: quoteFromForm(formData), items }, user.id);
  redirect(`/admin/quotes/${id}?ok=saved`);
}

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { company }, { t, locale }] = await Promise.all([params, requirePerm("invoices.edit"), getT()]);
  const q = getQuote(company.id, id);
  if (!q) notFound();
  if (q.status !== "draft" && q.status !== "sent") redirect(`/admin/quotes/${id}?error=not_editable`);
  const job = q.job_id ? getJob(company.id, q.job_id) : undefined;
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4, useGrouping: false }).format(n);
  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: t.quotes.title, href: "/admin/quotes" }, { label: q.number, href: `/admin/quotes/${id}` }, { label: t.quotes.edit }]} />
      <InvoiceForm
        kind="quote"
        action={updateQuote}
        company={company}
        title={`${t.quotes.edit}: ${q.number}`}
        submitLabel={t.common.save}
        hidden={<input type="hidden" name="id" value={id} />}
        initial={{
          customer_id: q.customer_id, job_id: q.job_id,
          job: job ? { id: job.id, title: job.title, job_date: job.job_date } : undefined,
          issue: q.issue_date, valid: q.valid_until, note: q.note, reverse_charge: !!q.reverse_charge,
          rows: quoteItems(company.id, id).map((it) => ({ name: it.name, qty: fmt(Number(it.quantity)), unitPrice: fmt(Number(it.unit_price)), unit: it.unit, vat: String(it.vat_rate) })),
        }}
      />
    </>
  );
}
