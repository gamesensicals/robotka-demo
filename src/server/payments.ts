import { config } from "./config";
import { createHmac, timingSafeEqual } from "node:crypto";

// Platba kartou cez Polar (polar.sh, merchant of record). Bez knižnice: jedno volanie API
// na vytvorenie platby a overenie webhookov podľa Standard Webhooks.
// Zapne sa nastavením POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET a POLAR_PRODUCT_ID v .env alebo v paneli (Konfigurácia).

export const cardEnabled = () => Boolean(config("polar_access_token") && config("polar_webhook_secret") && config("polar_product_id"));

/** Najmenšie a najväčšie dobitie kartou (v centoch). */
export const CARD_MIN = 1000;
export const CARD_MAX = 100_000;

const apiBase = () =>
  (process.env.POLAR_API_URL || (config("polar_server") === "sandbox" ? "https://sandbox-api.polar.sh" : "https://api.polar.sh")).replace(/\/$/, "");

/**
 * Vytvorí platobnú stránku a vráti jej adresu. Suma je pevná (jednorazová cena len pre túto
 * platbu), zľavové kódy sú vypnuté. Kredit pripíše až webhook po zaplatení.
 */
export async function createCheckout(opts: { companyId: string; amountCents: number; origin: string; email?: string | null; ip?: string | null }) {
  const product = config("polar_product_id")!;
  const body: Record<string, unknown> = {
    products: [product],
    prices: { [product]: [{ amount_type: "fixed", price_amount: opts.amountCents, price_currency: "eur" }] },
    currency: "eur",
    allow_discount_codes: false,
    success_url: `${opts.origin}/admin/credits?ok=paid&checkout_id={CHECKOUT_ID}`,
    return_url: `${opts.origin}/admin/credits`,
    external_customer_id: opts.companyId,
    metadata: { company_id: opts.companyId, credit_cents: opts.amountCents },
  };
  if (opts.email) body.customer_email = opts.email;
  if (opts.ip) body.customer_ip_address = opts.ip;
  const res = await fetch(`${apiBase()}/v1/checkouts/`, {
    method: "POST",
    headers: { authorization: `Bearer ${config("polar_access_token")}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; detail?: unknown };
  if (!res.ok || !json.url) throw new Error(`Polar checkout failed: ${res.status} ${JSON.stringify(json.detail ?? json).slice(0, 300)}`);
  return json.url;
}

/**
 * Overenie webhooku (Standard Webhooks): HMAC-SHA256 z "id.čas.telo", hlavička
 * webhook-signature = "v1,<base64> …", najviac 5 minút stará. Kľúč je base64 časť za "whsec_";
 * staršie tajomstvá Polaru (pred 8. 9. 2026) používajú ako kľúč priamo bajty celého textu.
 */
export function verifyWebhook(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSec = Date.now() / 1000
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;
  const keys: Buffer[] = [Buffer.from(secret, "utf8")];
  if (secret.startsWith("whsec_")) keys.unshift(Buffer.from(secret.slice(6), "base64"));
  const signed = `${id}.${timestamp}.${payload}`;
  const given = signature
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => Buffer.from(s.slice(3), "base64"));
  return keys.some((key) => {
    const expected = createHmac("sha256", key).update(signed).digest();
    return given.some((g) => g.length === expected.length && timingSafeEqual(g, expected));
  });
}

/** Objednávka z webhooku (len polia, ktoré používame). */
export type PolarOrder = {
  id: string;
  status: string;
  paid?: boolean;
  currency: string;
  total_amount: number;
  discount_amount?: number;
  refunded_amount?: number;
  metadata?: { company_id?: string; credit_cents?: number | string };
};

/** Koľko kreditu (v centoch) objednávka pripisuje; null = nie je to naše dobitie. */
export function orderCredit(o: PolarOrder): { companyId: string; credit: number } | null {
  const companyId = o.metadata?.company_id;
  const credit = Number(o.metadata?.credit_cents);
  if (!companyId || !Number.isInteger(credit) || credit < CARD_MIN || credit > CARD_MAX) return null;
  if (o.currency?.toLowerCase() !== "eur") return null;
  // zaplatené musí byť aspoň toľko, koľko pripisujeme (DPH môže byť navrch, zľavy sú vypnuté)
  if ((o.discount_amount ?? 0) > 0 || !(o.total_amount >= credit)) return null;
  return { companyId, credit };
}
