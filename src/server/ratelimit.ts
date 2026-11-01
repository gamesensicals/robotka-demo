import { headers } from "next/headers";

// Jednoduché obmedzenie počtu pokusov (prihlásenie, verejný formulár) na IP a server.
// Stačí ako brzda proti skúšaniu hesiel a spamu; každý server si počíta sám.
const g = globalThis as unknown as { __robotkaRate?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__robotkaRate ??= new Map<string, number[]>());

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Každý pokus sa počíta (napr. verejný formulár). true = ešte môže. */
export async function allow(kind: string, max: number, windowMs: number): Promise<boolean> {
  const key = `${kind}:${await clientIp()}`;
  if (blocked(key, max, windowMs)) return false;
  hit(key);
  return true;
}

// Pri prihlásení sa počítajú len NEÚSPEŠNÉ pokusy, aby veľa zamestnancov z jednej
// firemnej siete (rovnaká IP) neblokovalo jeden druhého.
export const failKey = async (kind: string) => `${kind}:${await clientIp()}`;

export function blocked(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, recent);
  return recent.length >= max;
}

export function hit(key: string) {
  hits.set(key, [...(hits.get(key) ?? []), Date.now()]);
}
