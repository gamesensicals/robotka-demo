import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import InvoiceForm from "@/components/InvoiceForm";
import { submitOr } from "@/server/actions";
import { invoiceFromForm, itemsFromForm } from "@/server/invoice-form";
import { getJob, labourPrice } from "@/server/queries";

async function createInvoice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.create");
  const back = "/admin/invoices/new";
  const items = itemsFromForm(formData, company, back);
  // číslo faktúry pridelí až apply v poradí určenom hubom, takže sa nezdvojí ani pri viacerých serveroch
  const id = randomUUID();
  await submitOr(back, { type: "invoice.create", companyId: company.id, invoice: { id, ...invoiceFromForm(formData) }, items }, user.id);
  redirect(`/admin/invoices/${id}`);
}

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ job?: string; hours?: string }> }) {
  const [{ company }, { t }, sp] = await Promise.all([requirePerm("invoices.create"), getT(), searchParams]);
  // z dochádzky: faktúra za odpracované hodiny na zákazke
  const fromJob = sp.job ? getJob(company.id, sp.job) : undefined;
  const hours = Number(sp.hours ?? 0) > 0 ? String(Number(sp.hours)) : "";
  const labour = hours ? labourPrice(company.id) : undefined;

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: t.invoices.title, href: "/admin/invoices" }, { label: t.invoices.newInvoice }]} />
      <InvoiceForm
        action={createInvoice}
        company={company}
        title={t.invoices.newInvoice}
        submitLabel={t.invoices.issue}
        initial={{
          customer_id: fromJob?.customer_id ?? null,
          job_id: fromJob?.id ?? null,
          job: fromJob ? { id: fromJob.id, title: fromJob.title, job_date: fromJob.job_date } : undefined,
          note: null,
          rows: hours ? [labour ? { priceId: labour.id, query: labour.name, qty: hours } : { name: t.time.labourLine, qty: hours }] : [],
        }}
      />
    </>
  );
}
