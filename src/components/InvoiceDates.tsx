"use client";

import { useState } from "react";
import { DUE_DAYS } from "@/lib/invoice-math";

/** "2026-11-07" + n dní, v UTC (bez posunu časovej zóny). */
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Dátumy faktúry: splatnosť sa pri zmene dodania posunie na dodanie + 14 dní (dá sa prepísať). */
export default function InvoiceDates({
  today, initial, labels,
}: {
  today: string;
  /** pri úprave konceptu pôvodné dátumy */
  initial?: { issue: string; delivery: string; due: string };
  labels: { issued: string; delivery: string; due: string; dueHint: string };
}) {
  const [delivery, setDelivery] = useState(initial?.delivery ?? today);
  const [due, setDue] = useState(initial?.due ?? addDays(today, DUE_DAYS));
  return (
    <>
      <label className="field">{labels.issued} <input type="date" name="issue_date" defaultValue={initial?.issue ?? today} required /></label>
      <label className="field">{labels.delivery}
        <input
          type="date"
          name="delivery_date"
          value={delivery}
          required
          onChange={(e) => {
            setDelivery(e.target.value);
            if (e.target.value) setDue(addDays(e.target.value, DUE_DAYS));
          }}
        />
      </label>
      <label className="field">{labels.due}
        <input type="date" name="due_date" value={due} onChange={(e) => setDue(e.target.value)} />
        <span className="muted field-hint">{labels.dueHint}</span>
      </label>
    </>
  );
}
