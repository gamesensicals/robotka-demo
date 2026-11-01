"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/company";
import { submit } from "@/server/sync";

/** „Rozumiem“ pri oznamе – zavrie ho len tomuto používateľovi a vráti ho na tú istú stránku. */
export async function ackNotice(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer || viewer.isWebmaster) redirect("/login");
  try {
    await submit({ type: "notice.ack", noticeId: String(formData.get("id") ?? "") }, viewer.user.id);
  } catch {
    // nevadí – oznam sa ukáže znova a dá sa zavrieť neskôr
  }
  // oznam je v spoločnom layoute – bez toho by ostal zobrazený až do obnovenia stránky
  revalidatePath("/", "layout");
  const ref = (await headers()).get("referer");
  let back = "/";
  try {
    if (ref) back = new URL(ref).pathname + new URL(ref).search;
  } catch {
    // zlá adresa – domov
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
