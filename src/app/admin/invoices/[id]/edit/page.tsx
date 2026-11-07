import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import InvoiceForm from "@/components/InvoiceForm";
import { submitOr } from "@/server/actions";
import { invoiceFromForm, itemsFromForm } from "@/server/invoice-form";
import { getInvoice, getJob, invoiceItems } from "@/server/queries";

// Úprava konceptu faktúry (vystavená sa opravuje cez „Opraviť“ = storno + nový koncept).

async function updateInvoice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.edit");
  const id = String(formData.get("id"));
  const back = `/admin/invoices/${id}/edit`;
  const items = itemsFromForm(formData, company, back);
  await submitOr(back, { type: "invoice.update", companyId: company.id, invoiceId: id, invoice: invoiceFromForm(formData), items }, user.id);
  redirect(`/admin/invoices/${id}?ok=saved`);
}

export default async function EditInvoice({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { company }, { t, locale }] = await Promise.all([params, requirePerm("invoices.edit"), getT()]);
  const inv = getInvoice(company.id, id);
  if (!inv) notFound();
  if (inv.status !== "draft") redirect(`/admin/invoices/${id}?error=not_editable`);
  const job = inv.job_id ? getJob(company.id, inv.job_id) : undefined;
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4, useGrouping: false }).format(n);

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: t.invoices.title, href: "/admin/invoices" }, { label: inv.number, href: `/admin/invoices/${id}` }, { label: t.invoices.edit }]} />
      <InvoiceForm
        action={updateInvoice}
        company={company}
        title={`${t.invoices.edit}: ${inv.number}`}
        submitLabel={t.common.save}
        hidden={<input type="hidden" name="id" value={id} />}
        initial={{
          customer_id: inv.customer_id,
          job_id: inv.job_id,
          job: job ? { id: job.id, title: job.title, job_date: job.job_date } : undefined,
          issue: inv.issue_date,
          delivery: inv.delivery_date,
          due: inv.due_date,
          note: inv.note,
          reverse_charge: !!inv.reverse_charge,
          // položky ako vlastné (názov, cena, jednotka a DPH ostanú)
          rows: invoiceItems(company.id, id).map((it) => ({ name: it.name, qty: fmt(Number(it.quantity)), unitPrice: fmt(Number(it.unit_price)), unit: it.unit, vat: String(it.vat_rate) })),
        }}
      />
    </>
  );
}
