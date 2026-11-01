import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { webmasterEmail } from "@/server/auth";
import { ADMIN_PERMS, type Perm } from "@/lib/perms";
import { WEBMASTER, type Role } from "@/server/events";
import { PERMS } from "@/lib/perms";
import { getCompany as companyById, hasWebmasterTickets, isReadOnly, membershipOf, userById, type Company } from "@/server/queries";
import { startSync } from "@/server/sync";

export type { Company, Role };

/** Webmaster si otvorí firmu na prezeranie („bypass“) – platí len spolu s reláciou webmastra. */
export const BYPASS_COOKIE = "robotka_bypass";

/** Prihlásený používateľ a jeho firma, bez presmerovania (pre hlavičku). null = nikto nie je prihlásený. */
export const getViewer = cache(async () => {
  startSync();
  const userId = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  if (userId === WEBMASTER) {
    const email = webmasterEmail();
    if (!email) return null; // webmaster bol vypnutý v .env
    const base = {
      user: { id: WEBMASTER, email, username: null as string | null },
      company: null as Company | null, role: null as Role | null, isAdmin: false, isWebmaster: true, readOnly: false,
      perms: [] as Perm[], has: (_: Perm) => false, supportVisible: false, bypass: false, blocked: false,
    };
    // bypass: webmaster vidí firmu ako majiteľ (aj zablokovanú), len na prezeranie
    const bypassId = (await cookies()).get(BYPASS_COOKIE)?.value;
    const bypassCompany = bypassId ? companyById(bypassId) : undefined;
    if (bypassCompany) {
      return {
        ...base, company: bypassCompany, role: "owner" as Role, isAdmin: true, readOnly: true,
        perms: [...PERMS], has: (_: Perm) => true, supportVisible: true, bypass: true,
      };
    }
    return base;
  }
  const user = userById(userId);
  if (!user) return null;
  const m = membershipOf(userId);
  // zablokovaná firma: členovia tímu nemajú prístup vôbec, majitelia len k podpore
  if (m?.company.blocked) {
    if (m.role !== "owner") return null;
    return {
      user, company: m.company, role: m.role, isAdmin: false, isWebmaster: false, readOnly: true,
      perms: ["support"] as Perm[], has: (p: Perm) => p === "support", supportVisible: true, bypass: false, blocked: true,
    };
  }
  const role = m?.role ?? null;
  const perms = m?.perms ?? [];
  const has = (p: Perm) => perms.includes(p);
  return {
    user,
    company: m?.company ?? null,
    role,
    /** záložka Administrácia: majiteľ alebo člen s niektorým oprávnením z nej */
    isAdmin: ADMIN_PERMS.some(has),
    isWebmaster: false,
    readOnly: m ? isReadOnly(m.company) : false,
    perms,
    has,
    /** Podpora: s oprávnením, alebo keď mu webmaster poslal chat */
    supportVisible: has("support") || (m ? hasWebmasterTickets(m.company.id, userId) : false),
    bypass: false,
    blocked: false,
  };
});

/**
 * Prihlásený používateľ + jeho firma. Neprihlásený -> /login, webmaster -> /webmaster, bez firmy -> /onboarding.
 * Majiteľ zablokovanej firmy smie len do podpory (allowBlocked).
 */
export async function getContext(opts?: { allowBlocked?: boolean }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.blocked && !opts?.allowBlocked) redirect("/admin/support");
  if (viewer.isWebmaster && !viewer.bypass) redirect("/webmaster");
  const { company, role } = viewer;
  if (!company || !role) redirect("/onboarding");
  return { ...viewer, company, role };
}

/** Aspoň jedno z oprávnení (majiteľ má všetky). Bez neho späť na prehľad. */
export async function requirePerm(...perms: Perm[]) {
  const ctx = await getContext();
  if (!perms.some(ctx.has)) redirect("/");
  return ctx;
}

/** Podpora: s oprávnením na podporu, alebo keď má chat od webmastra (bez možnosti založiť nový). */
export async function requireSupport() {
  const ctx = await getContext({ allowBlocked: true });
  if (!ctx.supportVisible) redirect("/");
  return { ...ctx, canOpen: ctx.has("support") && !ctx.bypass };
}

/** Len webmaster (panel /webmaster). */
export async function requireWebmaster() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isWebmaster) redirect("/");
  return viewer;
}

/** Len majiteľ firmy. */
export async function requireOwner() {
  const ctx = await getContext();
  if (ctx.role !== "owner") redirect("/");
  return ctx;
}
