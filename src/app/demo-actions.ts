"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { startSession } from "@/server/auth";
import { DEMO_COMPANY_ID, DEMO_MEMBERS, DEMO_OWNER } from "@/server/demo-seed";
import { getCompany } from "@/server/queries";
import { ensureSeeded } from "@/server/sync";
import { TEAM_COOKIE } from "@/server/team";

/** Prihlásenie jedným klikom do ukážkového účtu (majiteľ, správca, zamestnanec). */
export async function demoSignIn(formData: FormData) {
  await ensureSeeded();
  const who = String(formData.get("who") ?? "");
  const member = DEMO_MEMBERS.find((m) => m.id === who);
  const userId = who === DEMO_OWNER.id ? DEMO_OWNER.id : member?.id;
  if (!userId) redirect("/login");
  if (member) {
    // člen tímu: zariadenie si zapamätá firmu (odhlásenie ho vráti na prihlásenie pre tím)
    const code = getCompany(DEMO_COMPANY_ID)?.login_code;
    if (code) (await cookies()).set(TEAM_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 86400 });
  }
  await startSession(userId);
  redirect("/");
}
