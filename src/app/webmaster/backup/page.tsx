import { requireWebmaster } from "@/lib/company";
import { fmtBytes } from "@/lib/format";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import AutoRefresh from "@/components/support/AutoRefresh";
import BackupKey from "@/components/webmaster/BackupKey";
import BackupTest from "@/components/webmaster/BackupTest";
import { type BackupOverview, backupOverview } from "@/server/hub-admin";
import { cancel, runNow, saveConfig } from "./actions";

const INTERVALS = [1, 2, 3, 6, 12, 24, 48, 168];
const FULL_EVERY = [1, 3, 7, 14, 30];

export default async function BackupPage() {
  const [, { t, locale, dateTime }] = await Promise.all([requireWebmaster(), getT()]);
  const b = t.backup;
  const crumbs = <Crumbs items={[{ label: t.webmaster.title, href: "/webmaster" }, { label: b.title }]} />;

  let o: BackupOverview;
  try {
    o = await backupOverview();
  } catch (e) {
    return (
      <>
        {crumbs}
        <section className="panel">
          <h2 className="panel-title">{b.title}</h2>
          <div className="panel-body"><p role="alert" className="alert">{t.hub.unreachable}: {e instanceof Error ? e.message : String(e)}</p></div>
        </section>
      </>
    );
  }
  const c = o.config;
  const s = o.state;
  const job = s.job;
  const mb = (n: number) => fmtBytes(n, locale);
  const duration = (from: number, to: number | null) => {
    const sec = Math.round(((to ?? Date.now()) - from) / 1000);
    return sec < 120 ? `${sec} s` : `${Math.round(sec / 60)} min`;
  };

  return (
    <>
      {crumbs}
      {job && <AutoRefresh seconds={5} />}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{b.title}</span>
          <span className="title-stats">
            {!o.configured ? b.notSet : c.enabled ? b.enabledShort : b.disabledShort}
          </span>
        </h2>
        {!o.configured && <div className="panel-body"><p className="notice">{b.notConfigured}</p></div>}
        <dl className="stats">
          <dt>{b.lastOk}</dt><dd>{s.lastOkAt ? dateTime(s.lastOkAt) : b.never}</dd>
          <dt>{b.next}</dt><dd>{job ? b.runningNow : s.nextRunAt ? dateTime(s.nextRunAt) : "–"}</dd>
          <dt>{b.lastFull}</dt><dd>{s.lastFullAt ? dateTime(s.lastFullAt) : b.never}</dd>
          <dt>{b.eventsBacked}</dt><dd>{b.ofTotal(o.events.backedUp, o.events.last)}</dd>
          <dt>{b.filesBacked}</dt><dd>{b.ofTotal(o.files.backedUp, o.files.total)} · {mb(o.files.backupBytes)}</dd>
          <dt>{b.deletedKept}</dt><dd>{o.files.deletedKept}</dd>
          {s.lastError && <><dt>{b.lastError}</dt><dd className="bad-text">{s.lastError}</dd></>}
        </dl>
        {job && (
          <div className="panel-body">
            <p role="status" className="notice">
              {b.running(job.runId, b.kinds[job.kind as "incremental" | "full"] ?? job.kind)}: {b.phases[job.phase as keyof typeof b.phases] ?? job.phase} ·{" "}
              {b.progress(job.events, job.files, mb(job.bytes))}
              {job.failures > 0 && ` · ${b.retrying(job.failures)}`}
            </p>
          </div>
        )}
        <div className="panel-foot backup-actions">
          <form action={runNow} className="actions">
            <button className="primary" name="kind" value="incremental" disabled={!o.configured || !!job}>{b.runNow}</button>
            <button name="kind" value="full" disabled={!o.configured || !!job}>{b.runFull}</button>
          </form>
          {job && (
            <form action={cancel}>
              <ConfirmSubmit label={b.cancel} question={t.confirm.cancelBackupQ} yes={b.cancel} no={t.confirm.cancel} className="danger" />
            </form>
          )}
        </div>
        <div className="panel-body">
          <BackupTest labels={{ test: b.test, testing: b.testing, ok: b.testOk, failed: b.testFailed, steps: b.steps }} />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">{b.key}</h2>
        <div className="panel-body">
          <BackupKey
            keyId={c.keyId}
            setId={c.setId}
            labels={{
              keyId: b.keyId,
              set: b.set,
              noKey: b.noKey,
              warning: b.keyWarning,
              generate: b.generate,
              generateQ: t.confirm.newKeyQ,
              setOwn: b.setOwn,
              ownPh: b.ownPh,
              reveal: b.reveal,
              revealQ: t.confirm.revealKeyQ,
              shown: b.keyShown,
              newSet: b.newSet,
              copy: b.copy,
              copied: b.copied,
              download: b.download,
              cancel: t.confirm.cancel,
              errors: t.errors,
            }}
          />
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">{b.settings}</h2>
        <form action={saveConfig} className="panel-body">
          <fieldset>
            <legend>{b.storage}</legend>
            <div className="fields">
              <label className="field wide">{b.endpoint} <input name="endpoint" type="url" defaultValue={c.endpoint} placeholder="https://s3.eu-central-2.wasabisys.com" /></label>
              <label className="field">{b.region} <input name="region" defaultValue={c.region} placeholder="eu-central-2" /></label>
              <label className="field">{b.bucket} <input name="bucket" defaultValue={c.bucket} /></label>
              <label className="field">{b.prefix} <input name="prefix" defaultValue={c.prefix} /></label>
              <label className="field">{b.accessKey} <input name="accessKeyId" defaultValue={c.accessKeyId} autoComplete="off" spellCheck={false} /></label>
              <label className="field">{b.secretKey}
                <input name="secretAccessKey" type="password" autoComplete="new-password" placeholder={c.hasSecret ? b.secretKept(c.secretHint ?? "") : ""} />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{b.schedule}</legend>
            <div className="fields">
              <label className="field">{b.interval}
                <select name="intervalHours" defaultValue={c.intervalHours}>
                  {[...new Set([...INTERVALS, c.intervalHours])].sort((x, y) => x - y).map((h) => <option key={h} value={h}>{b.hours(h)}</option>)}
                </select>
              </label>
              <label className="field">{b.fullEvery}
                <select name="fullEveryDays" defaultValue={c.fullEveryDays}>
                  {[...new Set([...FULL_EVERY, c.fullEveryDays])].sort((x, y) => x - y).map((d) => <option key={d} value={d}>{b.days(d)}</option>)}
                </select>
              </label>
              <label className="field">{b.keepFull} <input name="keepFull" type="number" min={1} max={52} defaultValue={c.keepFull} /></label>
              <label className="field">{b.retention} <input name="deletedRetentionDays" type="number" min={0} max={3650} defaultValue={c.deletedRetentionDays} /></label>
              <label className="check wide"><input type="checkbox" name="includeFiles" defaultChecked={c.includeFiles} /> {b.includeFiles}</label>
              <label className="check wide"><input type="checkbox" name="enabled" defaultChecked={c.enabled} /> {b.enable}</label>
            </div>
            <p className="muted small-note" style={{ marginTop: 12 }}>{b.scheduleHint}</p>
          </fieldset>
          <div className="actions"><button className="primary">{t.common.save}</button></div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{b.history}</span>
          <span className="title-stats">{b.fullsKept(s.fulls.length)}</span>
        </h2>
        <table>
          <thead>
            <tr><th>#</th><th>{b.started}</th><th>{t.common.status}</th><th className="num">{b.uploaded}</th><th className="hide-sm">{b.detail}</th></tr>
          </thead>
          <tbody>
            {o.runs.length === 0 && <tr><td colSpan={5} className="empty">{b.noRuns}</td></tr>}
            {o.runs.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td className="nowrap">
                  {dateTime(r.started_at)}
                  <span className="muted by">{b.kinds[r.kind]} · {b.triggers[r.trigger]} · {duration(r.started_at, r.finished_at)}</span>
                </td>
                <td><span className={`badge badge-${r.status}`}>{b.statuses[r.status]}</span></td>
                <td className="num">
                  {mb(r.bytes)}
                  <span className="muted by">{b.progress(r.events, r.files, "")}</span>
                </td>
                <td className="hide-sm log-msg">{r.error ?? (r.pruned ? b.pruned(r.pruned) : "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="panel-body"><p className="muted small-note">{b.restoreHint}</p></div>
      </section>
    </>
  );
}
