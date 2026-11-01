"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireSupport } from "@/lib/company";
import { submitOr } from "@/server/actions";
import type { TicketPriority } from "@/server/events";
import { visibleTicket } from "@/server/queries";
import { submit } from "@/server/sync";

// Podpora z pohľadu majiteľa firmy.

export async function openTicket(formData: FormData) {
  const { company, user, canOpen } = await requireSupport();
  if (!canOpen) redirect("/admin/support");
  const id = randomUUID();
  await submitOr("/admin/support", {
    type: "ticket.open",
    companyId: company.id,
    ticket: { id, subject: String(formData.get("subject") ?? ""), priority: String(formData.get("priority") ?? "normal") as TicketPriority },
    message: { id: randomUUID(), body: String(formData.get("body") ?? "") },
  }, user.id);
  redirect(`/admin/support/${id}?ok=ticket_opened`);
}

export async function replyTicket(formData: FormData) {
  const { user } = await requireSupport();
  const id = String(formData.get("id"));
  await submitOr(`/admin/support/${id}`, { type: "ticket.message", ticketId: id, message: { id: randomUUID(), body: String(formData.get("body") ?? "") } }, user.id);
  redirect(`/admin/support/${id}?ok=ticket_sent`);
}

export async function setTicketStatus(formData: FormData) {
  const { user } = await requireSupport();
  const id = String(formData.get("id"));
  const status = formData.get("status") === "open" ? "open" : "closed";
  await submitOr(`/admin/support/${id}`, { type: "ticket.setStatus", ticketId: id, status }, user.id);
  redirect(`/admin/support/${id}?ok=${status === "open" ? "ticket_reopened" : "ticket_closed"}`);
}

/** Označiť ako prečítané (len ak naozaj je čo – každé označenie je udalosť v hube). */
export async function markRead(ticketId: string) {
  const { company, user, has, bypass } = await requireSupport();
  if (bypass) return; // webmaster si pri prezeraní nič neoznačuje
  const t = visibleTicket(ticketId, company.id, user.id, has("support"));
  if (!t || t.unread === 0) return;
  try {
    await submit({ type: "ticket.read", ticketId }, user.id);
  } catch {
    // nevadí, skúsi sa pri ďalšom otvorení
  }
}
