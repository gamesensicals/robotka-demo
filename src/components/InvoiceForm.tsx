import type { ReactNode } from "react";
import { getT } from "@/i18n";
import InvoiceDates from "@/components/InvoiceDates";
import InvoiceLines from "@/components/InvoiceLines";
import { type Company, activePrices, customerHint, customerOptions, jobOptions, listCategories } from "@/server/queries";
import SearchSelect from "@/components/SearchSelect";

type Row = { priceId?: string; query?: string; name?: string; qty?: string; unitPrice?: string; unit?: string; vat?: string };
export type InvoiceFormInitial = {
  customer_id: string | null; job_id: string | null; issue?: string; delivery?: string; due?: string; note: string | null; rows: Row[];
  reverse_charge?: boolean;
  /** cenová ponuka: platná do */
  valid?: string;
  job?: { id: string; title: string; job_date: string };
};

/** Formulár faktúry – nová aj úprava konceptu. */
export default async function InvoiceForm({
  action, company, title, submitLabel, initial, hidden, kind = "invoice",
}: {
  /** "quote" = cenová ponuka (vystavenie + platnosť namiesto dodania a splatnosti) */
  kind?: "invoice" | "quote";
  action: (formData: FormData) => Promise<void>;
  company: Company;
  title: string;
  submitLabel: string;
  initial: InvoiceFormInitial;
  hidden?: ReactNode;
}) {
  const { t, date, locale } = await getT();
  const ti = t.invoices;
  const customers = customerOptions(company.id);
  const jobs = jobOptions(company.id);
  if (initial.job && !jobs.some((j) => j.id === initial.job!.id)) jobs.unshift({ customer_name: null, ...initial.job });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="panel">
      <h2 className="panel-title">{title}</h2>
      <div className="panel-body">
        {hidden}
        <fieldset>
          <legend>{ti.header}</legend>
          <div className="fields">
            <label className="field">{t.common.customer}
              <SearchSelect
                name="customer_id" defaultValue={initial.customer_id ?? ""} emptyLabel={t.common.chooseCustomer} placeholder={t.search.typeToSearch}
                noMatch={t.search.nothing} ariaLabel={t.common.customer}
                options={customers.map((c) => ({ value: c.id, label: c.name, hint: customerHint(c) }))}
              />
            </label>
            <label className="field">{t.jobs.job}
              <SearchSelect
                name="job_id" defaultValue={initial.job_id ?? ""} emptyLabel={ti.chooseJob} placeholder={t.search.typeToSearch}
                noMatch={t.search.nothing} ariaLabel={t.jobs.job}
                options={jobs.map((j) => ({ value: j.id, label: j.title, hint: [date(j.job_date), j.customer_name].filter(Boolean).join(" · ") }))}
              />
            </label>
            {kind === "quote" ? (
              <>
                <label className="field">{ti.issued} <input type="date" name="issue_date" required defaultValue={initial.issue ?? today} /></label>
                <label className="field">{t.quotes.validUntil}
                  <input type="date" name="valid_until" defaultValue={initial.valid ?? ""} />
                  <span className="muted small-note">{t.quotes.validHint}</span>
                </label>
              </>
            ) : (
              <InvoiceDates
                today={today}
                initial={initial.issue && initial.delivery && initial.due ? { issue: initial.issue, delivery: initial.delivery, due: initial.due } : undefined}
                labels={{ issued: ti.issued, delivery: ti.delivery, due: ti.due, dueHint: ti.dueHint }}
              />
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>{ti.items}</legend>
          <InvoiceLines
            prices={activePrices(company.id).map((p) => ({ id: p.id, name: p.name, unit: p.unit, unit_price: Number(p.unit_price), vat_rate: p.vat_rate, category_id: p.category_id }))}
            categories={listCategories(company.id).map((c) => ({ id: c.id, name: c.name }))}
            initial={initial.rows}
            isVatPayer={company.is_vat_payer}
            reverseCharge={{ initial: !!initial.reverse_charge, label: ti.reverseCharge, hint: ti.reverseChargeHint }}
            defaultVat={Number(company.default_vat_rate)}
            locale={locale}
            labels={{
              guide: ti.linesGuide, fromPrices: ti.fromPricesHead, searchPh: ti.searchPricePh, customName: ti.customName,
              nameOptional: ti.nameOptional, nameRequired: ti.nameRequired, qty: ti.qty, unitPrice: ti.unitPrice,
              priceFromList: ti.priceFromList, priceRequired: ti.priceRequired, lineTotal: ti.colLineNet, addRow: ti.addRow,
              remove: t.common.delete, allCategories: t.prices.allCategories, noCategory: t.prices.noCategory, noMatch: ti.noMatch,
              net: ti.totalNet, vat: ti.totalVat, total: ti.toPay, required: ti.requiredNote,
            }}
          />
        </fieldset>

        <fieldset>
          <legend>{ti.note}</legend>
          <textarea name="note" defaultValue={initial.note ?? ""} />
        </fieldset>
        <div className="actions"><button className="primary">{submitLabel}</button></div>
      </div>
    </form>
  );
}
