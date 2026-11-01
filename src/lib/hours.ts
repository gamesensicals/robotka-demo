/** "7,5" / "7.5" / "7:30" / "7h30" / "7" -> minúty; null = nečitateľné. */
export function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".").replace(/\s+/g, "");
  let m = s.match(/^(\d{1,2})(?::|h)(\d{1,2})(?:m(?:in)?)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d{1,2}(?:\.\d{1,2})?)h?$/);
  if (m) return Math.round(Number(m[1]) * 60);
  return null;
}

/** 450 -> "7,5" (podľa jazyka), bez zbytočných núl. */
export const fmtHours = (minutes: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(minutes / 60);

/** Člen tímu nemôže mazať hodiny s dátumom práce starším ako 62 dní (majiteľ áno). Rovnaké ako v applyEvent. */
export const TIME_LOCK_DAYS = 62;
export const timeLocked = (workDate: string, isOwner: boolean) =>
  !isOwner && workDate < new Date(Date.now() - TIME_LOCK_DAYS * 86_400_000).toISOString().slice(0, 10);
