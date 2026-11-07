import type { ReactNode } from "react";
import { getContext } from "@/lib/company";
import { redirect } from "next/navigation";
import { ADMIN_PERMS } from "@/lib/perms";
import { getT } from "@/i18n";
import AdminMenu from "@/components/AdminMenu";
import { unreadTickets } from "@/server/queries";

// Sekcia /admin: majiteľ a členovia tímu s niektorým oprávnením z nej (inak späť na prehľad).
// V menu je len to, na čo má človek oprávnenie.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // člen bez oprávnení z administrácie sa sem dostane len kvôli chatu od webmastra (Podpora)
  const { company, user, has, supportVisible, blocked } = await getContext({ allowBlocked: true });
  const admin = !blocked && ADMIN_PERMS.some(has);
  if (!admin && !supportVisible) redirect("/");
  const { t } = await getT();
  const items = [
    { href: "/admin", label: t.admin.title, show: admin },
    { href: "/admin/invoices", label: t.invoices.title, show: has("invoices.view") },
    { href: "/admin/invoices/new", label: t.invoices.newInvoice, show: has("invoices.create") },
    { href: "/admin/quotes", label: t.quotes.title, show: has("invoices.view") },
    { href: "/admin/settings", label: t.settings.title, show: has("company.settings") },
    { href: "/admin/prices", label: t.prices.title, show: has("prices.view") },
    { href: "/admin/employees", label: t.employees.title, show: has("company.team") || has("company.code") },
    { href: "/admin/credits", label: t.credits.title, show: has("company.credits") },
    { href: "/admin/support", label: t.support.title, show: supportVisible, badge: supportVisible ? unreadTickets(user.id, company.id, has("support")) : 0, badgeTitle: t.support.unread },
  ]
    .filter((i) => i.show)
    .map(({ show: _, ...i }) => i);
  return (
    <div className="cols">
      <aside className="panel no-print"><AdminMenu items={items} /></aside>
      <div className="stack">{children}</div>
    </div>
  );
}
