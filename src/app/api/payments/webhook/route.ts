import { config } from "@/server/config";
import { one } from "@/server/db";
import { SYSTEM } from "@/server/events";
import { type PolarOrder, orderCredit, verifyWebhook } from "@/server/payments";
import { SyncError, submit } from "@/server/sync";

// Polar sem pošle správu po zaplatení (order.paid) a pri vrátení peňazí (order.refunded).
// Kredit sa pripíše/odpočíta udalosťou credit.add cez hub. ref = id objednávky, takže opakované
// doručenie (Polar skúša až 10×) nič nepripíše dvakrát.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = config("polar_webhook_secret");
  if (!secret) return new Response("payments not configured", { status: 404 });
  const payload = await req.text();
  const headers = { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") };
  if (!verifyWebhook(payload, headers, secret)) return new Response("bad signature", { status: 403 });

  const event = JSON.parse(payload) as { type: string; data: PolarOrder };
  const order = event.data;
  if (event.type !== "order.paid" && event.type !== "order.refunded") return Response.json({ ignored: event.type }, { status: 202 });
  const c = order && orderCredit(order);
  if (!c) return Response.json({ ignored: "not a credit top-up" }, { status: 202 });

  let body: Parameters<typeof submit>[0];
  if (event.type === "order.paid") {
    if (order.status !== "paid" && !order.paid) return Response.json({ ignored: "not paid" }, { status: 202 });
    body = { type: "credit.add", companyId: c.companyId, amount_cents: c.credit, kind: "topup", note: "card", ref: `polar:${order.id}`, topupRequestId: null };
  } else {
    // vrátené peniaze: odpočítať pomernú časť kreditu (pri viacerých čiastočných vráteniach len rozdiel)
    const refunded = Math.min(1, ((order.refunded_amount ?? 0) + ((order as { refunded_tax_amount?: number }).refunded_tax_amount ?? 0)) / order.total_amount);
    const target = order.status === "refunded" ? c.credit : Math.round(c.credit * refunded);
    const done = one<{ n: number }>("SELECT COALESCE(SUM(-amount_cents), 0) AS n FROM credit_tx WHERE ref LIKE ?", `polar-refund:${order.id}:%`)?.n ?? 0;
    if (target - done <= 0) return Response.json({ ok: true, note: "nothing to deduct" });
    body = { type: "credit.add", companyId: c.companyId, amount_cents: -(target - done), kind: "adjust", note: "card refund", ref: `polar-refund:${order.id}:${target}`, topupRequestId: null };
  }

  try {
    await submit(body, SYSTEM);
  } catch (e) {
    if (e instanceof SyncError && (e.code === "duplicate" || e.code === "not_found")) return Response.json({ ok: true, note: e.code });
    console.error("[payments] credit was not updated, Polar will retry:", e);
    return new Response("retry later", { status: 503 });
  }
  return Response.json({ ok: true });
}
