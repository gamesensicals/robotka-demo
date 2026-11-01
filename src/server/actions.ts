import { redirect } from "next/navigation";
import type { ErrorCode, EventBody } from "./events";
import { SyncError, submit } from "./sync";

// Pomôcky pre server actions: chyby sa ukážu ako hláška nad stránkou (?error=kód),
// nie ako pád aplikácie. Hlášku vykreslí FlashError v layoute.

export function fail(path: string, code: ErrorCode): never {
  // ?error=… musí byť pred kotvou (#time), inak by ho prehliadač nevidel
  const [base, hash] = path.split("#");
  redirect(`${base}${base.includes("?") ? "&" : "?"}error=${code}${hash ? `#${hash}` : ""}`);
}

/** Pošle udalosť cez hub; pri chybe vráti používateľa na `path` s hláškou. */
export async function submitOr(path: string, body: EventBody, actor: string | null): Promise<void> {
  try {
    await submit(body, actor);
  } catch (e) {
    if (e instanceof SyncError) fail(path, e.code);
    throw e;
  }
}

/** Prázdny text -> null (rovnako ako predtým pri Supabase). */
export const textOf = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

/** Nové heslo: aspoň 10 znakov. */
export const MIN_PASSWORD = 10;
