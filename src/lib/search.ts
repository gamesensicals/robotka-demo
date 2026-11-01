/** Text na porovnanie: malé písmená, bez diakritiky ("Horvát" = "horvat"). */
export const plain = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Všetky slová z hľadania sa musia nájsť aspoň v jednom z polí. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.map(plain).join(" \u0000 ");
  return words.every((w) => haystack.includes(w));
}
