// Texty e-mailov (SK/EN/CS). Len obyčajný text: žiadne obrázky, žiadne sledovacie odkazy ani pixely.
import type { MailLang } from "@/lib/mail-kinds";

type D = Record<string, unknown>;
type Ctx = {
  /** verejná adresa aplikácie (bez lomky na konci), prázdna = bez odkazov */
  url: string;
  company: string;
  money: (cents: number) => string;
  date: (iso: string) => string;
};
type Mail = { subject: string; text: string };
type Texts = {
  footerOptional: (url: string) => string;
  footerMandatory: string;
  footerWebmaster: (url: string) => string;
  test: () => Mail;
  credited: (d: D, c: Ctx) => Mail;
  billing: (d: D, c: Ctx) => Mail;
  credit_low: (d: D, c: Ctx) => Mail;
  support: (d: D, c: Ctx) => Mail;
  chat_closed: (d: D, c: Ctx) => Mail;
  price_change: (d: D, c: Ctx) => Mail;
  price_cancel: (d: D, c: Ctx) => Mail;
  wm_request: (d: D, c: Ctx) => Mail;
  wm_chat: (d: D, c: Ctx) => Mail;
};

const link = (c: Ctx, path: string) => (c.url ? `${c.url}${path}` : "");
const lines = (...l: (string | false | null | undefined)[]) => l.filter((x) => x !== false && x != null).join("\n");
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? "");
/** Zmena ceny prevádzky (alebo či sa platí na osobu / na firmu); firmy s vlastnou cenou sa netýka. */
const feeChanged = (d: D) => !d.own && (n(d.oldFee) !== n(d.newFee) || (d.oldMode ?? null) !== (d.newMode ?? null));
const unit = (perUser: string, perCompany: string, plain: string) => (m: unknown) => (m === "per_user" ? perUser : m === "per_company" ? perCompany : plain);
const unitSk = unit("mesačne za osobu", "mesačne za firmu", "mesačne");
const unitEn = unit("per person per month", "per company per month", "per month");
const unitCs = unit("měsíčně za osobu", "měsíčně za firmu", "měsíčně");

