"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { DUE_DAYS } from "@/lib/invoice-math";
import { fail, submitOr } from "@/server/actions";
import { QUOTE_STATUSES, type QuoteStatus } from "@/server/events";
import { getQuote } from "@/server/queries";

// Akcie na detaile cenovej ponuky.
const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export async function setQuoteStatus(formData: FormData) {
  const { company, user } = await requirePerm("invoices.status");
  const id = String(formData.get("id"));
  const back = `/admin/quotes/${id}`;
  const status = String(formData.get("status")) as QuoteStatus;
  if (!QUOTE_STATUSES.includes(status)) fail(back, "invalid");
  await submitOr(back, { type: "quote.setStatus", companyId: company.id, quoteId: id, status }, user.id);
  redirect(`${back}?ok=saved`);
}

export async function deleteQuote(formData: FormData) {
  const { company, user } = await requirePerm("invoices.delete");
  const id = String(formData.get("id"));
  await submitOr(`/admin/quotes/${id}`, { type: "quote.delete", companyId: company.id, quoteId: id }, user.id);
  redirect("/admin/quotes?ok=quote_deleted");
}

/** Prijatá ponuka → koncept faktúry s rovnakými položkami (dátumy dnes, splatnosť + 14 dní). */
export async function quoteToInvoice(formData: FormData) {
  const { company, user } = await requirePerm("invoices.create");
  const id = String(formData.get("id"));
  const today = new Date().toISOString().slice(0, 10);
  const invoiceId = randomUUID();
  await submitOr(`/admin/quotes/${id}`, {
    type: "quote.toInvoice", companyId: company.id, quoteId: id, invoiceId,
    issue_date: today, delivery_date: today, due_date: plusDays(today, DUE_DAYS),
  }, user.id);
  redirect(`/admin/invoices/${invoiceId}/edit?ok=quote_invoiced`);
}

/** Zákazka z ponuky: zákazník a dnešný dátum, názov z formulára. */
export async function quoteToJob(formData: FormData) {
  const { company, user } = await requirePerm("jobs.create", "invoices.edit");
  const id = String(formData.get("id"));
  const back = `/admin/quotes/${id}`;
  const q = getQuote(company.id, id);
  if (!q) fail(back, "not_found");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) fail(back, "invalid");
  const jobId = randomUUID();
  const buyer = q.buyer ? (JSON.parse(q.buyer) as { address?: string | null; zip?: string | null; city?: string | null }) : null;
  const address = buyer ? [buyer.address, [buyer.zip, buyer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;
  await submitOr(back, {
    type: "job.create", companyId: company.id,
    job: { id: jobId, title, description: null, address, customer_id: q.customer_id, job_date: new Date().toISOString().slice(0, 10) },
  }, user.id);
  await submitOr(back, { type: "quote.setJob", companyId: company.id, quoteId: id, jobId }, user.id);
  redirect(`/jobs/${jobId}?ok=quote_job`);
}
