import { accessSync, constants, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA, SCHEMA_VERSION } from "./schema";

// Next.js balí inštrumentáciu a stránky do samostatných modulov, preto jedna
// inštancia databázy na proces žije na globalThis.
const g = globalThis as unknown as { __robotkaDb?: DatabaseSync; __dataDir?: string };

/**
 * Priečinok na databázu a súbory dema. Ak sa do DATA_DIR nedá zapisovať (napr. zlé nastavenie
 * na hostingu), demo nespadne, ale použije dočasný priečinok – dáta sa aj tak každú hodinu mažú.
 */
export function dataDir(): string {
  if (g.__dataDir) return g.__dataDir;
  const wanted = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  try {
    mkdirSync(wanted, { recursive: true });
    accessSync(wanted, constants.W_OK);
    g.__dataDir = wanted;
  } catch (e) {
    const fallback = path.join(tmpdir(), "robotka-demo");
    console.warn(`[db] cannot write to ${wanted} (${(e as NodeJS.ErrnoException).code ?? e}), using ${fallback}`);
    mkdirSync(fallback, { recursive: true });
    g.__dataDir = fallback;
  }
  return g.__dataDir;
}

export function getDb(): DatabaseSync {
  if (!g.__robotkaDb) {
    const file = path.join(dataDir(), "robotka.db");
    let db = open(file);
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const empty = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get();
    if (version !== SCHEMA_VERSION && !empty) {
      // Databáza je len kópia logu z hubu: pri novej schéme ju zahodíme a sync ju poskladá znova.
      console.log(`[db] schema ${version} -> ${SCHEMA_VERSION}, rebuilding the local database from the hub`);
      db.close();
      for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
      db = open(file);
    }
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    g.__robotkaDb = db;
  }
  return g.__robotkaDb;
}

/** Zahodí lokálnu databázu (je to len kópia logu z hubu); ďalší getDb() vytvorí prázdnu. */
export function resetDb() {
  const file = path.join(dataDir(), "robotka.db");
  g.__robotkaDb?.close();
  g.__robotkaDb = undefined;
  for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
}

/** Veľkosť súboru databázy v bajtoch. */
export function dbBytes(): number {
  const r = getDb().prepare("SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()").get() as { n: number };
  return r.n;
}

function open(file: string) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

type Param = string | number | null;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T>(sql: string, ...params: Param[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