const sk: Texts = {
  footerOptional: (url) => `Toto je automatická správa z Robotky.${url ? ` Upozornenia si vypneš v Môj účet: ${url}/account` : " Upozornenia si vypneš v Môj účet."}`,
  footerMandatory: "Toto je automatická správa z Robotky pre majiteľov firiem.",
  footerWebmaster: (url) => `Upozornenie pre webmastra.${url ? ` Vypneš ho v nastaveniach e-mailov: ${url}/webmaster/mail` : ""}`,
  test: () => ({ subject: "Robotka: testovací e-mail", text: "Ak čítaš túto správu, odosielanie e-mailov funguje." }),
  credited: (d, c) => ({
    subject: "Robotka: kredit je pripísaný",
    text: lines(`Firme ${c.company} sme pripísali ${c.money(n(d.amount))}.`, `Zostatok: ${c.money(n(d.balance))}`, link(c, "/admin/credits")),
  }),
  billing: (d, c) => ({
    subject: `Robotka: vyúčtovanie ${s(d.month)}`,
    text: lines(
      `Vyúčtovanie firmy ${c.company}:`,
      n(d.fee) > 0 && `Prevádzka ${s(d.month)}: ${c.money(n(d.fee))}`,
      n(d.storage) > 0 && `Úložisko ${s(d.prev)} (${n(d.gbm)} GB/mesiac): ${c.money(n(d.storage))}`,
      `Zostatok kreditu: ${c.money(n(d.balance))}`,
      link(c, "/admin/credits"),
    ),
  }),
  credit_low: (d, c) =>
    d.negative
      ? {
          subject: "Robotka: firma je len na čítanie",
          text: lines(
            `Kredit firmy ${c.company} je pod nulou (${c.money(n(d.balance))}).`,
            "Kým ho nedobiješ, firma je len na čítanie: údaje vidíš, ale nič nové nezapíšeš.",
            c.url && `Dobiť kredit: ${link(c, "/admin/credits")}`,
          ),
        }
      : {
          subject: "Robotka: kredit dochádza",
          text: lines(
            `Kredit firmy ${c.company} je ${c.money(n(d.balance))}. Na ďalší mesiac treba približne ${c.money(n(d.need))}.`,
            "Ak ho nedobiješ, po ďalšom vyúčtovaní bude firma len na čítanie.",
            c.url && `Dobiť kredit: ${link(c, "/admin/credits")}`,
          ),
        },
  support: (d, c) => ({
    subject: d.opened ? `Robotka: webmaster otvoril nový tiket – ${s(d.subject)}` : `Robotka: odpoveď v podpore – ${s(d.subject)}`,
    text: lines(
      d.opened ? `Webmaster otvoril nový tiket „${s(d.subject)}“ (${c.company}):` : `Webmaster odpovedal v chate „${s(d.subject)}“ (${c.company}):`,
      "",
      s(d.preview),
      "",
      d.byMember ? "Chat začal člen tímu a odpoveď si zatiaľ neprečítal." : false,
      c.url && `Celý chat: ${link(c, `/admin/support/${s(d.ticket)}`)}`,
    ),
  }),
  chat_closed: (d, c) => ({
    subject: `Robotka: chat „${s(d.subject)}“ je zatvorený`,
    text: lines(
      "Chat bol 7 dní bez novej správy, preto sa zatvoril. O 7 dní sa zmaže.",
      "Ak ešte niečo treba, otvoríš ho znova alebo napíšeš nový.",
      link(c, `/admin/support/${s(d.ticket)}`),
    ),
  }),
  price_change: (d, c) => ({
    subject: `Robotka: zmena cien od ${c.date(s(d.effective))}`,
    text: lines(
      `Od ${c.date(s(d.effective))} sa menia ceny:`,
      feeChanged(d) && `Prevádzka: ${c.money(n(d.oldFee))} ${unitSk(d.oldMode)} → ${c.money(n(d.newFee))} ${unitSk(d.newMode)}`,
      n(d.oldStorage) !== n(d.newStorage) && `Úložisko: ${c.money(n(d.oldStorage))} → ${c.money(n(d.newStorage))} za GB-mesiac`,
      "",
      "Kredit, ktorý máš, ostáva tvoj a platí ďalej.",
      c.url && `Podmienky: ${"https://robotka.beer/terms"}`,
    ),
  }),
  price_cancel: (d, c) => ({
    subject: "Robotka: zmena cien sa ruší",
    text: `Ohlásená zmena cien od ${c.date(s(d.effective))} sa nekoná. Ceny ostávajú, ako boli.`,
  }),
  wm_request: (d, c) => ({
    subject: `Robotka: nová žiadosť o účet – ${s(d.company)}`,
    text: lines(`Firma: ${s(d.company)}`, `Kontakt: ${s(d.contact)} <${s(d.email)}>`, link(c, "/webmaster/requests")),
  }),
  wm_chat: (d, c) => ({
    subject: `Robotka: nový chat – ${c.company}: ${s(d.subject)}`,
    text: lines(s(d.preview), "", link(c, `/webmaster/support/${s(d.ticket)}`)),
  }),
};

