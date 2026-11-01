import { createHash } from "node:crypto";

// Kód firmy pre prihlásenie zamestnancov, napr. "novak-k7m4":
// - začína menom firmy, takže sa ľahko pamätá a diktuje,
// - končí 4 znakmi z abecedy bez zameniteľných znakov (bez i, l, o, 0, 1) = 923 521 možností,
//   takže sa nedá len tak uhádnuť (pokusy sú navyše obmedzené na IP),
// - sám osebe k ničomu nepustí: zamestnanec potrebuje ešte meno a heslo.
// Kód sa odvodzuje z id udalosti (hash), takže je na všetkých serveroch rovnaký.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// všeobecné slová, ktoré by nikoho neodlíšili (vyberie sa radšej priezvisko/názov)
const GENERIC = new Set([
  "elektro", "elektrika", "elektroinstalacie", "elektroinstalacia", "elektromontaze", "elektroservis",
  "firma", "servis", "stavby", "montaze", "instalacie", "sro", "spol", "the", "company", "group",
]);

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function codeBase(companyName: string): string {
  const words = plain(companyName)
    .replace(/\b(s\.?\s*r\.?\s*o|a\.?\s*s|spol|k\.?\s*s|v\.?\s*o\.?\s*s)\b\.?/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  const pick = words.find((w) => w.length >= 3 && !GENERIC.has(w)) ?? words[0] ?? "firma";
  return pick.slice(0, 10);
}

/** Deterministický kód: rovnaký vstup = rovnaký kód na každom serveri. `attempt` rieši zriedkavú kolíziu. */
export function deriveCode(companyName: string, seed: string, attempt: number): string {
  const h = createHash("sha256").update(`${seed}:${attempt}`).digest();
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += ALPHABET[h[i] % ALPHABET.length];
  return `${codeBase(companyName)}-${suffix}`;
}

/** Ako zamestnanec kód napíše je jedno: veľké písmená, diakritika, medzery aj chýbajúca pomlčka. */
export const codeKey = (input: string) => plain(input).replace(/[^a-z0-9]/g, "");

/** Používateľské meno zamestnanca: malé písmená bez diakritiky, 3–32 znakov a-z 0-9 . _ - */
export const normalizeUsername = (input: string) => plain(input).trim().replace(/\s+/g, ".");
export const validUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(u);

/** Variabilný symbol firmy YYQRRR: rok (2 číslice) a kvartál založenia + 3 číslice z id udalosti. */
export function deriveVs(at: string, seed: string, attempt: number): string {
  const q = Math.floor((Number(at.slice(5, 7)) - 1) / 3) + 1;
  const n = (createHash("sha256").update(seed).digest().readUInt32BE(0) + attempt) % 1000;
  return `${at.slice(2, 4)}${q}${String(n).padStart(3, "0")}`;
}

/** Meno pre člena tímu, ktorý mal doteraz len e-mail (časť pred @), jedinečné cez `taken`. */
export function usernameFromEmail(email: string, taken: (name: string) => boolean): string {
  let base = plain(email.split("@")[0] ?? "").replace(/[^a-z0-9._-]+/g, ".").replace(/^[._-]+|[._-]+$/g, "").slice(0, 28);
  if (base.length < 3) base = `clen.${base}`.replace(/\.$/, "").padEnd(3, "x");
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if (!taken(name)) return name;
  }
}
