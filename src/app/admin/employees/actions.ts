"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/company";
import { PERMS, PRESETS, type Perm, normalizePerms } from "@/lib/perms";
import { MIN_PASSWORD, fail, submitOr, textOf } from "@/server/actions";
import { hashPassword } from "@/server/auth";
import { WEBMASTER } from "@/server/events";
import { normalizeUsername } from "@/server/login-code";

// Správa tímu – rovnaké akcie pre stránku Zamestnanci aj pre webmastra pri firme.
// Oprávnenia (kto smie čo a komu) kontroluje applyEvent, tu sa len poskladá udalosť.

/** Kam sa vrátiť: len na stránku tímu alebo firmy vo webmaster paneli. */
const safeBack = (b: string) => (/^\/(admin\/employees|webmaster\/companies\/[0-9a-f-]{36})$/.test(b) ? b : "/admin/employees");

async function context(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const back = safeBack(String(formData.get("back") ?? ""));
  if (viewer.isWebmaster) return { actor: WEBMASTER, companyId: String(formData.get("company_id") ?? ""), back };
  if (!viewer.company) redirect("/");
  return { actor: viewer.user.id, companyId: viewer.company.id, back };
}

/** Oprávnenia z formulára: predvoľba (tlačidlo) alebo zaškrtnuté políčka. */
function permsFrom(formData: FormData): Perm[] {
  const preset = String(formData.get("preset") ?? "");
  if (preset === "all") return [...PERMS];
  if (preset === "worker" || preset === "manager") return [...PRESETS[preset]];
  return normalizePerms(formData.getAll("perm").map(String));
}

export async function addMember(formData: FormData) {
  const { actor, companyId, back } = await context(formData);
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) fail(back, "weak_password");
  const password_hash = await hashPassword(password);
  const owner = formData.get("kind") === "owner";
  await submitOr(
    back,
    owner
      ? { type: "member.add", companyId, role: "owner", user: { id: randomUUID(), email: String(formData.get("email") ?? "").trim().toLowerCase(), password_hash } }
      : {
          type: "member.add",
          companyId,
          role: "member",
          perms: permsFrom(formData),
          user: { id: randomUUID(), username: normalizeUsername(String(formData.get("username") ?? "")), password_hash },
        },
    actor
  );
  redirect(`${back}?ok=member_added`);
}

export async function removeMember(formData: FormData) {
  const { actor, companyId, back } = await context(formData);
  await submitOr(back, { type: "member.remove", companyId, userId: String(formData.get("user_id")) }, actor);
  redirect(`${back}?ok=member_removed`);
}

export async function setMemberPassword(formData: FormData) {
  const { actor, back } = await context(formData);
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) fail(back, "weak_password");
  await submitOr(back, { type: "user.setPassword", userId: String(formData.get("user_id")), password_hash: await hashPassword(password) }, actor);
  redirect(`${back}?ok=password_changed`);
}

/** Člen stratil mobil: vypne mu dvojstupňové prihlásenie (rovnaké pravidlá ako nové heslo). */
export async function resetMemberTwoFa(formData: FormData) {
  const { actor, back } = await context(formData);
  await submitOr(back, { type: "user.totp.clear", userId: String(formData.get("user_id")) }, actor);
  redirect(`${back}?ok=totp_off`);
}

export async function setMemberPerms(formData: FormData) {
  const { actor, companyId, back } = await context(formData);
  await submitOr(back, { type: "member.setPermissions", companyId, userId: String(formData.get("user_id")), perms: permsFrom(formData) }, actor);
  redirect(`${back}?ok=perms_saved`);
}

export async function setMemberRole(formData: FormData) {
  const { actor, companyId, back } = await context(formData);
  const username = textOf(formData, "username");
  await submitOr(
    back,
    {
      type: "member.setRole",
      companyId,
      userId: String(formData.get("user_id")),
      role: formData.get("role") === "owner" ? "owner" : "member",
      email: textOf(formData, "email"),
      username: username ? normalizeUsername(username) : null,
    },
    actor
  );
  redirect(`${back}?ok=role_changed`);
}

export async function newCompanyCode(formData: FormData) {
  const { actor, companyId, back } = await context(formData);
  await submitOr(back, { type: "company.newCode", companyId }, actor);
  redirect(`${back}?ok=code_changed`);
}
