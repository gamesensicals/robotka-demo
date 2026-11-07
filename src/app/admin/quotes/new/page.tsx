import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import InvoiceForm from "@/components/InvoiceForm";
import { submitOr } from "@/server/actions";
import { itemsFromForm, quoteFromForm } from "@/server/invoice-form";
import { getJob } from "@/server/queries";

async function createQuote(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("invoices.create");
  const back = "/admin/quotes/new";
  const items = itemsFromForm(formData, company, back);
  const id = randomUUID();
  await submitOr(back, { type: "quote.create", companyId: company.id, quote: { id, ...quoteFromForm(formData) }, items }, user.id);
  redirect(`/admin/quotes/${id}`);
}

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const [{ company }, { t }, sp] = await Promise.all([requirePerm("invoices.create"), getT(), searchParams]);
  const fromJob = sp.job ? getJob(company.id, sp.job) : undefined;
  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: t.quotes.title, href: "/admin/quotes" }, { label: t.quotes.newQuote }]} />
      <InvoiceForm
        kind="quote"
        action={createQuote}
        company={company}
        title={t.quotes.newQuote}
        submitLabel={t.quotes.issue}
        initial={{
          customer_id: fromJob?.customer_id ?? null,
          job_id: fromJob?.id ?? null,
          job: fromJob ? { id: fromJob.id, title: fromJob.title, job_date: fromJob.job_date } : undefined,
          note: null,
          rows: [],
        }}
      />
    </>
  );
}
