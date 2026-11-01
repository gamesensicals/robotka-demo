import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import pkg from "../../package.json";
import { getDb, one } from "./db";
import { applyEvent, type ErrorCode, type EventBody, type SyncEvent } from "./events";
import { SEED_USER_IDS, seedDemo } from "./demo-seed";

// DEMO: žiadny hub ani synchronizácia. Je jeden server; každá zmena sa hneď zapíše do lokálnej
// databázy (rovnakým applyEvent ako v ostrej Robotke). Každú celú hodinu sa všetko zmaže
// a nahrá znova z ukážkových dát (src/server/demo.ts).

/** V ostrej aplikácii nezhoda s hubom; v deme nenastane. */
export type SyncProblem = { kind: "hub_behind" | "diverged"; local: number; hub: number; at: number };

type State = { started: boolean; ready: boolean; seeding: Promise<void> | null; bootedAt: number; lastError: string | null };
const g = globalThis as unknown as { __robotkaDemo?: State };
const S: State = (g.__robotkaDemo ??= { started: false, ready: false, seeding: null, bootedAt: Date.now(), lastError: null });

export class SyncError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

export const serverName = () => process.env.SERVER_NAME || hostname();
export const appVersion = pkg.version;

const lastSeq = () => one<{ last_seq: number }>("SELECT last_seq FROM sync_state WHERE id = 1")?.last_seq ?? 0;

export function syncStatus() {
  return {
    ready: S.ready,
    lastSeq: S.ready ? lastSeq() : 0,
    connected: true,
    connectedAt: S.bootedAt,
    problem: null as SyncProblem | null,
    lastError: S.lastError,
    name: serverName(),
    version: appVersion,
    bootedAt: S.bootedAt,
  };
}

/** Prvé použitie: ak je databáza prázdna, nahrá ukážkové dáta. */
export function startSync() {
  if (S.started || process.env.NEXT_PHASE === "phase-production-build") return;
  S.started = true;
  void ensureSeeded();
}

/** Počká, kým sú ukážkové dáta nahraté (pri štarte a po každom hodinovom resete). */
export function ensureSeeded(): Promise<void> {
  if (S.ready) return Promise.resolve();
  S.seeding ??= (async () => {
    try {
      const empty = !one("SELECT 1 AS x FROM companies LIMIT 1");
      if (empty) await seedDemo(apply);
      S.ready = true;
    } catch (e) {
      S.lastError = String(e);
      console.error("[demo] seeding failed:", e);
      throw e;
    } finally {
      S.seeding = null;
    }
  })();
  return S.seeding;
}

/** Hodinový reset: databáza je zmazaná – dáta treba nahrať znova. */
export function markEmpty() {
  S.ready = false;
  S.seeding = null;
}

/** Aplikuje udalosť do lokálnej databázy s ďalším poradovým číslom (bez hubu). */
function apply(event: SyncEvent): ErrorCode | null {
  const seq = lastSeq() + 1;
  return applyEvent(getDb(), seq, event, Date.now());
}

/** V deme sa nedá meniť to, čo by ostatným pokazilo skúšanie (heslá, kód firmy, ukážkové účty…). */
function demoBlocked(body: EventBody): boolean {
  switch (body.type) {
    case "user.setPassword":
    case "company.newCode":
    case "mail.settings":
    case "mail.test":
    case "config.set":
    case "account.request":
    case "company.delete":
    case "company.setBlocked":
    case "company.setSuspended":
    case "company.setPrimaryOwner":
      return true;
    case "member.remove":
    case "member.setRole":
      return SEED_USER_IDS.includes(body.userId);
    default:
      return false;
  }
}

/** Zápis: hneď do lokálnej databázy. Chyba (napr. bez oprávnenia) sa vráti ako SyncError. */
export async function submit(body: EventBody, actor: string | null): Promise<void> {
  startSync();
  await ensureSeeded();
  if (demoBlocked(body)) throw new SyncError("demo_disabled");
  const event = { ...body, id: randomUUID(), at: new Date().toISOString(), actor } as SyncEvent;
  const error = apply(event);
  if (error) throw new SyncError(error);
}

// Funkcie panela webmastra (hub) – v deme nie sú.
export async function pushLogToHub(): Promise<number> {
  throw new Error("Not available in the demo.");
}
export function rebuildFromHub() {
  throw new Error("Not available in the demo.");
}
