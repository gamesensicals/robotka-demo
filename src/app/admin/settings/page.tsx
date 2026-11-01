import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr, textOf } from "@/server/actions";
import { LOGO_ACCEPT, deleteFile, extOf, logoType, putFile, signedFileUrl } from "@/server/files";

async function saveCompany(formData: FormData) {
  "use server";
  const { company, user, readOnly } = await requirePerm("company.settings");
  const back = "/admin/settings";
  if (readOnly) fail(back, "read_only");
  const text = (k: string) => textOf(formData, k);

  let logo_path = company.logo_path;
  const logo = formData.get("logo") as File | null;
  if (logo && logo.size > 0) {
    const type = logoType(logo);
    if (!type || logo.size > 2_000_000) fail(back, "logo_invalid");
    logo_path = `${company.id}/logo-${randomUUID()}.${extOf(logo.name, "png")}`;
    try {
      await putFile(logo_path, logo, type);
    } catch {
      fail(back, "sync_down");
    }
  }

  await submitOr(back, {
    type: "company.update",
    companyId: company.id,
    patch: {
      name: String(formData.get("name") ?? ""),
      ico: text("ico"), dic: text("dic"), ic_dph: text("ic_dph"),
      address: text("address"), city: text("city"), zip: text("zip"),
      email: text("email"), phone: text("phone"), iban: text("iban"),
      is_vat_payer: formData.get("is_vat_payer") === "on",
      default_vat_rate: Number(formData.get("default_vat_rate") || 23),
      invoice_prefix: String(formData.get("invoice_prefix") ?? ""),
      invoice_footer: text("invoice_footer"),
      logo_path,
      logo_size: logo && logo.size > 0 ? logo.size : 0,
    },
  }, user.id);
  if (company.logo_path && company.logo_path !== logo_path) await deleteFile(company.logo_path);
  redirect(`${back}?ok=saved`);
}

export default async function Settings() {
  const [{ company }, { t }] = await Promise.all([requirePerm("company.settings"), getT()]);
  const logoUrl = company.logo_path ? signedFileUrl(company.logo_path) : null;
  const c = t.common;
  const s = t.settings;

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: s.title }]} />
      <form action={saveCompany} className="panel">
        <h2 className="panel-title">{company.name} – {s.title}</h2>
        <div className="panel-body">
          <fieldset>
            <legend>{s.companyData}</legend>
            <div className="fields">
              <label className="field wide">{c.name} <input name="name" defaultValue={company.name} required /></label>
              <label className="field">{c.ico} <input name="ico" defaultValue={company.ico ?? ""} /></label>
              <label className="field">{c.dic} <input name="dic" defaultValue={company.dic ?? ""} /></label>
              <label className="field">{c.icDph} <input name="ic_dph" defaultValue={company.ic_dph ?? ""} /></label>
              <label className="field wide">{c.address} <input name="address" defaultValue={company.address ?? ""} /></label>
              <label className="field">{c.zip} <input name="zip" defaultValue={company.zip ?? ""} /></label>
              <label className="field">{c.city} <input name="city" defaultValue={company.city ?? ""} /></label>
              <label className="field">{c.email} <input name="email" type="email" defaultValue={company.email ?? ""} /></label>
              <label className="field">{c.phone} <input name="phone" defaultValue={company.phone ?? ""} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{s.invoicing}</legend>
            <div className="fields">
              <label className="field wide">{t.invoices.iban} <input name="iban" defaultValue={company.iban ?? ""} /></label>
              <label className="field">{s.defaultVat} <input name="default_vat_rate" type="number" step="0.01" defaultValue={company.default_vat_rate} /></label>
              <label className="field">{s.prefix} <input name="invoice_prefix" defaultValue={company.invoice_prefix} /></label>
              <label className="check wide"><input type="checkbox" name="is_vat_payer" defaultChecked={company.is_vat_payer} /> {s.vatPayer}</label>
              <label className="field wide">{s.footer} <textarea name="invoice_footer" defaultValue={company.invoice_footer ?? ""} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{s.logo}</legend>
            {logoUrl && <p><img src={logoUrl} alt="Logo" height={60} /></p>}
            <input type="file" name="logo" accept={LOGO_ACCEPT} aria-label={s.logo} />
            <p className="muted" style={{ marginTop: 10 }}>{t.request.logoHint}</p>
          </fieldset>

          <div className="actions"><button className="primary">{c.save}</button></div>
        </div>
      </form>
    </>
  );
}
