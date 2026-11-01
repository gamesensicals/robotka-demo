import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import Crumbs from "@/components/Crumbs";
import { submitOr, textOf } from "@/server/actions";
import { deleteFile } from "@/server/files";
import { getCustomer, listJobs, listPhotos } from "@/server/queries";

// Detail zákazníka: údaje, jeho zákazky, úprava a zmazanie.

async function updateCustomer(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("customers.edit");
  const id = String(formData.get("id"));
  const t = (k: string) => textOf(formData, k);
  await submitOr(`/customers/${id}`, {
    type: "customer.update",
    companyId: company.id,
    customerId: id,
    patch: {
      name: String(formData.get("name") ?? ""),
      ico: t("ico"), dic: t("dic"), ic_dph: t("ic_dph"),
      address: t("address"), zip: t("zip"), city: t("city"),
      email: t("email"), phone: t("phone"),
    },
  }, user.id);
  redirect(`/customers/${id}?ok=saved`);
}

async function deleteCustomer(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("customers.delete");
  const id = String(formData.get("id"));
  const deleteJobs = formData.get("delete_jobs") === "on";
  // súbory zmazaných zákaziek sa zmažú z úložiska až po úspešnej udalosti
  const files = deleteJobs ? listJobs(company.id).filter((j) => j.customer_id === id).flatMap((j) => listPhotos(company.id, j.id)) : [];
  await submitOr(`/customers/${id}`, { type: "customer.delete", companyId: company.id, customerId: id, deleteJobs }, user.id);
  for (const f of files) await deleteFile(f.storage_path);
  redirect("/customers?ok=customer_deleted");
}

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { company, has }, { t, date }] = await Promise.all([params, requirePerm("customers.view"), getT()]);
  const cu = getCustomer(company.id, id);
  if (!cu) notFound();
  const c = t.common;
  const jobs = listJobs(company.id).filter((j) => j.customer_id === id);

  return (
    <>
      <Crumbs items={[{ label: t.customers.title, href: "/customers" }, { label: cu.name }]} />
      <section className="panel">
        <h2 className="panel-title">{cu.name}</h2>
        <dl className="stats">
          {(cu.address || cu.city) && <><dt>{c.address}</dt><dd>{[cu.address, [cu.zip, cu.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</dd></>}
          {cu.ico && <><dt>{c.ico}</dt><dd>{cu.ico}</dd></>}
          {cu.dic && <><dt>{c.dic}</dt><dd>{cu.dic}</dd></>}
          {cu.ic_dph && <><dt>{c.icDph}</dt><dd>{cu.ic_dph}</dd></>}
          {cu.email && <><dt>{c.email}</dt><dd><a href={`mailto:${cu.email}`}>{cu.email}</a></dd></>}
          {cu.phone && <><dt>{c.phone}</dt><dd><a href={`tel:${cu.phone}`}>{cu.phone}</a></dd></>}
        </dl>
        {(has("customers.edit") || has("customers.delete")) && (
          <div className="panel-foot job-tools">
            {has("customers.edit") && (
              <details className="inline-details edit-job">
                <summary className="button small">{t.customers.edit}</summary>
                <form action={updateCustomer} className="panel-body">
                  <input type="hidden" name="id" value={cu.id} />
                  <div className="fields">
                    <label className="field wide">{t.customers.nameOrPerson} <input name="name" defaultValue={cu.name} required maxLength={200} /></label>
                    <label className="field wide">{c.address} <input name="address" defaultValue={cu.address ?? ""} /></label>
                    <label className="field">{c.zip} <input name="zip" defaultValue={cu.zip ?? ""} /></label>
                    <label className="field">{c.city} <input name="city" defaultValue={cu.city ?? ""} /></label>
                    <label className="field">{c.ico} <input name="ico" defaultValue={cu.ico ?? ""} /></label>
                    <label className="field">{c.dic} <input name="dic" defaultValue={cu.dic ?? ""} /></label>
                    <label className="field">{c.icDph} <input name="ic_dph" defaultValue={cu.ic_dph ?? ""} /></label>
                    <label className="field">{c.email} <input name="email" type="email" defaultValue={cu.email ?? ""} /></label>
                    <label className="field">{c.phone} <input name="phone" defaultValue={cu.phone ?? ""} /></label>
                  </div>
                  <div className="actions" style={{ marginTop: 12 }}><button className="primary">{c.save}</button></div>
                </form>
              </details>
            )}
            {has("customers.delete") && (
              <form action={deleteCustomer} className="actions">
                <input type="hidden" name="id" value={cu.id} />
                {jobs.length > 0 && has("jobs.delete") && (
                  <label className="check"><input type="checkbox" name="delete_jobs" /> {t.customers.deleteJobsToo(jobs.length)}</label>
                )}
                <ConfirmSubmit label={t.customers.delete} className="danger small" question={t.confirm.customerQ(cu.name, jobs.length)} yes={t.customers.delete} no={t.confirm.cancel} />
              </form>
            )}
          </div>
        )}
      </section>

      {has("jobs.view") && (
        <section className="panel">
          <h2 className="panel-title">{t.jobs.title} ({jobs.length})</h2>
          <table>
            <tbody>
              {jobs.length === 0 && <tr><td className="empty">{t.customers.noJobs}</td></tr>}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/jobs/${j.id}`} className="row-title">{j.title}</Link>{j.address && <span className="muted">{j.address}</span>}</td>
                  <td className="nowrap">{date(j.job_date)}</td>
                  <td><span className={`badge badge-${j.status}`}>{t.jobStatus[j.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
