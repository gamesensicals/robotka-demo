"use server";

import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { fail } from "@/server/actions";
import { forgetServer } from "@/server/hub-admin";
import { pushLogToHub, rebuildFromHub } from "@/server/sync";

export async function forget(formData: FormData) {
  await requireWebmaster();
  try {
    await forgetServer(String(formData.get("name") ?? ""));
  } catch {
    fail("/webmaster/hub", "hub_error");
  }
  redirect("/webmaster/hub?ok=server_forgotten");
}

/** Hub má menej udalostí ako tento server: doplní ich z lokálnej kópie logu. */
export async function pushToHub() {
  await requireWebmaster();
  try {
    await pushLogToHub();
  } catch (e) {
    console.error("[hub] push to hub failed:", e);
    fail("/webmaster/hub", "push_failed");
  }
  redirect("/webmaster/hub?ok=hub_pushed");
}

/** Log tohto servera nesedí s hubom: databáza sa zahodí a poskladá znova z hubu. */
export async function rebuildServer() {
  await requireWebmaster();
  rebuildFromHub();
  redirect("/webmaster/hub?ok=server_rebuilt");
}
