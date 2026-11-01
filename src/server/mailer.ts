import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { MAIL_LANGS, type MailLang } from "@/lib/mail-kinds";
import { getDb } from "./db";
import { MAIL_CLAIM_MINUTES, type MailResult, SYSTEM, WEBMASTER } from "./events";
import { config } from "./config";
import { renderMail } from "./mail-text";
import { openSecret } from "./secret";
import { submit, syncStatus } from "./sync";

// Odosielanie e-mailov. Front (mail_outbox) majú všetky servery rovnaký; každý e-mail odošle len
// server, ktorý si ho cez hub zarezervoval (mail.claim). Posielame len obyčajný text – žiadne
// sledovacie pixely ani prepisované odkazy.

export type MailSettings = {
  mail_enabled: number; smtp_host: string | null; smtp_port: number | null; smtp_secure: number;
  smtp_user: string | null; smtp_pass: string | null; mail_from: string | null; mail_from_name: string | null;
  wm_notify_email: string | null; wm_mail_off: string;
};
export const mailSettings = () =>
  getDb().prepare(
    `SELECT mail_enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, mail_from, mail_from_name,
       wm_notify_email, wm_mail_off FROM site_settings WHERE id = 1`
  ).get() as MailSettings;

export { openSecret, sealSecret } from "./secret";

type OutboxRow = { id: string; kind: string; recipient: string; company_id: string | null; data: string };
const appUrl = () => (config("app_url") ?? "").replace(/\/$/, "");

/** Komu a v akom jazyku; null = nie je komu poslať. */
function addressOf(m: OutboxRow, s: MailSettings): { to: string; lang: MailLang } | null {
  if (m.kind === "test") return { to: m.recipient, lang: "sk" };
  if (m.recipient === WEBMASTER) {
    const to = s.wm_notify_email || config("webmaster_email");
    return to ? { to, lang: "sk" } : null;
  }
  const u = getDb().prepare("SELECT email, mail_lang FROM users WHERE id = ?").get(m.recipient) as { email: string | null; mail_lang: string } | undefined;
  if (!u?.email) return null;
  return { to: u.email, lang: (MAIL_LANGS as readonly string[]).includes(u.mail_lang) ? (u.mail_lang as MailLang) : "sk" };
}

let running: Promise<number> | null = null;

/** Odošle e-maily, ktorých čas prišiel. Vracia počet spracovaných. */
export function processOutbox(): Promise<number> {
  running ??= run().finally(() => (running = null));
  return running;
}

async function run(): Promise<number> {
  if (!syncStatus().ready) return 0;
  const db = getDb();
  const s = mailSettings();
  if (!s.smtp_host) return 0;
  const now = new Date();
  const stale = new Date(now.getTime() - MAIL_CLAIM_MINUTES * 60_000).toISOString();
  const due = db.prepare(
    `SELECT id FROM mail_outbox WHERE status = 'pending' AND due_at <= ? AND (claimed_at IS NULL OR claimed_at <= ?)
       AND (kind = 'test' OR ? = 1) ORDER BY due_at LIMIT 20`
  ).all(now.toISOString(), stale, s.mail_enabled) as { id: string }[];
  if (!due.length) return 0;

  const token = randomUUID();
  try {
    await submit({ type: "mail.claim", ids: due.map((d) => d.id), token }, SYSTEM);
  } catch (e) {
    console.error("[mail] could not reserve e-mails:", e);
    return 0;
  }
  const mine = db.prepare("SELECT id, kind, recipient, company_id, data FROM mail_outbox WHERE claimed_by = ? AND status = 'pending'")
    .all(token) as OutboxRow[];
  if (!mine.length) return 0;

  const transport = nodemailer.createTransport({
    host: s.smtp_host,
    port: s.smtp_port ?? (s.smtp_secure ? 465 : 587),
    secure: !!s.smtp_secure,
    auth: s.smtp_user ? { user: s.smtp_user, pass: openSecret(s.smtp_pass) ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const from = { name: s.mail_from_name || "Robotka", address: s.mail_from || config("webmaster_email") || "" };
  const results: MailResult[] = [];
  for (const m of mine) {
    const addr = addressOf(m, s);
    const company = m.company_id
      ? ((db.prepare("SELECT name FROM companies WHERE id = ?").get(m.company_id) as { name: string } | undefined)?.name ?? "")
      : "";
    const mail = addr && renderMail(m.kind, JSON.parse(m.data || "{}"), addr.lang, company, appUrl());
    if (!addr || !mail) {
      results.push({ id: m.id, ok: false, skip: true, error: addr ? "unknown kind" : "no address" });
      continue;
    }
    try {
      await transport.sendMail({
        from, to: addr.to, subject: mail.subject, text: mail.text,
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
      });
      results.push({ id: m.id, ok: true, to: addr.to, subject: mail.subject });
    } catch (e) {
      results.push({ id: m.id, ok: false, to: addr.to, subject: mail.subject, error: (e as Error).message || String(e) });
    }
  }
  transport.close();
  try {
    await submit({ type: "mail.done", results }, SYSTEM);
  } catch (e) {
    console.error("[mail] could not record sent e-mails:", e);
  }
  return results.length;
}

/** Spustí odosielanie každých ~30 s (s náhodným posunom, aby sa servery nestretávali). */
export function startMailer() {
  const tick = () => {
    void processOutbox().catch((e) => console.error("[mail] outbox failed:", e));
    setTimeout(tick, 20_000 + Math.random() * 20_000);
  };
  setTimeout(tick, 10_000 + Math.random() * 10_000);
}
