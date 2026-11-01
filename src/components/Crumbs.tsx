import Link from "next/link";
import { getT } from "@/i18n";

type Crumb = { label: string; href?: string };

/** Drobčeková navigácia: Prehľad » Administrácia » Faktúry */
export default async function Crumbs({ items }: { items: Crumb[] }) {
  const { t } = await getT();
  const all: Crumb[] = [{ label: t.nav.home, href: "/" }, ...items];
  return (
    <nav className="crumbs no-print" aria-label="breadcrumb">
      {all.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="sep"> » </span>}
          {c.href && i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
