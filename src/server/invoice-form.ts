import { DUE_DAYS } from "@/lib/invoice-math";
import { fail, textOf } from "./actions";
import { type InvoiceData, type InvoiceLine, type QuoteData, QUOTE_VALID_DAYS } from "./events";
import { type Company, activePrices } from "./queries";

// Spoločné spracovanie formulára faktúry (nová aj úprava konceptu).

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Položky z formulára (InvoiceLines): z cenníka alebo vlastné; neúplný riadok = hláška. */
export function itemsFromForm(formData: FormData, company: Company, back: string): InvoiceLine[] {
  const priceById = new Map(activePrices(company.id).map((p) => [p.id, p]));
  const defaultVat = Number(company.default_vat_rate);
  const items: InvoiceLine[] = [];
  const rows = Math.min(100, Math.max(0, Number(formData.get("rows") ?? 0) || 0));
  for (let i = 0; i < rows; i++) {
    const priceId = String(formData.get(`price_${i}`) ?? "");
    const p = priceId ? priceById.get(priceId) : undefined;
    const qtyText = String(formData.get(`qty_${i}`) ?? "").trim();
    const manualName = String(formData.get(`name_${i}`) ?? "").trim();
    const manualPrice = String(formData.get(`unit_price_${i}`) ?? "").trim();
    if (!p && !qtyText && !manualName && !manualPrice) continue; // prázdny riadok
    const qty = Number(qtyText.replace(",", "."));
    // neúplný riadok: chýba množstvo, alebo (bez cenníka) názov či cena
    if (!(qty > 0) || (!p && (!manualName || manualPrice === "")) || (priceId && !p)) fail(back, "item_incomplete");
    const unitPrice = manualPrice !== "" ? Number(manualPrice.replace(",", ".")) : Number(p!.unit_price);
    if (!Number.isFinite(unitPrice)) fail(back, "item_incomplete");
    const vatText = String(formData.get(`vat_${i}`) ?? "");
    items.push({
      name: manualName || p!.name,
      unit: p?.unit ?? (String(formData.get(`unit_${i}`) ?? "").trim() || "ks"),
      quantity: qty,
      unit_price: unitPrice,
      // neplatcovi DPH nastaví 0 až apply podľa nastavení firmy
      vat_rate: p ? Number(p.vat_rate ?? defaultVat) : vatText !== "" ? Number(vatText) : defaultVat,
    });
  }
  if (items.length === 0) fail(back, "no_items");
  return items;
}

/** Hlavička faktúry z formulára; prázdna splatnosť = dodanie + 14 dní. */
export function invoiceFromForm(formData: FormData): Omit<InvoiceData, "id"> {
  const delivery = String(formData.get("delivery_date"));
  return {
    customer_id: textOf(formData, "customer_id"),
    job_id: textOf(formData, "job_id"),
    issue_date: String(formData.get("issue_date")),
    delivery_date: delivery,
    due_date: String(formData.get("due_date") || "") || plusDays(delivery, DUE_DAYS),
    note: textOf(formData, "note"),
    reverse_charge: formData.get("reverse_charge") === "on",
  };
}

/** Hlavička cenovej ponuky z formulára (platnosť predvolene 30 dní od vystavenia). */
export function quoteFromForm(formData: FormData): Omit<QuoteData, "id"> {
  const issue = String(formData.get("issue_date") || new Date().toISOString().slice(0, 10));
  return {
    customer_id: textOf(formData, "customer_id"),
    job_id: textOf(formData, "job_id"),
    issue_date: issue,
    valid_until: String(formData.get("valid_until") || "") || plusDays(issue, QUOTE_VALID_DAYS),
    note: textOf(formData, "note"),
    reverse_charge: formData.get("reverse_charge") === "on",
  };
}
