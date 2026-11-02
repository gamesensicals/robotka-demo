import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext, requirePerm } from "@/lib/company";
import { fmtHours, parseHours, timeLocked } from "@/lib/hours";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr, textOf } from "@/server/actions";
import { nextMonth, prevMonth } from "@/server/billing";
import { listJobs, listMembers, loginName, monthTime } from "@/server/queries";
import SearchSelect from "@/components/SearchSelect";

const monthOf = (m?: string) => (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : new Date().toISOString().slice(0, 7));

async function addTime(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const back = `/time?m=${monthOf(String(formData.get("m") ?? ""))}`;
  const minutes = parseHours(String(formData.get("hours") ?? ""));
  if (!minutes || minutes > 24 * 60) fail(back, "bad_hours");
  await submitOr(back, {
    type: "time.add",
    companyId: company.id,
    entry: {
      id: randomUUID(), job_id: String(formData.get("job_id")), user_id: textOf(formData, "user_id"),
      work_date: String(formData.get("work_date") || new Date().toISOString().slice(0, 10)), minutes, note: textOf(formData, "note"),
      material: textOf(formData, "material"),
    },
  }, user.id);
  redirect(`${back}&ok=saved`);
}

async function deleteTime(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const back = `/time?m=${monthOf(String(formData.get("m") ?? ""))}`;
  await submitOr(back, { type: "time.delete", companyId: company.id, entryId: String(formData.get("id")) }, user.id);
  redirect(`${back}&ok=time_deleted`);
}

