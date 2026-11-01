import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import StatusDot from "@/components/StatusDot";
import { submitOr, textOf } from "@/server/actions";
import { customerHint, customerOptions, listJobs } from "@/server/queries";
import { JOB_STATUSES, type JobStatus } from "@/server/events";
import { matches } from "@/lib/search";
import SearchSelect from "@/components/SearchSelect";

async function createJob(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("jobs.create");
  const id = randomUUID();
  await submitOr("/jobs", {
    type: "job.create",
    companyId: company.id,
    job: {
      id,
      title: String(formData.get("title") ?? ""),
      description: textOf(formData, "description"),
      address: textOf(formData, "address"),
      customer_id: textOf(formData, "customer_id"),
      job_date: String(formData.get("job_date") || new Date().toISOString().slice(0, 10)),
    },
  }, user.id);
  redirect(`/jobs/${id}`);
}

type Search = { q?: string; status?: string; new?: string };

export default async function Jobs({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ company, has }, { t, date }, sp] = await Promise.all([requirePerm("jobs.view"), getT(), searchParams]);
  const all = listJobs(company.id);
  const customers = customerOptions(company.id);
  const c = t.common;
  const q = (sp.q ?? "").trim();
  const status = sp.status === "active" || JOB_STATUSES.includes(sp.status as JobStatus) ? (sp.status as string) : "";
  const jobs = all.filter(
    (j) =>
      (status === "" || (status === "active" ? j.status !== "done" : j.status === status)) &&
      matches(q, j.title, j.address, j.description, j.customer_name)
  );
  const filtered = q !== "" || status !== "";

  return (
    <>
      <Crumbs items={[{ label: t.jobs.title }]} />

      <form className="panel toolbar" role="search">
        <input name="q" defaultValue={q} placeholder={t.search.jobsPlaceholder} aria-label={t.search.search} />
        <select name="status" defaultValue={status} aria-label={c.status}>
          <option value="">{t.search.allStatuses}</option>
          <option value="active">{t.search.activeOnly}</option>
          {JOB_STATUSES.map((s) => <option key={s} value={s}>{t.jobStatus[s]}</option>)}
        </select>
        <button>{t.search.search}</button>
        {filtered && <Link href="/jobs">{t.search.clear}</Link>}
      </form>

      {/* formulár je schovaný, kým ho používateľ neotvorí (alebo nepríde z tlačidla Nová zákazka) */}
      {has("jobs.create") && <details className="panel create" open={sp.new === "1"}>
        <summary className="panel-title">＋ {t.jobs.newJob}</summary>
        <form action={createJob} className="panel-body">
          <fieldset>
            <legend>{t.jobs.details}</legend>
            <div className="fields">
              <label className="field wide">{t.jobs.jobTitle} <input name="title" required /></label>
              <label className="field">{c.date} <input name="job_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label className="field">{c.customer}
                <SearchSelect
                  name="customer_id" emptyLabel={c.chooseCustomer} placeholder={t.search.typeToSearch} noMatch={t.search.nothing} ariaLabel={c.customer}
                  options={customers.map((cu) => ({ value: cu.id, label: cu.name, hint: customerHint(cu) }))}
                />
              </label>
              <label className="field wide">{c.address} <input name="address" /></label>
              <label className="field wide">{c.description} <textarea name="description" /></label>
            </div>
          </fieldset>
          <div className="actions"><button className="primary">{c.create}</button></div>
        </form>
      </details>}

      <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{t.jobs.title}</span>
          {filtered && <span className="title-stats">{t.search.found(jobs.length, all.length)}</span>}
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th className="dotcol" /><th>{t.jobs.job}</th><th>{c.customer}</th><th>{c.date}</th><th>{c.status}</th></tr>
            </thead>
            <tbody>
              {!jobs.length && <tr><td colSpan={5} className="empty">{filtered ? t.search.nothing : t.jobs.empty}</td></tr>}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="dotcol"><StatusDot active={j.status !== "done"} /></td>
                  <td>
                    <Link href={`/jobs/${j.id}`} className="row-title">{j.title}</Link>
                    {j.address && <span className="muted">{j.address}</span>}
                  </td>
                  <td>{j.customer_name ?? ""}</td>
                  <td className="nowrap">{date(j.job_date)}</td>
                  <td><span className={`badge badge-${j.status}`}>{t.jobStatus[j.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
