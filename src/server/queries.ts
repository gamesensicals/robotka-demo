import { all, one } from "./db";
import { type Perm, PERMS, parsePerms } from "@/lib/perms";
import type { InvoiceStatus, JobStatus, Role } from "./events";

// Čítanie z lokálnej databázy. Každá funkcia berie companyId a filtruje podľa neho –
// to nahrádza RLS zo Supabase, takže firma nikdy neuvidí cudzie dáta.

export type Company = {
  id: string; name: string; ico: string | null; dic: string | null; ic_dph: string | null;
  address: string | null; city: string | null; zip: string | null; email: string | null; phone: string | null;
  iban: string | null; logo_path: string | null; is_vat_payer: boolean; default_vat_rate: number;
  invoice_prefix: string; invoice_footer: string | null;
  company_no: number; vs: string; login_code: string; primary_owner_id: string | null; credit_cents: number; storage_bytes: number; logo_size: number; suspended: boolean; blocked: boolean; created_at: string;
};
export type Customer = {
  id: string; name: string; ico: string | null; dic: string | null; ic_dph: string | null;
  address: string | null; zip: string | null; city: string | null; email: string | null; phone: string | null; created_at: string;
};
export type JobRow = {
  id: string; title: string; job_date: string; status: JobStatus; address: string | null;
  description: string | null; customer_id: string | null; customer_name: string | null;
};
export type Photo = {
  id: string; storage_path: string; caption: string | null; taken_on: string; mime: string | null; file_name: string | null; size_bytes: number;
  uploaded_by: string | null;
};
export type InvoiceRow = {
  id: string; number: string; issue_date: string; due_date: string; status: InvoiceStatus; total_gross: number; customer_name: string | null;
  downloaded_at: string | null; delete_after: string | null;
};
export type Invoice = InvoiceRow & {
  job_id: string | null;
  /** odberateľ a zákazka v čase vystavenia (faktúra prežije ich zmazanie) */
  buyer: string | null; job_title: string | null;
  updated_at: string | null; updated_by: string | null; corrected_by: string | null;
  variable_symbol: string; delivery_date: string; due_date: string; note: string | null; total_net: number; total_vat: number;
};
export type InvoiceItem = { id: string; name: string; unit: string; quantity: number; unit_price: number; vat_rate: number };
export type PriceItem = { id: string; name: string; unit: string; unit_price: number; vat_rate: number | null; is_labor: number; category_id: string | null };
export type PriceCategory = { id: string; name: string; position: number; items: number };

// ───────── Používatelia a firma ─────────
type CompanyRow = Omit<Company, "is_vat_payer" | "suspended" | "blocked"> & { is_vat_payer: number; suspended: number; blocked: number };
const toCompany = (c: CompanyRow): Company => ({ ...c, is_vat_payer: Boolean(c.is_vat_payer), suspended: Boolean(c.suspended), blocked: Boolean(c.blocked) });

export type User = { id: string; email: string | null; username: string | null };
/** Čo sa zobrazí ako „Prihlásený ako“: e-mail majiteľa alebo meno člena tímu. */
export const loginName = (u: Pick<User, "email" | "username"> & { role?: Role | null }) =>
  (u.role === "member" ? u.username ?? u.email : u.email ?? u.username) ?? "";
export const userById = (id: string) => one<User>("SELECT id, email, username FROM users WHERE id = ?", id);
export const userByEmail = (email: string) =>
  one<User & { password_hash: string }>("SELECT id, email, username, password_hash FROM users WHERE email = ?", email.trim().toLowerCase());
export const passwordHashOf = (userId: string) =>
  one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", userId)?.password_hash;
export const userByUsername = (companyId: string, username: string) =>
  one<User & { password_hash: string; role: Role }>(
    `SELECT u.id, u.email, u.username, u.password_hash, m.role FROM users u JOIN company_members m ON m.user_id = u.id
     WHERE m.company_id = ? AND u.username = ?`,
    companyId, username
  );
/** Firma podľa kódu pre prihlásenie zamestnancov (veľkosť písmen, diakritika a pomlčky nehrajú rolu). */
export const companyByCode = (key: string) =>
  key ? one<{ id: string; name: string; logo_path: string | null; login_code: string; blocked: number }>(
    "SELECT id, name, logo_path, login_code, blocked FROM companies WHERE REPLACE(login_code, '-', '') = ?", key
  ) : undefined;

