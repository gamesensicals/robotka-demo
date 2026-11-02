import type { DatabaseSync } from "node:sqlite";
import type { DefaultPrice } from "./default-prices";
import { totals } from "@/lib/invoice-math";
import { type FeeMode, companyFee, gbMonths, nextMonth, prevMonth, proratedFee, siteSettings, storageByteDays } from "./billing";
import { type Perm, PRESETS, legacyPerms, normalizePerms, parsePerms, permsText } from "@/lib/perms";
import { codeKey, deriveCode, deriveVs, usernameFromEmail, validUsername } from "./login-code";
import {
  MAIL_LANGS, type MailKind, OWNER_MAIL_KINDS, PRICE_NOTICE_DAYS, SUPPORT_MEMBER_DELAY_MIN, SUPPORT_OWNER_DELAY_MIN,
  WEBMASTER_MAIL_KINDS, parseKinds,
} from "@/lib/mail-kinds";

// Každá zmena dát je udalosť. Hub udalosti len zoradí a rozpošle; každý server ich potom
// aplikuje cez applyEvent() v rovnakom poradí, takže všetky skončia s rovnakými dátami.
//
// Pravidlá, aby to sedelo na všetkých serveroch:
// - id a časy vytvára server, ktorý udalosť posiela (sú v udalosti), apply ich len prepíše
// - apply nesmie volať Date.now(), náhodu ani nič mimo databázy
// - oprávnenia (náhrada RLS v Supabase) sa kontrolujú tu podľa stavu databázy pri danom poradí

