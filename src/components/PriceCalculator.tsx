"use client";

import { useState } from "react";

/** Odhad mesačnej platby v žiadosti o účet: počet ľudí × prevádzka + úložisko. */
export default function PriceCalculator({
  feeCents, storageCents, perUser, locale, labels,
}: {
  feeCents: number;
  storageCents: number;
  perUser: boolean;
  locale: string;
  labels: { people: string; peopleHint: string; storage: string; storageHint: string; fee: string; storageRow: string; total: string; perMonth: string; perCompany: string };
}) {
  const [people, setPeople] = useState("3");
  const [gb, setGb] = useState("10");
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const n = Math.max(1, Math.floor(Number(people) || 1));
  const g = Math.max(0, Math.ceil(Number(gb.replace(",", ".")) || 0));
  const fee = perUser ? n * feeCents : feeCents;
  const storage = g * storageCents;
  const fmt = (c: number) => money.format(c / 100);
  return (
    <div className="price-calc">
      <div className="fields">
        <label className="field">{labels.people}
          <input name="people" type="number" min={1} max={10000} step={1} required value={people} onChange={(e) => setPeople(e.target.value)} />
          <span className="muted small-note">{labels.peopleHint}</span>
        </label>
        <label className="field">{labels.storage}
          <input name="storage_gb" type="number" min={0} max={1000000} step={1} required value={gb} onChange={(e) => setGb(e.target.value)} />
          <span className="muted small-note">{labels.storageHint}</span>
        </label>
      </div>
      <table className="calc-table">
        <tbody>
          <tr><td>{labels.fee}</td><td className="num">{perUser ? `${n} × ${fmt(feeCents)}` : labels.perCompany}</td><td className="num">{fmt(fee)}</td></tr>
          <tr><td>{labels.storageRow}</td><td className="num">{g} GB × {fmt(storageCents)}</td><td className="num">{fmt(storage)}</td></tr>
          <tr className="calc-total"><td>{labels.total}</td><td /><td className="num">{fmt(fee + storage)} <span className="muted">{labels.perMonth}</span></td></tr>
        </tbody>
      </table>
    </div>
  );
}