/** Čo smie používateľ: majiteľ všetko, člen tímu len to, čo má v oprávneniach. */
export const permsOf = (role: Role, perms: string): Perm[] => (role === "owner" ? [...PERMS] : parsePerms(perms));

export function membershipOf(userId: string): { role: Role; company: Company; perms: Perm[] } | undefined {
  const row = one<CompanyRow & { role: Role; member_perms: string }>(
    `SELECT c.*, m.role, m.perms AS member_perms FROM company_members m JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = ? ORDER BY m.created_at LIMIT 1`,
    userId
  );
  if (!row) return undefined;
  const { role, member_perms, ...company } = row;
  return { role, company: toCompany(company), perms: permsOf(role, member_perms) };
}

export const getCompany = (id: string) => {
  const row = one<CompanyRow>("SELECT * FROM companies WHERE id = ?", id);
  return row ? toCompany(row) : undefined;
};
/** Firma je len na čítanie: pozastavená alebo bez kreditu. */
export const isReadOnly = (c: Pick<Company, "credit_cents" | "suspended">) => c.suspended || c.credit_cents < 0;

// ───────── Zákazníci ─────────
export const listCustomers = (cid: string) => all<Customer>("SELECT * FROM customers WHERE company_id = ? ORDER BY name", cid);
export const customerOptions = (cid: string) =>
  all<{ id: string; name: string; city: string | null; ico: string | null }>("SELECT id, name, city, ico FROM customers WHERE company_id = ? ORDER BY name", cid);
/** Nápoveda pri zákazníkovi vo výbere (mesto, IČO). */
export const customerHint = (c: { city: string | null; ico: string | null }) => [c.city, c.ico].filter(Boolean).join(" · ") || undefined;
export const latestCustomer = (cid: string) =>
  one<{ name: string; created_at: string }>("SELECT name, created_at FROM customers WHERE company_id = ? ORDER BY created_at DESC LIMIT 1", cid);
export const getCustomer = (cid: string, id: string) => one<Customer>("SELECT * FROM customers WHERE company_id = ? AND id = ?", cid, id);

// ───────── Zákazky a fotky ─────────
const JOB_SELECT = `SELECT j.id, j.title, j.job_date, j.status, j.address, j.description, j.customer_id, c.name AS customer_name
  FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id`;
export const listJobs = (cid: string) => all<JobRow>(`${JOB_SELECT} WHERE j.company_id = ? ORDER BY j.job_date DESC, j.created_at DESC`, cid);
export const getJob = (cid: string, id: string) => one<JobRow>(`${JOB_SELECT} WHERE j.company_id = ? AND j.id = ?`, cid, id);
export const latestJob = (cid: string) => one<JobRow>(`${JOB_SELECT} WHERE j.company_id = ? ORDER BY j.job_date DESC, j.created_at DESC LIMIT 1`, cid);
export const jobOptions = (cid: string) =>
  all<{ id: string; title: string; job_date: string; customer_name: string | null }>(
    `SELECT j.id, j.title, j.job_date, c.name AS customer_name FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id
      WHERE j.company_id = ? ORDER BY j.job_date DESC LIMIT 500`, cid
  );
export const jobStatusCounts = (cid: string) =>
  all<{ status: JobStatus; n: number }>("SELECT status, COUNT(*) AS n FROM jobs WHERE company_id = ? GROUP BY status", cid);
export const listPhotos = (cid: string, jobId: string) =>
  all<Photo>(
    "SELECT id, storage_path, caption, taken_on, mime, file_name, size_bytes, uploaded_by FROM job_photos WHERE company_id = ? AND job_id = ? ORDER BY taken_on, created_at",
    cid, jobId
  );
export const getPhoto = (cid: string, id: string) =>
  one<Photo & { job_id: string }>(
    "SELECT id, job_id, storage_path, caption, taken_on, mime, file_name, size_bytes, uploaded_by FROM job_photos WHERE company_id = ? AND id = ?", cid, id
  );

