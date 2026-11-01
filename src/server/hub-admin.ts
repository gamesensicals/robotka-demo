// Panel webmastra sa pýta hubu na stav, logy a zálohy (cez SYNC_SECRET, len zo servera).

const hubUrl = () => (process.env.HUB_URL ?? "").replace(/\/$/, "");

export class HubError extends Error {}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeout = 15_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${hubUrl()}/admin/${path}`, {
      method,
      headers: { authorization: `Bearer ${process.env.SYNC_SECRET ?? ""}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new HubError(`The hub is not responding (${e instanceof Error ? e.message : String(e)})`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // nie je JSON
    }
    throw new HubError(msg || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export type HubServer = {
  name: string;
  online: boolean;
  version: string | null;
  ip: string | null;
  firstSeen: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
  lastSeen: number | null;
  lastSeq: number | null;
  connections: number;
  info: { uptime?: number; node?: string; schema?: number; dbBytes?: number; rss?: number; pid?: number } | null;
};

export type HubStatus = {
  version: string;
  now: number;
  events: { last: number; firstTs: number | null; lastTs: number | null; perDay: { day: string; n: number }[] };
  storage: { dbBytes: number };
  files: { count: number; bytes: number; deleted: number };
  servers: HubServer[];
  backup: { enabled: boolean; configured: boolean; lastOkAt: number | null; lastError: string | null; nextRunAt: number | null; running: { phase: string; kind: string; events: number; files: number; bytes: number } | null };
};

export type HubLog = { id: number; ts: number; level: "info" | "warn" | "error"; msg: string };

export type BackupRun = {
  id: number;
  kind: "incremental" | "full";
  trigger: "schedule" | "manual";
  started_at: number;
  finished_at: number | null;
  status: "running" | "ok" | "error";
  events: number;
  files: number;
  bytes: number;
  pruned: number;
  error: string | null;
  note: string | null;
};

export type BackupOverview = {
  config: {
    enabled: boolean;
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    secretHint: string | null;
    keyId: string | null;
    setId: string | null;
    intervalHours: number;
    fullEveryDays: number;
    keepFull: number;
    deletedRetentionDays: number;
    includeFiles: boolean;
    updatedAt: number;
    hasSecret: boolean;
    hasKey: boolean;
  };
  configured: boolean;
  state: {
    lastRunAt: number | null;
    lastOkAt: number | null;
    lastFullAt: number | null;
    nextRunAt: number | null;
    backedUpSeq: number;
    lastError: string | null;
    job: { runId: number; kind: string; phase: string; events: number; files: number; bytes: number; startedAt: number; failures: number } | null;
    fulls: { id: string; at: number; to: number; parts: string[] }[];
  };
  runs: BackupRun[];
  events: { last: number; backedUp: number };
  files: { total: number; bytes: number; backedUp: number; backupBytes: number; deletedKept: number };
};

export type TestResult = { ok: boolean; steps: { step: string; ok: boolean; ms: number; error?: string }[] };

export const hubStatus = () => call<HubStatus>("GET", "status");
export const hubLogs = (q: { level?: string; q?: string; before?: number; limit?: number }) => {
  const p = new URLSearchParams();
  if (q.level) p.set("level", q.level);
  if (q.q) p.set("q", q.q);
  if (q.before) p.set("before", String(q.before));
  p.set("limit", String(q.limit ?? 100));
  return call<{ logs: HubLog[]; more: boolean }>("GET", `logs?${p}`);
};
export const forgetServer = (name: string) => call<{ ok: boolean }>("POST", "servers/forget", { name });
export const backupOverview = () => call<BackupOverview>("GET", "backup");
export const saveBackupConfig = (cfg: Record<string, unknown>) => call<BackupOverview>("POST", "backup/config", cfg);
export const backupKey = (action: "generate" | "set" | "reveal", key?: string) =>
  call<{ key: string; keyId?: string; newSet?: boolean }>("POST", "backup/key", { action, key });
export const testBackup = () => call<TestResult>("POST", "backup/test", {}, 60_000);
export const runBackup = (kind?: "incremental" | "full") => call<BackupOverview & { started: boolean }>("POST", "backup/run", { kind });
export const cancelBackup = () => call<BackupOverview>("POST", "backup/cancel", {});
