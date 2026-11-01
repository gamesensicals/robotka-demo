import type { ReactNode } from "react";
import { requireWebmaster } from "@/lib/company";
import { getT } from "@/i18n";
import AdminMenu from "@/components/AdminMenu";
import { WEBMASTER } from "@/server/events";
import { unreadTickets } from "@/server/queries";

// Panel webmastra: všetky firmy, žiadosti o účet, kredity a nastavenia webu.
export default async function WebmasterLayout({ children }: { children: ReactNode }) {
  await requireWebmaster();
  const { t } = await getT();
  const w = t.webmaster;
  const items = [
    { href: "/webmaster", label: w.companies },
    { href: "/webmaster/companies/new", label: w.newCompany },
    { href: "/webmaster/requests", label: w.requests },
    { href: "/webmaster/support", label: t.support.title, badge: unreadTickets(WEBMASTER), badgeTitle: t.support.unread },
    { href: "/webmaster/hub", label: w.hub },
    { href: "/webmaster/backup", label: w.backup },
    { href: "/webmaster/settings", label: w.settings },
    { href: "/webmaster/mail", label: t.mail.title },
    { href: "/webmaster/notices", label: t.notices.title },
    { href: "/webmaster/config", label: t.config.title },
  ];
  return (
    <div className="cols">
      <aside className="panel no-print"><AdminMenu items={items} /></aside>
      <div className="stack">{children}</div>
    </div>
  );
}
