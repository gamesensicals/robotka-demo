import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { matches } from "@/lib/search";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { submitOr, textOf } from "@/server/actions";
import { listCategories, listPrices } from "@/server/queries";

const BACK = "/admin/prices";
const vatOf = (formData: FormData) => {
  const v = String(formData.get("vat_rate") ?? "").trim();
  return v === "" ? null : Number(v.replace(",", "."));
};
const priceOf = (formData: FormData) => Number(String(formData.get("unit_price") || 0).replace(",", "."));

async function addPrice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, {
    type: "price.add",
    companyId: company.id,
    item: {
      id: randomUUID(),
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") || "ks"),
      unit_price: priceOf(formData),
      vat_rate: vatOf(formData),
      is_labor: formData.get("is_labor") === "on",
      category_id: textOf(formData, "category_id"),
    },
  }, user.id);
  redirect(`${BACK}?ok=saved`);
}

async function updatePrice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, {
    type: "price.update",
    companyId: company.id,
    itemId: String(formData.get("id")),
    patch: {
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") || "ks"),
      unit_price: priceOf(formData),
      vat_rate: vatOf(formData),
      category_id: String(formData.get("category_id") ?? ""), // "" = bez kategórie
    },
  }, user.id);
  redirect(`${BACK}?ok=saved`);
}

async function deletePrice(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, { type: "price.delete", companyId: company.id, itemId: String(formData.get("id")) }, user.id);
  redirect(`${BACK}?ok=price_deleted`);
}

async function addCategory(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, { type: "category.add", companyId: company.id, category: { id: randomUUID(), name: String(formData.get("name") ?? "") } }, user.id);
  redirect(`${BACK}?ok=category_saved`);
}

async function renameCategory(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, { type: "category.rename", companyId: company.id, categoryId: String(formData.get("id")), name: String(formData.get("name") ?? "") }, user.id);
  redirect(`${BACK}?ok=category_saved`);
}

async function deleteCategory(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("prices.edit");
  await submitOr(BACK, { type: "category.delete", companyId: company.id, categoryId: String(formData.get("id")) }, user.id);
  redirect(`${BACK}?ok=category_deleted`);
}

