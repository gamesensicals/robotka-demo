import type { DatabaseSync } from "node:sqlite";

// Výpočet poplatkov. Úložisko sa počíta rovnako ako v Cloudflare R2:
//   GB-mesiac = priemer denných VRCHOLOV obsadeného miesta za obdobie,
//   zaokrúhlený NAHOR na celý GB-mesiac (1,1 -> 2), bez GB zadarmo.
//   Príklad: 1 GB 5 dní, potom 3 GB 25 dní (30-dňový mesiac) = (1·5 + 3·25) / 30 = 2,66 -> 3 GB-mesiace.
// Cena za GB-mesiac a mesačný poplatok sú v nastaveniach webu (predvolené 0,12 € a 15 € za osobu).
// Všetko je deterministické (len z databázy a dátumov v udalostiach), aby to sedelo na všetkých serveroch.

export const GB = 2 ** 30;

export const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Súčet denných vrcholov (bajty × dni) za mesiac, najviac do dňa `untilDay` vrátane. */
export function storageByteDays(db: DatabaseSync, companyId: string, month: string, untilDay?: number): number {
  const days = daysInMonth(month);
  const last = Math.min(days, untilDay ?? days);
  const rows = db
    .prepare("SELECT day, peak_bytes, end_bytes FROM storage_usage WHERE company_id = ? AND day <= ? ORDER BY day")
    .all(companyId, `${month}-${String(last).padStart(2, "0")}`) as { day: string; peak_bytes: number; end_bytes: number }[];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  // stav na začiatku mesiaca = koncový stav posledného dňa so zmenou pred mesiacom
  let carry = 0;
  for (const r of rows) if (r.day < `${month}-01`) carry = r.end_bytes;
  let sum = 0;
  for (let d = 1; d <= last; d++) {
    const row = byDay.get(`${month}-${String(d).padStart(2, "0")}`);
    if (row) {
      sum += row.peak_bytes;
      carry = row.end_bytes;
    } else {
      sum += carry;
    }
  }
  return sum;
}

/** GB-mesiace za celý mesiac, zaokrúhlené nahor (ako R2). */
export const gbMonths = (byteDays: number, month: string) =>
  byteDays <= 0 ? 0 : Math.ceil(byteDays / (GB * daysInMonth(month)));

/** Pomerný mesačný poplatok od dňa `day` (vrátane) do konca mesiaca. */
export const proratedFee = (feeCents: number, month: string, day: number) =>
  Math.round((feeCents * (daysInMonth(month) - day + 1)) / daysInMonth(month));

export type SiteSettings = {
  operator_name: string | null; iban: string | null; contact_email: string | null; contact_phone: string | null;
  info_text: string | null; monthly_fee_cents: number; storage_cents_per_gb: number; fee_mode: FeeMode;
};
export type FeeMode = "per_user" | "per_company";

/** Natrvalo odpustená prevádzka. */
export const WAIVED_FOREVER = "9999-12";

/**
 * Prevádzka firmy za mesiac `month`: cena (individuálna firmy, inak cenník webu) × počet ľudí, ak sa
 * platí na osobu. Počet ľudí = aspoň najvyšší počet v mesiaci `peakMonth` (aby sa nedalo ľudí na deň
 * vyúčtovania odobrať). Odpustená prevádzka (len webmaster) = 0.
 */
export function companyFee(db: DatabaseSync, companyId: string, settings: Pick<SiteSettings, "monthly_fee_cents" | "fee_mode">, month: string, peakMonth?: string) {
  const c = db.prepare("SELECT fee_cents, fee_mode, fee_waived_until FROM companies WHERE id = ?").get(companyId) as
    { fee_cents: number | null; fee_mode: FeeMode | null; fee_waived_until: string | null } | undefined;
  const unit = c?.fee_cents ?? settings.monthly_fee_cents;
  const mode: FeeMode = c?.fee_mode ?? settings.fee_mode ?? "per_user";
  const people = (db.prepare("SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?").get(companyId) as { n: number }).n;
  const peak = peakMonth
    ? ((db.prepare("SELECT peak FROM member_peaks WHERE company_id = ? AND month = ?").get(companyId, peakMonth) as { peak: number } | undefined)?.peak ?? 0)
    : 0;
  const units = mode === "per_user" ? Math.max(1, people, peak) : 1;
  const waived = !!c?.fee_waived_until && month <= c.fee_waived_until;
  return { unit, mode, units, people, waived, cents: waived ? 0 : unit * units };
}

export const siteSettings = (db: DatabaseSync) => db.prepare("SELECT * FROM site_settings WHERE id = 1").get() as SiteSettings;
