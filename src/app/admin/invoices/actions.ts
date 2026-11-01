"use server";

import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { submitOr } from "@/server/actions";

const backOf = (formData: FormData) => {
  const b = String(formData.get("back") ?? "/admin/invoices");
  return b.startsWith("/admin/") ? b : "/admin/invoices";
};

/** Zmazať sa dá len koncept a stornovaná faktúra (kontroluje aj applyEvent). */
export async function deleteInvoice(formData: FormData) {
  const { company, user } = await requirePerm("invoices.delete");
  const back = backOf(formData);
  await submitOr(back, { type: "invoice.delete", companyId: company.id, invoiceId: String(formData.get("id")) }, user.id);
  // detail zmazanej faktúry už neexistuje -> späť na zoznam
  const to = back.startsWith("/admin/invoices/") ? "/admin/invoices" : back;
  redirect(`${to}${to.includes("?") ? "&" : "?"}ok=invoice_deleted`);
}
