import Link from "next/link";
import { getT } from "@/i18n";
import { siteSettings } from "@/server/billing";
import { getDb } from "@/server/db";

/** Dátum poslednej zmeny textu podmienok (pri úprave textu zmeň). */
const UPDATED = "2026-11-01";

// Podmienky a ochrana súkromia. Jediná stránka, kde sa menujú poskytovatelia (sprostredkovatelia).
// Navrchu stručné zhrnutie a obsah s odkazmi, potom sekcie s odrážkami.
export default async function Terms() {
  const { t, credits, date } = await getT();
  const s = siteSettings(getDb());
  const contact = [s.contact_email, s.contact_phone].filter(Boolean).join(", ") || "–";
  const prices = { fee: credits(s.monthly_fee_cents), storage: credits(s.storage_cents_per_gb) };
  const sections = t.terms.sections({ operator: s.operator_name || t.app.operatorFallback, contact, ...prices });
  return (
    <>
      <nav className="crumbs"><Link href="/">robotka.beer</Link><span className="sep"> » </span><span>{t.terms.title}</span></nav>
      <article className="panel">
        <h2 className="panel-title spread-title">
          <span>{t.terms.title}</span>
          <span className="title-stats">{t.terms.updated(date(UPDATED))}</span>
        </h2>
        <div className="panel-body terms">
          <section className="terms-summary">
            <h3>{t.terms.summaryTitle}</h3>
            <ul>{t.terms.summary(prices).map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <nav className="terms-toc" aria-label={t.terms.tocTitle}>
            <h3>{t.terms.tocTitle}</h3>
            <ol>{sections.map((sec) => <li key={sec.id}><a href={`#${sec.id}`}>{sec.h}</a></li>)}</ol>
          </nav>
          {sections.map((sec, n) => (
            <section key={sec.id} id={sec.id}>
              <h3>{n + 1}. {sec.h}</h3>
              {sec.body.map((b, i) =>
                typeof b === "string" ? <p key={i}>{b}</p> : <ul key={i}>{b.map((x) => <li key={x}>{x}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </>
  );
}
