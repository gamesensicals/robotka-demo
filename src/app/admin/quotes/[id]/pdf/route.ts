import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import { renderInvoicePdf } from "@/server/invoice-doc";
import { type Invoice, getQuote, invoiceBuyer, quoteItems } from "@/server/queries";

// Cenová ponuka ako PDF (rovnaký vzhľad ako faktúra).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const inline = new URL(req.url).searchParams.has("inline");
  const { id } = await params;
  const [{ company }, { t, money, date }] = await Promise.all([requirePerm("invoices.view"), getT()]);
  const q = getQuote(company.id, id);
  if (!q) return new Response("not found", { status: 404 });
  // ponuka v tvare faktúry: platnosť namiesto splatnosti, bez variabilného symbolu
  const inv = { ...q, delivery_date: q.issue_date, due_date: q.valid_until, variable_symbol: "" } as unknown as Invoice;
  const pdf = await renderInvoicePdf({ company, inv, items: quoteItems(company.id, id), customer: invoiceBuyer(company.id, q), jobTitle: q.job_title, t, fmt: { money, date }, kind: "quote" });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="ponuka-${q.number.replace(/[^\w-]/g, "")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
