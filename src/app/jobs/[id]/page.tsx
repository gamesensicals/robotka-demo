import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContext, requirePerm } from "@/lib/company";
import { fmtHours, parseHours, timeLocked } from "@/lib/hours";
import { getT } from "@/i18n";
import Crumbs from "@/components/Crumbs";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import MediaUpload from "@/components/MediaUpload";
import { fail, submitOr, textOf } from "@/server/actions";
import { JOB_STATUSES, type JobStatus } from "@/server/events";
import { deleteFile, signedFileUrl } from "@/server/files";
import { customerHint, customerOptions, getJob, getPhoto, jobTime, listMembers, listPhotos, loginName } from "@/server/queries";
import SearchSelect from "@/components/SearchSelect";

async function deletePhoto(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const photo = getPhoto(company.id, String(formData.get("id")));
  if (!photo) fail("/jobs", "not_found");
  const back = `/jobs/${photo.job_id}`;
  await submitOr(back, { type: "photo.delete", companyId: company.id, photoId: photo.id }, user.id);
  await deleteFile(photo.storage_path); // mazanie v úložisku je zadarmo
  redirect(`${back}?ok=photo_deleted`);
}

async function setStatus(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const jobId = String(formData.get("job_id"));
  const back = `/jobs/${jobId}`;
  await submitOr(back, { type: "job.setStatus", companyId: company.id, jobId, status: String(formData.get("status")) as JobStatus }, user.id);
  redirect(back);
}

async function updateJob(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("jobs.edit");
  const jobId = String(formData.get("job_id"));
  const back = `/jobs/${jobId}`;
  await submitOr(back, {
    type: "job.update",
    companyId: company.id,
    jobId,
    patch: {
      title: String(formData.get("title") ?? ""),
      description: textOf(formData, "description"),
      address: textOf(formData, "address"),
      customer_id: textOf(formData, "customer_id"),
      job_date: String(formData.get("job_date") ?? ""),
    },
  }, user.id);
  redirect(`${back}?ok=saved`);
}

/** Zmazanie zákazky: najprv udalosť (hodiny ostanú, faktúry ostanú), potom súbory v úložisku (zadarmo). */
async function deleteJob(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("jobs.delete");
  const jobId = String(formData.get("job_id"));
  const files = listPhotos(company.id, jobId);
  await submitOr(`/jobs/${jobId}`, { type: "job.delete", companyId: company.id, jobId }, user.id);
  for (const f of files) await deleteFile(f.storage_path);
  redirect("/jobs?ok=job_deleted");
}

async function addTime(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const jobId = String(formData.get("job_id"));
  const back = `/jobs/${jobId}#time`;
  const minutes = parseHours(String(formData.get("hours") ?? ""));
  if (!minutes || minutes > 24 * 60) fail(back, "bad_hours");
  await submitOr(back, {
    type: "time.add",
    companyId: company.id,
    entry: {
      id: randomUUID(), job_id: jobId, user_id: textOf(formData, "user_id"),
      work_date: String(formData.get("work_date") || new Date().toISOString().slice(0, 10)), minutes, note: textOf(formData, "note"),
      material: textOf(formData, "material"),
    },
  }, user.id);
  redirect(`/jobs/${jobId}?ok=saved#time`);
}