export default async function Prices({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const [{ company, has }, { t, money, locale }, sp] = await Promise.all([requirePerm("prices.view"), getT(), searchParams]);
  // cena v políčku po slovensky (1,20); pri ukladaní sa berie čiarka aj bodka
  const priceText = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false }).format(n);
  const canEdit = has("prices.edit");
  const p = t.prices;
  const all = listPrices(company.id);
  const categories = listCategories(company.id);
  const q = (sp.q ?? "").trim();
  const cat = sp.cat ?? "";
  const shown = all.filter((i) => (cat === "" || (cat === "none" ? !i.category_id : i.category_id === cat)) && matches(q, i.name, i.unit));
  // zoskupenie podľa kategórií (v poradí kategórií, nakoniec „bez kategórie“)
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name })), { id: "", name: p.noCategory }]
    .map((g) => ({ ...g, items: shown.filter((i) => (i.category_id ?? "") === g.id) }))
    .filter((g) => g.items.length > 0);
  const filtered = q !== "" || cat !== "";
  const catOptions = [{ id: "", name: p.noCategory }, ...categories];

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: p.title }]} />

      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={p.searchPh} aria-label={t.search.search} />
        <select name="cat" defaultValue={cat} aria-label={p.category}>
          <option value="">{p.allCategories}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">{p.noCategory}</option>
        </select>
        <button>{t.search.search}</button>
        {filtered && <Link href={BACK}>{t.search.clear}</Link>}
      </form>

      {canEdit && <div className="cols-2">
        <details className="panel create">
          <summary className="panel-title">＋ {p.newItem}</summary>
          <form action={addPrice} className="panel-body">
            <div className="fields">
              <label className="field wide">{t.common.name} <input name="name" placeholder={p.namePh} required /></label>
              <label className="field">{p.category}
                <select name="category_id" defaultValue={cat && cat !== "none" ? cat : ""}>
                  {catOptions.map((c) => <option key={c.id || "none"} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">{p.unit} <input name="unit" placeholder={p.unitPh} /></label>
              <label className="field">{p.price} <input name="unit_price" inputMode="decimal" required /></label>
              <label className="field">{p.vat} <input name="vat_rate" inputMode="decimal" placeholder={p.vatDefault} /></label>
              <label className="check wide"><input type="checkbox" name="is_labor" /> {p.labor}</label>
            </div>
            <div className="actions" style={{ marginTop: 14 }}><button className="primary">{t.common.add}</button></div>
          </form>
        </details>

        <details className="panel create">
          <summary className="panel-title">{p.categories} ({categories.length})</summary>
          <div className="panel-body">
            <p className="muted small-note">{p.categoriesHint}</p>
            <ul className="cat-list">
              {categories.map((c) => (
                <li key={c.id}>
                  <form action={renameCategory} className="actions">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="name" defaultValue={c.name} aria-label={p.category} required maxLength={60} />
                    <span className="muted nowrap">{p.itemsCount(c.items)}</span>
                    <button className="small">{t.common.save}</button>
                  </form>
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmit label={t.common.delete} className="danger small" question={t.confirm.categoryQ(c.name, c.items)} yes={t.common.delete} no={t.confirm.cancel} />
                  </form>
                </li>
              ))}
            </ul>
            <form action={addCategory} className="actions" style={{ marginTop: 12 }}>
              <input name="name" placeholder={p.newCategoryPh} required maxLength={60} style={{ flex: 1 }} />
              <button className="primary small">{p.addCategory}</button>
            </form>
          </div>
        </details>
      </div>}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{p.title}</span>
          <span className="title-stats">{filtered ? t.search.found(shown.length, all.length) : p.note}</span>
        </h2>
        {groups.length === 0 && <div className="panel-body"><p className="muted">{filtered ? t.search.nothing : p.empty}</p></div>}
        {!canEdit && groups.length > 0 && (
          // len na čítanie: obyčajná tabuľka, kategórie ako medzititulky
          <div className="table-wrap">
            <table className="price-table">
              <thead>
                <tr><th>{t.common.name}</th><th>{p.unit}</th><th className="num">{p.price}</th><th className="num">{p.vat}</th></tr>
              </thead>
              <tbody>
                {groups.map((g) => [
                  <tr key={`g-${g.id || "none"}`} className="price-cat">
                    <td colSpan={4}>{g.name} <span className="muted">({g.items.length})</span></td>
                  </tr>,
                  ...g.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.unit}</td>
                      <td className="num">{money(Number(row.unit_price))}</td>
                      <td className="num">{row.vat_rate == null ? <span className="muted" title={p.vatDefault}>{company.default_vat_rate} %</span> : `${row.vat_rate} %`}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && groups.map((g) => (
          <div key={g.id || "none"} className="price-group">
            <h3>{g.name} <span className="muted">({g.items.length})</span></h3>
            <div className="price-row price-head muted" aria-hidden>
              <span>{t.common.name}</span><span>{p.unit}</span><span>{p.price}</span><span>{p.vat}</span><span>{p.category}</span><span /><span />
            </div>
            {g.items.map((row) => (
              <form key={row.id} action={updatePrice} className="price-row">
                <input type="hidden" name="id" value={row.id} />
                <input name="name" defaultValue={row.name} aria-label={t.common.name} />
                <input name="unit" defaultValue={row.unit} aria-label={p.unit} />
                <input name="unit_price" inputMode="decimal" defaultValue={priceText(Number(row.unit_price))} aria-label={p.price} title={money(Number(row.unit_price))} />
                <input name="vat_rate" inputMode="decimal" defaultValue={row.vat_rate ?? ""} placeholder={p.vatDefault} aria-label={p.vat} />
                <select name="category_id" defaultValue={row.category_id ?? ""} aria-label={p.category}>
                  {catOptions.map((c) => <option key={c.id || "none"} value={c.id}>{c.name}</option>)}
                </select>
                <button className="small">{t.common.save}</button>
                <ConfirmSubmit formAction={deletePrice} label={t.common.delete} className="danger small" question={t.confirm.priceQ(row.name)} yes={t.common.delete} no={t.confirm.cancel} />
              </form>
            ))}
          </div>
        ))}
      </section>


    </>
  );
}
