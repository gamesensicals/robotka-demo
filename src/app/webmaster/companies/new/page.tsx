import { randomUUID } from "node:crypto";
import { DEFAULT_PRICES } from "@/server/default-prices";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { MIN_PASSWORD, fail, submitOr, textOf } from "@/server/actions";
import { hashPassword } from "@/server/auth";
import { WEBMASTER } from "@/server/events";
import { getAccountRequest } from "@/server/queries";

async function createCompany(formData: FormData) {
  "use server";
  await requireWebmaster();
  const requestId = textOf(formData, "request_id");
  const back = `/webmaster/companies/new${requestId ? `?request=${requestId}` : ""}`;
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) fail(back, "weak_password");
  const credit = Math.round(Number(String(formData.get("credit") || "0").replace(",", ".")) * 100);
  if (!Number.isFinite(credit) || credit < 0) fail(back, "invalid");
  const id = randomUUID();
  await submitOr(back, {
    type: "company.create",
    company: { id, name: String(formData.get("name") ?? ""), ico: textOf(formData, "ico") },
    owner: { id: randomUUID(), email: String(formData.get("email") ?? ""), password_hash: await hashPassword(password) },
    credit_cents: credit,
    requestId,
    prices: DEFAULT_PRICES,
  }, WEBMASTER);
  redirect(`/webmaster/companies/${id}?ok=company_created`);
}

export default async function NewCompany({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const [{ request }, , { t }] = await Promise.all([searchParams, requireWebmaster(), getT()]);
  const w = t.webmaster;
  const r = request ? getAccountRequest(request) : undefined;

  return (
    <>
      <Crumbs items={[{ label: w.title, href: "/webmaster" }, { label: w.newCompany }]} />
      <form action={createCompany} className="panel">
        <h2 className="panel-title">{w.newCompany}{r && <span className="muted"> · {w.fromRequest}</span>}</h2>
        <div className="panel-body">
          {r && <input type="hidden" name="request_id" value={r.id} />}
          <fieldset>
            <legend>{w.company}</legend>
            <div className="fields">
              <label className="field wide">{t.common.name} <input name="name" required defaultValue={r?.company_name} /></label>
              <label className="field">{t.common.ico} <input name="ico" defaultValue={r?.ico ?? ""} /></label>
              <label className="field">{w.initialCredit} <input name="credit" inputMode="decimal" defaultValue="0" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{w.owner}</legend>
            <div className="fields">
              <label className="field">{t.common.email} <input name="email" type="email" required defaultValue={r?.email} autoComplete="off" /></label>
              <label className="field">{t.employees.tempPassword} <input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>{w.newCompanyHint}</p>
          </fieldset>
          <div className="actions"><button className="primary">{w.createCompany}</button></div>
        </div>
      </form>
    </>
  );
}
