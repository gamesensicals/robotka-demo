"use server";

import { cookies } from "next/headers";
import { isLang } from "./index";

export async function setLang(formData: FormData) {
  const lang = formData.get("lang");
  if (!isLang(lang)) return;
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