// ───────── Faktúry ─────────
const INVOICE_SELECT = `SELECT i.*, COALESCE(c.name, json_extract(i.buyer, '$.name')) AS customer_name FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id`;
/** Odberateľ faktúry: uložený pri vystavení, inak aktuálny zákazník. */
export const invoiceBuyer = (cid: string, inv: { buyer: string | null; customer_id: string | null }): Customer | undefined => {
  if (inv.buyer) return { id: inv.customer_id ?? "", created_at: "", ...(JSON.parse(inv.buyer) as Omit<Customer, "id" | "created_at">) };
  return inv.customer_id ? getCustomer(cid, inv.customer_id) : undefined;
};
export const listInvoices = (cid: string, limit = -1) =>
  all<InvoiceRow>(`${INVOICE_SELECT} WHERE i.company_id = ? ORDER BY i.issue_date DESC, i.number DESC LIMIT ?`, cid, limit);
export const getInvoice = (cid: string, id: string) =>
  one<Invoice & { customer_id: string | null }>(`${INVOICE_SELECT} WHERE i.company_id = ? AND i.id = ?`, cid, id);
export const invoiceItems = (cid: string, invoiceId: string) =>
  all<InvoiceItem>("SELECT * FROM invoice_items WHERE company_id = ? AND invoice_id = ? ORDER BY position", cid, invoiceId);
export const invoiceTotals = (cid: string) =>
  all<{ status: InvoiceStatus; total_gross: number; issue_date: string }>(
    "SELECT status, total_gross, issue_date FROM invoices WHERE company_id = ?", cid
  );

// ───────── Cenník ─────────
export const listPrices = (cid: string) => all<PriceItem>("SELECT * FROM price_items WHERE company_id = ? ORDER BY name", cid);
export const listCategories = (cid: string) =>
  all<PriceCategory>(
    `SELECT c.id, c.name, c.position, (SELECT COUNT(*) FROM price_items p WHERE p.category_id = c.id) AS items
     FROM price_categories c WHERE c.company_id = ? ORDER BY c.position, c.name`,
    cid
  );
export const activePrices = (cid: string) =>
  all<PriceItem>("SELECT * FROM price_items WHERE company_id = ? AND active = 1 ORDER BY name", cid);

// ───────── Zamestnanci ─────────
export type Member = { id: string; email: string | null; username: string | null; role: Role; created_at: string; perms: Perm[] };
export const listMembers = (cid: string) =>
  all<Omit<Member, "perms"> & { perms: string }>(
    `SELECT u.id, u.email, u.username, m.role, m.created_at, m.perms FROM company_members m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, COALESCE(u.username, u.email)`,
    cid
  ).map((m) => ({ ...m, perms: permsOf(m.role, m.perms) }));
export const memberCompany = (userId: string) =>
  one<{ company_id: string }>("SELECT company_id FROM company_members WHERE user_id = ?", userId)?.company_id;

// ───────── Kredity ─────────
export type CreditTx = { id: string; at: string; amount_cents: number; kind: "topup" | "adjust" | "fee" | "storage"; note: string | null };
export const creditHistory = (cid: string, limit = 100) =>
  all<CreditTx>("SELECT id, at, amount_cents, kind, note FROM credit_tx WHERE company_id = ? ORDER BY at DESC, id DESC LIMIT ?", cid, limit);
export type TopupRequest = { id: string; company_id: string; amount_cents: number; status: string; created_at: string; company_name?: string; vs?: string };
export const pendingTopups = (cid: string) =>
  all<TopupRequest>("SELECT * FROM topup_requests WHERE company_id = ? AND status = 'pending' ORDER BY created_at", cid);
export const allPendingTopups = () =>
  all<TopupRequest>(
    `SELECT t.*, c.name AS company_name, c.vs FROM topup_requests t JOIN companies c ON c.id = t.company_id
     WHERE t.status = 'pending' ORDER BY t.created_at`
  );

