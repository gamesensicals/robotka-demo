import { rmSync } from "node:fs";
import { resetDb } from "./db";
import { filesDir } from "./files";
import { ensureSeeded, markEmpty } from "./sync";

// DEMO: každú celú hodinu (DEMO_RESET_MINUTES) sa databáza aj súbory zmažú a nahrajú sa znova
// ukážkové dáta. Ukážkové účty majú pevné id, takže prihlásení ostanú prihlásení.

export const RESET_MINUTES = Math.max(1, Number(process.env.DEMO_RESET_MINUTES) || 60);

/** „každú celú hodinu“ / „každých N minút“ podľa nastavenia (text v pruhu a na úvode). */
export const resetEvery = (t: { demo: { everyHour: string; everyMinutes: (n: number) => string } }) =>
  RESET_MINUTES === 60 ? t.demo.everyHour : t.demo.everyMinutes(RESET_MINUTES);

/** Najbližší reset (zarovnaný na celé hodiny, resp. násobky RESET_MINUTES). */
export const nextReset = (now = Date.now()) => {
  const step = RESET_MINUTES * 60_000;
  return Math.floor(now / step) * step + step;
};

let resetting: Promise<void> | null = null;
export function resetDemo(): Promise<void> {
  resetting ??= (async () => {
    console.log("[demo] resetting to the original state");
    resetDb();
    rmSync(filesDir(), { recursive: true, force: true });
    markEmpty();
    await ensureSeeded();
  })().finally(() => (resetting = null));
  return resetting;
}

/** Reset pri štarte a potom každú celú hodinu. */
export function startDemoReset() {
  const g = globalThis as unknown as { __demoTimer?: boolean };
  if (g.__demoTimer) return;
  g.__demoTimer = true;
  const schedule = () => setTimeout(() => void resetDemo().catch((e) => console.error("[demo] reset failed:", e)).finally(schedule), nextReset() - Date.now() + 500);
  void resetDemo().catch((e) => console.error("[demo] reset failed:", e)).finally(schedule);
}
