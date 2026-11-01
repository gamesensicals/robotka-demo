"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BYPASS_COOKIE, getViewer, requireWebmaster } from "@/lib/company";
import { getCompany } from "@/server/queries";

/** Webmaster si otvorí firmu na prezeranie (aj zablokovanú) – len pre neho, len na čítanie. */
export async function startBypass(formData: FormData) {
  await requireWebmaster();
  const id = String(formData.get("company_id") ?? "");
  if (!getCompany(id)) redirect("/webmaster");
  (await cookies()).set(BYPASS_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 4 * 3600, secure: process.env.NODE_ENV === "production" && !!process.env.APP_URL?.startsWith("https") });
  redirect("/");
}

/** Koniec prezerania – späť na firmu vo webmaster paneli. */
export async function endBypass() {
  const viewer = await getViewer();
  const jar = await cookies();
  const id = jar.get(BYPASS_COOKIE)?.value;
  jar.delete(BYPASS_COOKIE);
  redirect(viewer?.isWebmaster && id ? `/webmaster/companies/${id}` : "/login");
}
