import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/company";
import { buildEInvoice } from "@/server/einvoice";
import { getInvoice, invoiceBuyer, invoiceItems } from "@/server/queries";

// Stiahnutie e-faktúry (UBL / Peppol BIS 3.0). Keď niečo chýba (DIČ), späť na faktúru s hláškou.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await requirePerm("invoices.view");
  const inv = getInvoice(company.id, id);
  if (!inv) return new Response("not found", { status: 404 });
  const res = buildEInvoice({ company, inv, items: invoiceItems(company.id, id), buyer: invoiceBuyer(company.id, inv) });
  if ("error" in res) return NextResponse.redirect(new URL(`/admin/invoices/${id}?error=${res.error}`, req.url), 303);
  return new Response(res.xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="e-faktura-${inv.number.replace(/[^\w-]/g, "")}.xml"`,
      "cache-control": "no-store",
    },
  });
}
