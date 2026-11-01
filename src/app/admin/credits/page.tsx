import { config } from "@/server/config";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/company";
import { fmtBytes } from "@/lib/format";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import CopyButton from "@/components/CopyButton";
import Crumbs from "@/components/Crumbs";
import { fail, submitOr } from "@/server/actions";
import { monthEstimate } from "@/server/credits";
import { payBySquareText, qrDataUrl } from "@/server/invoice-doc";
import { creditHistory, isReadOnly, pendingTopups } from "@/server/queries";
import { CARD_MAX, CARD_MIN, cardEnabled, createCheckout } from "@/server/payments";

const BACK = "/admin/credits";
const amountOf = (formData: FormData) => Math.round(Number(String(formData.get("amount") ?? "").replace(",", ".")) * 100);

async function requestTopup(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("company.credits");
  const amount = amountOf(formData);
  if (!(amount >= 100)) fail(BACK, "invalid");
  await submitOr(BACK, { type: "topup.request", companyId: company.id, request: { id: randomUUID(), amount_cents: amount } }, user.id);
  redirect(`${BACK}?ok=topup_requested`);
}

async function cancelTopup(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("company.credits");
  await submitOr(BACK, { type: "topup.cancel", companyId: company.id, requestId: String(formData.get("id")) }, user.id);
  redirect(`${BACK}?ok=topup_cancelled`);
}

async function payByCard(formData: FormData) {
  "use server";
  const { company, user } = await requirePerm("company.credits");
  const amount = amountOf(formData);
  if (!cardEnabled() || !(amount >= CARD_MIN && amount <= CARD_MAX)) fail(BACK, "card_amount");
  const h = await headers();
  const origin = config("app_url")?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  let url: string;
  try {
    url = await createCheckout({ companyId: company.id, amountCents: amount, origin, email: user.email, ip });
  } catch (e) {
    console.error(e);
    fail(BACK, "payment_failed");
  }
  redirect(url);
}

export default async function Credits() {
  const [{ company }, { t, credits, date, locale }] = await Promise.all([requirePerm("company.credits"), getT()]);
  const c = t.credits;
  const est = monthEstimate(company);
  const s = est.settings;
  const history = creditHistory(company.id);
  const pending = pendingTopups(company.id);
  const vs = company.vs;
  const status = company.suspended ? c.suspended : isReadOnly(company) ? c.readOnly : c.active;
  // QR (PAY by square) pre každú oznámenú platbu: suma, IBAN aj VS sa v banke vyplnia samé
  const qrs = await Promise.all(
    pending.map(async (p) => {
      const text = await payBySquareText({ iban: s.iban, amount: p.amount_cents / 100, vs, name: s.operator_name ?? "Robotka", note: `${c.qrNote} ${company.name}` });
      return text ? qrDataUrl(text) : null;
    })
  );
  const copy = (v: string) => <CopyButton value={v} label={c.copy} done={c.copied} />;

  const txText = (kind: (typeof history)[number]["kind"], note: string | null) => {
    if (kind === "fee" && note) return `${t.tx.fee} · ${note}`;
    if (kind === "storage" && note) {
      const [month, gb] = note.split(":");
      return `${t.tx.storage} · ${month} · ${gb} ${c.gbMonth}`;
    }
    if (note === "card") return `${t.tx[kind]} · ${c.byCard}`;
    if (note === "card refund") return `${t.tx[kind]} · ${c.cardRefund}`;
    return note ? `${t.tx[kind]} · ${note}` : t.tx[kind];
  };

  return (
    <>
      <Crumbs items={[{ label: t.admin.title, href: "/admin" }, { label: c.title }]} />

      <section className="panel">
        <h2 className="panel-title">{c.title}</h2>
        <dl className="stats">
          <dt>{c.balance}</dt><dd className={company.credit_cents < 0 ? "neg" : undefined}>{credits(company.credit_cents)}</dd>
          <dt>{c.status}</dt><dd>{status}</dd>
          <dt>{c.storageNow}</dt><dd>{fmtBytes(company.storage_bytes, locale)}</dd>
          <dt>{c.nextCharge}</dt>
          <dd>
            {credits(est.feeCents + est.storageCents)}{" "}
            <span className="muted">
              ({t.tx.fee} {credits(est.feeCents)} + {t.tx.storage} {est.gbMonths} {c.gbMonth} × {credits(s.storage_cents_per_gb)})
            </span>
          </dd>
        </dl>
        <div className="panel-body"><p className="muted">{c.howItWorks}</p></div>
      </section>

      <div className="cols-2">
        <form action={requestTopup} className="panel">
          <h2 className="panel-title">{c.bankTitle}</h2>
          <div className="panel-body">
            <dl className="stats pay-details">
              {s.operator_name && <><dt>{c.recipient}</dt><dd><span className="copy-val">{s.operator_name}</span>{copy(s.operator_name)}</dd></>}
              {s.iban && <><dt>{c.iban}</dt><dd><span className="copy-val nowrap">{s.iban}</span>{copy(s.iban.replace(/\s+/g, ""))}</dd></>}
              <dt>{c.vs}</dt><dd><span className="copy-val nowrap">{vs}</span>{copy(vs)}</dd>
            </dl>
            {!s.iban && <p className="muted">{c.noBank}</p>}
            <p className="muted">{c.bankText}</p>
            <div className="actions">
              <input name="amount" inputMode="decimal" placeholder={c.amount} required style={{ width: 140 }} aria-describedby="card-limits" />
              <button className="primary">{c.notify}</button>
            </div>
          </div>
        </form>

        <form action={payByCard} className="panel">
          <h2 className="panel-title">{c.cardTitle}</h2>
          <div className="panel-body">
            {cardEnabled() ? (
              <>
                <p className="muted">{c.cardText}</p>
                <p className="muted small-note" id="card-limits">{c.cardLimits(credits(CARD_MIN), credits(CARD_MAX))}</p>
                <div className="actions">
                  <input name="amount" inputMode="decimal" placeholder={c.amount} required style={{ width: 140 }} aria-describedby="card-limits" />
                  <button className="primary">{c.pay}</button>
                </div>
              </>
            ) : <p className="muted">{c.cardOff}</p>}
          </div>
        </form>
      </div>

      {pending.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">{c.pending}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.common.date}</th><th className="num">{c.amount}</th><th>{c.qrTitle}</th><th /></tr></thead>
              <tbody>
                {pending.map((p, i) => (
                  <tr key={p.id}>
                    <td>{date(p.created_at)}</td>
                    <td className="num">{credits(p.amount_cents)}</td>
                    <td>
                      {qrs[i] ? (
                        <div className="pay-qr">
                          <img src={qrs[i]!} alt={c.qrTitle} width={132} height={132} />
                          <span className="muted small-note">{c.qrHint}</span>
                        </div>
                      ) : <span className="muted">–</span>}
                    </td>
                    <td className="num">
                      <form action={cancelTopup}><input type="hidden" name="id" value={p.id} /><ConfirmSubmit label={c.cancel} className="danger small" question={t.confirm.cancelTopupQ} yes={c.cancel} no={t.confirm.cancel} /></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">{c.history}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t.common.date}</th><th>{t.common.description}</th><th className="num">{c.amount}</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={3} className="empty">{c.noTx}</td></tr>}
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{date(h.at)}</td>
                  <td>{txText(h.kind, h.note)}</td>
                  <td className={`num ${h.amount_cents < 0 ? "neg" : "pos"}`}>{h.amount_cents > 0 ? "+" : ""}{credits(h.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
