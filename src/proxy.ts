import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Neprihlásených presmeruje na /login. Overí len podpis cookie, bez databázy,
// takže požiadavku môže vybaviť ktorýkoľvek server.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = ["/login", "/team", "/request-account", "/terms", "/api/health", "/api/payments/webhook", "/files"].some((p) => path === p || path.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    const url = request.nextUrl.clone();
    // zamestnanec so zapamätanou firmou ide na prihlásenie s kódom
    url.pathname = request.cookies.get("robotka_team")?.value ? "/team" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