async function deleteTime(formData: FormData) {
  "use server";
  const { company, user } = await getContext();
  const jobId = String(formData.get("job_id"));
  await submitOr(`/jobs/${jobId}#time`, { type: "time.delete", companyId: company.id, entryId: String(formData.get("id")) }, user.id);
  redirect(`/jobs/${jobId}?ok=time_deleted#time`);
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ company, has, user, role }, { t, date, locale }] = await Promise.all([requirePerm("jobs.view"), getT()]);

  const job = getJob(company.id, id);
  if (!job) notFound();
  const photos = listPhotos(company.id, id);
  const entries = jobTime(company.id, id);
  const members = has("time.others") ? listMembers(company.id) : [];
  const today = new Date().toISOString().slice(0, 10);

  // zoskupenie súborov podľa dátumu
  const byDate = new Map<string, typeof photos>();
  photos.forEach((p) => byDate.set(p.taken_on, [...(byDate.get(p.taken_on) ?? []), p]));
  // súčty hodín podľa ľudí
  const perPerson = new Map<string, number>();
  entries.forEach((e) => perPerson.set(e.user_name, (perPerson.get(e.user_name) ?? 0) + e.minutes));
  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
  const c = t.common;
  const tm = t.time;
  const j = t.jobs;

  return (
    <>
      <Crumbs items={[{ label: j.title, href: "/jobs" }, { label: job.title }]} />

      <section className="panel">
        <h2 className="panel-title">{job.title}</h2>
        <div className="panel-body">
          <dl className="stats" style={{ padding: 0, marginBottom: 14 }}>
            <dt>{c.date}</dt><dd>{date(job.job_date)}</dd>
            {job.customer_name && <><dt>{c.customer}</dt><dd>{job.customer_name}</dd></>}
            {job.address && <><dt>{c.address}</dt><dd>{job.address}</dd></>}
            <dt>{tm.total}</dt><dd>{fmtHours(totalMinutes, locale)} h</dd>
          </dl>
          {job.description && <p style={{ whiteSpace: "pre-line" }}>{job.description}</p>}
          {has("jobs.status") ? (
            <form action={setStatus} className="actions">
              <input type="hidden" name="job_id" value={id} />
              <select name="status" defaultValue={job.status} aria-label={c.status} style={{ width: "auto" }}>
                {JOB_STATUSES.map((s) => <option key={s} value={s}>{t.jobStatus[s]}</option>)}
              </select>
              <button>{c.changeStatus}</button>
            </form>
          ) : (
            <p><span className={`badge badge-${job.status}`}>{t.jobStatus[job.status]}</span></p>
          )}
        </div>
        {(has("jobs.edit") || has("jobs.delete")) && (
          <div className="panel-foot job-tools">
            {has("jobs.edit") && (
              <details className="inline-details edit-job">
                <summary className="button small">{j.edit}</summary>
                <form action={updateJob} className="panel-body">
                  <input type="hidden" name="job_id" value={id} />
                  <div className="fields">
                    <label className="field wide">{j.jobTitle} <input name="title" defaultValue={job.title} required maxLength={200} /></label>
                    <label className="field">{c.date} <input type="date" name="job_date" defaultValue={job.job_date} required /></label>
                    <label className="field">{c.customer}
                      <SearchSelect
                        name="customer_id" defaultValue={job.customer_id ?? ""} emptyLabel={c.chooseCustomer} placeholder={t.search.typeToSearch}
                        noMatch={t.search.nothing} ariaLabel={c.customer}
                        options={customerOptions(company.id).map((o) => ({ value: o.id, label: o.name, hint: customerHint(o) }))}
                      />
                    </label>
                    <label className="field wide">{c.address} <input name="address" defaultValue={job.address ?? ""} maxLength={300} /></label>
                    <label className="field wide">{c.description} <textarea name="description" defaultValue={job.description ?? ""} rows={3} maxLength={4000} /></label>
                  </div>
                  <div className="actions" style={{ marginTop: 12 }}><button className="primary">{c.save}</button></div>
                </form>
              </details>
            )}
            {has("jobs.delete") && (
              <form action={deleteJob}>
                <input type="hidden" name="job_id" value={id} />
                <ConfirmSubmit
                  label={j.deleteJob}
                  className="danger small"
                  question={t.confirm.jobQ(job.title, photos.length, totalMinutes ? `${fmtHours(totalMinutes, locale)} h` : "")}
                  yes={j.deleteJob}
                  no={t.confirm.cancel}
                />
              </form>
            )}
          </div>
        )}
      </section>

      <section className="panel" id="time">
        <h2 className="panel-title spread-title">
          <span>{tm.logTitle}</span>
          {perPerson.size > 0 && (
            <span className="title-stats">
              {[...perPerson.entries()].map(([name, min]) => `${name} ${fmtHours(min, locale)} h`).join(" · ")}
            </span>
          )}
        </h2>
        {(has("time.own") || has("time.others")) && (
        <form action={addTime} className="panel-body">
          <input type="hidden" name="job_id" value={id} />
          <div className="fields time-fields">
            <label className="field">{c.date} <input type="date" name="work_date" defaultValue={today} required /></label>
            <label className="field">{tm.hours} <input name="hours" inputMode="decimal" placeholder={tm.hoursPh} required /></label>
            {has("time.others") && (
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
        </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>{c.date}</th><th>{tm.person}</th><th className="num">{tm.hours}</th><th>{tm.note}</th><th /></tr></thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={5} className="empty">{tm.noEntries}</td></tr>}
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{date(e.work_date)}</td>
                  <td>{e.user_name}{e.created_by_name && <span className="muted by">{tm.loggedBy(e.created_by_name)}</span>}</td>
                  <td className="num">{fmtHours(e.minutes, locale)}</td>
                  <td>
                    {e.note ?? ""}
                    {e.material && <span className="muted material">{tm.material}: {e.material}</span>}
                  </td>
                  <td className="num">
                    {(has("time.others") || (e.user_id === user.id && has("time.own"))) && !timeLocked(e.work_date, role === "owner") && (
                      <form action={deleteTime}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="job_id" value={id} />
                        <ConfirmSubmit label={c.delete} className="danger small" question={t.confirm.timeQ} yes={c.delete} no={t.confirm.cancel} />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {has("invoices.create") && totalMinutes > 0 && (
          <div className="panel-foot">
            <Link href={`/admin/invoices/new?job=${id}&hours=${Math.round((totalMinutes / 60) * 100) / 100}`}>
              {tm.invoiceHours(fmtHours(totalMinutes, locale))} →
            </Link>
          </div>
        )}
      </section>

      {has("files.upload") && <section className="panel">
        <h2 className="panel-title">{j.uploadTitle}</h2>
        <div className="panel-body">
          <MediaUpload
            jobId={id}
            today={today}
            locale={locale}
            errors={t.errors}
            labels={{
              dropTitle: j.dropTitle, dropOr: j.dropOr, limits: j.limits, shrink: j.shrink, takenOn: j.takenOn, caption: j.caption,
              upload: j.uploadN, remove: c.delete, uploading: j.uploading, done: j.uploadDone, failed: j.uploadFailed, uploaded: j.uploaded,
            }}
          />
        </div>
      </section>}

      <section className="panel">
        <h2 className="panel-title">{j.photos}</h2>
        <div className="panel-body">
          {byDate.size === 0 && <p className="muted">{j.noPhotos}</p>}
          {[...byDate.entries()].map(([day, list]) => (
            <div key={day} className="photo-day">
              <h3>{date(day)}</h3>
              <div className="photos">
                {list.map((p) => {
                  const url = signedFileUrl(p.storage_path);
                  const mime = p.mime ?? "image/jpeg";
                  return (
                    <figure key={p.id}>
                      {mime.startsWith("video/") ? (
                        // preload="none": video sa stiahne až po kliknutí na prehrať
                        <video src={url} controls preload="none" playsInline />
                      ) : mime === "application/pdf" ? (
                        <a href={url} target="_blank" rel="noreferrer" className="doc">
                          <div><span>PDF</span><small>{p.file_name ?? ""}</small></div>
                        </a>
                      ) : (
                        <a href={url} target="_blank" rel="noreferrer">
                          {/* lazy: fotka sa načíta, až keď k nej používateľ zoskroluje */}
                          <img src={url} alt={p.caption ?? j.photoAlt} loading="lazy" decoding="async" />
                        </a>
                      )}
                      {p.caption && <figcaption>{p.caption}</figcaption>}
                      {(has("files.delete") || p.uploaded_by === user.id) && (
                        <form action={deletePhoto}>
                          <input type="hidden" name="id" value={p.id} />
                          <ConfirmSubmit label={c.delete} className="danger small" question={t.confirm.fileQ} yes={c.delete} no={t.confirm.cancel} />
                        </form>
                      )}
                    </figure>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
