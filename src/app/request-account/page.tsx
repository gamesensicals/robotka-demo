import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/i18n";
import { fail, submitOr, textOf } from "@/server/actions";
import { siteSettings } from "@/server/billing";
import { getDb } from "@/server/db";
import { allow } from "@/server/ratelimit";
import { LOGO_ACCEPT, extOf, logoType, putFile } from "@/server/files";

const BACK = "/request-account";

async function sendRequest(formData: FormData) {
  "use server";
  // pasca na roboty: skryté pole, ktoré človek nevyplní
  if (String(formData.get("website") ?? "")) redirect(`${BACK}?sent=1`);
  if (!(await allow("account-request", 3, 60 * 60_000))) fail(BACK, "too_many");
  const id = randomUUID();
  // voliteľné logo: po založení firmy sa ukáže aj zamestnancom na prihlásení
  let logo_path: string | null = null;
  const logo = formData.get("logo") as File | null;
  if (logo && logo.size > 0) {
    const type = logoType(logo);
    if (!type || logo.size > 2_000_000) fail(BACK, "logo_invalid");
    logo_path = `requests/${id}/logo.${extOf(logo.name, "png")}`;
    try {
      await putFile(logo_path, logo, type);
    } catch {
      fail(BACK, "sync_down");
    }
  }
  await submitOr(BACK, {
    type: "account.request",
    request: {
      id,
      logo_path,
      logo_size: logo_path && logo ? logo.size : 0,
      company_name: String(formData.get("company_name") ?? ""),
      contact_name: String(formData.get("contact_name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: textOf(formData, "phone"),
      ico: textOf(formData, "ico"),
      message: textOf(formData, "message"),
    },
  }, null);
  redirect(`${BACK}?sent=1`);
}

export default async function RequestAccount() {
  const { t } = await getT();
  return (
    <section className="panel narrow">
      <h2 className="panel-title">{t.demo.requestTitle}</h2>
      <div className="panel-body">
        <p>{t.demo.requestText}</p>
        <div className="actions"><a href="https://robotka.beer/request-account" className="button primary">{t.demo.ownAccount}</a></div>
      </div>
    </section>
  );
}

/** Pôvodný formulár žiadosti (v deme sa nezobrazuje, ostáva kvôli ľahšiemu prenosu zmien z hlavnej aplikácie). */
export async function RequestAccountForm({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const [{ sent }, { t, credits }] = await Promise.all([searchParams, getT()]);
  const r = t.request;
  const s = siteSettings(getDb());

  return (
    <>
      <nav className="crumbs"><Link href="/login">{t.login.title}</Link><span className="sep"> » </span><span>{r.title}</span></nav>

      {sent ? (
        <section className="panel">
          <h2 className="panel-title">{r.sentTitle}</h2>
          <div className="panel-body"><p>{r.sentText}</p><Link href="/login" className="button">{r.back}</Link></div>
        </section>
      ) : (
        <div className="cols-2">
          <div className="stack">
            <section className="panel">
              <h2 className="panel-title">{r.howTitle}</h2>
              <div className="panel-body">
                <ol className="steps">
                  <li>{r.step1}</li>
                  <li>{r.step2}</li>
                  <li>{r.step3}</li>
                </ol>
                {s.info_text && <p style={{ whiteSpace: "pre-line" }}>{s.info_text}</p>}
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">{r.pricingTitle}</h2>
              <div className="table-wrap">
                <table className="keep-table">
                  <tbody>
                    <tr><td className="row-title">{r.feeLabel}</td><td className="num">{credits(s.monthly_fee_cents)} {r.perMonth}</td></tr>
                    <tr><td className="row-title">{r.storageLabel}</td><td className="num">{credits(s.storage_cents_per_gb)} {r.perGbMonth}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="panel-body">
                <p className="muted">{r.feeNote}</p>
                <p className="muted">{r.storageHow}</p>
                <p className="muted">{r.creditsHow}</p>
              </div>
            </section>

            {(s.contact_email || s.contact_phone) && (
              <section className="panel">
                <h2 className="panel-title">{r.contactTitle}</h2>
                <dl className="stats">
                  {s.operator_name && <><dt>{r.operator}</dt><dd>{s.operator_name}</dd></>}
                  {s.contact_email && <><dt>{t.common.email}</dt><dd><a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></dd></>}
                  {s.contact_phone && <><dt>{t.common.phone}</dt><dd><a href={`tel:${s.contact_phone}`}>{s.contact_phone}</a></dd></>}
                </dl>
              </section>
            )}
          </div>

          <form action={sendRequest} className="panel">
            <h2 className="panel-title">{r.formTitle}</h2>
            <div className="panel-body">
              <fieldset>
                <legend>{r.companyLegend}</legend>
                <div className="fields">
                  <label className="field wide">{r.companyName} <input name="company_name" required maxLength={200} /></label>
                  <label className="field">{t.common.ico} <input name="ico" maxLength={20} /></label>
                  <label className="field wide">{r.logo} <input type="file" name="logo" accept={LOGO_ACCEPT} /></label>
                  <p className="muted wide">{r.logoHint}</p>
                </div>
              </fieldset>
              <fieldset>
                <legend>{r.contactLegend}</legend>
                <div className="fields">
                  <label className="field wide">{r.contactName} <input name="contact_name" required maxLength={200} autoComplete="name" /></label>
                  <label className="field">{t.common.email} <input name="email" type="email" required maxLength={200} autoComplete="email" /></label>
                  <label className="field">{t.common.phone} <input name="phone" maxLength={50} autoComplete="tel" /></label>
                  <label className="field wide">{r.message} <textarea name="message" maxLength={4000} /></label>
                </div>
              </fieldset>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="trap" />
              <div className="actions"><button className="primary">{r.send}</button></div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
