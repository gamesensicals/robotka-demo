import { cache } from "react";
import { cookies, headers } from "next/headers";
import { sk } from "./sk";
import { en } from "./en";
import { cs } from "./cs";

export const LANGS = ["sk", "en", "cs"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABELS: Record<Lang, string> = { sk: "SK", en: "EN", cs: "CZ" };

const DICTS = { sk, en, cs };
const LOCALES: Record<Lang, string> = { sk: "sk-SK", en: "en-GB", cs: "cs-CZ" };

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** Jazyk: cookie "lang" (prepínač v pätičke), inak jazyk prehliadača, inak slovenčina. */
export const getLang = cache(async (): Promise<Lang> => {
  const fromCookie = (await cookies()).get("lang")?.value;
  if (isLang(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return "sk";
});

/** Preklady + formátovanie peňazí a dátumov pre aktuálny jazyk. */
export async function getT() {
  const lang = await getLang();
  const locale = LOCALES[lang];
  const moneyFmt = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  // dátumy z DB sú "YYYY-MM-DD" (UTC), preto formátujeme v UTC, aby sa deň neposunul
  const dateFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC" });
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Bratislava", dateStyle: "short", timeStyle: "short" });
  return {
    t: DICTS[lang],
    lang,
    locale,
    money: (n: number) => moneyFmt.format(n),
    /** kredity sú v centoch (1 kredit = 1 €) */
    credits: (cents: number) => moneyFmt.format(cents / 100),
    date: (d: string) => dateFmt.format(new Date(d)),
    /** časový údaj (ms alebo ISO) s hodinou, v čase prevádzky */
    dateTime: (d: number | string) => dateTimeFmt.format(new Date(d)),
  };
}
