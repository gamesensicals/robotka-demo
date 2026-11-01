"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endSession } from "@/server/auth";
import { TEAM_COOKIE } from "@/server/team";

export async function signOut() {
  await endSession();
  // zamestnanec sa vráti na prihlásenie svojej firmy
  redirect((await cookies()).get(TEAM_COOKIE)?.value ? "/team" : "/login");
}