// ───────── Webmaster ─────────
export type CompanyOverview = {
  id: string; name: string; company_no: number; vs: string; ico: string | null; credit_cents: number; storage_bytes: number; suspended: number; blocked: number;
  created_at: string; owner_email: string | null; owner_emails: string | null; members: number; pending_topups: number;
};
export const companiesOverview = () =>
  all<CompanyOverview>(
    `SELECT c.id, c.name, c.company_no, c.vs, c.ico, c.credit_cents, c.storage_bytes, c.suspended, c.blocked, c.created_at,
       (SELECT u.email FROM company_members m JOIN users u ON u.id = m.user_id
         WHERE m.company_id = c.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email,
       (SELECT GROUP_CONCAT(u.email, ' ') FROM company_members m JOIN users u ON u.id = m.user_id
         WHERE m.company_id = c.id AND m.role = 'owner') AS owner_emails,
       (SELECT COUNT(*) FROM company_members m WHERE m.company_id = c.id) AS members,
       (SELECT COUNT(*) FROM topup_requests t WHERE t.company_id = c.id AND t.status = 'pending') AS pending_topups
     FROM companies c ORDER BY c.company_no`
  );
export type AccountRequestRow = {
  id: string; company_name: string; contact_name: string; email: string; phone: string | null; ico: string | null;
  message: string | null; status: "new" | "done" | "rejected"; created_at: string;
  logo_path: string | null; company_id: string | null;
};
export const accountRequests = () =>
  all<AccountRequestRow>("SELECT * FROM account_requests ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC");
export const getAccountRequest = (id: string) => one<AccountRequestRow>("SELECT * FROM account_requests WHERE id = ?", id);
/** Žiadosti na zmazanie (vybavené po 7 dňoch, zamietnuté po 30) a ich logá, ktoré nepoužíva žiadna firma. */
export function dueRequestDeletes(nowIso: string, doneDays: number, rejectedDays: number) {
  const ago = (d: number) => new Date(Date.parse(nowIso) - d * 86_400_000).toISOString();
  return all<{ id: string; logo_path: string | null; logo_used: number }>(
    `SELECT r.id, r.logo_path, EXISTS(SELECT 1 FROM companies c WHERE c.logo_path = r.logo_path) AS logo_used
       FROM account_requests r
      WHERE (r.status = 'done' AND r.status_at <= ?) OR (r.status = 'rejected' AND r.status_at <= ?)`,
    ago(doneDays), ago(rejectedDays)
  );
}
export const lastBillingMonth = () => one<{ m: string | null }>("SELECT MAX(month) AS m FROM billing_runs")?.m ?? null;
export const firstCompanyMonth = () =>
  one<{ c: string | null }>("SELECT MIN(created_at) AS c FROM companies")?.c?.slice(0, 7) ?? null;

// ───────── Dochádzka ─────────
export type TimeEntry = {
  id: string; job_id: string | null; job_title: string; user_id: string; user_name: string; work_date: string; minutes: number;
  note: string | null; material: string | null; created_by_name: string | null;
};
// zákazka mohla byť zmazaná – hodiny ostanú s jej pôvodným názvom
const TIME_SELECT = `SELECT t.id, t.job_id, COALESCE(j.title, t.job_title, '–') AS job_title, t.user_id, t.user_name, t.work_date, t.minutes, t.note, t.material, t.created_by_name
  FROM time_entries t LEFT JOIN jobs j ON j.id = t.job_id`;
export const jobTime = (cid: string, jobId: string) =>
  all<TimeEntry>(`${TIME_SELECT} WHERE t.company_id = ? AND t.job_id = ? ORDER BY t.work_date DESC, t.created_at DESC`, cid, jobId);
/** Zápisy za mesiac ("2026-11"), voliteľne len jedného človeka. */
export const monthTime = (cid: string, month: string, userId?: string) =>
  all<TimeEntry>(
    `${TIME_SELECT} WHERE t.company_id = ? AND t.work_date >= ? AND t.work_date <= ?${userId ? " AND t.user_id = ?" : ""}
     ORDER BY t.work_date DESC, t.user_name, t.created_at DESC`,
    ...([cid, `${month}-01`, `${month}-31`, ...(userId ? [userId] : [])] as string[])
  );
export const labourPrice = (cid: string) =>
  one<PriceItem>("SELECT * FROM price_items WHERE company_id = ? AND is_labor = 1 AND active = 1 ORDER BY name LIMIT 1", cid);
export const dueInvoiceDeletes = () =>
  one<{ n: number }>("SELECT COUNT(*) AS n FROM invoices WHERE delete_after IS NOT NULL AND delete_after <= ?", new Date().toISOString())?.n ?? 0;

