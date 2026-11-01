import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { PRICE_NOTICE_DAYS } from "@/lib/mail-kinds";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr, textOf } from "@/server/actions";
import { siteSettings } from "@/server/billing";
import { getDb } from "@/server/db";
import { WEBMASTER } from "@/server/events";
import { companiesOverview, pendingPriceChange } from "@/server/queries";

const BACK = "/webmaster/settings";
const centsOf = (formData: FormData, key: string) => Math.round(Number(String(formData.get(key) ?? "").replace(",", ".")) * 100);

async function save(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(BACK, {
    type: "site.update",
    patch: {
      operator_name: textOf(formData, "operator_name"),
      iban: textOf(formData, "iban"),
      contact_email: textOf(formData, "contact_email"),
      contact_phone: textOf(formData, "contact_phone"),
      info_text: textOf(formData, "info_text"),
    },
  }, WEBMASTER);
  redirect(`${BACK}?ok=saved`);
}

/** Nové ceny platia až o 31 dní (kým nie je žiadna firma, hneď). */
async function schedulePrices(formData: FormData) {
  "use server";
  await requireWebmaster();
  const fee = centsOf(formData, "monthly_fee");
  const storage = centsOf(formData, "storage_price");
  if (!Number.isFinite(fee) || !Number.isFinite(storage) || fee < 0 || storage < 0) fail(BACK, "invalid");
  const fee_mode = formData.get("fee_mode") === "per_company" ? "per_company" : "per_user";
  await submitOr(BACK, { type: "price.schedule", changeId: randomUUID(), monthly_fee_cents: fee, storage_cents_per_gb: storage, fee_mode }, WEBMASTER);
  redirect(`${BACK}?ok=prices_scheduled`);
}

async function cancelPrices(formData: FormData) {
  "use server";
  await requireWebmaster();
  await submitOr(BACK, { type: "price.cancel", changeId: String(formData.get("id")) }, WEBMASTER);
  redirect(`${BACK}?ok=prices_cancelled`);
}

export default async function SiteSettingsPage() {
  const [, { t, credits, date }] = await Promise.all([requireWebmaster(), getT()]);
  const w = t.webmaster;
  const s = siteSettings(getDb());
  const pending = pendingPriceChange();
  const anyCompany = companiesOverview().length > 0;
  const euro = (cents: number) => (cents / 100).toFixed(2);
  const effective = new Date(Date.now() + PRICE_NOTICE_DAYS * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <Crumbs items={[{ label: w.title, href: "/webmaster" }, { label: w.settings }]} />

      <section className="panel">
        <h2 className="panel-title">{w.pricesLegend}</h2>
        <dl className="stats">
          <dt>{w.monthlyFeeNow}</dt><dd>{credits(s.monthly_fee_cents)} {t.pricing.per[s.fee_mode]}</dd>
          <dt>{w.storagePriceNow}</dt><dd>{credits(s.storage_cents_per_gb)}</dd>
        </dl>
        {pending && (
          <div className="panel-body price-pending">
            <p>
              <strong>{w.priceChangeFrom(date(pending.effective_at.slice(0, 10)))}</strong>{" "}
              {w.priceChangeLine(
                `${credits(pending.old_fee_cents)} ${t.pricing.per[pending.old_mode ?? s.fee_mode]}`, `${credits(pending.new_fee_cents)} ${t.pricing.per[pending.new_mode ?? s.fee_mode]}`,
                credits(pending.old_storage_cents), credits(pending.new_storage_cents)
              )}
            </p>
            <form action={cancelPrices} className="actions">
              <input type="hidden" name="id" value={pending.id} />
              <ConfirmSubmit label={w.cancelPriceChange} className="danger small" question={t.confirm.cancelPriceQ} yes={w.cancelPriceChange} no={t.confirm.cancel} />
            </form>
          </div>
        )}
        <form action={schedulePrices} className="panel-body">
          <fieldset>
            <legend>{w.newPrices}</legend>
            <div className="fields">
              <label className="field">{w.monthlyFee} <input name="monthly_fee" inputMode="decimal" required defaultValue={euro(pending?.new_fee_cents ?? s.monthly_fee_cents)} /></label>
              <label className="field">{w.feeMode}
                <select name="fee_mode" defaultValue={pending?.new_mode ?? s.fee_mode}>
                  <option value="per_user">{t.pricing.modes.per_user}</option>
                  <option value="per_company">{t.pricing.modes.per_company}</option>
                </select>
              </label>
              <label className="field">{w.storagePrice} <input name="storage_price" inputMode="decimal" required defaultValue={euro(pending?.new_storage_cents ?? s.storage_cents_per_gb)} /></label>
            </div>
            <p className="muted small-note" style={{ marginTop: 12 }}>{anyCompany ? w.pricesHint(PRICE_NOTICE_DAYS) : w.pricesHintNow}</p>
          </fieldset>
          <div className="actions">
            {anyCompany ? (
              <ConfirmSubmit label={w.schedulePrices} className="primary" question={t.confirm.schedulePricesQ(date(effective))} yes={w.schedulePrices} no={t.confirm.cancel} />
            ) : (
              <button className="primary">{t.common.save}</button>
            )}
          </div>
        </form>
      </section>

      <form action={save} className="panel">
        <h2 className="panel-title">{w.settings}</h2>
        <div className="panel-body">
          <fieldset>
            <legend>{w.paymentLegend}</legend>
            <div className="fields">
              <label className="field wide">{w.operatorName} <input name="operator_name" defaultValue={s.operator_name ?? ""} /></label>
              <label className="field wide">{t.credits.iban} <input name="iban" defaultValue={s.iban ?? ""} /></label>
              <label className="field">{w.contactEmail} <input name="contact_email" type="email" defaultValue={s.contact_email ?? ""} /></label>
              <label className="field">{w.contactPhone} <input name="contact_phone" defaultValue={s.contact_phone ?? ""} /></label>
              <label className="field wide">{w.infoText} <textarea name="info_text" defaultValue={s.info_text ?? ""} /></label>
            </div>
          </fieldset>
          <div className="actions"><button className="primary">{t.common.save}</button></div>
        </div>
      </form>
    </>
  );
}
