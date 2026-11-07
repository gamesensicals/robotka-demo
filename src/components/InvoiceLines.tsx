"use client";

import { useMemo, useRef, useState } from "react";

type Price = { id: string; name: string; unit: string; unit_price: number; vat_rate: number | null; category_id: string | null };
type Category = { id: string; name: string };
/** unit/vat: pri úprave faktúry ostane jednotka a sadzba DPH pôvodnej položky */
type Row = { key: number; priceId: string; query: string; name: string; qty: string; unitPrice: string; unit: string; vat: string };
type Labels = {
  guide: string; fromPrices: string; searchPh: string; customName: string; nameOptional: string; nameRequired: string;
  qty: string; unitPrice: string; priceFromList: string; priceRequired: string; lineTotal: string; addRow: string; remove: string;
  allCategories: string; noCategory: string; noMatch: string; net: string; vat: string; total: string; required: string;
};

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => Number(s.replace(",", "."));

/**
 * Položky faktúry: položku vyhľadáš v cenníku (aj podľa kategórie) ALEBO napíšeš vlastnú.
 * Povinné polia sa menia podľa toho, čo je vyplnené; súčty sa počítajú priebežne.
 * Formulár posiela rovnaké polia ako predtým (price_i, name_i, qty_i, unit_price_i) + počet riadkov.
 */
