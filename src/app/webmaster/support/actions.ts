"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWebmaster } from "@/lib/company";
import { submitOr } from "@/server/actions";
import { TICKET_PRIORITIES, type TicketPriority, WEBMASTER } from "@/server/events";
import { getTicket } from "@/server/queries";
import { submit } from "@/server/sync";

// Podpora z pohľadu webmastra: odpovedať, zavrieť/otvoriť, priorita, okamžité zmazanie.

const back = (id: string, ok: string) => redirect(`/webmaster/support/${id}?ok=${ok}`);

export async function wmReply(formData: FormData) {
  await requireWebmaster();
  const id = String(formData.get("id"));
  await submitOr(`/webmaster/support/${id}`, { type: "ticket.message", ticketId: id, message: { id: randomUUID(), body: String(formData.get("body") ?? "") } }, WEBMASTER);
  back(id, "ticket_sent");
}

export async function wmSetStatus(formData: FormData) {
  await requireWebmaster();
  const id = String(formData.get("id"));
  const status = formData.get("status") === "open" ? "open" : "closed";
  await submitOr(`/webmaster/support/${id}`, { type: "ticket.setStatus", ticketId: id, status }, WEBMASTER);
  back(id, status === "open" ? "ticket_reopened" : "ticket_closed");
}

export async function wmSetPriority(formData: FormData) {
  await requireWebmaster();
  const id = String(formData.get("id"));
  const priority = String(formData.get("priority")) as TicketPriority;
  if (!TICKET_PRIORITIES.includes(priority)) back(id, "priority_changed");
  await submitOr(`/webmaster/support/${id}`, { type: "ticket.setPriority", ticketId: id, priority }, WEBMASTER);
  back(id, "priority_changed");
}

export async function wmDelete(formData: FormData) {
  await requireWebmaster();
  const id = String(formData.get("id"));
  await submitOr(`/webmaster/support/${id}`, { type: "ticket.delete", ticketId: id }, WEBMASTER);
  redirect("/webmaster/support?ok=ticket_deleted");
}

export async function wmMarkRead(ticketId: string) {
  await requireWebmaster();
  const t = getTicket(ticketId, WEBMASTER);
  if (!t || t.unread === 0) return;
  try {
    await submit({ type: "ticket.read", ticketId }, WEBMASTER);
  } catch {
    // skúsi sa pri ďalšom otvorení
  }
}
