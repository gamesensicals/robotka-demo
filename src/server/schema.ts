// Lokálna kópia dát na každom serveri. Pravda je v logu udalostí v hube;
// táto databáza sa z neho dá kedykoľvek znova poskladať.
// Pri zmene schémy zvýš verziu: server lokálnu databázu zahodí a poskladá ju znova z hubu.
export const SCHEMA_VERSION = 12;

export const SCHEMA = `
-- Majiteľ sa prihlasuje e-mailom, člen tímu kódom firmy + používateľským menom.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT,                           -- jedinečné v rámci firmy (kontroluje apply)
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  mail_off TEXT NOT NULL DEFAULT '',       -- vypnuté e-mailové upozornenia (čiarkami)
  mail_lang TEXT NOT NULL DEFAULT 'sk'     -- jazyk e-mailov
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ico TEXT, dic TEXT, ic_dph TEXT,
  address TEXT, city TEXT, zip TEXT,
  email TEXT, phone TEXT, iban TEXT,
  logo_path TEXT,
  is_vat_payer INTEGER NOT NULL DEFAULT 0,
  default_vat_rate REAL NOT NULL DEFAULT 23,
  invoice_prefix TEXT NOT NULL DEFAULT '',
  invoice_footer TEXT,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  company_no INTEGER NOT NULL,            -- poradové číslo firmy
  vs TEXT NOT NULL UNIQUE,                 -- variabilný symbol pri dobíjaní: YYQRRR (rok, kvartál založenia, 3 náhodné)
  login_code TEXT NOT NULL UNIQUE,         -- kód firmy pre prihlásenie zamestnancov, napr. novak-k7m4
  primary_owner_id TEXT,                   -- supermajiteľ: nedá sa znížiť ani odobrať, zmeniť ho môže len webmaster
  credit_cents INTEGER NOT NULL DEFAULT 0, -- zostatok kreditu (1 kredit = 1 €)
  storage_bytes INTEGER NOT NULL DEFAULT 0, -- aktuálne obsadené miesto v R2 (fotky + logo)
  logo_size INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,    -- pozastavená webmastrom = len na čítanie
  blocked INTEGER NOT NULL DEFAULT 0,      -- zablokovaná webmastrom = nikto z firmy sa neprihlási (webmaster vidí cez bypass)
  -- individuálna cena (len webmaster; NULL = platí cenník webu)
  fee_cents INTEGER,
  fee_mode TEXT CHECK (fee_mode IN ('per_user','per_company')),
  fee_waived_until TEXT,                   -- odpustená prevádzka do mesiaca vrátane ('YYYY-MM', '9999-12' = natrvalo)
  created_at TEXT NOT NULL
);
-- najviac ľudí vo firme v danom mesiaci (prevádzka na osobu sa ráta aspoň z tohto počtu)
CREATE TABLE IF NOT EXISTS member_peaks (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  peak INTEGER NOT NULL,
  PRIMARY KEY (company_id, month)
);

CREATE TABLE IF NOT EXISTS company_members (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  -- čo smie člen tímu (medzerami oddelený zoznam z src/lib/perms.ts); majiteľ smie všetko
  perms TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS company_members_user ON company_members (user_id);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ico TEXT, dic TEXT, ic_dph TEXT,
  address TEXT, city TEXT, zip TEXT,
  email TEXT, phone TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customers_company ON customers (company_id);

-- Kategórie cenníka: každá firma má svoje (predvolené Káble, Ističe, Chráničky, S-boxy)
CREATE TABLE IF NOT EXISTS price_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS price_categories_company ON price_categories (company_id, position);

CREATE TABLE IF NOT EXISTS price_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ks',
  unit_price REAL NOT NULL DEFAULT 0,
  vat_rate REAL,
  is_labor INTEGER NOT NULL DEFAULT 0,
  category_id TEXT,                        -- NULL = bez kategórie
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS price_items_company ON price_items (company_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  job_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','done')),
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs (company_id, job_date DESC);

CREATE TABLE IF NOT EXISTS job_photos (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  taken_on TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  mime TEXT,                               -- image/..., video/..., application/pdf
  file_name TEXT,                          -- pôvodný názov (pri PDF a videách)
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_photos_job ON job_photos (job_id, taken_on);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  variable_symbol TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','cancelled')),
  note TEXT,
  total_net REAL NOT NULL DEFAULT 0,
  total_vat REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  buyer TEXT,                              -- odberateľ v čase vystavenia (JSON) – faktúra ostane aj po zmazaní zákazníka
  job_title TEXT,                          -- zákazka v čase vystavenia
  updated_at TEXT, updated_by TEXT,        -- posledná úprava konceptu
  corrected_by TEXT,                       -- opravená faktúra: id novej (opravnej)
  downloaded_at TEXT,                      -- prvé stiahnutie PDF (bez neho sa vystavená faktúra nedá zmazať)
  delete_after TEXT,                       -- naplánované zmazanie (16 dní), dovtedy sa dá obnoviť
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_company ON invoices (company_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ks',
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice ON invoice_items (invoice_id);

-- ───────── Dochádzka: odpracované hodiny na zákazkách ─────────
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id TEXT,                             -- bez FK: hodiny ostanú aj po zmazaní zákazky (pre výplaty)
  job_title TEXT,                          -- názov zákazky v čase zápisu (ukáže sa aj po jej zmazaní)
  user_id TEXT NOT NULL,                   -- kto robil (bez FK: hodiny ostanú aj po odobratí zamestnanca)
  user_name TEXT NOT NULL,                 -- meno v čase zápisu (pre výplaty)
  work_date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT,
  material TEXT,                           -- použitý materiál (voľný text)
  created_by_name TEXT,                    -- kto zápis urobil (ak za niekoho zapísal majiteľ/správca)
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS time_entries_company_date ON time_entries (company_id, work_date);
CREATE INDEX IF NOT EXISTS time_entries_job ON time_entries (job_id);

-- ───────── Kredity a úložisko ─────────
-- Denný vrchol obsadeného miesta (ako počíta Cloudflare R2). Deň bez zmeny = koncový stav posledného dňa so zmenou.
CREATE TABLE IF NOT EXISTS storage_usage (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  peak_bytes INTEGER NOT NULL,
  end_bytes INTEGER NOT NULL,
  PRIMARY KEY (company_id, day)
);

CREATE TABLE IF NOT EXISTS credit_tx (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,           -- + dobitie, - poplatok
  kind TEXT NOT NULL CHECK (kind IN ('topup','adjust','fee','storage')),
  note TEXT,
  ref TEXT UNIQUE                          -- napr. id objednávky platby kartou, aby sa nepripísala dvakrát
);
CREATE INDEX IF NOT EXISTS credit_tx_company ON credit_tx (company_id, at DESC);

CREATE TABLE IF NOT EXISTS topup_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS billing_runs (
  month TEXT PRIMARY KEY,                  -- "2026-11": poplatok za 11/2026 + úložisko za 10/2026
  at TEXT NOT NULL
);

-- ───────── Žiadosti o účet a nastavenia webu ─────────
CREATE TABLE IF NOT EXISTS account_requests (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  ico TEXT,
  message TEXT,
  logo_path TEXT,                          -- logo nahraté so žiadosťou, pri založení sa stane logom firmy
  logo_size INTEGER NOT NULL DEFAULT 0,
  people INTEGER,                          -- koľko ľudí bude Robotku používať (odhad zo žiadosti)
  storage_gb INTEGER,                      -- odhadované úložisko v GB
  company_id TEXT,                         -- firma založená z tejto žiadosti
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','rejected')),
  status_at TEXT,                          -- kedy bola vybavená/zamietnutá (vybavená sa zmaže po 7, zamietnutá po 30 dňoch)
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  operator_name TEXT,
  iban TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  info_text TEXT,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 1500,  -- 15 € mesačne za osobu (alebo za firmu, podľa fee_mode)
  fee_mode TEXT NOT NULL DEFAULT 'per_user' CHECK (fee_mode IN ('per_user','per_company')),
  storage_cents_per_gb INTEGER NOT NULL DEFAULT 12, -- 0,12 € za GB-mesiac
  -- e-maily (SMTP); heslo je zašifrované kľúčom serverov, v logu hubu nie je čitateľné
  mail_enabled INTEGER NOT NULL DEFAULT 0,
  smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER NOT NULL DEFAULT 1,
  smtp_user TEXT, smtp_pass TEXT,
  mail_from TEXT, mail_from_name TEXT,
  wm_notify_email TEXT,                    -- kam chodia upozornenia pre webmastra (prázdne = WEBMASTER_EMAIL)
  wm_mail_off TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO site_settings (id) VALUES (1);

-- Zmena cien: platí najskôr 31 dní po oznámení, dovtedy sa dá zrušiť
CREATE TABLE IF NOT EXISTS price_changes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  old_fee_cents INTEGER NOT NULL, new_fee_cents INTEGER NOT NULL,
  old_storage_cents INTEGER NOT NULL, new_storage_cents INTEGER NOT NULL,
  old_mode TEXT, new_mode TEXT,           -- prevádzka na osobu / na firmu
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled')),
  done_at TEXT
);
-- kto z majiteľov klikol „Rozumiem“ (bublina na Prehľade zmizne)
CREATE TABLE IF NOT EXISTS price_change_acks (
  change_id TEXT NOT NULL REFERENCES price_changes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (change_id, user_id)
);

-- Nastavenia, ktoré sa inak berú z .env (Polar, APP_URL, webmaster…). Hodnota tu má prednosť
-- pred .env; tajné hodnoty sú zašifrované kľúčom serverov.
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Oznamy (napr. údržba): webmaster nastaví text v 3 jazykoch, čas od–do a komu sa ukážu
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all','owners','members')),
  dismissible INTEGER NOT NULL DEFAULT 1,  -- dá sa zavrieť „Rozumiem“
  text_sk TEXT, text_en TEXT, text_cs TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
-- kto oznam zavrel „Rozumiem“
CREATE TABLE IF NOT EXISTS notice_acks (
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (notice_id, user_id)
);

-- E-maily na odoslanie. Vznikajú v apply (rovnako na všetkých serveroch);
-- odošle ich len server, ktorý si ich cez hub zarezervuje (mail.claim).
CREATE TABLE IF NOT EXISTS mail_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,                 -- id používateľa, 'webmaster' alebo e-mail (test)
  company_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',         -- údaje do textu e-mailu
  created_at TEXT NOT NULL,
  due_at TEXT NOT NULL,                    -- skôr sa neodošle
  unless_read TEXT,                        -- {"ticket","reader","since"}: neposlať, ak si to medzitým prečítal
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  claimed_by TEXT, claimed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  done_at TEXT, error TEXT, to_addr TEXT, subject TEXT
);
CREATE INDEX IF NOT EXISTS mail_outbox_due ON mail_outbox (status, due_at);
CREATE INDEX IF NOT EXISTS mail_outbox_created ON mail_outbox (created_at DESC);

-- ───────── Podpora: chat majiteľov s webmastrom ─────────
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,          -- posledná správa (7 dní ticha = automaticky zatvoriť)
  closed_at TEXT,
  delete_after TEXT,                       -- 7 dní po zatvorení sa chat zmaže
  -- chat založený webmastrom: komu patrí ('company' celá firma, 'support' majitelia + oprávnenie na podporu,
  -- 'people' len vybraní – ticket_recipients); zavrieť ho môže len webmaster
  opened_by_webmaster INTEGER NOT NULL DEFAULT 0,
  audience TEXT
);
CREATE TABLE IF NOT EXISTS ticket_recipients (
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (ticket_id, user_id)
);
CREATE INDEX IF NOT EXISTS tickets_company ON tickets (company_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_webmaster INTEGER NOT NULL DEFAULT 0,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_role TEXT,                         -- owner / member v čase správy (webmaster vidí, kto písal)
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket ON ticket_messages (ticket_id, created_at);

-- kto si chat naposledy prečítal ('webmaster' alebo id majiteľa) -> neprečítané v menu
CREATE TABLE IF NOT EXISTS ticket_reads (
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  reader TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, reader)
);

-- Úplná kópia logu udalostí z hubu (druhá záloha: hub sa dá obnoviť z ktoréhokoľvek servera)
CREATE TABLE IF NOT EXISTS event_log (
  seq INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  body TEXT NOT NULL
);

-- Synchronizácia: posledná aplikovaná udalosť z hubu a udalosti, ktoré apply odmietol.
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seq INTEGER NOT NULL
);
INSERT OR IGNORE INTO sync_state (id, last_seq) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS event_results (
  seq INTEGER PRIMARY KEY,
  error TEXT NOT NULL
);
`;
