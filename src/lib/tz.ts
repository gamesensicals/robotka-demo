// Čas v Bratislave pre formuláre (input type="datetime-local" nemá časové pásmo).
export const TZ = "Europe/Bratislava";

/** O koľko ms je čas v Bratislave pred UTC v danom okamihu (zimný/letný čas). */
function offset(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
}

/** "2026-11-05T22:00" (čas v Bratislave) → ISO v UTC; null pri zlom vstupe. */
export function localToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = wall - offset(wall);
  t = wall - offset(t); // presne aj okolo prechodu na letný čas
  return new Date(t).toISOString();
}

/** ISO → "2026-11-05T22:00" v Bratislave (predvyplnenie formulára). */
export function isoToLocal(iso: string): string {
  const ms = Date.parse(iso);
  return new Date(ms + offset(ms)).toISOString().slice(0, 16);
}
