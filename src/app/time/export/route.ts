import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import { monthTime } from "@/server/queries";

// Dochádzka za mesiac ako CSV pre Excel (výplaty, fakturácia). Len majiteľ/správca.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const [{ company }, { t, lang }] = await Promise.all([requirePerm("time.all"), getT()]);
  const m = new URL(req.url).searchParams.get("m") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : new Date().toISOString().slice(0, 7);
  const comma = lang !== "en"; // slovenský/český Excel čaká desatinnú čiarku a bodkočiarku
  const sep = comma ? ";" : ",";
  const cell = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const hours = (min: number) => (Math.round((min / 60) * 100) / 100).toString().replace(".", comma ? "," : ".");
  const rows = monthTime(company.id, month).reverse();
  const tm = t.time;
  const lines = [
    [t.common.date, tm.person, t.jobs.job, tm.hours, tm.note, tm.material].map(cell).join(sep),
    ...rows.map((e) => [e.work_date, e.user_name, e.job_title, hours(e.minutes), e.note ?? "", e.material ?? ""].map(cell).join(sep)),
  ];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dochadzka-${month}.csv"`,
    },
  });
}