/** Majiteľ smie všetko, člen tímu len to, čo má v oprávneniach (src/lib/perms.ts). */
export type Role = "owner" | "member";
/** Staršie udalosti (do schémy 6) poznali aj správcu a zamestnanca – dnes sú to predvoľby oprávnení. */
type AnyRole = Role | "manager" | "worker";
export const JOB_STATUSES = ["open", "waiting", "done"] as const;
export const INVOICE_STATUSES = ["draft", "sent", "paid", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type ErrorCode =
  | "sync_down" | "forbidden" | "not_found" | "invalid" | "email_taken"
  | "wrong_login" | "photos_invalid" | "logo_invalid" | "no_items"
  | "read_only" | "duplicate" | "last_owner" | "too_many"
  | "wrong_password" | "password_mismatch" | "weak_password" | "payment_failed"
  | "username_taken" | "bad_code" | "bad_hours"
  | "primary_owner" | "not_deletable" | "email_needed" | "username_needed" | "download_first"
  | "ticket_closed" | "item_incomplete" | "not_editable"
  | "mail_not_configured" | "mail_failed" | "notice_dates" | "notice_text" | "time_locked" | "no_recipients" | "company_blocked" | "demo_disabled"
  | "team_login" | "card_amount" | "hub_error" | "backup_not_configured" | "bad_endpoint" | "bad_key" | "backup_running" | "push_failed";

export const TICKET_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
/** Chat sa zatvorí po 7 dňoch bez správy a zmaže 7 dní po zatvorení. */
export const TICKET_IDLE_DAYS = 7;
export const TICKET_DELETE_DAYS = 7;
/** Predvolené kategórie cenníka pre každú firmu (dajú sa premenovať, pridať, zmazať). */
/** Kategórie firiem založených pred tým, ako sa názvy kategórií posielali v udalosti (nemeniť – prepočet logu). */
export const LEGACY_CATEGORIES = ["Káble", "Ističe", "Chráničky", "S-boxy"];

/** Vystavená faktúra sa po kliknutí na Zmazať zmaže až po tejto dobe (dovtedy sa dá obnoviť). */
export const INVOICE_DELETE_DAYS = 16;
/** Žiadosti o účet: vybavená sa zmaže po 7 dňoch, zamietnutá po 30 dňoch. */
export const REQUEST_DONE_DAYS = 7;
export const REQUEST_REJECTED_DAYS = 30;
/** Rezervácia e-mailu serverom platí 10 minút; potom ho smie poslať iný server. */
export const MAIL_CLAIM_MINUTES = 10;
/** Člen tímu nemôže zmazať hodiny s dátumom práce starším ako toľko dní (majiteľ áno). */
export const TIME_LOCK_DAYS = 62;
/** Kľúče nastavení, ktoré webmaster mení v paneli namiesto .env. */
export const CONFIG_KEYS = [
  "polar_access_token", "polar_webhook_secret", "polar_product_id", "polar_server",
  "app_url", "webmaster_email", "webmaster_password_hash", "dev_origins", "demo_url",
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type TicketAudience = "company" | "support" | "people";
/** Pokusy o odoslanie, kým sa e-mail označí ako neodoslaný. */
export const MAIL_ATTEMPTS = 3;

/** Špeciálni autori udalostí: webmaster (účet z .env) a samotný systém (uzávierky, platby kartou). */
export const WEBMASTER = "webmaster";
export const SYSTEM = "system";

type Text = string | null;

export type CompanyPatch = {
  name: string; ico: Text; dic: Text; ic_dph: Text; address: Text; city: Text; zip: Text;
  email: Text; phone: Text; iban: Text; is_vat_payer: boolean; default_vat_rate: number;
  invoice_prefix: string; invoice_footer: Text; logo_path: Text; logo_size: number;
};
export type CustomerData = {
  id: string; name: string; ico: Text; dic: Text; ic_dph: Text;
  address: Text; zip: Text; city: Text; email: Text; phone: Text;
};
export type JobData = { id: string; title: string; description: Text; address: Text; customer_id: Text; job_date: string };
export type PhotoData = {
  id: string; job_id: string; storage_path: string; caption: Text; taken_on: string; size_bytes: number;
  mime?: Text; file_name?: Text;
};
/** Staré oprávnenia zamestnanca v udalostiach do schémy 6. */
type LegacyPermissions = { jobs: boolean; status: boolean; customers: boolean };

/** Majiteľ má e-mail, člen tímu používateľské meno. */
export type NewUser = { id: string; email?: Text; username?: Text; password_hash: string };
export type AccountRequest = {
  id: string; company_name: string; contact_name: string; email: string; phone: Text; ico: Text; message: Text;
  logo_path?: Text; logo_size?: number;
  /** odhad zo žiadosti: koľko ľudí a koľko GB */
  people?: number | null; storage_gb?: number | null;
};
export type SitePatch = {
  operator_name: Text; iban: Text; contact_email: Text; contact_phone: Text; info_text: Text;
  /** len staršie udalosti; ceny sa dnes menia cez price.schedule (platia o 31 dní) */
  monthly_fee_cents?: number; storage_cents_per_gb?: number;
};
export type MailSettingsPatch = {
  mail_enabled: boolean; smtp_host: Text; smtp_port: number | null; smtp_secure: boolean; smtp_user: Text;
  /** už zašifrované; undefined = nechať pôvodné */
  smtp_pass?: Text;
  mail_from: Text; mail_from_name: Text; wm_notify_email: Text; wm_mail_off: string[];
};
/** skip = nie je komu poslať (napr. používateľ medzitým nemá e-mail) */
export type NoticeData = {
  id: string; starts_at: string; ends_at: string; audience: "all" | "owners" | "members"; dismissible: boolean;
  text_sk: Text; text_en: Text; text_cs: Text;
};
export type MailResult = { id: string; ok: boolean; skip?: boolean; error?: Text; to?: Text; subject?: Text };
export type PriceData = { name: string; unit: string; unit_price: number; vat_rate: number | null; category_id?: Text };
export type InvoiceData = {
  id: string; customer_id: Text; job_id: Text; issue_date: string; delivery_date: string; due_date: string; note: Text;
};
export type InvoiceLine = { name: string; unit: string; quantity: number; unit_price: number; vat_rate: number };

export type EventBody =
  // webmaster a web
  | { type: "account.request"; request: AccountRequest }
  | { type: "request.setStatus"; requestId: string; status: "new" | "done" | "rejected" }
  // údržba (servery): vybavené žiadosti po 7 dňoch, zamietnuté po 30 dňoch zmazať
  | { type: "request.maintain" }
  | { type: "company.create"; company: { id: string; name: string; ico: Text }; owner: NewUser; credit_cents: number; requestId: Text; categories?: string[]; prices?: DefaultPrice[] }
  | { type: "company.setSuspended"; companyId: string; suspended: boolean }
  // totálna blokácia: nikto z firmy sa neprihlási ani nič nezapíše (firma ani dáta sa nemažú)
  | { type: "company.setBlocked"; companyId: string; blocked: boolean }
  | { type: "company.newCode"; companyId: string }
  | { type: "site.update"; patch: SitePatch }
  // ceny: zmena platí o 31 dní (dovtedy sa dá zrušiť), majitelia dostanú e-mail a bublinu na Prehľade
  | { type: "price.schedule"; changeId: string; monthly_fee_cents: number; storage_cents_per_gb: number; fee_mode?: FeeMode }
  // individuálna cena firmy (len webmaster; null = cenník webu)
  // individuálna cena a odpustenie prevádzky (len webmaster; null = cenník webu / bez odpustenia)
  | { type: "company.setPricing"; companyId: string; fee_cents: number | null; fee_mode: FeeMode | null; fee_waived_until?: string | null }
  | { type: "price.cancel"; changeId: string }
  | { type: "price.ack"; changeId: string }
  | { type: "price.apply" }
  // oznamy (údržba): uloží/zmaže webmaster, „Rozumiem“ klikne používateľ
  | { type: "notice.save"; notice: NoticeData }
  // nastavenia namiesto .env (null = zmazať, platí .env)
  | { type: "config.set"; patch: Partial<Record<ConfigKey, string | null>> }
  // zmazanie celej firmy (webmaster) – všetky údaje aj účty jej ľudí
  | { type: "company.delete"; companyId: string }
  | { type: "notice.delete"; noticeId: string }
  | { type: "notice.ack"; noticeId: string }
  // e-maily
  | { type: "mail.settings"; patch: MailSettingsPatch }
  | { type: "mail.prefs"; off: string[]; lang: string }
  | { type: "mail.test"; mailId: string; to: string }
  | { type: "mail.claim"; ids: string[]; token: string }
  | { type: "mail.done"; results: MailResult[] }
  // používatelia
  | { type: "member.add"; companyId: string; user: NewUser; role: AnyRole; perms?: string[] }
  | { type: "member.remove"; companyId: string; userId: string }
  | { type: "member.setPermissions"; companyId: string; userId: string; perms?: string[]; permissions?: LegacyPermissions }
  // zmena role; na majiteľa treba e-mail, na člena tímu používateľské meno
  | { type: "member.setRole"; companyId: string; userId: string; role: AnyRole; email?: Text; username?: Text; perms?: string[] }
  | { type: "company.setPrimaryOwner"; companyId: string; userId: string }
  | { type: "invoice.delete"; companyId: string; invoiceId: string }
  | { type: "invoice.downloaded"; companyId: string; invoiceId: string }
  | { type: "invoice.restore"; companyId: string; invoiceId: string }
  | { type: "invoice.purgeDue" }
  | { type: "user.setPassword"; userId: string; password_hash: string }
  // kredity
  | { type: "credit.add"; companyId: string; amount_cents: number; kind: "topup" | "adjust"; note: Text; ref: Text; topupRequestId: Text }
  | { type: "topup.request"; companyId: string; request: { id: string; amount_cents: number } }
  | { type: "topup.cancel"; companyId: string; requestId: string }
  | { type: "billing.close"; month: string }
  // dáta firmy
  | { type: "company.update"; companyId: string; patch: CompanyPatch }
  | { type: "customer.create"; companyId: string; customer: CustomerData }
  | { type: "job.create"; companyId: string; job: JobData }
  | { type: "job.setStatus"; companyId: string; jobId: string; status: JobStatus }
  | { type: "job.update"; companyId: string; jobId: string; patch: Omit<JobData, "id"> }
  | { type: "job.delete"; companyId: string; jobId: string }
  | { type: "customer.update"; companyId: string; customerId: string; patch: Omit<CustomerData, "id"> }
  // zákazky zákazníka ostanú bez zákazníka, alebo sa zmažú tiež (deleteJobs)
  | { type: "customer.delete"; companyId: string; customerId: string; deleteJobs?: boolean }
  | { type: "photo.add"; companyId: string; photo: PhotoData }
  | { type: "photo.delete"; companyId: string; photoId: string }
  // dochádzka: user_id = za koho (predvolene autor; za iného smie len majiteľ/správca)
  | { type: "time.add"; companyId: string; entry: { id: string; job_id: string; user_id?: Text; work_date: string; minutes: number; note: Text; material?: Text } }
  | { type: "time.delete"; companyId: string; entryId: string }
  | { type: "price.add"; companyId: string; item: PriceData & { id: string; is_labor: boolean } }
  | { type: "price.update"; companyId: string; itemId: string; patch: PriceData }
  | { type: "price.delete"; companyId: string; itemId: string }
  | { type: "category.add"; companyId: string; category: { id: string; name: string } }
  | { type: "category.rename"; companyId: string; categoryId: string; name: string }
  | { type: "category.delete"; companyId: string; categoryId: string }
  // podpora: chat majiteľov s webmastrom
  | {
      type: "ticket.open"; companyId: string; ticket: { id: string; subject: string; priority: TicketPriority }; message: { id: string; body: string };
      /** len webmaster: komu chat patrí */
      audience?: TicketAudience; recipients?: string[];
    }
  | { type: "ticket.message"; ticketId: string; message: { id: string; body: string } }
  | { type: "ticket.setStatus"; ticketId: string; status: "open" | "closed" }
  | { type: "ticket.setPriority"; ticketId: string; priority: TicketPriority }
  | { type: "ticket.read"; ticketId: string }
  | { type: "ticket.delete"; ticketId: string }
  | { type: "ticket.maintain" }
  | { type: "invoice.create"; companyId: string; invoice: InvoiceData; items: InvoiceLine[] }
  // úprava konceptu (číslo ostane); vystavenú faktúru opraví invoice.correct (storno + kópia ako nový koncept)
  | { type: "invoice.update"; companyId: string; invoiceId: string; invoice: Omit<InvoiceData, "id">; items: InvoiceLine[] }
  | { type: "invoice.correct"; companyId: string; invoiceId: string; newId: string }
  | { type: "invoice.setStatus"; companyId: string; invoiceId: string; status: InvoiceStatus };

/** Udalosť tak, ako ide cez hub: telo + id udalosti, čas a autor (id používateľa). */
export type SyncEvent = EventBody & { id: string; at: string; actor: string | null };

class Rejected extends Error {}
const reject = (code: ErrorCode): never => {
  throw new Rejected(code);
};

/**
 * Aplikuje jednu udalosť v jednej transakcii spolu s posunom last_seq.
 * Odmietnutá udalosť (chýbajúce oprávnenie, duplicitný e-mail…) nič nezmení, len sa
 * zapíše jej chyba; synchronizácia ide ďalej. Vracia kód chyby alebo null.
 */
export function applyEvent(db: DatabaseSync, seq: number, ev: SyncEvent, ts = 0): ErrorCode | null {
  let error: ErrorCode | null = null;
  db.exec("BEGIN IMMEDIATE");
  try {
    // každý server drží úplnú kópiu logu (hub sa z nej dá obnoviť)
    db.prepare("INSERT OR REPLACE INTO event_log (seq, ts, body) VALUES (?, ?, ?)").run(seq, ts, JSON.stringify(ev));
    db.exec("SAVEPOINT ev");
    try {
      handle(db, ev);
      db.exec("RELEASE ev");
    } catch (e) {
      db.exec("ROLLBACK TO ev");
      db.exec("RELEASE ev");
      if (e instanceof Rejected) {
        error = e.message as ErrorCode;
      } else {
        console.error(`[sync] event ${seq} (${ev?.type}) could not be applied:`, e);
        error = "invalid";
      }
      db.prepare("INSERT OR REPLACE INTO event_results (seq, error) VALUES (?, ?)").run(seq, error);
    }
    db.prepare("UPDATE sync_state SET last_seq = ? WHERE id = 1").run(seq);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return error;
}

function handle(db: DatabaseSync, ev: SyncEvent) {
  const run = (sql: string, ...p: (string | number | null)[]) => db.prepare(sql).run(...p);
  const get = <T>(sql: string, ...p: (string | number | null)[]) => db.prepare(sql).get(...p) as T | undefined;
  const all = <T>(sql: string, ...p: (string | number | null)[]) => db.prepare(sql).all(...p) as T[];

  const isWebmaster = ev.actor === WEBMASTER;
  const isSystem = ev.actor === SYSTEM;
  const webmasterOnly = () => {
    if (!isWebmaster) reject("forbidden");
  };

  type CompanyState = { id: string; credit_cents: number; suspended: number; blocked: number; logo_path: string | null; logo_size: number; storage_bytes: number; created_at: string };
  const company = (companyId: string) =>
    get<CompanyState>("SELECT id, credit_cents, suspended, blocked, logo_path, logo_size, storage_bytes, created_at FROM companies WHERE id = ?", companyId) ??
    reject("not_found");
  // Bez kreditu (zostatok pod nulou) alebo po pozastavení je firma len na čítanie.
  const writable = (companyId: string) => {
    const c = company(companyId);
    if (c.suspended || c.credit_cents < 0) reject("read_only");
  };
  const access = (companyId: string, userId = ev.actor) =>
    userId ? get<{ role: Role; perms: string }>("SELECT role, perms FROM company_members WHERE company_id = ? AND user_id = ?", companyId, userId) : undefined;
  const roleOf = (companyId: string, userId = ev.actor) => access(companyId, userId)?.role;
  /** Člen firmy. Zápis (predvolene) vyžaduje kredit a nepozastavenú firmu. */
  /** blockedOk: zablokovaná firma – majitelia smú len písať podpore */
  const member = (companyId: string, opts?: { readOnlyOk?: boolean; blockedOk?: boolean }) => {
    const role = roleOf(companyId) ?? reject("forbidden");
    if (company(companyId).blocked && !(opts?.blockedOk && role === "owner")) reject("company_blocked");
    if (!opts?.readOnlyOk) writable(companyId);
    return role;
  };
  const isOwner = (companyId: string) => roleOf(companyId) === "owner";
  const has = (companyId: string, perm: Perm, userId = ev.actor) => {
    const a = access(companyId, userId);
    return !!a && (a.role === "owner" || parsePerms(a.perms).includes(perm));
  };
  /** Člen firmy s oprávnením (majiteľ smie všetko). */
  const can = (companyId: string, perm: Perm, opts?: { readOnlyOk?: boolean; blockedOk?: boolean }) => {
    member(companyId, opts);
    if (!has(companyId, perm)) reject("forbidden");
  };
  /** Tím spravuje webmaster, majiteľ alebo člen s oprávnením company.team (ten nesiaha na majiteľov). */
  const manageTeam = (companyId: string, targetUserId: string) => {
    if (isWebmaster) return void company(companyId);
    can(companyId, "company.team", { readOnlyOk: true });
    if (!isOwner(companyId) && roleOf(companyId, targetUserId) === "owner") reject("forbidden");
  };
  /** Člen tímu môže meniť len oprávnenia, ktoré má sám (pridať aj odobrať). */
  const checkGrant = (companyId: string, before: Perm[], after: Perm[]) => {
    if (isWebmaster || isOwner(companyId)) return;
    const mine = parsePerms(access(companyId)?.perms);
    const changed = [...before.filter((p) => !after.includes(p)), ...after.filter((p) => !before.includes(p))];
    if (changed.some((p) => !mine.includes(p))) reject("forbidden");
  };
  const plusDays = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  };
  /** Najvyšší počet ľudí vo firme v tomto mesiaci (prevádzka na osobu). */
  /** Majitelia, ktorých sa zmena cien týka (firmy s vlastnou cenou prevádzky len pri zmene ceny úložiska). */
  const priceOwners = (storageChanged: boolean) =>
    all<{ user_id: string; own: number }>(
      `SELECT m.user_id, MAX(c.fee_cents IS NOT NULL OR c.fee_mode IS NOT NULL) AS own
         FROM company_members m JOIN companies c ON c.id = m.company_id
        WHERE m.role = 'owner' AND (? = 1 OR (c.fee_cents IS NULL AND c.fee_mode IS NULL))
        GROUP BY m.user_id ORDER BY m.user_id`,
      storageChanged ? 1 : 0
    );
  const bumpPeak = (companyId: string) => {
    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM company_members WHERE company_id = ?", companyId)!.n;
    run(
      `INSERT INTO member_peaks (company_id, month, peak) VALUES (?, ?, ?)
       ON CONFLICT(company_id, month) DO UPDATE SET peak = MAX(peak, excluded.peak)`,
      companyId, ev.at.slice(0, 7), n
    );
  };
  const plusMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
  const ownersOf = (companyId: string) =>
    all<{ user_id: string }>("SELECT user_id FROM company_members WHERE company_id = ? AND role = 'owner' ORDER BY created_at", companyId)
      .map((r) => r.user_id);
  /**
   * E-mail do fronty. Id je odvodené z udalosti, takže je na všetkých serveroch rovnaké.
   * Nič sa nezaradí, keď sú e-maily vypnuté, príjemca nemá e-mail alebo si tento druh vypol.
   */
  const enqueue = (
    key: string, kind: MailKind, recipient: string, companyId: string | null, data: Record<string, unknown>,
    opts: { dueAt?: string; unlessRead?: { ticket: string; reader: string; since: string }; force?: boolean } = {}
  ) => {
    const site = get<{ mail_enabled: number; wm_mail_off: string }>("SELECT mail_enabled, wm_mail_off FROM site_settings WHERE id = 1");
    if (!site?.mail_enabled) return;
    // zablokovaná firma: len e-maily o podpore (majitelia smú písať podpore)
    if (companyId && recipient !== WEBMASTER && !["support", "chat_closed"].includes(kind)
      && get("SELECT 1 FROM companies WHERE id = ? AND blocked = 1", companyId)) return;
    if (recipient === WEBMASTER) {
      if (!opts.force && parseKinds(site.wm_mail_off).includes(kind)) return;
    } else {
      const u = get<{ email: string | null; mail_off: string }>("SELECT email, mail_off FROM users WHERE id = ?", recipient);
      if (!u?.email || (!opts.force && parseKinds(u.mail_off).includes(kind))) return;
    }
    run(
      `INSERT OR IGNORE INTO mail_outbox (id, kind, recipient, company_id, data, created_at, due_at, unless_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      `${ev.id}:${key}`, kind, recipient, companyId, JSON.stringify(data), ev.at, opts.dueAt ?? ev.at,
      opts.unlessRead ? JSON.stringify(opts.unlessRead) : null
    );
  };
  /** Naplánované zmeny cien, ktorých čas prišiel, sa prepíšu do platných cien. */
  const applyDuePrices = (at: string) => {
    const due = all<{ id: string; new_fee_cents: number; new_storage_cents: number; new_mode: string | null }>(
      "SELECT id, new_fee_cents, new_storage_cents, new_mode FROM price_changes WHERE status = 'pending' AND effective_at <= ? ORDER BY effective_at",
      at
    );
    for (const c of due) {
      run("UPDATE site_settings SET monthly_fee_cents = ?, storage_cents_per_gb = ?, fee_mode = COALESCE(?, fee_mode) WHERE id = 1", c.new_fee_cents, c.new_storage_cents, c.new_mode);
      run("UPDATE price_changes SET status = 'applied', done_at = ? WHERE id = ?", at, c.id);
    }
    return due.length;
  };
  /**
   * Odpoveď webmastra v podpore → e-mail (najviac jeden za sériu neprečítaných správ):
   * - chat založil majiteľ: prvá odpoveď hneď, ďalšie len ak si ich do 15 min neprečíta
   * - chat založil člen tímu: majiteľom len ak si to člen do 30 min neprečíta
   */
  const supportMail = (ticketId: string, companyId: string, messageId: string, body: string) => {
    const tk = get<{ created_by: string | null; subject: string; opened_by_webmaster: number; audience: string | null }>(
      "SELECT created_by, subject, opened_by_webmaster, audience FROM tickets WHERE id = ?", ticketId
    );
    if (!tk) return;
    if (tk.opened_by_webmaster) {
      // chat od webmastra: ďalšie odpovede majiteľom-adresátom, ak si ich do 15 min neprečítajú
      const data = { ticket: ticketId, subject: tk.subject, preview: body.slice(0, 600) };
      for (const o of ticketOwners(ticketId, companyId, tk.audience)) {
        const lastRead = get<{ read_at: string }>("SELECT read_at FROM ticket_reads WHERE ticket_id = ? AND reader = ?", ticketId, o)?.read_at ?? "";
        if (get(
          `SELECT 1 FROM mail_outbox WHERE kind = 'support' AND recipient = ? AND json_extract(data, '$.ticket') = ?
             AND created_at > ? AND status IN ('pending', 'sent')`, o, ticketId, lastRead
        )) continue;
        enqueue(`s:${o}`, "support", o, companyId, data, {
          dueAt: plusMinutes(ev.at, SUPPORT_OWNER_DELAY_MIN), unlessRead: { ticket: ticketId, reader: o, since: ev.at },
        });
      }
      return;
    }
    const starter = tk.created_by;
    const starterRole = starter ? roleOf(companyId, starter) : undefined;
    const data = { ticket: ticketId, subject: tk.subject, preview: body.slice(0, 600) };
    /** Už čaká alebo odišiel e-mail od chvíle, keď si to čitateľ naposledy prečítal? */
    const seriesOpen = (recipient: string, reader: string | null) => {
      const lastRead = reader ? get<{ read_at: string }>("SELECT read_at FROM ticket_reads WHERE ticket_id = ? AND reader = ?", ticketId, reader)?.read_at ?? "" : "";
      return !!get(
        `SELECT 1 FROM mail_outbox WHERE kind = 'support' AND recipient = ? AND json_extract(data, '$.ticket') = ?
           AND created_at > ? AND status IN ('pending', 'sent')`,
        recipient, ticketId, lastRead
      );
    };
    if (starter && starterRole === "owner") {
      if (seriesOpen(starter, starter)) return;
      const first = !get("SELECT 1 FROM ticket_messages WHERE ticket_id = ? AND from_webmaster = 1 AND id <> ?", ticketId, messageId);
      enqueue(`s:${starter}`, "support", starter, companyId, data, first ? {} : {
        dueAt: plusMinutes(ev.at, SUPPORT_OWNER_DELAY_MIN),
        unlessRead: { ticket: ticketId, reader: starter, since: ev.at },
      });
      return;
    }
    const reader = starter && starterRole === "member" ? starter : null;
    for (const o of ownersOf(companyId)) {
      if (seriesOpen(o, reader)) continue;
      enqueue(`s:${o}`, "support", o, companyId, { ...data, byMember: true }, {
        dueAt: plusMinutes(ev.at, SUPPORT_MEMBER_DELAY_MIN),
        ...(reader ? { unlessRead: { ticket: ticketId, reader, since: ev.at } } : {}),
      });
    }
  };
  /** Kategória musí patriť firme; inak (aj prázdna) = bez kategórie. */
  const categoryOf = (companyId: string, id: Text | undefined) =>
    id && get("SELECT 1 FROM price_categories WHERE id = ? AND company_id = ?", id, companyId) ? id : null;
  /** Meno používateľa, ako sa prihlasuje: majiteľ e-mail, člen tímu používateľské meno. */
  const nameOf = (companyId: string, userId: string) => {
    const u = get<{ email: string | null; username: string | null }>("SELECT email, username FROM users WHERE id = ?", userId);
    return (roleOf(companyId, userId) === "owner" ? u?.email ?? u?.username : u?.username ?? u?.email) ?? "?";
  };
  /** Chat: webmaster všetky, vo firme majiteľ a členovia s oprávnením na podporu. */
  type TicketState = { company_id: string; status: string; opened_by_webmaster: number; audience: string | null };
  /** Vidí človek chat? Chat od firmy: majiteľ + oprávnenie na podporu. Chat od webmastra podľa adresátov. */
  const seesTicket = (t: TicketState, ticketId: string, userId: string) => {
    const support = has(t.company_id, "support", userId);
    if (!t.opened_by_webmaster || t.audience === "support") return support;
    if (t.audience === "company") return !!roleOf(t.company_id, userId);
    return !!get("SELECT 1 FROM ticket_recipients WHERE ticket_id = ? AND user_id = ?", ticketId, userId);
  };
  const ticketAccess = (ticketId: string) => {
    const t = get<TicketState>("SELECT company_id, status, opened_by_webmaster, audience FROM tickets WHERE id = ?", ticketId) ?? reject("not_found");
    if (!isWebmaster) {
      member(t.company_id, { readOnlyOk: true, blockedOk: true });
      if (!seesTicket(t, ticketId, ev.actor!)) reject("forbidden");
    }
    return t;
  };
  /** Majitelia, ktorí chat od webmastra dostali (e-maily). */
  const ticketOwners = (ticketId: string, companyId: string, audience: string | null) =>
    audience === "people"
      ? all<{ user_id: string }>(
          `SELECT r.user_id FROM ticket_recipients r JOIN company_members m ON m.user_id = r.user_id AND m.company_id = ?
            WHERE r.ticket_id = ? AND m.role = 'owner' ORDER BY r.user_id`, companyId, ticketId
        ).map((r) => r.user_id)
      : ownersOf(companyId);
  const isPrimaryOwner = (companyId: string, userId: string) =>
    get<{ p: string | null }>("SELECT primary_owner_id AS p FROM companies WHERE id = ?", companyId)?.p === userId;
  // riadok musí patriť tej istej firme (inak by sa dalo siahnuť na cudzie dáta)
  const owned = (table: "customers" | "jobs" | "job_photos" | "price_items" | "invoices", id: string, companyId: string) => {
    if (!get(`SELECT 1 FROM ${table} WHERE id = ? AND company_id = ?`, id, companyId)) reject("not_found");
  };
  const optionalOwned = (table: "customers" | "jobs", id: Text, companyId: string) => {
    if (id) owned(table, id, companyId);
    return id || null;
  };
  const bool = (b: boolean) => (b ? 1 : 0);
  const cents = (n: number) => (Number.isInteger(n) ? n : reject("invalid"));
  const text = (v: Text, max: number) => (v == null ? null : v.length > max ? reject("invalid") : v.trim() || null);
  const validEmail = (e: string) => {
    const email = e.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) reject("invalid");
    return email;
  };
  const usernameTaken = (companyId: string, name: string) =>
    !!get("SELECT 1 FROM users u JOIN company_members m ON m.user_id = u.id WHERE m.company_id = ? AND u.username = ?", companyId, name);
  /** Zadané meno člena tímu (jedinečné vo firme); staršie udalosti mali len e-mail – meno sa odvodí z neho. */
  const memberName = (companyId: string, wanted: Text | undefined, legacyEmail: Text | undefined) => {
    const name = (wanted ?? "").trim().toLowerCase();
    if (!name && legacyEmail) return usernameFromEmail(legacyEmail, (n) => usernameTaken(companyId, n));
    if (!name) reject("username_needed");
    if (!validUsername(name)) reject("invalid");
    if (usernameTaken(companyId, name)) reject("username_taken");
    return name;
  };
  /** Nový používateľ firmy: majiteľ s e-mailom, člen tímu s menom (jedinečným vo firme). */
  const insertUser = (u: NewUser, companyId: string, role: Role, perms: Perm[], legacy = false) => {
    if (!u.password_hash) reject("invalid");
    let email: string | null = null;
    let username: string | null = null;
    if (role === "member") {
      username = memberName(companyId, u.username, legacy ? u.email : null);
    } else {
      email = validEmail(u.email ?? "");
      if (get("SELECT 1 FROM users WHERE email = ?", email)) reject("email_taken");
    }
    run("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", u.id, email, username, u.password_hash, ev.at);
    run("INSERT INTO company_members (company_id, user_id, role, perms, created_at) VALUES (?, ?, ?, ?, ?)", companyId, u.id, role, permsText(perms), ev.at);
    return role === "member" ? username! : email!;
  };
  /** Kód firmy odvodený z id udalosti (rovnaký na všetkých serveroch), bez kolízie. */
  const newLoginCode = (companyName: string) => {
    for (let attempt = 0; ; attempt++) {
      const code = deriveCode(companyName, ev.id, attempt);
      if (!get("SELECT 1 FROM companies WHERE REPLACE(login_code, '-', '') = ?", codeKey(code))) return code;
    }
  };
  /** Pohyb na kreditnom účte firmy (+ dobitie, - poplatok). */
  const credit = (companyId: string, id: string, amount: number, kind: "topup" | "adjust" | "fee" | "storage", note: Text, ref: Text = null) => {
    run("INSERT INTO credit_tx (id, company_id, at, amount_cents, kind, note, ref) VALUES (?, ?, ?, ?, ?, ?, ?)", id, companyId, ev.at, amount, kind, note, ref);
    run("UPDATE companies SET credit_cents = credit_cents + ? WHERE id = ?", amount, companyId);
  };
  /** Zmena obsadeného miesta; zapíše denný vrchol (ako R2). */
  const storage = (companyId: string, delta: number) => {
    if (!delta) return;
    const day = ev.at.slice(0, 10);
    const current = company(companyId).storage_bytes;
    const next = Math.max(0, current + delta);
    const row = get<{ peak_bytes: number }>("SELECT peak_bytes FROM storage_usage WHERE company_id = ? AND day = ?", companyId, day);
    if (row) {
      run("UPDATE storage_usage SET peak_bytes = ?, end_bytes = ? WHERE company_id = ? AND day = ?", Math.max(row.peak_bytes, next), next, companyId, day);
    } else {
      // deň začína so stavom z konca predchádzajúceho dňa, ten sa do vrcholu počíta tiež
      run("INSERT INTO storage_usage (company_id, day, peak_bytes, end_bytes) VALUES (?, ?, ?, ?)", companyId, day, Math.max(current, next), next);
    }
    run("UPDATE companies SET storage_bytes = ? WHERE id = ?", next, companyId);
  };

  /** Zmaže zákazku: súbory (uvoľní miesto), hodiny ostanú s názvom zákazky, faktúry ostanú. */
  const deleteJob = (companyId: string, jobId: string) => {
    const freed = get<{ n: number | null }>("SELECT SUM(size_bytes) AS n FROM job_photos WHERE job_id = ?", jobId)?.n ?? 0;
    run(
      "UPDATE time_entries SET job_title = COALESCE(job_title, (SELECT title FROM jobs WHERE id = ?)), job_id = NULL WHERE job_id = ? AND company_id = ?",
      jobId, jobId, companyId
    );
    run("UPDATE invoices SET job_title = COALESCE(job_title, (SELECT title FROM jobs WHERE id = ?)) WHERE job_id = ? AND company_id = ?", jobId, jobId, companyId);
    run("DELETE FROM jobs WHERE id = ? AND company_id = ?", jobId, companyId); // súbory sa zmažú s ňou
    storage(companyId, -freed);
  };
  /** Odberateľ a zákazka na faktúre tak, ako boli pri vystavení (faktúra prežije ich zmazanie). */
  const snapshot = (companyId: string, customerId: string | null, jobId: string | null) => {
    const c = customerId
      ? get<Record<string, string | null>>("SELECT name, ico, dic, ic_dph, address, zip, city, email, phone FROM customers WHERE id = ?", customerId)
      : undefined;
    const j = jobId ? get<{ title: string }>("SELECT title FROM jobs WHERE id = ? AND company_id = ?", jobId, companyId) : undefined;
    return { buyer: c ? JSON.stringify(c) : null, jobTitle: j?.title ?? null };
  };
  type InvoiceRowIn = { id: string; customer_id: string | null; job_id: string | null; issue_date: string; delivery_date: string; due_date: string; note: Text };
  /** Položky faktúry (neplatca DPH nikdy neúčtuje DPH) + súčty. */
  const invoiceLines = (companyId: string, lines: InvoiceLine[]) => {
    if (!lines.length) reject("no_items");
    const c = get<{ is_vat_payer: number }>("SELECT is_vat_payer FROM companies WHERE id = ?", companyId) ?? reject("not_found");
    const items = lines.map((it) => ({ ...it, vat_rate: c.is_vat_payer ? Number(it.vat_rate) : 0 }));
    return { items, sum: totals(items) };
  };
  const writeItems = (companyId: string, invoiceId: string, items: InvoiceLine[]) => {
    run("DELETE FROM invoice_items WHERE invoice_id = ?", invoiceId);
    items.forEach((it, position) =>
      run(
        `INSERT INTO invoice_items (id, invoice_id, company_id, position, name, unit, quantity, unit_price, vat_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${invoiceId}:${position}`, invoiceId, companyId, position, it.name, it.unit || "ks", Number(it.quantity), Number(it.unit_price), it.vat_rate
      )
    );
  };
  /** Nová faktúra s ďalším číslom (číslo prideľuje až apply, takže sa nikdy nezdvojí). */
  const insertInvoice = (companyId: string, inv: InvoiceRowIn, lines: InvoiceLine[]) => {
    const { items, sum } = invoiceLines(companyId, lines);
    const c = get<{ invoice_prefix: string; next_invoice_number: number }>(
      "SELECT invoice_prefix, next_invoice_number FROM companies WHERE id = ?", companyId
    ) ?? reject("not_found");
    const number = `${c.invoice_prefix}${ev.at.slice(0, 4)}${String(c.next_invoice_number).padStart(4, "0")}`;
    run("UPDATE companies SET next_invoice_number = next_invoice_number + 1 WHERE id = ?", companyId);
    const customerId = optionalOwned("customers", inv.customer_id, companyId);
    const jobId = optionalOwned("jobs", inv.job_id, companyId);
    const snap = snapshot(companyId, customerId, jobId);
    run(
      `INSERT INTO invoices (id, company_id, customer_id, job_id, number, variable_symbol, issue_date, delivery_date, due_date,
         note, total_net, total_vat, total_gross, buyer, job_title, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      inv.id, companyId, customerId, jobId, number, number.replace(/\D/g, ""), inv.issue_date, inv.delivery_date, inv.due_date,
      inv.note, sum.net, sum.vat, sum.gross, snap.buyer, snap.jobTitle, ev.actor, ev.at
    );
    writeItems(companyId, inv.id, items);
  };

  switch (ev.type) {
    // ───────── Web a webmaster ─────────
    case "account.request": {
      // Verejný formulár (bez prihlásenia); obmedzenie počtu rieši server pred odoslaním.
      const r = ev.request;
      const companyName = text(r.company_name, 200) ?? reject("invalid");
      const contactName = text(r.contact_name, 200) ?? reject("invalid");
      if (r.logo_path && !r.logo_path.startsWith(`requests/${r.id}/`)) reject("forbidden");
      const people = r.people == null ? null : cents(r.people);
      const storageGb = r.storage_gb == null ? null : cents(r.storage_gb);
      if ((people !== null && (people < 1 || people > 10_000)) || (storageGb !== null && (storageGb < 0 || storageGb > 1_000_000))) reject("invalid");
      run(
        `INSERT INTO account_requests (id, company_name, contact_name, email, phone, ico, message, logo_path, logo_size, people, storage_gb, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, companyName, contactName, validEmail(r.email), text(r.phone, 50), text(r.ico, 20), text(r.message, 4000),
        r.logo_path || null, r.logo_path ? cents(r.logo_size ?? 0) : 0, people, storageGb, ev.at
      );
      enqueue("wr", "wm_request", WEBMASTER, null, { company: companyName, contact: contactName, email: r.email.trim().toLowerCase() });
      return;
    }
    case "request.setStatus": {
      webmasterOnly();
      if (!["new", "done", "rejected"].includes(ev.status)) reject("invalid");
      if (!run("UPDATE account_requests SET status = ?, status_at = ? WHERE id = ?", ev.status, ev.status === "new" ? null : ev.at, ev.requestId).changes) {
        reject("not_found");
      }
      return;
    }
    case "request.maintain": {
      if (!isSystem) reject("forbidden");
      run(
        `DELETE FROM account_requests WHERE (status = 'done' AND status_at <= ?) OR (status = 'rejected' AND status_at <= ?)`,
        plusDays(ev.at, -REQUEST_DONE_DAYS), plusDays(ev.at, -REQUEST_REJECTED_DAYS)
      );
      return;
    }
    case "company.create": {
      // Firmy zakladá len webmaster (namiesto registrácie je žiadosť o účet).
      webmasterOnly();
      const name = text(ev.company.name, 200) ?? reject("invalid");
      const no = get<{ no: number }>("SELECT COALESCE(MAX(company_no), 0) + 1 AS no FROM companies")!.no;
      // variabilný symbol YYQRRR, jedinečný (pri kolízii ďalšie číslo; v kvartáli je 1000 možností)
      let vs: string | null = null;
      for (let attempt = 0; attempt < 1000 && !vs; attempt++) {
        const v = deriveVs(ev.at, ev.id, attempt);
        if (!get("SELECT 1 FROM companies WHERE vs = ?", v)) vs = v;
      }
      if (!vs) reject("invalid");
      run(
        "INSERT INTO companies (id, name, ico, company_no, vs, login_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ev.company.id, name, text(ev.company.ico, 20), no, vs, newLoginCode(name), ev.at
      );
      insertUser(ev.owner, ev.company.id, "owner", []);
      bumpPeak(ev.company.id);
      run("UPDATE companies SET primary_owner_id = ? WHERE id = ?", ev.owner.id, ev.company.id);
      // kategórie cenníka: z udalosti, staršie udalosti ich nemajú (vtedy pôvodné štyri)
      const cats = ev.categories ?? LEGACY_CATEGORIES;
      if (cats.length > 20) reject("invalid");
      cats.forEach((cname, i) =>
        run("INSERT INTO price_categories (id, company_id, name, position) VALUES (?, ?, ?, ?)", `${ev.company.id}:cat:${i}`, ev.company.id, text(cname, 60) ?? reject("invalid"), i)
      );
      // základný cenník (položky sú v udalosti; staršie udalosti ho nemajú)
      if ((ev.prices?.length ?? 0) > 200) reject("invalid");
      (ev.prices ?? []).forEach((p, i) => {
        const pname = text(p.name, 200) ?? reject("invalid");
        const price = Number(p.unit_price);
        if (!Number.isFinite(price) || price < 0) reject("invalid");
        const cat = p.cat != null && p.cat >= 0 && p.cat < cats.length ? `${ev.company.id}:cat:${p.cat}` : null;
        run(
          `INSERT INTO price_items (id, company_id, name, unit, unit_price, vat_rate, is_labor, category_id, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          `${ev.id}:price:${i}`, ev.company.id, pname, text(p.unit, 20) ?? "ks", price, bool(!!p.is_labor), cat, ev.at
        );
      });
      if (cents(ev.credit_cents) < 0) reject("invalid");
      if (ev.credit_cents > 0) credit(ev.company.id, `${ev.id}:credit`, ev.credit_cents, "topup", null);
      // prevádzka sa platí vopred: prvý mesiac pomerne od dňa založenia
      const month = ev.at.slice(0, 7);
      const fee = proratedFee(companyFee(db, ev.company.id, siteSettings(db), month).cents, month, Number(ev.at.slice(8, 10)));
      if (fee > 0) credit(ev.company.id, `${ev.id}:fee`, -fee, "fee", month);
      if (ev.requestId) {
        // logo zo žiadosti sa stane logom firmy (a počíta sa do jej úložiska)
        const req = get<{ logo_path: string | null; logo_size: number }>("SELECT logo_path, logo_size FROM account_requests WHERE id = ?", ev.requestId);
        if (req?.logo_path) {
          run("UPDATE companies SET logo_path = ?, logo_size = ? WHERE id = ?", req.logo_path, req.logo_size, ev.company.id);
          storage(ev.company.id, req.logo_size);
        }
        run("UPDATE account_requests SET status = 'done', status_at = ?, company_id = ? WHERE id = ?", ev.at, ev.company.id, ev.requestId);
      }
      return;
    }
    case "company.setPricing": {
      webmasterOnly();
      company(ev.companyId);
      const fee = ev.fee_cents == null ? null : cents(ev.fee_cents);
      const waived = ev.fee_waived_until ?? null;
      if ((fee !== null && (fee < 0 || fee > 1_000_000)) || (ev.fee_mode !== null && !["per_user", "per_company"].includes(ev.fee_mode))) reject("invalid");
      if (waived !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(waived)) reject("invalid");
      run("UPDATE companies SET fee_cents = ?, fee_mode = ?, fee_waived_until = ? WHERE id = ?", fee, ev.fee_mode, waived, ev.companyId);
      return;
    }
    case "company.setBlocked": {
      webmasterOnly();
      company(ev.companyId);
      run("UPDATE companies SET blocked = ? WHERE id = ?", bool(ev.blocked), ev.companyId);
      return;
    }
    case "company.setSuspended": {
      webmasterOnly();
      company(ev.companyId);
      run("UPDATE companies SET suspended = ? WHERE id = ?", bool(ev.suspended), ev.companyId);
      return;
    }
    case "company.newCode": {
      // nový kód firmy (napr. keď odíde zamestnanec); starý prestane platiť
      if (!isWebmaster) can(ev.companyId, "company.code", { readOnlyOk: true });
      const c = get<{ name: string }>("SELECT name FROM companies WHERE id = ?", ev.companyId) ?? reject("not_found");
      run("UPDATE companies SET login_code = ? WHERE id = ?", newLoginCode(c.name), ev.companyId);
      return;
    }
    case "site.update": {
      webmasterOnly();
      const p = ev.patch;
      run(
        "UPDATE site_settings SET operator_name = ?, iban = ?, contact_email = ?, contact_phone = ?, info_text = ? WHERE id = 1",
        text(p.operator_name, 200), text(p.iban, 50), text(p.contact_email, 200), text(p.contact_phone, 50), text(p.info_text, 4000)
      );
      // staršie udalosti menili ceny hneď
      if (p.monthly_fee_cents !== undefined && p.storage_cents_per_gb !== undefined) {
        if (cents(p.monthly_fee_cents) < 0 || cents(p.storage_cents_per_gb) < 0) reject("invalid");
        run("UPDATE site_settings SET monthly_fee_cents = ?, storage_cents_per_gb = ? WHERE id = 1", p.monthly_fee_cents, p.storage_cents_per_gb);
      }
      return;
    }
    case "price.schedule": {
      webmasterOnly();
      const fee = cents(ev.monthly_fee_cents), storagePrice = cents(ev.storage_cents_per_gb);
      if (fee < 0 || storagePrice < 0 || fee > 1_000_000 || storagePrice > 1_000_000) reject("invalid");
      const cur = siteSettings(db);
      const mode: FeeMode = ev.fee_mode ?? cur.fee_mode;
      if (!["per_user", "per_company"].includes(mode)) reject("invalid");
      // nová zmena nahrádza doterajšiu naplánovanú
      run("UPDATE price_changes SET status = 'cancelled', done_at = ? WHERE status = 'pending'", ev.at);
      if (fee === cur.monthly_fee_cents && storagePrice === cur.storage_cents_per_gb && mode === cur.fee_mode) return;
      if (!get("SELECT 1 FROM companies LIMIT 1")) {
        // ešte nikto neplatí – platí hneď
        run("UPDATE site_settings SET monthly_fee_cents = ?, storage_cents_per_gb = ?, fee_mode = ? WHERE id = 1", fee, storagePrice, mode);
        return;
      }
      const effective = plusDays(ev.at, PRICE_NOTICE_DAYS);
      run(
        `INSERT INTO price_changes (id, created_at, effective_at, old_fee_cents, new_fee_cents, old_storage_cents, new_storage_cents, old_mode, new_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ev.changeId, ev.at, effective, cur.monthly_fee_cents, fee, cur.storage_cents_per_gb, storagePrice, cur.fee_mode, mode
      );
      const data = { oldFee: cur.monthly_fee_cents, newFee: fee, oldStorage: cur.storage_cents_per_gb, newStorage: storagePrice, oldMode: cur.fee_mode, newMode: mode, effective };
      // firmy s vlastnou cenou prevádzky sa týka len zmena ceny úložiska
      const storageChanged = storagePrice !== cur.storage_cents_per_gb;
      for (const o of priceOwners(storageChanged)) enqueue(`p:${o.user_id}`, "price_change", o.user_id, null, { ...data, own: o.own }, { force: true });
      return;
    }
    case "price.cancel": {
      webmasterOnly();
      const c = get<{ effective_at: string; old_storage_cents: number; new_storage_cents: number }>(
        "SELECT effective_at, old_storage_cents, new_storage_cents FROM price_changes WHERE id = ? AND status = 'pending'", ev.changeId
      ) ?? reject("not_found");
      run("UPDATE price_changes SET status = 'cancelled', done_at = ? WHERE id = ?", ev.at, ev.changeId);
      // zrušenie dostanú tí istí majitelia ako oznámenie o zmene
      for (const o of priceOwners(c.old_storage_cents !== c.new_storage_cents)) enqueue(`pc:${o.user_id}`, "price_cancel", o.user_id, null, { effective: c.effective_at }, { force: true });
      return;
    }
    case "price.ack": {
      // „Rozumiem“ – bublinu vidia len majitelia
      if (!ev.actor || !get("SELECT 1 FROM company_members WHERE user_id = ? AND role = 'owner'", ev.actor)) reject("forbidden");
      if (!get("SELECT 1 FROM price_changes WHERE id = ?", ev.changeId)) reject("not_found");
      run("INSERT OR IGNORE INTO price_change_acks (change_id, user_id, at) VALUES (?, ?, ?)", ev.changeId, ev.actor, ev.at);
      return;
    }
    case "price.apply": {
      if (!isSystem && !isWebmaster) reject("forbidden");
      if (!applyDuePrices(ev.at)) reject("duplicate");
      return;
    }

    // ───────── Nastavenia namiesto .env ─────────
    case "config.set": {
      webmasterOnly();
      for (const [k, v] of Object.entries(ev.patch ?? {})) {
        if (!(CONFIG_KEYS as readonly string[]).includes(k)) reject("invalid");
        if (v == null || v === "") run("DELETE FROM app_config WHERE key = ?", k);
        else {
          if (typeof v !== "string" || v.length > 4000) reject("invalid");
          if (k === "webmaster_email") validEmail(v);
          if (k === "polar_server" && !["production", "sandbox"].includes(v)) reject("invalid");
          run("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, v);
        }
      }
      return;
    }
    case "company.delete": {
      // len webmaster; zmaže firmu so všetkými údajmi a účty jej ľudí (súbory zmaže server, ktorý to poslal)
      webmasterOnly();
      company(ev.companyId);
      const people = all<{ user_id: string }>("SELECT user_id FROM company_members WHERE company_id = ?", ev.companyId).map((r) => r.user_id);
      run("UPDATE account_requests SET company_id = NULL WHERE company_id = ?", ev.companyId);
      run("DELETE FROM mail_outbox WHERE company_id = ? AND status = 'pending'", ev.companyId);
      run("DELETE FROM companies WHERE id = ?", ev.companyId); // ostatné údaje firmy idú preč kaskádou
      for (const u of people) {
        run("DELETE FROM mail_outbox WHERE recipient = ? AND status = 'pending'", u);
        run("DELETE FROM notice_acks WHERE user_id = ?", u);
        run("DELETE FROM price_change_acks WHERE user_id = ?", u);
        run("DELETE FROM ticket_recipients WHERE user_id = ?", u);
        run("DELETE FROM users WHERE id = ?", u);
      }
      return;
    }

    // ───────── Oznamy ─────────
    case "notice.save": {
      webmasterOnly();
      const n = ev.notice;
      const iso = (v: string) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : reject("invalid"));
      const starts = iso(n.starts_at), ends = iso(n.ends_at);
      if (ends <= starts || !["all", "owners", "members"].includes(n.audience)) reject("invalid");
      const texts = [text(n.text_sk, 4000), text(n.text_en, 4000), text(n.text_cs, 4000)];
      if (!texts.some(Boolean)) reject("invalid");
      const before = get<{ text_sk: string | null; text_en: string | null; text_cs: string | null }>(
        "SELECT text_sk, text_en, text_cs FROM notices WHERE id = ?", n.id
      );
      run(
        `INSERT INTO notices (id, starts_at, ends_at, audience, dismissible, text_sk, text_en, text_cs, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET starts_at = excluded.starts_at, ends_at = excluded.ends_at, audience = excluded.audience,
           dismissible = excluded.dismissible, text_sk = excluded.text_sk, text_en = excluded.text_en, text_cs = excluded.text_cs,
           updated_at = ?`,
        n.id, starts, ends, n.audience, bool(!!n.dismissible), texts[0], texts[1], texts[2], ev.at, ev.at
      );
      // zmenený text sa ukáže znova aj tým, čo už klikli „Rozumiem“
      if (before && (before.text_sk !== texts[0] || before.text_en !== texts[1] || before.text_cs !== texts[2])) {
        run("DELETE FROM notice_acks WHERE notice_id = ?", n.id);
      }
      // staré oznamy (skončené pred viac ako 90 dňami) netreba držať
      run("DELETE FROM notices WHERE ends_at < ?", plusDays(ev.at, -90));
      return;
    }
    case "notice.delete": {
      webmasterOnly();
      if (!run("DELETE FROM notices WHERE id = ?", ev.noticeId).changes) reject("not_found");
      return;
    }
    case "notice.ack": {
      if (!ev.actor || !get("SELECT 1 FROM company_members WHERE user_id = ?", ev.actor)) reject("forbidden");
      if (!get("SELECT 1 FROM notices WHERE id = ? AND dismissible = 1", ev.noticeId)) reject("not_found");
      run("INSERT OR IGNORE INTO notice_acks (notice_id, user_id, at) VALUES (?, ?, ?)", ev.noticeId, ev.actor, ev.at);
      return;
    }

    // ───────── E-maily ─────────
    case "mail.settings": {
      webmasterOnly();
      const p = ev.patch;
      const port = p.smtp_port == null ? null : cents(p.smtp_port);
      if (port !== null && (port < 1 || port > 65535)) reject("invalid");
      const from = p.mail_from ? validEmail(p.mail_from) : null;
      const notify = p.wm_notify_email ? validEmail(p.wm_notify_email) : null;
      run(
        `UPDATE site_settings SET mail_enabled = ?, smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?,
           mail_from = ?, mail_from_name = ?, wm_notify_email = ?, wm_mail_off = ? WHERE id = 1`,
        bool(p.mail_enabled), text(p.smtp_host, 200), port, bool(p.smtp_secure), text(p.smtp_user, 200),
        from, text(p.mail_from_name, 100), notify,
        (p.wm_mail_off ?? []).filter((k) => (WEBMASTER_MAIL_KINDS as readonly string[]).includes(k)).join(",")
      );
      if (p.smtp_pass !== undefined) run("UPDATE site_settings SET smtp_pass = ? WHERE id = 1", text(p.smtp_pass, 2000));
      return;
    }
    case "mail.prefs": {
      if (!ev.actor || isWebmaster || isSystem || !get("SELECT 1 FROM users WHERE id = ?", ev.actor)) reject("forbidden");
      const off = (ev.off ?? []).filter((k) => (OWNER_MAIL_KINDS as readonly string[]).includes(k));
      const lang = (MAIL_LANGS as readonly string[]).includes(ev.lang) ? ev.lang : "sk";
      run("UPDATE users SET mail_off = ?, mail_lang = ? WHERE id = ?", [...new Set(off)].join(","), lang, ev.actor);
      return;
    }
    case "mail.test": {
      webmasterOnly();
      if (!get("SELECT 1 FROM site_settings WHERE id = 1 AND smtp_host IS NOT NULL")) reject("mail_not_configured");
      run(
        "INSERT INTO mail_outbox (id, kind, recipient, data, created_at, due_at) VALUES (?, 'test', ?, '{}', ?, ?)",
        ev.mailId, validEmail(ev.to), ev.at, ev.at
      );
      return;
    }
    case "mail.claim": {
      // Server si pred odoslaním e-maily zarezervuje. Poradie určuje hub, takže každý e-mail
      // dostane len jeden server. Kto si medzitým chat prečítal, tomu sa e-mail neposiela.
      if (!isSystem) reject("forbidden");
      if (!Array.isArray(ev.ids) || ev.ids.length > 50 || !ev.token) reject("invalid");
      const stale = plusMinutes(ev.at, -MAIL_CLAIM_MINUTES);
      for (const id of ev.ids) {
        const m = get<{ status: string; due_at: string; claimed_at: string | null; unless_read: string | null }>(
          "SELECT status, due_at, claimed_at, unless_read FROM mail_outbox WHERE id = ?", id
        );
        if (!m || m.status !== "pending" || m.due_at > ev.at || (m.claimed_at && m.claimed_at > stale)) continue;
        if (m.unless_read) {
          const u = JSON.parse(m.unless_read) as { ticket: string; reader: string; since: string };
          const read = get<{ read_at: string }>("SELECT read_at FROM ticket_reads WHERE ticket_id = ? AND reader = ?", u.ticket, u.reader)?.read_at;
          if (!get("SELECT 1 FROM tickets WHERE id = ?", u.ticket) || (read && read >= u.since)) {
            run("UPDATE mail_outbox SET status = 'skipped', done_at = ? WHERE id = ?", ev.at, id);
            continue;
          }
        }
        run("UPDATE mail_outbox SET claimed_by = ?, claimed_at = ?, attempts = attempts + 1 WHERE id = ?", ev.token, ev.at, id);
      }
      return;
    }
    case "mail.done": {
      if (!isSystem) reject("forbidden");
      for (const r of ev.results ?? []) {
        const m = get<{ attempts: number; kind: string }>("SELECT attempts, kind FROM mail_outbox WHERE id = ? AND status = 'pending'", r.id);
        if (!m) continue;
        const to = text(r.to ?? null, 300), subject = text(r.subject ?? null, 300), error = text((r.error ?? "").slice(0, 500), 500);
        if (r.skip) {
          run("UPDATE mail_outbox SET status = 'skipped', done_at = ?, error = ? WHERE id = ?", ev.at, error, r.id);
        } else if (r.ok) {
          run("UPDATE mail_outbox SET status = 'sent', done_at = ?, to_addr = ?, subject = ?, error = NULL WHERE id = ?", ev.at, to, subject, r.id);
        } else if (m.attempts >= MAIL_ATTEMPTS || m.kind === "test") {
          run("UPDATE mail_outbox SET status = 'failed', done_at = ?, to_addr = ?, subject = ?, error = ? WHERE id = ?", ev.at, to, subject, error, r.id);
        } else {
          // ďalší pokus neskôr (10, 20 min)
          run(
            "UPDATE mail_outbox SET claimed_by = NULL, claimed_at = NULL, due_at = ?, error = ?, to_addr = ?, subject = ? WHERE id = ?",
            plusMinutes(ev.at, 10 * m.attempts), error, to, subject, r.id
          );
        }
      }
      // história e-mailov 90 dní
      run("DELETE FROM mail_outbox WHERE status <> 'pending' AND done_at < ?", plusDays(ev.at, -90));
      return;
    }

    // ───────── Používatelia ─────────
    case "member.add": {
      if (!["owner", "member", "manager", "worker"].includes(ev.role)) reject("invalid");
      const legacy = ev.role === "manager" || ev.role === "worker";
      const role: Role = ev.role === "owner" ? "owner" : "member";
      if (isWebmaster) company(ev.companyId);
      else {
        can(ev.companyId, "company.team");
        if (role === "owner" && !isOwner(ev.companyId)) reject("forbidden"); // majiteľa pridá len majiteľ
      }
      const perms = role === "owner" ? [] : normalizePerms(ev.perms ?? (ev.role === "manager" ? PRESETS.manager : PRESETS.worker));
      checkGrant(ev.companyId, [], perms);
      const name = insertUser(ev.user, ev.companyId, role, perms, legacy);
      bumpPeak(ev.companyId);
      // človek, ktorého odobrali a znova pridali pod rovnakým menom, dostane späť svoje hodiny
      run(
        `UPDATE time_entries SET user_id = ? WHERE company_id = ? AND user_name = ?
           AND user_id NOT IN (SELECT user_id FROM company_members WHERE company_id = ?)`,
        ev.user.id, ev.companyId, name, ev.companyId
      );
      return;
    }
    case "member.remove": {
      const target = roleOf(ev.companyId, ev.userId) ?? reject("not_found");
      if (isPrimaryOwner(ev.companyId, ev.userId)) reject("primary_owner");
      manageTeam(ev.companyId, ev.userId);
      if (!isWebmaster && ev.userId === ev.actor) reject("forbidden");
      const owners = get<{ n: number }>("SELECT COUNT(*) AS n FROM company_members WHERE company_id = ? AND role = 'owner'", ev.companyId)!.n;
      if (target === "owner" && owners <= 1) reject("last_owner");
      run("DELETE FROM company_members WHERE company_id = ? AND user_id = ?", ev.companyId, ev.userId);
      run("DELETE FROM users WHERE id = ?", ev.userId); // jeden používateľ = jedna firma
      return;
    }
    case "member.setPermissions": {
      const target = access(ev.companyId, ev.userId) ?? reject("not_found");
      if (target.role === "owner") reject("invalid"); // majiteľ smie všetko
      manageTeam(ev.companyId, ev.userId);
      if (!isWebmaster && ev.userId === ev.actor) reject("forbidden"); // vlastné oprávnenia si nikto nemení
      const after = ev.perms ? normalizePerms(ev.perms) : legacyPerms(ev.permissions ?? {});
      checkGrant(ev.companyId, parsePerms(target.perms), after);
      run("UPDATE company_members SET perms = ? WHERE company_id = ? AND user_id = ?", permsText(after), ev.companyId, ev.userId);
      return;
    }
    case "member.setRole": {
      if (!["owner", "member", "manager", "worker"].includes(ev.role)) reject("invalid");
      const role: Role = ev.role === "owner" ? "owner" : "member";
      const target = access(ev.companyId, ev.userId) ?? reject("not_found");
      if (isPrimaryOwner(ev.companyId, ev.userId)) reject("primary_owner"); // supermajiteľa nikto neznižuje
      if (!isWebmaster && ev.userId === ev.actor) reject("forbidden"); // vlastnú rolu si nikto nemení
      if (role === "owner" || target.role === "owner") {
        // o majiteľoch rozhoduje len majiteľ alebo webmaster
        if (isWebmaster) company(ev.companyId);
        else if (member(ev.companyId, { readOnlyOk: true }) !== "owner") reject("forbidden");
      } else manageTeam(ev.companyId, ev.userId);
      const u = get<{ email: string | null; username: string | null }>("SELECT email, username FROM users WHERE id = ?", ev.userId)!;
      if (role === "owner") {
        if (target.role === "owner") return;
        // majiteľ sa prihlasuje e-mailom
        if (!u.email) {
          if (!ev.email) reject("email_needed");
          const email = validEmail(ev.email ?? "");
          if (get("SELECT 1 FROM users WHERE email = ?", email)) reject("email_taken");
          run("UPDATE users SET email = ? WHERE id = ?", email, ev.userId);
        }
        run("UPDATE company_members SET role = 'owner', perms = '' WHERE company_id = ? AND user_id = ?", ev.companyId, ev.userId);
        return;
      }
      // člen tímu: meno na prihlásenie kódom firmy + oprávnenia (staré roly = predvoľby)
      if (!u.username) run("UPDATE users SET username = ? WHERE id = ?", memberName(ev.companyId, ev.username, u.email), ev.userId);
      const before = target.role === "owner" ? [] : parsePerms(target.perms);
      const after = normalizePerms(ev.perms ?? (ev.role === "worker" ? PRESETS.worker : ev.role === "manager" || target.role === "owner" ? PRESETS.manager : before));
      if (target.role !== "owner") checkGrant(ev.companyId, before, after);
      run("UPDATE company_members SET role = 'member', perms = ? WHERE company_id = ? AND user_id = ?", permsText(after), ev.companyId, ev.userId);
      return;
    }
    case "company.setPrimaryOwner": {
      // supermajiteľa mení len webmaster; nový musí byť majiteľ (s e-mailom), starý ostane majiteľom
      webmasterOnly();
      company(ev.companyId);
      if (roleOf(ev.companyId, ev.userId) !== "owner") reject("invalid");
      run("UPDATE companies SET primary_owner_id = ? WHERE id = ?", ev.userId, ev.companyId);
      return;
    }
    case "user.setPassword": {
      if (!ev.password_hash) reject("invalid");
      if (!get("SELECT 1 FROM users WHERE id = ?", ev.userId)) reject("not_found");
      if (!isWebmaster && ev.actor !== ev.userId) {
        // nové heslo inému: majiteľ, alebo člen s oprávnením na tím (nie majiteľom)
        const m = get<{ company_id: string }>("SELECT company_id FROM company_members WHERE user_id = ?", ev.userId) ?? reject("forbidden");
        manageTeam(m.company_id, ev.userId);
      }
      run("UPDATE users SET password_hash = ? WHERE id = ?", ev.password_hash, ev.userId);
      return;
    }

    // ───────── Kredity ─────────
    case "credit.add": {
      // Pripisuje webmaster (prevod na účet, korekcia) alebo systém (platba kartou, vrátenie platby).
      if (!isWebmaster && !isSystem) reject("forbidden");
      company(ev.companyId);
      if (!cents(ev.amount_cents) || (ev.kind === "topup" && ev.amount_cents < 0) || !["topup", "adjust"].includes(ev.kind)) reject("invalid");
      if (ev.ref && get("SELECT 1 FROM credit_tx WHERE ref = ?", ev.ref)) reject("duplicate");
      if (ev.topupRequestId) {
        const done = run(
          "UPDATE topup_requests SET status = 'done', done_at = ? WHERE id = ? AND company_id = ? AND status = 'pending'",
          ev.at, ev.topupRequestId, ev.companyId
        ).changes;
        if (!done) reject("not_found");
      }
      credit(ev.companyId, ev.id, ev.amount_cents, ev.kind, text(ev.note, 500), ev.ref);
      if (ev.kind === "topup" && ev.amount_cents > 0) {
        const balance = company(ev.companyId).credit_cents;
        for (const o of ownersOf(ev.companyId)) {
          enqueue(`c:${o}`, "credited", o, ev.companyId, { amount: ev.amount_cents, balance, card: ev.note === "card" });
        }
      }
      return;
    }
    case "topup.request": {
      can(ev.companyId, "company.credits", { readOnlyOk: true });
      const amount = cents(ev.request.amount_cents);
      if (amount < 100 || amount > 10_000_000) reject("invalid");
      run(
        "INSERT INTO topup_requests (id, company_id, amount_cents, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
        ev.request.id, ev.companyId, amount, ev.actor, ev.at
      );
      return;
    }
    case "topup.cancel": {
      if (!isWebmaster) can(ev.companyId, "company.credits", { readOnlyOk: true });
      const changed = run(
        "UPDATE topup_requests SET status = 'cancelled', done_at = ? WHERE id = ? AND company_id = ? AND status = 'pending'",
        ev.at, ev.requestId, ev.companyId
      ).changes;
      if (!changed) reject("not_found");
      return;
    }
    case "billing.close": {
      // Mesačná uzávierka mesiaca M: úložisko za M-1 (vzorec R2) + prevádzka za M (vopred).
      // Posielajú ju servery samy; prvá vyhrá, ďalšie sa odmietnu ako duplicitné.
      if (!isSystem && !isWebmaster) reject("forbidden");
      const month = ev.month;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || ev.at.slice(0, 7) < month) reject("invalid");
      if (get("SELECT 1 FROM billing_runs WHERE month = ?", month)) reject("duplicate");
      const prev = prevMonth(month);
      applyDuePrices(ev.at); // naplánovaná zmena ceny, ak už platí
      const settings = siteSettings(db);
      const companies = all<{ id: string; created_at: string; suspended: number }>(
        "SELECT id, created_at, suspended OR blocked AS suspended FROM companies ORDER BY company_no"
      );
      for (const c of companies) {
        const created = c.created_at.slice(0, 7);
        let storageCharge = 0, fee = 0, gbm = 0;
        if (created <= prev) {
          gbm = gbMonths(storageByteDays(db, c.id, prev), prev);
          storageCharge = gbm * settings.storage_cents_per_gb;
          if (gbm > 0) credit(c.id, `${ev.id}:s:${c.id}`, -storageCharge, "storage", `${prev}:${gbm}`);
        }
        if (created < month && !c.suspended) {
          fee = companyFee(db, c.id, settings, month, prev).cents;
          if (fee) credit(c.id, `${ev.id}:f:${c.id}`, -fee, "fee", month);
        }
        if (!fee && !storageCharge) continue;
        // vyúčtovanie a upozornenie na kredit (na ďalší mesiac treba aspoň poplatok + úložisko ako teraz)
        const balance = company(c.id).credit_cents;
        const need = companyFee(db, c.id, settings, nextMonth(month)).cents + storageCharge;
        for (const o of ownersOf(c.id)) {
          enqueue(`b:${c.id}:${o}`, "billing", o, c.id, { month, prev, fee, storage: storageCharge, gbm, balance });
          if (balance < need) enqueue(`l:${c.id}:${o}`, "credit_low", o, c.id, { balance, need, negative: balance < 0 });
        }
      }
      run("INSERT INTO billing_runs (month, at) VALUES (?, ?)", month, ev.at);
      return;
    }

    // ───────── Dáta firmy ─────────
    case "company.update": {
      can(ev.companyId, "company.settings");
      const p = ev.patch;
      if (!p.name.trim()) reject("invalid");
      const before = company(ev.companyId);
      if (p.logo_path && p.logo_path !== before.logo_path && !p.logo_path.startsWith(`${ev.companyId}/`)) reject("forbidden");
      const logoSize = p.logo_path ? (p.logo_path === before.logo_path ? before.logo_size : cents(p.logo_size)) : 0;
      storage(ev.companyId, logoSize - before.logo_size);
      run(
        `UPDATE companies SET name = ?, ico = ?, dic = ?, ic_dph = ?, address = ?, city = ?, zip = ?, email = ?, phone = ?,
           iban = ?, is_vat_payer = ?, default_vat_rate = ?, invoice_prefix = ?, invoice_footer = ?, logo_path = ?, logo_size = ? WHERE id = ?`,
        p.name.trim(), p.ico, p.dic, p.ic_dph, p.address, p.city, p.zip, p.email, p.phone,
        p.iban, bool(p.is_vat_payer), Number(p.default_vat_rate), p.invoice_prefix, p.invoice_footer, p.logo_path, logoSize, ev.companyId
      );
      return;
    }
    case "customer.create": {
      can(ev.companyId, "customers.create");
      const c = ev.customer;
      if (!c.name.trim()) reject("invalid");
      run(
        `INSERT INTO customers (id, company_id, name, ico, dic, ic_dph, address, zip, city, email, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id, ev.companyId, c.name.trim(), c.ico, c.dic, c.ic_dph, c.address, c.zip, c.city, c.email, c.phone, ev.at
      );
      return;
    }
    case "job.create": {
      can(ev.companyId, "jobs.create");
      const j = ev.job;
      if (!j.title.trim()) reject("invalid");
      run(
        `INSERT INTO jobs (id, company_id, customer_id, title, description, address, job_date, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        j.id, ev.companyId, optionalOwned("customers", j.customer_id, ev.companyId), j.title.trim(),
        j.description, j.address, j.job_date, ev.actor, ev.at
      );
      return;
    }
    case "job.setStatus": {
      can(ev.companyId, "jobs.status");
      owned("jobs", ev.jobId, ev.companyId);
      // staršie udalosti mali stav "in_progress" (Rozpracovaná) -> dnes "waiting" (Čaká)
      const status = (ev.status as string) === "in_progress" ? "waiting" : ev.status;
      if (!JOB_STATUSES.includes(status)) reject("invalid");
      run("UPDATE jobs SET status = ? WHERE id = ?", status, ev.jobId);
      return;
    }
    case "job.update": {
      can(ev.companyId, "jobs.edit");
      owned("jobs", ev.jobId, ev.companyId);
      const j = ev.patch;
      const title = text(j.title, 200) ?? reject("invalid");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(j.job_date)) reject("invalid");
      run(
        "UPDATE jobs SET title = ?, description = ?, address = ?, customer_id = ?, job_date = ? WHERE id = ?",
        title, text(j.description, 4000), text(j.address, 300), optionalOwned("customers", j.customer_id, ev.companyId), j.job_date, ev.jobId
      );
      return;
    }
    case "job.delete": {
      // mazanie uvoľní miesto, preto ide aj bez kreditu
      can(ev.companyId, "jobs.delete", { readOnlyOk: true });
      owned("jobs", ev.jobId, ev.companyId);
      deleteJob(ev.companyId, ev.jobId);
      return;
    }
    case "customer.update": {
      can(ev.companyId, "customers.edit");
      owned("customers", ev.customerId, ev.companyId);
      const c = ev.patch;
      const name = text(c.name, 200) ?? reject("invalid");
      run(
        "UPDATE customers SET name = ?, ico = ?, dic = ?, ic_dph = ?, address = ?, zip = ?, city = ?, email = ?, phone = ? WHERE id = ?",
        name, text(c.ico, 20), text(c.dic, 20), text(c.ic_dph, 20), text(c.address, 300), text(c.zip, 20), text(c.city, 100),
        text(c.email, 200), text(c.phone, 50), ev.customerId
      );
      return;
    }
    case "customer.delete": {
      can(ev.companyId, "customers.delete", { readOnlyOk: true });
      owned("customers", ev.customerId, ev.companyId);
      if (ev.deleteJobs) {
        if (!has(ev.companyId, "jobs.delete")) reject("forbidden");
        for (const j of all<{ id: string }>("SELECT id FROM jobs WHERE customer_id = ? AND company_id = ?", ev.customerId, ev.companyId)) deleteJob(ev.companyId, j.id);
      }
      // faktúry si odberateľa pamätajú (buyer), zákazky ostanú bez zákazníka
      run("DELETE FROM customers WHERE id = ?", ev.customerId);
      return;
    }
    case "photo.add": {
      can(ev.companyId, "files.upload");
      const p = ev.photo;
      owned("jobs", p.job_id, ev.companyId);
      if (!p.storage_path.startsWith(`${ev.companyId}/`)) reject("forbidden");
      const size = cents(p.size_bytes);
      if (size < 0) reject("invalid");
      run(
        `INSERT INTO job_photos (id, company_id, job_id, storage_path, caption, taken_on, size_bytes, mime, file_name, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id, ev.companyId, p.job_id, p.storage_path, p.caption, p.taken_on, size, text(p.mime ?? null, 100), text(p.file_name ?? null, 255), ev.actor, ev.at
      );
      storage(ev.companyId, size);
      return;
    }
    case "photo.delete": {
      // mazať sa dá aj bez kreditu (uvoľní miesto); vlastný súbor vždy, cudzí s oprávnením
      member(ev.companyId, { readOnlyOk: true });
      owned("job_photos", ev.photoId, ev.companyId);
      const photo = get<{ size_bytes: number; uploaded_by: string | null }>("SELECT size_bytes, uploaded_by FROM job_photos WHERE id = ?", ev.photoId)!;
      if (photo.uploaded_by !== ev.actor && !has(ev.companyId, "files.delete")) reject("forbidden");
      const size = photo.size_bytes;
      run("DELETE FROM job_photos WHERE id = ?", ev.photoId);
      storage(ev.companyId, -size);
      return;
    }
    case "time.add": {
      const e = ev.entry;
      const userId = e.user_id || ev.actor!;
      can(ev.companyId, userId === ev.actor ? "time.own" : "time.others");
      owned("jobs", e.job_id, ev.companyId);
      if (!roleOf(ev.companyId, userId)) reject("not_found");
      const minutes = cents(e.minutes);
      if (minutes < 1 || minutes > 24 * 60 || !/^\d{4}-\d{2}-\d{2}$/.test(e.work_date)) reject("bad_hours");
      run(
        `INSERT INTO time_entries (id, company_id, job_id, job_title, user_id, user_name, work_date, minutes, note, material, created_by, created_by_name, created_at)
         VALUES (?, ?, ?, (SELECT title FROM jobs WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id, ev.companyId, e.job_id, e.job_id, userId, nameOf(ev.companyId, userId), e.work_date, minutes, text(e.note, 500), text(e.material ?? null, 2000),
        ev.actor, userId === ev.actor ? null : nameOf(ev.companyId, ev.actor!), ev.at
      );
      return;
    }
    case "time.delete": {
      // vlastný zápis s oprávnením na vlastné hodiny, cudzí s oprávnením na hodiny iných
      member(ev.companyId, { readOnlyOk: true });
      const entry = get<{ user_id: string }>("SELECT user_id FROM time_entries WHERE id = ? AND company_id = ?", ev.entryId, ev.companyId) ?? reject("not_found");
      if (!has(ev.companyId, entry.user_id === ev.actor ? "time.own" : "time.others")) reject("forbidden");
      // staré hodiny (podľa dátumu práce) môže zmazať už len majiteľ
      const workDate = get<{ d: string }>("SELECT work_date AS d FROM time_entries WHERE id = ?", ev.entryId)!.d;
      if (!isOwner(ev.companyId) && workDate < plusDays(ev.at, -TIME_LOCK_DAYS).slice(0, 10)) reject("time_locked");
      run("DELETE FROM time_entries WHERE id = ?", ev.entryId);
      return;
    }
    case "category.add": {
      can(ev.companyId, "prices.edit");
      const name = text(ev.category.name, 60) ?? reject("invalid");
      const pos = get<{ p: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM price_categories WHERE company_id = ?", ev.companyId)!.p;
      run("INSERT INTO price_categories (id, company_id, name, position) VALUES (?, ?, ?, ?)", ev.category.id, ev.companyId, name, pos);
      return;
    }
    case "category.rename": {
      can(ev.companyId, "prices.edit");
      const name = text(ev.name, 60) ?? reject("invalid");
      if (!run("UPDATE price_categories SET name = ? WHERE id = ? AND company_id = ?", name, ev.categoryId, ev.companyId).changes) reject("not_found");
      return;
    }
    case "category.delete": {
      // položky sa nezmažú, len ostanú bez kategórie
      can(ev.companyId, "prices.edit", { readOnlyOk: true });
      if (!get("SELECT 1 FROM price_categories WHERE id = ? AND company_id = ?", ev.categoryId, ev.companyId)) reject("not_found");
      run("UPDATE price_items SET category_id = NULL WHERE category_id = ? AND company_id = ?", ev.categoryId, ev.companyId);
      run("DELETE FROM price_categories WHERE id = ?", ev.categoryId);
      return;
    }

    // ───────── Podpora ─────────
    case "ticket.open": {
      // chat zakladá majiteľ alebo člen tímu s oprávnením na podporu – alebo webmaster pre vybraných ľudí
      if (!TICKET_PRIORITIES.includes(ev.ticket.priority)) reject("invalid");
      const subject = text(ev.ticket.subject, 200) ?? reject("invalid");
      const body = text(ev.message.body, 10_000) ?? reject("invalid");
      if (isWebmaster) {
        company(ev.companyId);
        const audience = ev.audience ?? "support";
        if (!["company", "support", "people"].includes(audience)) reject("invalid");
        const people = audience === "people"
          ? [...new Set(ev.recipients ?? [])].filter((u) => roleOf(ev.companyId, u))
          : [];
        if (audience === "people" && !people.length) reject("no_recipients");
        run(
          `INSERT INTO tickets (id, company_id, subject, priority, created_by, created_at, last_activity_at, opened_by_webmaster, audience)
           VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?)`,
          ev.ticket.id, ev.companyId, subject, ev.ticket.priority, ev.at, ev.at, audience
        );
        for (const u of people) run("INSERT INTO ticket_recipients (ticket_id, user_id) VALUES (?, ?)", ev.ticket.id, u);
        run(
          "INSERT INTO ticket_messages (id, ticket_id, from_webmaster, author_id, author_name, author_role, body, created_at) VALUES (?, ?, 1, NULL, 'Webmaster', NULL, ?, ?)",
          ev.message.id, ev.ticket.id, body, ev.at
        );
        run("INSERT OR REPLACE INTO ticket_reads (ticket_id, reader, read_at) VALUES (?, ?, ?)", ev.ticket.id, WEBMASTER, ev.at);
        // „Webmaster otvoril nový tiket“ majiteľom, ktorí ho dostali
        for (const o of ticketOwners(ev.ticket.id, ev.companyId, audience)) {
          enqueue(`so:${o}`, "support", o, ev.companyId, { ticket: ev.ticket.id, subject, preview: body.slice(0, 600), opened: true });
        }
        return;
      }
      can(ev.companyId, "support", { readOnlyOk: true, blockedOk: true });
      run(
        "INSERT INTO tickets (id, company_id, subject, priority, created_by, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ev.ticket.id, ev.companyId, subject, ev.ticket.priority, ev.actor, ev.at, ev.at
      );
      run(
        "INSERT INTO ticket_messages (id, ticket_id, from_webmaster, author_id, author_name, author_role, body, created_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
        ev.message.id, ev.ticket.id, ev.actor, nameOf(ev.companyId, ev.actor!), roleOf(ev.companyId) ?? null, body, ev.at
      );
      run("INSERT OR REPLACE INTO ticket_reads (ticket_id, reader, read_at) VALUES (?, ?, ?)", ev.ticket.id, ev.actor, ev.at);
      const cname = get<{ name: string }>("SELECT name FROM companies WHERE id = ?", ev.companyId)?.name ?? "";
      enqueue("wc", "wm_chat", WEBMASTER, ev.companyId, { ticket: ev.ticket.id, subject, company: cname, preview: body.slice(0, 600) });
      return;
    }
    case "ticket.message": {
      const t = ticketAccess(ev.ticketId);
      if (t.status === "closed") reject("ticket_closed");
      const body = text(ev.message.body, 10_000) ?? reject("invalid");
      run(
        "INSERT INTO ticket_messages (id, ticket_id, from_webmaster, author_id, author_name, author_role, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ev.message.id, ev.ticketId, bool(isWebmaster), isWebmaster ? null : ev.actor,
        isWebmaster ? "Webmaster" : nameOf(t.company_id, ev.actor!), isWebmaster ? null : roleOf(t.company_id) ?? null, body, ev.at
      );
      run("UPDATE tickets SET last_activity_at = ? WHERE id = ?", ev.at, ev.ticketId);
      run("INSERT OR REPLACE INTO ticket_reads (ticket_id, reader, read_at) VALUES (?, ?, ?)", ev.ticketId, isWebmaster ? WEBMASTER : ev.actor, ev.at);
      if (isWebmaster) supportMail(ev.ticketId, t.company_id, ev.message.id, body);
      return;
    }
    case "ticket.setStatus": {
      // zatvoriť/otvoriť môže majiteľ aj webmaster (chat od webmastra len webmaster); po zatvorení sa o 7 dní zmaže
      if (ticketAccess(ev.ticketId).opened_by_webmaster && !isWebmaster) reject("forbidden");
      if (ev.status === "closed") {
        run("UPDATE tickets SET status = 'closed', closed_at = ?, delete_after = ? WHERE id = ?", ev.at, plusDays(ev.at, TICKET_DELETE_DAYS), ev.ticketId);
      } else if (ev.status === "open") {
        run("UPDATE tickets SET status = 'open', closed_at = NULL, delete_after = NULL, last_activity_at = ? WHERE id = ?", ev.at, ev.ticketId);
      } else reject("invalid");
      return;
    }
    case "ticket.setPriority": {
      if (ticketAccess(ev.ticketId).opened_by_webmaster && !isWebmaster) reject("forbidden");
      if (!TICKET_PRIORITIES.includes(ev.priority)) reject("invalid");
      run("UPDATE tickets SET priority = ? WHERE id = ?", ev.priority, ev.ticketId);
      return;
    }
    case "ticket.read": {
      ticketAccess(ev.ticketId);
      run("INSERT OR REPLACE INTO ticket_reads (ticket_id, reader, read_at) VALUES (?, ?, ?)", ev.ticketId, isWebmaster ? WEBMASTER : ev.actor, ev.at);
      return;
    }
    case "ticket.delete": {
      // okamžite zmazať môže len webmaster
      webmasterOnly();
      if (!run("DELETE FROM tickets WHERE id = ?", ev.ticketId).changes) reject("not_found");
      return;
    }
    case "ticket.maintain": {
      // posielajú servery samy: zatvorí chaty bez správy 7 dní, zmaže zatvorené po 7 dňoch
      if (!isSystem) reject("forbidden");
      const idleBefore = plusDays(ev.at, -TICKET_IDLE_DAYS);
      const closing = all<{ id: string; company_id: string; created_by: string | null; subject: string; opened_by_webmaster: number; audience: string | null }>(
        "SELECT id, company_id, created_by, subject, opened_by_webmaster, audience FROM tickets WHERE status = 'open' AND last_activity_at <= ? ORDER BY id", idleBefore
      );
      for (const tk of closing) {
        const to = tk.opened_by_webmaster ? ticketOwners(tk.id, tk.company_id, tk.audience)
          : tk.created_by && roleOf(tk.company_id, tk.created_by) === "owner" ? [tk.created_by] : ownersOf(tk.company_id);
        for (const o of to) enqueue(`cc:${tk.id}:${o}`, "chat_closed", o, tk.company_id, { ticket: tk.id, subject: tk.subject });
      }
      run(
        "UPDATE tickets SET status = 'closed', closed_at = ?, delete_after = ? WHERE status = 'open' AND last_activity_at <= ?",
        ev.at, plusDays(ev.at, TICKET_DELETE_DAYS), idleBefore
      );
      run("DELETE FROM tickets WHERE status = 'closed' AND delete_after IS NOT NULL AND delete_after <= ?", ev.at);
      return;
    }

    case "price.add": {
      can(ev.companyId, "prices.edit");
      const i = ev.item;
      if (!i.name.trim()) reject("invalid");
      run(
        `INSERT INTO price_items (id, company_id, name, unit, unit_price, vat_rate, is_labor, category_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        i.id, ev.companyId, i.name.trim(), i.unit || "ks", Number(i.unit_price), i.vat_rate, bool(i.is_labor), categoryOf(ev.companyId, i.category_id), ev.at
      );
      return;
    }
    case "price.update": {
      can(ev.companyId, "prices.edit");
      owned("price_items", ev.itemId, ev.companyId);
      const p = ev.patch;
      run(
        "UPDATE price_items SET name = ?, unit = ?, unit_price = ?, vat_rate = ?, category_id = COALESCE(?, category_id) WHERE id = ?",
        p.name.trim(), p.unit || "ks", Number(p.unit_price), p.vat_rate, p.category_id === undefined ? null : categoryOf(ev.companyId, p.category_id) ?? "", ev.itemId
      );
      // prázdny reťazec = „bez kategórie“
      run("UPDATE price_items SET category_id = NULL WHERE id = ? AND category_id = ''", ev.itemId);
      return;
    }
    case "price.delete": {
      can(ev.companyId, "prices.edit", { readOnlyOk: true });
      owned("price_items", ev.itemId, ev.companyId);
      run("DELETE FROM price_items WHERE id = ?", ev.itemId);
      return;
    }
    case "invoice.create": {
      can(ev.companyId, "invoices.create");
      insertInvoice(ev.companyId, ev.invoice, ev.items);
      return;
    }
    case "invoice.update": {
      // upraviť sa dá len koncept; číslo ostane
      can(ev.companyId, "invoices.edit");
      const cur = get<{ status: string }>("SELECT status FROM invoices WHERE id = ? AND company_id = ?", ev.invoiceId, ev.companyId) ?? reject("not_found");
      if (cur.status !== "draft") reject("not_editable");
      const inv = ev.invoice;
      const { items, sum } = invoiceLines(ev.companyId, ev.items);
      const customerId = optionalOwned("customers", inv.customer_id, ev.companyId);
      const jobId = optionalOwned("jobs", inv.job_id, ev.companyId);
      const snap = snapshot(ev.companyId, customerId, jobId);
      run(
        `UPDATE invoices SET customer_id = ?, job_id = ?, issue_date = ?, delivery_date = ?, due_date = ?, note = ?,
           total_net = ?, total_vat = ?, total_gross = ?, buyer = ?, job_title = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
        customerId, jobId, inv.issue_date, inv.delivery_date, inv.due_date, inv.note, sum.net, sum.vat, sum.gross,
        snap.buyer, snap.jobTitle, ev.at, ev.actor, ev.invoiceId
      );
      writeItems(ev.companyId, ev.invoiceId, items);
      return;
    }
    case "invoice.correct": {
      // vystavenú faktúru nemeníme: stornuje sa a jej kópia vznikne ako nový koncept s novým číslom
      can(ev.companyId, "invoices.edit");
      can(ev.companyId, "invoices.create");
      const orig = get<InvoiceRowIn & { status: string; buyer: string | null; job_title: string | null }>(
        "SELECT id, customer_id, job_id, issue_date, delivery_date, due_date, note, status, buyer, job_title FROM invoices WHERE id = ? AND company_id = ?",
        ev.invoiceId, ev.companyId
      ) ?? reject("not_found");
      if (orig.status !== "sent" && orig.status !== "paid") reject("not_editable");
      const lines = all<InvoiceLine>(
        "SELECT name, unit, quantity, unit_price, vat_rate FROM invoice_items WHERE invoice_id = ? ORDER BY position", ev.invoiceId
      );
      run("UPDATE invoices SET status = 'cancelled', corrected_by = ? WHERE id = ?", ev.newId, ev.invoiceId);
      insertInvoice(ev.companyId, { ...orig, id: ev.newId }, lines);
      // zákazník/zákazka mohli byť medzitým zmazaní – odberateľ ostane z pôvodnej faktúry
      run("UPDATE invoices SET buyer = COALESCE(buyer, ?), job_title = COALESCE(job_title, ?) WHERE id = ?", orig.buyer, orig.job_title, ev.newId);
      return;
    }
    case "invoice.delete": {
      // zmazať sa dá len koncept a stornovaná faktúra (vystavené sa archivujú)
      can(ev.companyId, "invoices.delete", { readOnlyOk: true });
      const inv = get<{ number: string; status: string; created_at: string }>(
        "SELECT number, status, created_at FROM invoices WHERE id = ? AND company_id = ?", ev.invoiceId, ev.companyId
      ) ?? reject("not_found");
      if (inv.status !== "draft" && inv.status !== "cancelled") reject("not_deletable");
      if (inv.status === "draft") {
        // posledný koncept: vrátime počítadlo, aby v číslovaní nevznikla diera
        const c = get<{ invoice_prefix: string; next_invoice_number: number }>(
          "SELECT invoice_prefix, next_invoice_number FROM companies WHERE id = ?", ev.companyId
        )!;
        const last = `${c.invoice_prefix}${inv.created_at.slice(0, 4)}${String(c.next_invoice_number - 1).padStart(4, "0")}`;
        if (inv.number === last) run("UPDATE companies SET next_invoice_number = next_invoice_number - 1 WHERE id = ?", ev.companyId);
      }
      run("DELETE FROM invoices WHERE id = ?", ev.invoiceId); // položky sa zmažú s ňou
      return;
    }
    case "invoice.downloaded": {
      can(ev.companyId, "invoices.view", { readOnlyOk: true });
      owned("invoices", ev.invoiceId, ev.companyId);
      run("UPDATE invoices SET downloaded_at = COALESCE(downloaded_at, ?) WHERE id = ?", ev.at, ev.invoiceId);
      return;
    }
    case "invoice.restore": {
      can(ev.companyId, "invoices.view", { readOnlyOk: true });
      owned("invoices", ev.invoiceId, ev.companyId);
      run("UPDATE invoices SET delete_after = NULL WHERE id = ?", ev.invoiceId);
      return;
    }
    case "invoice.purgeDue": {
      // posielajú servery samy; zmaže faktúry, ktorým uplynulo 16 dní (podľa času udalosti, všade rovnako)
      if (!isSystem) reject("forbidden");
      run("DELETE FROM invoices WHERE delete_after IS NOT NULL AND delete_after <= ?", ev.at);
      return;
    }
    case "invoice.setStatus": {
      can(ev.companyId, "invoices.status");
      owned("invoices", ev.invoiceId, ev.companyId);
      if (!INVOICE_STATUSES.includes(ev.status)) reject("invalid");
      run("UPDATE invoices SET status = ? WHERE id = ?", ev.status, ev.invoiceId);
      return;
    }
    default:
      reject("invalid");
  }
}
