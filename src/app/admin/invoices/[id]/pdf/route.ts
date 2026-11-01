import { requirePerm } from "@/lib/company";
import { getT } from "@/i18n";
import { renderInvoicePdf } from "@/server/invoice-doc";
import { getInvoice, getJob, invoiceBuyer, invoiceItems } from "@/server/queries";

// Stiahnutie faktúry ako PDF.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // ?inline=1: na tlač (prehliadač ho zobrazí), inak stiahnutie
  const inline = new URL(req.url).searchParams.has("inline");
  const { id } = await params;
  const [{ company }, { t, money, date }] = await Promise.all([requirePerm("invoices.view"), getT()]);
  const inv = getInvoice(company.id, id);
  if (!inv) return new Response("not found", { status: 404 });
  const items = invoiceItems(company.id, id);
  const customer = invoiceBuyer(company.id, inv);
  const job = inv.job_id ? getJob(company.id, inv.job_id) : undefined;
  const pdf = await renderInvoicePdf({ company, inv, items, customer, jobTitle: job?.title ?? inv.job_title, t, fmt: { money, date } });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="faktura-${inv.number.replace(/[^\w-]/g, "")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
