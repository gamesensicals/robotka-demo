import Link from "next/link";
import { requireWebmaster } from "@/lib/company";
import { fmtBytes } from "@/lib/format";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import StatusDot from "@/components/StatusDot";
import AutoRefresh from "@/components/support/AutoRefresh";
import { type HubLog, type HubStatus, hubLogs, hubStatus } from "@/server/hub-admin";
import { dbBytes, one } from "@/server/db";
import { syncStatus } from "@/server/sync";
import { forget, pushToHub, rebuildServer } from "./actions";

type Search = { level?: string; q?: string; before?: string };

export default async function HubPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, , { t, locale, dateTime }] = await Promise.all([searchParams, requireWebmaster(), getT()]);
  const h = t.hub;
  const level = sp.level === "warn" || sp.level === "error" ? sp.level : "";
  const before = Number(sp.before) || undefined;

  let status: HubStatus | null = null;
  let logs: { logs: HubLog[]; more: boolean } = { logs: [], more: false };
  let error: string | null = null;
  try {
    [status, logs] = await Promise.all([hubStatus(), hubLogs({ level, q: sp.q, before })]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const me = syncStatus();
  const localEvents = one<{ n: number }>("SELECT COUNT(*) AS n FROM event_log")?.n ?? 0;
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const since = (days: number) => status?.events.perDay.filter((d) => d.day >= day(days - 1)).reduce((s, d) => s + d.n, 0) ?? 0;
  const ago = (ms: number | null | undefined) => (ms ? dateTime(ms) : "–");
  const uptime = (s?: number) => (s === undefined ? "–" : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`);
  const logLink = (p: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ level, q: sp.q, ...p })) if (v) q.set(k, String(v));
    return `/webmaster/hub?${q}#logs`;
  };

  return (
    <>
      <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: h.title }]} />
      <AutoRefresh seconds={30} />

      {me.problem && (
        <section className="panel">
          <h2 className="panel-title">{h.thisServer}: {me.name}</h2>
          <div className="panel-body stack">
            <p role="alert" className="alert">
              {me.problem.kind === "hub_behind" ? h.problemBehind(me.problem.local, me.problem.hub) : h.problemDiverged(me.problem.local)}
            </p>
            <div className="actions">
              {me.problem.kind === "hub_behind" && (
                <form action={pushToHub}>
                  <ConfirmSubmit label={h.pushToHub} question={t.confirm.pushQ(me.problem.local - me.problem.hub)} yes={h.pushToHub} no={t.confirm.cancel} className="primary" />
                </form>
              )}
              <form action={rebuildServer}>
                <ConfirmSubmit label={h.rebuild} question={t.confirm.rebuildQ} yes={h.rebuild} no={t.confirm.cancel} className="danger" />
              </form>
            </div>
          </div>
        </section>
      )}

      {/workers\.dev/.test(process.env.HUB_PUBLIC_URL || process.env.HUB_URL || "") && (
        <p role="alert" className="alert">{h.noCacheWarning}</p>
      )}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{h.overview}</span>
          {status && <span className="title-stats">{h.version} {status.version}</span>}
        </h2>
        {error || !status ? (
          <div className="panel-body"><p role="alert" className="alert">{h.unreachable}: {error}</p></div>
        ) : (
          <dl className="stats">
            <dt>{h.events}</dt><dd>{status.events.last.toLocaleString(locale)}</dd>
            <dt>{h.today}</dt><dd>{since(1)}</dd>
            <dt>{h.week}</dt><dd>{since(7)}</dd>
            <dt>{h.twoWeeks}</dt><dd>{since(14)}</dd>
            <dt>{h.firstEvent}</dt><dd>{ago(status.events.firstTs)}</dd>
            <dt>{h.lastEvent}</dt><dd>{ago(status.events.lastTs)}</dd>
            <dt>{h.dbSize}</dt><dd>{fmtBytes(status.storage.dbBytes, locale)}</dd>
            <dt>{h.files}</dt><dd>{status.files.count} · {fmtBytes(status.files.bytes, locale)}</dd>
            <dt>{h.backups}</dt>
            <dd>
              <Link href="/webmaster/backup">
                {!status.backup.configured ? h.backupNotSet
                  : status.backup.running ? h.backupRunning
                  : status.backup.lastOkAt ? `${h.backupLast} ${dateTime(status.backup.lastOkAt)}` : h.never}
              </Link>
              {status.backup.lastError && <span className="muted by">{status.backup.lastError}</span>}
            </dd>
          </dl>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">{h.servers}</h2>
        <table>
          <thead>
            <tr><th className="dotcol" /><th>{h.server}</th><th>{h.lastSeq}</th><th>{h.connectedSince}</th><th className="hide-sm">{h.details}</th><th /></tr>
          </thead>
          <tbody>
            {status?.servers.length === 0 && <tr><td colSpan={6} className="empty">{h.noServers}</td></tr>}
            {status?.servers.map((s) => {
              const lag = s.online && s.lastSeq !== null ? status!.events.last - s.lastSeq : null;
              return (
                <tr key={s.name}>
                  <td className="dotcol"><StatusDot active={s.online} /></td>
                  <td>
                    <strong>{s.name}</strong>{s.name === me.name && <span className="muted"> · {h.thisOne}</span>}
                    <span className="muted by">{s.online ? h.online : h.offline} · {h.version} {s.version ?? "?"}</span>
                  </td>
                  <td>
                    {s.lastSeq ?? "–"}
                    <span className="muted by">{lag === null ? "" : lag <= 0 ? h.upToDate : h.behind(lag)}</span>
                  </td>
                  <td>
                    {s.online ? ago(s.connectedAt) : ago(s.disconnectedAt)}
                    <span className="muted by">{h.lastSeen} {ago(s.lastSeen)} · {h.connections(s.connections)}</span>
                  </td>
                  <td className="hide-sm">
                    <span className="muted">
                      {[s.ip, s.info?.uptime !== undefined && `${h.uptime} ${uptime(s.info.uptime)}`, s.info?.rss && `${h.memory} ${fmtBytes(s.info.rss, locale)}`, s.info?.dbBytes && `DB ${fmtBytes(s.info.dbBytes, locale)}`, s.info?.node]
                        .filter(Boolean)
                        .join(" · ") || "–"}
                    </span>
                  </td>
                  <td className="row-actions">
                    {!s.online && (
                      <form action={forget}>
                        <input type="hidden" name="name" value={s.name} />
                        <button className="small">{h.forget}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="panel-body">
          <p className="muted small-note">
            {h.thisServer}: <strong>{me.name}</strong> · {me.connected ? h.syncOk : h.syncDown} · {h.localEvents} {localEvents} · DB {fmtBytes(dbBytes(), locale)}
            {me.lastError && !me.connected && ` · ${me.lastError}`}
          </p>
        </div>
      </section>

      <section className="panel" id="logs">
        <h2 className="panel-title">{h.logs}</h2>
        <form className="toolbar" role="search" action="/webmaster/hub#logs">
          <input name="q" type="search" defaultValue={sp.q ?? ""} placeholder={h.searchLogs} aria-label={h.searchLogs} />
          <select name="level" defaultValue={level} aria-label={h.level}>
            <option value="">{h.allLevels}</option>
            <option value="warn">{h.warnUp}</option>
            <option value="error">{h.errorsOnly}</option>
          </select>
          <button>{t.search.search}</button>
          {(sp.q || level || before) && <Link href="/webmaster/hub#logs">{t.search.clear}</Link>}
        </form>
        <table className="logs">
          <thead><tr><th>{h.time}</th><th>{h.level}</th><th>{h.message}</th></tr></thead>
          <tbody>
            {logs.logs.length === 0 && <tr><td colSpan={3} className="empty">{h.noLogs}</td></tr>}
            {logs.logs.map((l) => (
              <tr key={l.id}>
                <td className="nowrap">{dateTime(l.ts)}</td>
                <td className="m-left"><span className={`badge badge-log-${l.level}`}>{h.levels[l.level]}</span></td>
                <td className="log-msg m-full">{l.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(logs.more || before) && (
          <div className="panel-foot log-pager">
            {before ? <Link href={logLink({ before: undefined })}>{h.newest}</Link> : <span />}
            {logs.more && <Link href={logLink({ before: logs.logs.at(-1)?.id })}>{h.older}</Link>}
          </div>
        )}
      </section>
    </>
  );
}
