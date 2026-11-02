import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import { submitOr, textOf } from "@/server/actions";
import { listCustomers } from "@/server/queries";
import { matches } from "@/lib/search";
import Link from "next/link";

async function addCustomer(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("customers.create");
  const t = (k: string) => textOf(formData, k);
  await submitOr("/customers", {
    type: "customer.create",
    companyId: company.id,
    customer: {
      id: randomUUID(),
      name: String(formData.get("name") ?? ""),
      ico: t("ico"), dic: t("dic"), ic_dph: t("ic_dph"),
      address: t("address"), zip: t("zip"), city: t("city"),
      email: t("email"), phone: t("phone"),
    },
  }, user.id);
  redirect("/customers?ok=saved");
}

type Search = { q?: string; new?: string };

export default async function Customers({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ company, has }, { t }, sp] = await Promise.all([requirePerm("customers.view"), getT(), searchParams]);
  const all = listCustomers(company.id);
  const c = t.common;
  const q = (sp.q ?? "").trim();
  const customers = all.filter((cu) => matches(q, cu.name, cu.address, cu.zip, cu.city, cu.ico, cu.dic, cu.ic_dph, cu.email, cu.phone));

  return (
    <>
      <Crumbs items={[{ label: t.customers.title }]} />

      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={t.search.customersPlaceholder} aria-label={t.search.search} />
        <button>{t.search.search}</button>
        {q && <Link href="/customers">{t.search.clear}</Link>}
      </form>

      {/* formulár je schovaný, kým ho používateľ neotvorí */}
      {has("customers.create") && <details className="panel create" open={sp.new === "1"}>
        <summary className="panel-title">＋ {t.customers.newCustomer}</summary>
        <form action={addCustomer} className="panel-body">
          <fieldset>
            <legend>{t.customers.nameOrPerson}</legend>
            <div className="fields">
              <label className="field wide">{t.customers.nameOrPerson} <input name="name" required /></label>
              <label className="field wide">{c.address} <input name="address" /></label>
              <label className="field">{c.zip} <input name="zip" /></label>
              <label className="field">{c.city} <input name="city" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.customers.companyIds}</legend>
            <div className="fields">
              <label className="field">{c.ico} <input name="ico" /></label>
              <label className="field">{c.dic} <input name="dic" /></label>
              <label className="field">{c.icDph} <input name="ic_dph" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.customers.contact}</legend>
            <div className="fields">
              <label className="field">{c.email} <input name="email" type="email" /></label>
              <label className="field">{c.phone} <input name="phone" /></label>
            </div>
          </fieldset>
          <div className="actions"><button className="primary">{c.add}</button></div>
        </form>
      </details>}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{t.customers.title}</span>
          {q && <span className="title-stats">{t.search.found(customers.length, all.length)}</span>}
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{c.name}</th><th>{c.city}</th><th>{c.ico}</th><th>{t.customers.contact}</th></tr>
            </thead>
            <tbody>
              {!customers.length && <tr><td colSpan={4} className="empty">{q ? t.search.nothing : t.customers.empty}</td></tr>}
              {customers.map((cu) => (
                <tr key={cu.id}>
                  <td><Link href={`/customers/${cu.id}`} className="row-title">{cu.name}</Link>{cu.address && <span className="muted">{cu.address}</span>}</td>
                  <td className="m-left">{[cu.zip, cu.city].filter(Boolean).join(" ")}</td>
                  <td>{cu.ico ?? ""}</td>
                  <td>
                    {cu.phone && <a href={`tel:${cu.phone}`}>{cu.phone}</a>}
                    {cu.phone && cu.email && <br />}
                    {cu.email && <a href={`mailto:${cu.email}`}>{cu.email}</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