const en: Texts = {
  footerOptional: (url) => `This is an automatic message from Robotka.${url ? ` Turn notifications off in My account: ${url}/account` : " Turn notifications off in My account."}`,
  footerMandatory: "This is an automatic message from Robotka for company owners.",
  footerWebmaster: (url) => `Webmaster notification.${url ? ` Turn it off in the e-mail settings: ${url}/webmaster/mail` : ""}`,
  test: () => ({ subject: "Robotka: test e-mail", text: "If you are reading this, sending e-mails works." }),
  credited: (d, c) => ({
    subject: "Robotka: credit added",
    text: lines(`${c.money(n(d.amount))} has been added to ${c.company}.`, `Balance: ${c.money(n(d.balance))}`, link(c, "/admin/credits")),
  }),
  billing: (d, c) => ({
    subject: `Robotka: statement ${s(d.month)}`,
    text: lines(
      `Statement for ${c.company}:`,
      n(d.fee) > 0 && `Service ${s(d.month)}: ${c.money(n(d.fee))}`,
      n(d.storage) > 0 && `Storage ${s(d.prev)} (${n(d.gbm)} GB-month): ${c.money(n(d.storage))}`,
      `Credit balance: ${c.money(n(d.balance))}`,
      link(c, "/admin/credits"),
    ),
  }),
  credit_low: (d, c) =>
    d.negative
      ? {
          subject: "Robotka: the company is read-only",
          text: lines(
            `The credit of ${c.company} is below zero (${c.money(n(d.balance))}).`,
            "Until you top it up, the company is read-only: you can see your data but cannot add anything new.",
            c.url && `Top up: ${link(c, "/admin/credits")}`,
          ),
        }
      : {
          subject: "Robotka: credit is running low",
          text: lines(
            `The credit of ${c.company} is ${c.money(n(d.balance))}. Next month needs about ${c.money(n(d.need))}.`,
            "Without a top-up the company becomes read-only after the next statement.",
            c.url && `Top up: ${link(c, "/admin/credits")}`,
          ),
        },
  support: (d, c) => ({
    subject: d.opened ? `Robotka: the webmaster opened a new ticket – ${s(d.subject)}` : `Robotka: support reply – ${s(d.subject)}`,
    text: lines(
      d.opened ? `The webmaster opened a new ticket “${s(d.subject)}” (${c.company}):` : `The webmaster replied in the chat “${s(d.subject)}” (${c.company}):`,
      "",
      s(d.preview),
      "",
      d.byMember ? "A team member started the chat and has not read the reply yet." : false,
      c.url && `Whole chat: ${link(c, `/admin/support/${s(d.ticket)}`)}`,
    ),
  }),
  chat_closed: (d, c) => ({
    subject: `Robotka: chat “${s(d.subject)}” is closed`,
    text: lines(
      "The chat had no new message for 7 days, so it was closed. It will be deleted in 7 days.",
      "If you still need something, reopen it or start a new one.",
      link(c, `/admin/support/${s(d.ticket)}`),
    ),
  }),
  price_change: (d, c) => ({
    subject: `Robotka: new prices from ${c.date(s(d.effective))}`,
    text: lines(
      `Prices change on ${c.date(s(d.effective))}:`,
      feeChanged(d) && `Service: ${c.money(n(d.oldFee))} ${unitEn(d.oldMode)} → ${c.money(n(d.newFee))} ${unitEn(d.newMode)}`,
      n(d.oldStorage) !== n(d.newStorage) && `Storage: ${c.money(n(d.oldStorage))} → ${c.money(n(d.newStorage))} per GB-month`,
      "",
      "The credit you have stays yours and remains valid.",
      c.url && `Terms: ${"https://robotka.beer/terms"}`,
    ),
  }),
  price_cancel: (d, c) => ({
    subject: "Robotka: the price change is cancelled",
    text: `The announced price change from ${c.date(s(d.effective))} will not happen. Prices stay as they were.`,
  }),
  wm_request: (d, c) => ({
    subject: `Robotka: new account request – ${s(d.company)}`,
    text: lines(`Company: ${s(d.company)}`, `Contact: ${s(d.contact)} <${s(d.email)}>`, link(c, "/webmaster/requests")),
  }),
  wm_chat: (d, c) => ({
    subject: `Robotka: new chat – ${c.company}: ${s(d.subject)}`,
    text: lines(s(d.preview), "", link(c, `/webmaster/support/${s(d.ticket)}`)),
  }),
};

