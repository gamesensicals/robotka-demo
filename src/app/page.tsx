import Link from "next/link";
import { MAIN_TERMS } from "@/lib/main-site";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/company";
import { submitOr } from "@/server/actions";
import { getT } from "@/i18n";
import StatusDot from "@/components/StatusDot";
import { monthEstimate } from "@/server/credits";
import { invoiceTotals, isReadOnly, priceNotice, jobStatusCounts, listCategories, listInvoices, listJobs, listPrices, monthTime } from "@/server/queries";
import { fmtHours } from "@/lib/hours";
import InvoiceTable from "./admin/invoices/invoice-table";

const PRICE_ROWS = 12;

/** „Rozumiem“ pri oznámení o zmene cien (bublina zmizne len tomuto majiteľovi). */
async function ackPrice(formData: FormData) {
  "use server";
  const { user, role } = await getContext();
  if (role !== "owner") redirect("/");
  await submitOr("/", { type: "price.ack", changeId: String(formData.get("id")) }, user.id);
  redirect("/");
}

// Prehľad: to, čo sa robí najčastejšie (nová zákazka/faktúra), rozbehnuté zákazky,
// a pre majiteľa/správcu faktúry, kredity a cenník. Nič z hlavičky sa tu neopakuje.
export default async function Home() {
  const [{ company, has, role, user }, { t, date, money, credits, locale }] = await Promise.all([getContext(), getT()]);
  const showJobs = has("jobs.view");
  const showInvoices = has("invoices.view");
  const showCredits = has("company.credits");
  const showPrices = has("prices.view");
  const h = t.home;

  const active = showJobs ? listJobs(company.id).filter((j) => j.status !== "done") : [];
  const counts = jobStatusCounts(company.id);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const prices = showPrices ? listPrices(company.id) : [];
  const catNames = new Map(listCategories(company.id).map((c) => [c.id, c.name]));
  // člen tímu: jeho hodiny za tento mesiac
  const month = new Date().toISOString().slice(0, 7);
  const showMyTime = role === "member" && has("time.own");
  const myTime = showMyTime ? monthTime(company.id, month, user.id) : [];
  const myTotal = myTime.reduce((sum, e) => sum + e.minutes, 0);
  // obdobie, za ktoré sa hodiny počítajú: 1. deň mesiaca – posledný deň mesiaca
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const period = `${date(`${month}-01`)} – ${date(`${month}-${String(lastDay).padStart(2, "0")}`)}`;
  const invoices = showInvoices ? listInvoices(company.id, 5) : [];
  const unpaid = showInvoices ? invoiceTotals(company.id).filter((i) => i.status === "draft" || i.status === "sent") : [];
  const est = showCredits ? monthEstimate(company) : null;
  // firma s vlastnou cenou prevádzky vidí len zmenu ceny úložiska
  const ownPrice = company.fee_cents != null || company.fee_mode != null;
  const notice = role === "owner" ? priceNotice(user.id, ownPrice) : undefined;
  const feeUnit = (m: string | null) => (m === "per_company" ? t.request.perMonth : t.request.perPersonMonth);

  return (
    <>
      {notice && (
        <section className="price-bubble" role="status" aria-live="polite">
          <p className="bubble-title">
            {notice.status === "applied" ? h.priceApplied(date(notice.effective_at.slice(0, 10))) : h.priceComing(date(notice.effective_at.slice(0, 10)))}
          </p>
          <ul>
            {!ownPrice && (notice.old_fee_cents !== notice.new_fee_cents || (notice.old_mode ?? null) !== (notice.new_mode ?? null)) && (
              <li>{h.priceFee(`${credits(notice.old_fee_cents)} ${feeUnit(notice.old_mode)}`, `${credits(notice.new_fee_cents)} ${feeUnit(notice.new_mode)}`)}</li>
            )}
            {notice.old_storage_cents !== notice.new_storage_cents && <li>{h.priceStorage(credits(notice.old_storage_cents), credits(notice.new_storage_cents))}</li>}
          </ul>
          <div className="bubble-foot">
            <span>{h.priceCredit} <a href={MAIN_TERMS}>{t.app.terms}</a></span>
            <form action={ackPrice}>
              <input type="hidden" name="id" value={notice.id} />
              <button className="small">{h.understood}</button>
            </form>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-body quick">
          {has("jobs.create") && <Link href="/jobs?new=1" className="button primary">＋ {t.jobs.newJob}</Link>}
          {(has("time.own") || has("time.others")) && <Link href="/time" className="button primary">＋ {t.time.logShort}</Link>}
          {has("invoices.create") && <Link href="/admin/invoices/new" className="button primary">＋ {t.invoices.newInvoice}</Link>}
          {showPrices && <Link href="/admin/prices" className="button">{t.prices.title}</Link>}
          {showCredits && (
            <Link href="/admin/credits" className="button">
              {t.credits.title}: <span className={company.credit_cents < 0 ? "neg" : "pos"}>{credits(company.credit_cents)}</span>
            </Link>
          )}
        </div>
      </section>

      {showJobs && <section className="panel">
        <h2 className="panel-title spread-title">
          <span>{h.activeJobs}</span>
          <span className="title-stats">
            {h.openJobs} <b>{count("open")}</b> · {h.waitingJobs} <b>{count("waiting")}</b> · {h.doneJobs} <b>{count("done")}</b>
          </span>
        </h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th className="dotcol" /><th>{t.jobs.job}</th><th>{t.common.customer}</th><th>{t.common.date}</th><th>{t.common.status}</th></tr></thead>
            <tbody>
              {active.length === 0 && <tr><td colSpan={5} className="empty">{h.noActiveJobs}</td></tr>}
              {active.slice(0, 10).map((j) => (
                <tr key={j.id}>
                  <td className="dotcol"><StatusDot active /></td>
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
        <div className="panel-foot"><Link href="/jobs">{h.allJobs} →</Link></div>
      </section>}

      {(showInvoices || est) && (
        <div className={showInvoices && est ? "cols-2 wide-left" : "stack"}>
          {showInvoices && <section className="panel">
            <h2 className="panel-title spread-title">
              <span>{t.admin.recentInvoices}</span>
              <span className="title-stats">{h.unpaid} <b>{unpaid.length}</b> · {money(unpaid.reduce((s, i) => s + Number(i.total_gross), 0))}</span>
            </h2>
            <InvoiceTable invoices={invoices} />
            <div className="panel-foot"><Link href="/admin/invoices">{h.allInvoices} →</Link></div>
          </section>}

          {est && <section className="panel">
            <h2 className="panel-title">{t.credits.title}</h2>
            <div className="panel-body">
              <p className={`big-number ${company.credit_cents < 0 ? "neg" : ""}`}>{credits(company.credit_cents)}</p>
              <p className="muted">{isReadOnly(company) ? t.credits.readOnly : t.credits.active}</p>
              <p>{t.credits.nextCharge}: <b>{credits(est.feeCents + est.storageCents)}</b></p>
              <Link href="/admin/credits" className="button primary">{t.readOnly.topUp}</Link>
            </div>
          </section>}
        </div>
      )}

      {showMyTime && (
        <section className="panel">
          <h2 className="panel-title spread-title">
            <span>{h.myHours} <span className="muted period">({period})</span></span>
            <span className="title-stats">{t.time.total}: <b>{fmtHours(myTotal, locale)} h</b></span>
          </h2>
          <table>
            <thead><tr><th>{t.common.date}</th><th>{t.jobs.job}</th><th className="num">{t.time.hours}</th><th>{t.time.material}</th></tr></thead>
            <tbody>
              {myTime.length === 0 && <tr><td colSpan={4} className="empty">{t.time.noEntries}</td></tr>}
              {myTime.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{date(e.work_date)}</td>
                  <td className="m-left">{e.job_id ? <Link href={`/jobs/${e.job_id}#time`} className="row-title">{e.job_title}</Link> : <span className="row-title muted">{e.job_title}</span>}{e.note && <span className="muted">{e.note}</span>}</td>
                  <td className="num">{fmtHours(e.minutes, locale)}</td>
                  <td className="material-cell">{e.material ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel-foot"><Link href="/time">{t.time.title} →</Link></div>
        </section>
      )}

      {showPrices && (
        <section className="panel">
          <h2 className="panel-title spread-title">
            <span>{t.prices.title}</span>
            <span className="title-stats">{h.pricesExclVat}</span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.common.name}</th><th>{t.prices.category}</th><th className="num">{t.prices.price}</th></tr></thead>
              <tbody>
                {prices.length === 0 && <tr><td colSpan={3} className="empty">{t.prices.empty}</td></tr>}
                {prices.slice(0, PRICE_ROWS).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted m-left">{(p.category_id && catNames.get(p.category_id)) || t.prices.noCategory}</td>
                    <td className="num">{money(Number(p.unit_price))} / {p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-foot">
            <Link href="/admin/prices">{prices.length > PRICE_ROWS ? h.fullPriceList(prices.length) : has("prices.edit") ? h.editPrices : t.prices.title} →</Link>
          </div>
        </section>
      )}
    </>
  );
}
