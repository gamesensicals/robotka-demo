"use server";

import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { fail } from "@/server/actions";
import type { ErrorCode } from "@/server/events";
import { HubError, type TestResult, backupKey, cancelBackup, runBackup, saveBackupConfig, testBackup } from "@/server/hub-admin";

const PAGE = "/webmaster/backup";

/** Chyba z hubu -> kód hlášky nad stránkou. */
function codeOf(e: unknown): ErrorCode {
  const msg = e instanceof Error ? e.message : "";
  if (!(e instanceof HubError)) throw e;
  if (msg.includes("not_configured")) return "backup_not_configured";
  if (msg.includes("bad_endpoint")) return "bad_endpoint";
  if (msg.includes("bad_key") || msg.includes("no_key")) return "bad_key";
  console.error("[backup] hub error:", msg);
  return "hub_error";
}

export async function saveConfig(formData: FormData) {
  await requireWebmaster();
  const text = (k: string) => String(formData.get(k) ?? "");
  try {
    await saveBackupConfig({
      enabled: formData.get("enabled") === "on",
      includeFiles: formData.get("includeFiles") === "on",
      endpoint: text("endpoint"),
      region: text("region"),
      bucket: text("bucket"),
      prefix: text("prefix"),
      accessKeyId: text("accessKeyId"),
      secretAccessKey: text("secretAccessKey"),
      intervalHours: text("intervalHours"),
      fullEveryDays: text("fullEveryDays"),
      keepFull: text("keepFull"),
      deletedRetentionDays: text("deletedRetentionDays"),
    });
  } catch (e) {
    fail(PAGE, codeOf(e));
  }
  redirect(`${PAGE}?ok=backup_saved`);
}

export async function runNow(formData: FormData) {
  await requireWebmaster();
  const kind = formData.get("kind") === "full" ? "full" : "incremental";
  let started = false;
  try {
    started = (await runBackup(kind)).started;
  } catch (e) {
    fail(PAGE, codeOf(e));
  }
  if (!started) fail(PAGE, "backup_running");
  redirect(`${PAGE}?ok=backup_started`);
}

export async function cancel() {
  await requireWebmaster();
  try {
    await cancelBackup();
  } catch (e) {
    fail(PAGE, codeOf(e));
  }
  redirect(`${PAGE}?ok=backup_cancelled`);
}

export type TestState = (TestResult & { error?: undefined }) | { error: string; ok?: undefined; steps?: undefined } | null;

export async function testConnection(_prev: TestState): Promise<TestState> {
  await requireWebmaster();
  try {
    return await testBackup();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type KeyState = { key?: string; keyId?: string; newSet?: boolean; error?: string } | null;

/** Kľúč zálohy: vytvoriť nový, zadať vlastný alebo zobraziť uložený (výsledok sa ukáže len raz, v odpovedi). */
export async function keyAction(_prev: KeyState, formData: FormData): Promise<KeyState> {
  await requireWebmaster();
  const action = String(formData.get("action"));
  try {
    if (action === "reveal") return { key: (await backupKey("reveal")).key };
    if (action === "set") return await backupKey("set", String(formData.get("key") ?? ""));
    return await backupKey("generate");
  } catch (e) {
    return { error: codeOf(e) };
  }
}
