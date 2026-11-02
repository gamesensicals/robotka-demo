import Link from "next/link";
import { getT } from "@/i18n";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import StatusDot from "@/components/StatusDot";
import type { InvoiceRow } from "@/server/queries";
import { deleteInvoice } from "./actions";

/** Tabuľka faktúr (zoznam, Administrácia, Prehľad). S `actions` aj stiahnutie PDF, zmazanie a obnovenie. */
export default async function InvoiceTable({ invoices, actions }: { invoices: InvoiceRow[]; actions?: { back: string } }) {
  const { t, money, date } = await getT();
  const ti = t.invoices;
  const cols = actions ? 7 : 6;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="dotcol" />
            <th>{ti.number}</th>
            <th>{t.common.date}</th>
            <th>{t.common.customer}</th>
            <th className="num">{ti.amount}</th>
            <th>{t.common.status}</th>
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 && <tr><td colSpan={cols} className="empty">{ti.empty}</td></tr>}
          {invoices.map((i) => {
            const immediate = i.status === "draft" || i.status === "cancelled";
            return (
              <tr key={i.id}>
                <td className="dotcol"><StatusDot active={i.status === "draft" || i.status === "sent"} /></td>
                <td><Link href={`/admin/invoices/${i.id}`} className="row-title">{i.number}</Link></td>
                <td className="nowrap">{date(i.issue_date)}</td>
                <td className="m-left">{i.customer_name ?? ""}</td>
                <td className="num">{money(Number(i.total_gross))}</td>
                <td>
                  <span className={`badge badge-${i.status}`}>{t.invoiceStatus[i.status]}</span>
                </td>
                {actions && (
                  <td className="row-actions">
                    <a href={`/admin/invoices/${i.id}/pdf`} className="button small">PDF</a>
                    {immediate && (
                      <form action={deleteInvoice}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="back" value={actions.back} />
                        <ConfirmSubmit label={t.common.delete} className="danger small" question={ti.deleteNowQ(i.number)} yes={t.common.delete} no={t.confirm.cancel} />
                      </form>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
