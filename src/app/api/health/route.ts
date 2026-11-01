import { startSync, syncStatus } from "@/server/sync";

// Health check pre load balancer: 503, kým server nedobehol zmeny z hubu,
// aby Caddy neposielal ľudí na server so starými dátami.
export const dynamic = "force-dynamic";

export function GET() {
  startSync();
  const { ready, lastSeq } = syncStatus();
  return Response.json({ ok: ready, lastSeq, instance: process.env.HOSTNAME ?? "unknown" }, { status: ready ? 200 : 503 });
}