export default function InvoiceLines({
  prices, categories, initial, isVatPayer, defaultVat, locale, labels, reverseCharge,
}: {
  prices: Price[]; categories: Category[]; initial: Partial<Row>[]; isVatPayer: boolean; defaultVat: number; locale: string; labels: Labels;
  /** prenesenie daňovej povinnosti (len platiteľ DPH): faktúra bez DPH */
  reverseCharge?: { initial: boolean; label: string; hint: string };
}) {
  const nextKey = useRef(0);
  const blank = (r: Partial<Row> = {}): Row => ({ key: nextKey.current++, priceId: "", query: "", name: "", qty: "", unitPrice: "", unit: "", vat: "", ...r });
  const [rows, setRows] = useState<Row[]>(() => {
    const start = initial.map((r) => blank(r));
    while (start.length < 3) start.push(blank());
    return start;
  });
  const [cat, setCat] = useState<string>("");
  const [rc, setRc] = useState(!!reverseCharge?.initial);
  const [open, setOpen] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const byId = useMemo(() => new Map(prices.map((p) => [p.id, p])), [prices]);
  const money = useMemo(() => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }), [locale]);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? labels.noCategory;

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const suggestions = (query: string) => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return prices
      .filter((p) => (cat === "" || (cat === "none" ? !p.category_id : p.category_id === cat)) && words.every((w) => plain(`${p.name} ${catName(p.category_id)}`).includes(w)))
      .slice(0, 40);
  };

  const lineOf = (r: Row) => {
    const p = r.priceId ? byId.get(r.priceId) : undefined;
    const qty = num(r.qty);
    const unit = r.unitPrice.trim() !== "" ? num(r.unitPrice) : p ? Number(p.unit_price) : NaN;
    const vat = isVatPayer && !rc ? (r.vat !== "" ? Number(r.vat) : Number(p?.vat_rate ?? defaultVat)) : 0;
    const net = qty > 0 && Number.isFinite(unit) ? Math.round(qty * unit * 100) / 100 : 0;
    return { net, vat: Math.round(((net * vat) / 100) * 100) / 100 };
  };
  const totals = rows.reduce((t, r) => { const l = lineOf(r); return { net: t.net + l.net, vat: t.vat + l.vat }; }, { net: 0, vat: 0 });

  const choose = (r: Row, p: Price) => {
    set(r.key, { priceId: p.id, query: p.name });
    setOpen(null);
  };

  return (
    <div className="lines">
      <p className="muted lines-guide">{labels.guide}</p>
      <div className="chips" role="group" aria-label={labels.fromPrices}>
        <button type="button" className={cat === "" ? "chip on" : "chip"} onClick={() => setCat("")}>{labels.allCategories}</button>
        {categories.map((c) => (
          <button type="button" key={c.id} className={cat === c.id ? "chip on" : "chip"} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>
      <input type="hidden" name="rows" value={rows.length} />
      <div className="line line-head" aria-hidden>
        <span>{labels.fromPrices}</span><span>{labels.customName}</span><span>{labels.qty} *</span><span>{labels.unitPrice}</span><span className="num">{labels.lineTotal}</span><span />
      </div>
      {rows.map((r, i) => {
        const p = r.priceId ? byId.get(r.priceId) : undefined;
        const used = !!(r.priceId || r.name.trim() || r.qty.trim() || r.unitPrice.trim());
        const list = open === r.key ? suggestions(r.priceId ? "" : r.query) : [];
        const l = lineOf(r);
        return (
          <div key={r.key} className={`line${used ? " used" : ""}`}>
            <input type="hidden" name={`price_${i}`} value={r.priceId} />
            {!r.priceId && r.unit && <input type="hidden" name={`unit_${i}`} value={r.unit} />}
            {!r.priceId && r.vat !== "" && <input type="hidden" name={`vat_${i}`} value={r.vat} />}
            <div className="combo">
              <input
                type="search"
                value={r.query}
                placeholder={labels.searchPh}
                aria-label={labels.fromPrices}
                autoComplete="off"
                onFocus={() => { setOpen(r.key); setActive(0); }}
                onBlur={() => setTimeout(() => setOpen((o) => (o === r.key ? null : o)), 150)}
                onChange={(e) => { set(r.key, { query: e.target.value, priceId: "" }); setOpen(r.key); setActive(0); }}
                onKeyDown={(e) => {
                  const items = suggestions(r.priceId ? "" : r.query);
                  if (e.key === "ArrowDown") { e.preventDefault(); setOpen(r.key); setActive((a) => Math.min(a + 1, items.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter" && open === r.key && items[active]) { e.preventDefault(); choose(r, items[active]); }
                  else if (e.key === "Escape") setOpen(null);
                }}
              />
              {list.length > 0 && (
                <ul className="combo-list" role="listbox">
                  {list.map((s, n) => (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={n === active}
                      className={n === active ? "on" : undefined}
                      onMouseDown={(e) => { e.preventDefault(); choose(r, s); }}
                    >
                      <span>{s.name}</span>
                      <small>{catName(s.category_id)} · {money.format(Number(s.unit_price))}/{s.unit}</small>
                    </li>
                  ))}
                </ul>
              )}
              {open === r.key && list.length === 0 && r.query && !r.priceId && <div className="combo-list empty">{labels.noMatch}</div>}
            </div>
            <input
              name={`name_${i}`}
              value={r.name}
              onChange={(e) => set(r.key, { name: e.target.value })}
              placeholder={p ? labels.nameOptional : labels.nameRequired}
              aria-label={labels.customName}
              required={used && !p}
            />
            <input
              name={`qty_${i}`}
              value={r.qty}
              onChange={(e) => set(r.key, { qty: e.target.value })}
              inputMode="decimal"
              placeholder={p ? p.unit : ""}
              aria-label={labels.qty}
              required={used}
              pattern="[0-9]+([.,][0-9]{1,3})?"
            />
            <input
              name={`unit_price_${i}`}
              value={r.unitPrice}
              onChange={(e) => set(r.key, { unitPrice: e.target.value })}
              inputMode="decimal"
              placeholder={p ? labels.priceFromList.replace("{price}", money.format(Number(p.unit_price))) : labels.priceRequired}
              aria-label={labels.unitPrice}
              required={used && !p}
              pattern="-?[0-9]+([.,][0-9]{1,2})?"
            />
            <span className="num line-total">{l.net ? money.format(l.net) : ""}</span>
            <button type="button" className="linklike" aria-label={labels.remove} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>✕</button>
          </div>
        );
      })}
      {isVatPayer && reverseCharge && (
        <label className="check reverse-charge">
          <input type="checkbox" name="reverse_charge" checked={rc} onChange={(e) => setRc(e.target.checked)} />
          <span>{reverseCharge.label}<span className="muted small-note">{reverseCharge.hint}</span></span>
        </label>
      )}
      <div className="actions spread lines-foot">
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])}>＋ {labels.addRow}</button>
        <dl className="lines-totals">
          <dt>{labels.net}</dt><dd>{money.format(totals.net)}</dd>
          {isVatPayer && <><dt>{labels.vat}</dt><dd>{money.format(totals.vat)}</dd></>}
          <dt><b>{labels.total}</b></dt><dd><b>{money.format(totals.net + totals.vat)}</b></dd>
        </dl>
      </div>
      <p className="muted small-note">* {labels.required}</p>
    </div>
  );
}
