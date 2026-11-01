"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number; badgeTitle?: string };

/** Bočné menu Administrácie; aktuálna stránka je biela (najdlhšia zhoda cesty). */
export default function AdminMenu({ items }: { items: Item[] }) {
  const path = usePathname();
  const current = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="menu">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={i.href === current ? "page" : undefined}>
            {i.label}
            {!!i.badge && <span className="unread-dot" title={i.badgeTitle}>{i.badge}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