/** Dochádzka: každý zapisuje svoje hodiny na zákazkách; majiteľ/správca vidí súčty za mesiac pre výplaty a faktúry. */
export default async function Time({ searchParams }: { searchParams: Promise<{ m?: string; user?: string }> }) {
  const [{ company, user, has, role }, { t, date, locale }, sp] = await Promise.all([requirePerm("time.own", "time.others", "time.all"), getT(), searchParams]);
  // „všetci“ = hodiny celej firmy a export; inak len vlastné
  const isManager = has("time.all");
  const canOthers = has("time.others");
  const tm = t.time;
  const c = t.common;
  const month = monthOf(sp.m);
  const filterUser = isManager ? sp.user || undefined : user.id; // zamestnanec vidí len seba
  const entries = monthTime(company.id, month, filterUser);
  const all = isManager ? monthTime(company.id, month) : entries;
  const jobs = listJobs(company.id);
  const activeJobs = [...jobs.filter((j) => j.status !== "done"), ...jobs.filter((j) => j.status === "done")];
  const members = canOthers ? listMembers(company.id) : [];
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  // súčty pre majiteľa/správcu
  const byPerson = new Map<string, { name: string; minutes: number; days: Set<string> }>();
  const byJob = new Map<string, { id: string | null; title: string; minutes: number }>();
  for (const e of all) {
    const p = byPerson.get(e.user_id) ?? { name: e.user_name, minutes: 0, days: new Set<string>() };
    p.minutes += e.minutes;
    p.days.add(e.work_date);
    byPerson.set(e.user_id, p);
    // zmazaná zákazka: zoskupí sa podľa pôvodného názvu
    const key = e.job_id ?? `deleted:${e.job_title}`;
    const jb = byJob.get(key) ?? { id: e.job_id, title: e.job_title, minutes: 0 };
    jb.minutes += e.minutes;
    byJob.set(key, jb);
  }
  const q = (extra: Record<string, string>) => `/time?${new URLSearchParams({ m: month, ...(filterUser && isManager ? { user: filterUser } : {}), ...extra })}`;

  return (
    <>
      <Crumbs items={[{ label: tm.title }]} />

      <section className="panel toolbar">
        <Link href={`/time?m=${prevMonth(month)}`} className="button">←</Link>
        <strong className="month-label">{monthLabel}</strong>
        <Link href={`/time?m=${nextMonth(month)}`} className="button">→</Link>
        <span className="title-stats">{tm.total}: <b>{fmtHours(total, locale)} h</b></span>
        {isManager && <a href={`/time/export?m=${month}`} className="button" style={{ marginLeft: "auto" }}>{tm.export}</a>}
      </section>

      {(has("time.own") || canOthers) && (
      <form action={addTime} className="panel">
        <h2 className="panel-title">{tm.logTitle}</h2>
        <div className="panel-body">
          <input type="hidden" name="m" value={month} />
          <div className="fields time-fields">
            <label className="field wide">{t.jobs.job}
              <SearchSelect
                name="job_id" required placeholder={tm.chooseJob} noMatch={t.search.nothing} ariaLabel={t.jobs.job}
                options={activeJobs.map((j) => ({ value: j.id, label: j.title, hint: [j.customer_name, date(j.job_date), t.jobStatus[j.status]].filter(Boolean).join(" · ") }))}
              />
            </label>
            <label className="field">{c.date} <input type="date" name="work_date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
            <label className="field">{tm.hours} <input name="hours" inputMode="decimal" placeholder={tm.hoursPh} required /></label>
            {canOthers && (
              <label className="field">{tm.person}
                <SearchSelect
                  name="user_id" defaultValue={user.id} required placeholder={t.search.typeToSearch} noMatch={t.search.nothing} ariaLabel={tm.person}
                  options={members.map((m) => ({ value: m.id, label: `${loginName(m)}${m.id === user.id ? ` (${tm.me})` : ""}`, hint: t.role[m.role] }))}
                />
              </label>
            )}
            <label className="field">{tm.note} <input name="note" maxLength={500} placeholder={tm.notePh} /></label>
            <label className="field wide">{tm.material} <textarea name="material" rows={2} maxLength={2000} placeholder={tm.materialPh} /></label>
          </div>
          <div className="actions" style={{ marginTop: 12 }}><button className="primary">{tm.add}</button></div>
        </div>
      </form>
      )}

      {isManager && (
        <div className="cols-2">
          <section className="panel">
            <h2 className="panel-title">{tm.byPerson}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{tm.person}</th><th className="num">{tm.days}</th><th className="num">{tm.hours}</th></tr></thead>
                <tbody>
                  {byPerson.size === 0 && <tr><td colSpan={3} className="empty">{tm.noEntries}</td></tr>}
                  {[...byPerson.entries()].sort((a, b) => b[1].minutes - a[1].minutes).map(([id, p]) => (
                    <tr key={id}>
                      <td><Link href={`/time?m=${month}&user=${id}`} className="row-title">{p.name}</Link></td>
                      <td className="num">{p.days.size}</td>
                      <td className="num">{fmtHours(p.minutes, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">{tm.byJob}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t.jobs.job}</th><th className="num">{tm.hours}</th></tr></thead>
                <tbody>
                  {byJob.size === 0 && <tr><td colSpan={2} className="empty">{tm.noEntries}</td></tr>}
                  {[...byJob.values()].sort((a, b) => b.minutes - a.minutes).map((jb) => (
                    <tr key={jb.id ?? jb.title}>
                      <td>{jb.id ? <Link href={`/jobs/${jb.id}#time`} className="row-title">{jb.title}</Link> : <span className="row-title muted">{jb.title}</span>}</td>
                      <td className="num">{fmtHours(jb.minutes, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{isManager ? (filterUser ? `${tm.entries} – ${entries[0]?.user_name ?? ""}` : tm.entries) : tm.myHours}</span>
          {isManager && filterUser && <Link href={q({ user: "" }).replace("&user=", "")} className="title-stats">{t.search.clear}</Link>}
        </h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{c.date}</th>{isManager && <th>{tm.person}</th>}<th>{t.jobs.job}</th><th className="num">{tm.hours}</th><th>{tm.note}</th><th /></tr></thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={6} className="empty">{tm.noEntries}</td></tr>}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{date(e.work_date)}</td>
                  {isManager && <td className="m-left">{e.user_name}{e.created_by_name && <span className="muted by">{tm.loggedBy(e.created_by_name)}</span>}</td>}
                  <td className="m-left">{e.job_id ? <Link href={`/jobs/${e.job_id}#time`}>{e.job_title}</Link> : <span className="muted">{e.job_title}</span>}</td>
                  <td className="num">{fmtHours(e.minutes, locale)}</td>
                  <td>
                    {e.note ?? ""}
                    {e.material && <span className="muted material">{tm.material}: {e.material}</span>}
                  </td>
                  <td className="num">
                    {(canOthers || (e.user_id === user.id && has("time.own"))) && !timeLocked(e.work_date, role === "owner") && (
                      <form action={deleteTime}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="m" value={month} />
                        <ConfirmSubmit label={c.delete} className="danger small" question={t.confirm.timeQ} yes={c.delete} no={t.confirm.cancel} />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
