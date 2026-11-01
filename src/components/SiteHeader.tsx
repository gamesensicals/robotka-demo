import Link from "next/link";
import { getViewer } from "@/lib/company";
import { signOut } from "@/lib/auth-actions";
import { endBypass } from "@/app/webmaster/bypass-actions";
import { getT } from "@/i18n";
import { WEBMASTER } from "@/server/events";
import { loginName, unreadTickets } from "@/server/queries";
import Logo from "./Logo";

// Hlavička v troch pásoch: logo / navigácia / "Prihlásený ako".
// Admin (owner/manager) má všetko čo zamestnanec + červenú záložku Administrácia.
// Webmaster má vlastnú záložku a spravuje všetky firmy.
export default async function SiteHeader() {
  const [viewer, { t, credits }] = await Promise.all([getViewer(), getT()]);
  // nová odpoveď v chate podpory = bodka pri záložke
  const unread = !viewer ? 0
    : viewer.isWebmaster ? unreadTickets(WEBMASTER)
    : viewer.company && viewer.supportVisible ? unreadTickets(viewer.user.id, viewer.company.id, viewer.has("support")) : 0;
  const dot = unread > 0 && <span className="unread-dot" title={t.support.unread}>{unread}</span>;
  return (
    <header className="site-head">
      <div className="logo-bar"><Logo /></div>
      {viewer && (
        <>
          {/* vľavo práca (zákazky, zákazníci, hodiny), vpravo kto je prihlásený a účet */}
          <nav className="topnav">
            <div className="nav-left">
              {viewer.company && !viewer.blocked && (
                <>
                  <Link href="/">{t.nav.home}</Link>
                  {viewer.has("jobs.view") && <Link href="/jobs">{t.nav.jobs}</Link>}
                  {viewer.has("customers.view") && <Link href="/customers">{t.nav.customers}</Link>}
                  {(viewer.has("time.own") || viewer.has("time.all")) && <Link href="/time">{t.nav.time}</Link>}
                </>
              )}
            </div>
            <div className="nav-right">
              <span className="who">
                {t.app.loggedInAs} <strong>{loginName({ ...viewer.user, role: viewer.role })}</strong>
                {viewer.isWebmaster && <span className="muted"> · {t.nav.webmaster}</span>}
                {viewer.company && <span className="muted"> · {viewer.company.name}{viewer.role && ` · ${t.role[viewer.role]}`}</span>}
              </span>
              {viewer.isWebmaster && <Link href="/webmaster" className="webmaster-link">{t.nav.webmaster}{dot}</Link>}
              {viewer.isAdmin && !viewer.bypass && <Link href="/admin" className="admin-link">{t.nav.admin}{dot}</Link>}
              {viewer.bypass && <Link href="/admin" className="admin-link">{t.nav.admin}</Link>}
              {/* člen bez Administrácie, ktorému webmaster poslal chat */}
              {!viewer.isAdmin && viewer.supportVisible && <Link href="/admin/support" className="admin-link">{t.support.title}{dot}</Link>}
              {!viewer.isWebmaster && <Link href="/account">{t.nav.account}</Link>}
              <form action={signOut}>
                <button className="linklike">{t.nav.logout}</button>
              </form>
            </div>
          </nav>
          {viewer.bypass && viewer.company && (
            <div className="bypass-bar" role="status">
              <span>{t.bypass.bar(viewer.company.name)}</span>
              <form action={endBypass}><button className="small">{t.bypass.end}</button></form>
            </div>
          )}
          {viewer.blocked && <div className="readonly-bar blocked-bar" role="status">{t.readOnly.blocked}</div>}
          {viewer.company && viewer.readOnly && !viewer.bypass && !viewer.blocked && (
            <div className="readonly-bar" role="status">
              {viewer.company.suspended ? t.readOnly.suspended : t.readOnly.noCredit(credits(viewer.company.credit_cents))}
              {viewer.has("company.credits") && !viewer.company.suspended && <Link href="/admin/credits">{t.readOnly.topUp}</Link>}
            </div>
          )}
        </>
      )}
    </header>
  );
}
