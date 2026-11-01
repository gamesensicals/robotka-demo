import { type FeeMode, GB, companyFee, daysInMonth, gbMonths, nextMonth, siteSettings, storageByteDays } from "./billing";
import { getDb } from "./db";
import { REQUEST_DONE_DAYS, REQUEST_REJECTED_DAYS, SYSTEM, TICKET_IDLE_DAYS } from "./events";
import { deleteFile } from "./files";
import { dueInvoiceDeletes, dueRequestDeletes, firstCompanyMonth, lastBillingMonth, ticketsNeedMaintenance, type Company } from "./queries";
import { SyncError, submit, syncStatus } from "./sync";

/** Odhad pre aktuálny mesiac: ak obsadené miesto ostane rovnaké, toľko sa strhne na začiatku ďalšieho mesiaca. */
export function monthEstimate(company: Pick<Company, "id" | "storage_bytes">) {
  const db = getDb();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.getUTCDate();
  const days = daysInMonth(month);
  const projected = storageByteDays(db, company.id, month, day) + company.storage_bytes * (days - day);
  // ak do 1. dňa ďalšieho mesiaca začne platiť nová cena, odhad počíta s ňou
  const settings = { ...siteSettings(db) };
  const change = db.prepare(
    "SELECT new_fee_cents, new_storage_cents, new_mode FROM price_changes WHERE status = 'pending' AND effective_at <= ? ORDER BY effective_at DESC LIMIT 1"
  ).get(`${nextMonth(month)}-01T00:00:00.000Z`) as { new_fee_cents: number; new_storage_cents: number; new_mode: FeeMode | null } | undefined;
  if (change) {
    settings.monthly_fee_cents = change.new_fee_cents;
    settings.storage_cents_per_gb = change.new_storage_cents;
    if (change.new_mode) settings.fee_mode = change.new_mode;
  }
  const gbm = gbMonths(projected, month);
  // prevádzka na ďalší mesiac: počet ľudí aspoň ako najviac v tomto mesiaci
  const fee = companyFee(db, company.id, settings, nextMonth(month), month);
  return {
    month,
    next: nextMonth(month),
    gbMonthsExact: projected / (GB * days),
    gbMonths: gbm,
    storageCents: gbm * settings.storage_cents_per_gb,
    feeCents: fee.cents,
    fee,
    settings,
  };
}

/**
 * Mesačná uzávierka. Každý server raz za čas skontroluje, či sú uzavreté všetky mesiace až po
 * aktuálny, a chýbajúce pošle hubu. Ak to naraz spravia dva servery, druhú udalosť apply
 * odmietne ako duplicitnú, takže sa nič nestrhne dvakrát.
 */
export async function closeBillingMonths() {
  if (!syncStatus().ready) return;
  const current = new Date().toISOString().slice(0, 7);
  const last = lastBillingMonth();
  const first = firstCompanyMonth();
  if (!last && !first) return;
  for (let month = last ? nextMonth(last) : nextMonth(first!); month <= current; month = nextMonth(month)) {
    try {
      await submit({ type: "billing.close", month }, SYSTEM);
      console.log(`[billing] month ${month} closed`);
    } catch (e) {
      if (e instanceof SyncError && e.code === "duplicate") continue; // iný server bol rýchlejší
      console.error(`[billing] closing month ${month} failed:`, e);
      return;
    }
  }
}

/** Faktúry naplánované na zmazanie (16 dní uplynulo): jeden server pošle udalosť, ostatné ju len aplikujú. */
export async function purgeDueInvoices() {
  if (!syncStatus().ready || dueInvoiceDeletes() === 0) return;
  try {
    await submit({ type: "invoice.purgeDue" }, SYSTEM);
  } catch (e) {
    console.error("[invoices] deleting scheduled invoices failed:", e);
  }
}

/** Chaty podpory: zatvoriť po 7 dňoch ticha, zmazať 7 dní po zatvorení (jedna udalosť, aplikujú všetci). */
export async function maintainTickets() {
  if (!syncStatus().ready || !ticketsNeedMaintenance(new Date().toISOString(), TICKET_IDLE_DAYS)) return;
  try {
    await submit({ type: "ticket.maintain" }, SYSTEM);
  } catch (e) {
    console.error("[support] chat maintenance failed:", e);
  }
}

/** Žiadosti o účet: vybavené zmazať po 7 dňoch, zamietnuté po 30 dňoch (aj s logom, ak ho nepoužíva firma). */
export async function maintainRequests() {
  if (!syncStatus().ready) return;
  const due = dueRequestDeletes(new Date().toISOString(), REQUEST_DONE_DAYS, REQUEST_REJECTED_DAYS);
  if (!due.length) return;
  try {
    await submit({ type: "request.maintain" }, SYSTEM);
  } catch (e) {
    console.error("[requests] deleting old account requests failed:", e);
    return;
  }
  // logo vybavenej žiadosti môže používať založená firma – to ostáva
  for (const r of due) if (r.logo_path && !r.logo_used) await deleteFile(r.logo_path);
}

/** Naplánovaná zmena ceny, ktorej čas prišiel, sa zapíše (jedna udalosť, aplikujú všetci). */
export async function applyPriceChanges() {
  if (!syncStatus().ready) return;
  const due = getDb().prepare("SELECT 1 FROM price_changes WHERE status = 'pending' AND effective_at <= ? LIMIT 1").get(new Date().toISOString());
  if (!due) return;
  try {
    await submit({ type: "price.apply" }, SYSTEM);
  } catch (e) {
    if (!(e instanceof SyncError && e.code === "duplicate")) console.error("[prices] applying the new prices failed:", e);
  }
}