const cs: Texts = {
  footerOptional: (url) => `Toto je automatická zpráva z Robotky.${url ? ` Upozornění vypneš v Můj účet: ${url}/account` : " Upozornění vypneš v Můj účet."}`,
  footerMandatory: "Toto je automatická zpráva z Robotky pro majitele firem.",
  footerWebmaster: (url) => `Upozornění pro webmastera.${url ? ` Vypneš ho v nastavení e-mailů: ${url}/webmaster/mail` : ""}`,
  test: () => ({ subject: "Robotka: testovací e-mail", text: "Pokud čteš tuto zprávu, odesílání e-mailů funguje." }),
  credited: (d, c) => ({
    subject: "Robotka: kredit je připsaný",
    text: lines(`Firmě ${c.company} jsme připsali ${c.money(n(d.amount))}.`, `Zůstatek: ${c.money(n(d.balance))}`, link(c, "/admin/credits")),
  }),
  billing: (d, c) => ({
    subject: `Robotka: vyúčtování ${s(d.month)}`,
    text: lines(
      `Vyúčtování firmy ${c.company}:`,
      n(d.fee) > 0 && `Provoz ${s(d.month)}: ${c.money(n(d.fee))}`,
      n(d.storage) > 0 && `Úložiště ${s(d.prev)} (${n(d.gbm)} GB/měsíc): ${c.money(n(d.storage))}`,
      `Zůstatek kreditu: ${c.money(n(d.balance))}`,
      link(c, "/admin/credits"),
    ),
  }),
  credit_low: (d, c) =>
    d.negative
      ? {
          subject: "Robotka: firma je jen pro čtení",
          text: lines(
            `Kredit firmy ${c.company} je pod nulou (${c.money(n(d.balance))}).`,
            "Dokud ho nedobiješ, firma je jen pro čtení: data vidíš, ale nic nového nezapíšeš.",
            c.url && `Dobít kredit: ${link(c, "/admin/credits")}`,
          ),
        }
      : {
          subject: "Robotka: kredit dochází",
          text: lines(
            `Kredit firmy ${c.company} je ${c.money(n(d.balance))}. Na další měsíc je potřeba asi ${c.money(n(d.need))}.`,
            "Pokud ho nedobiješ, po dalším vyúčtování bude firma jen pro čtení.",
            c.url && `Dobít kredit: ${link(c, "/admin/credits")}`,
          ),
        },
  support: (d, c) => ({
    subject: d.opened ? `Robotka: webmaster otevřel nový tiket – ${s(d.subject)}` : `Robotka: odpověď v podpoře – ${s(d.subject)}`,
    text: lines(
      d.opened ? `Webmaster otevřel nový tiket „${s(d.subject)}“ (${c.company}):` : `Webmaster odpověděl v chatu „${s(d.subject)}“ (${c.company}):`,
      "",
      s(d.preview),
      "",
      d.byMember ? "Chat začal člen týmu a odpověď si zatím nepřečetl." : false,
      c.url && `Celý chat: ${link(c, `/admin/support/${s(d.ticket)}`)}`,
    ),
  }),
  chat_closed: (d, c) => ({
    subject: `Robotka: chat „${s(d.subject)}“ je zavřený`,
    text: lines(
      "Chat byl 7 dní bez nové zprávy, proto se zavřel. Za 7 dní se smaže.",
      "Pokud ještě něco potřebuješ, otevřeš ho znovu nebo napíšeš nový.",
      link(c, `/admin/support/${s(d.ticket)}`),
    ),
  }),
  price_change: (d, c) => ({
    subject: `Robotka: změna cen od ${c.date(s(d.effective))}`,
    text: lines(
      `Od ${c.date(s(d.effective))} se mění ceny:`,
      feeChanged(d) && `Provoz: ${c.money(n(d.oldFee))} ${unitCs(d.oldMode)} → ${c.money(n(d.newFee))} ${unitCs(d.newMode)}`,
      n(d.oldStorage) !== n(d.newStorage) && `Úložiště: ${c.money(n(d.oldStorage))} → ${c.money(n(d.newStorage))} za GB-měsíc`,
      "",
      "Kredit, který máš, zůstává tvůj a platí dál.",
      c.url && `Podmínky: ${"https://robotka.beer/terms"}`,
    ),
  }),
  price_cancel: (d, c) => ({
    subject: "Robotka: změna cen se ruší",
    text: `Ohlášená změna cen od ${c.date(s(d.effective))} se nekoná. Ceny zůstávají, jak byly.`,
  }),
  wm_request: (d, c) => ({
    subject: `Robotka: nová žádost o účet – ${s(d.company)}`,
    text: lines(`Firma: ${s(d.company)}`, `Kontakt: ${s(d.contact)} <${s(d.email)}>`, link(c, "/webmaster/requests")),
  }),
  wm_chat: (d, c) => ({
    subject: `Robotka: nový chat – ${c.company}: ${s(d.subject)}`,
    text: lines(s(d.preview), "", link(c, `/webmaster/support/${s(d.ticket)}`)),
  }),
};

const TEXTS: Record<MailLang, Texts> = { sk, en, cs };
const LOCALE: Record<MailLang, string> = { sk: "sk-SK", en: "en-GB", cs: "cs-CZ" };
const OPTIONAL = new Set(["credited", "billing", "credit_low", "support", "chat_closed"]);

/** Predmet a text e-mailu daného druhu. */
export function renderMail(kind: string, data: D, lang: MailLang, company: string, appUrl: string): Mail | null {
  const t = TEXTS[lang] ?? sk;
  const money = new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency: "EUR" });
  const date = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "Europe/Bratislava", dateStyle: "long" });
  const ctx: Ctx = { url: appUrl, company, money: (c) => money.format(c / 100), date: (iso) => (iso ? date.format(new Date(iso)) : "") };
  const fn = (t as unknown as Record<string, ((d: D, c: Ctx) => Mail) | undefined>)[kind];
  if (!fn || kind.startsWith("footer")) return null;
  const m = fn(data, ctx);
  const footer = kind === "test" ? "" : kind.startsWith("wm_") ? t.footerWebmaster(appUrl) : OPTIONAL.has(kind) ? t.footerOptional(appUrl) : t.footerMandatory;
  return { subject: m.subject, text: footer ? `${m.text}\n\n--\n${footer}\n` : `${m.text}\n` };
}