// ───────── Podpora ─────────
export type TicketRow = {
  opened_by_webmaster: number; audience: "company" | "support" | "people" | null;
  id: string; company_id: string; company_name: string; subject: string; priority: "urgent" | "high" | "normal" | "low";
  status: "open" | "closed"; created_at: string; last_activity_at: string; delete_after: string | null;
  messages: number; last_from_webmaster: number; unread: number;
};
/** Chaty s počtom neprečítaných správ pre daného čitateľa ('webmaster' alebo id majiteľa). */
const TICKET_SELECT = (reader: string) => `SELECT t.*, c.name AS company_name,
    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS messages,
    (SELECT m.from_webmaster FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_from_webmaster,
    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id
       AND m.created_at > COALESCE((SELECT r.read_at FROM ticket_reads r WHERE r.ticket_id = t.id AND r.reader = '${reader.replace(/'/g, "")}'), '')
       AND ${reader === "webmaster" ? "m.from_webmaster = 0" : "m.from_webmaster = 1"}) AS unread
  FROM tickets t JOIN companies c ON c.id = t.company_id`;
const PRIORITY_ORDER = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";
/**
 * Ktoré chaty firmy človek vidí: s oprávnením na podporu (majiteľ ho má vždy) chaty firmy a chaty od webmastra
 * pre podporu; chat od webmastra pre celú firmu každý; chat pre vybraných ľudí len oni.
 */
const VISIBLE = `(((t.opened_by_webmaster = 0 OR t.audience = 'support') AND ? = 1)
  OR (t.opened_by_webmaster = 1 AND t.audience = 'company')
  OR (t.opened_by_webmaster = 1 AND t.audience = 'people' AND EXISTS (SELECT 1 FROM ticket_recipients r WHERE r.ticket_id = t.id AND r.user_id = ?)))`;
export const companyTickets = (cid: string, reader: string, support = true) =>
  all<TicketRow>(
    `${TICKET_SELECT(reader)} WHERE t.company_id = ? AND ${VISIBLE} ORDER BY t.status = 'closed', t.last_activity_at DESC`,
    cid, support ? 1 : 0, reader
  );
/** Chat, ak ho človek smie vidieť. */
export const visibleTicket = (id: string, cid: string, reader: string, support: boolean) =>
  one<TicketRow>(`${TICKET_SELECT(reader)} WHERE t.id = ? AND t.company_id = ? AND ${VISIBLE}`, id, cid, support ? 1 : 0, reader);
/** Má človek bez oprávnenia na podporu nejaký chat od webmastra? (potom vidí Podporu) */
export const hasWebmasterTickets = (cid: string, userId: string) =>
  !!one(
    `SELECT 1 AS x FROM tickets t WHERE t.company_id = ? AND t.opened_by_webmaster = 1
       AND (t.audience = 'company' OR (t.audience = 'people' AND EXISTS (SELECT 1 FROM ticket_recipients r WHERE r.ticket_id = t.id AND r.user_id = ?)))
     LIMIT 1`,
    cid, userId
  );
/** Adresáti chatu od webmastra (pre zobrazenie). */
export const ticketRecipients = (ticketId: string) =>
  all<{ user_id: string }>("SELECT user_id FROM ticket_recipients WHERE ticket_id = ?", ticketId).map((r) => r.user_id);
export const allTickets = () =>
  all<TicketRow>(`${TICKET_SELECT("webmaster")} ORDER BY t.status = 'closed', ${PRIORITY_ORDER}, t.last_activity_at DESC`);
export const getTicket = (id: string, reader: string) => one<TicketRow>(`${TICKET_SELECT(reader)} WHERE t.id = ?`, id);
export type TicketMessage = { id: string; from_webmaster: number; author_name: string; author_role: Role | null; body: string; created_at: string };
export const ticketMessages = (id: string) =>
  all<TicketMessage>("SELECT id, from_webmaster, author_name, author_role, body, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at", id);
export const unreadTickets = (reader: string, cid?: string, support = true) =>
  (cid ? companyTickets(cid, reader, support) : allTickets()).reduce((n, t) => n + (t.unread > 0 ? 1 : 0), 0);
/** Treba poslať údržbu chatov? (niečo na zatvorenie alebo zmazanie) */
export function ticketsNeedMaintenance(nowIso: string, idleDays: number) {
  const idle = new Date(nowIso);
  idle.setUTCDate(idle.getUTCDate() - idleDays);
  return (
    (one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tickets WHERE (status = 'open' AND last_activity_at <= ?)
         OR (status = 'closed' AND delete_after IS NOT NULL AND delete_after <= ?)`,
      idle.toISOString(), nowIso
    )?.n ?? 0) > 0
  );
}

// ───────── Ceny a e-maily ─────────
export type PriceChange = {
  id: string; created_at: string; effective_at: string; old_fee_cents: number; new_fee_cents: number;
  old_storage_cents: number; new_storage_cents: number; status: "pending" | "applied" | "cancelled"; done_at: string | null;
};
export const pendingPriceChange = () => one<PriceChange>("SELECT * FROM price_changes WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1");
/** Zmena ceny, ktorú majiteľ ešte nepotvrdil „Rozumiem“ (ohlásená alebo nedávno platná). */
export const priceNotice = (userId: string) =>
  one<PriceChange>(
    `SELECT p.* FROM price_changes p
      WHERE (p.status = 'pending' OR (p.status = 'applied' AND p.effective_at >= ?))
        AND NOT EXISTS (SELECT 1 FROM price_change_acks a WHERE a.change_id = p.id AND a.user_id = ?)
      ORDER BY p.created_at DESC LIMIT 1`,
    new Date(Date.now() - 60 * 86_400_000).toISOString(), userId
  );
export type OutboxEntry = {
  id: string; kind: string; recipient: string; created_at: string; due_at: string; status: "pending" | "sent" | "failed" | "skipped";
  attempts: number; done_at: string | null; error: string | null; to_addr: string | null; subject: string | null; recipient_email: string | null;
};
export const mailHistory = (limit = 50) =>
  all<OutboxEntry>(
    `SELECT o.id, o.kind, o.recipient, o.created_at, o.due_at, o.status, o.attempts, o.done_at, o.error, o.to_addr, o.subject,
       u.email AS recipient_email
     FROM mail_outbox o LEFT JOIN users u ON u.id = o.recipient ORDER BY o.created_at DESC LIMIT ?`,
    limit
  );
export const mailOf = (id: string) => one<OutboxEntry>("SELECT *, NULL AS recipient_email FROM mail_outbox WHERE id = ?", id);
export const userMailPrefs = (userId: string) => one<{ mail_off: string; mail_lang: string }>("SELECT mail_off, mail_lang FROM users WHERE id = ?", userId);

// ───────── Oznamy ─────────
export type Notice = {
  id: string; starts_at: string; ends_at: string; audience: "all" | "owners" | "members"; dismissible: number;
  text_sk: string | null; text_en: string | null; text_cs: string | null; created_at: string; updated_at: string | null;
};
export const allNotices = () => all<Notice>("SELECT * FROM notices ORDER BY starts_at DESC");
/** Oznamy, ktoré má používateľ práve vidieť (podľa času, roly a „Rozumiem“). */
export const activeNotices = (userId: string, role: "owner" | "member" | null) =>
  all<Notice>(
    `SELECT n.* FROM notices n
      WHERE n.starts_at <= ? AND n.ends_at > ?
        AND (n.audience = 'all' OR (n.audience = 'owners' AND ? = 'owner') OR (n.audience = 'members' AND ? = 'member'))
        AND NOT (n.dismissible = 1 AND EXISTS (SELECT 1 FROM notice_acks a WHERE a.notice_id = n.id AND a.user_id = ?))
      ORDER BY n.starts_at`,
    new Date().toISOString(), new Date().toISOString(), role ?? "", role ?? "", userId
  );

/** Súbory firmy (na zmazanie z úložiska pri zmazaní firmy). */
export const companyFiles = (cid: string) =>
  all<{ path: string }>(
    `SELECT storage_path AS path FROM job_photos WHERE company_id = ?
     UNION SELECT logo_path FROM companies WHERE id = ? AND logo_path IS NOT NULL`,
    cid, cid
  ).map((r) => r.path);
