import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Dict } from "@/i18n/sk";
import { signedFileUrl } from "./files";
import type { Company, Customer, Invoice, InvoiceItem } from "./queries";

// Faktúra ako dokument: rozpis DPH, QR na zaplatenie (PAY by square) a PDF na stiahnutie.
// Rovnaké údaje a rozloženie ako na obrazovke (src/app/admin/invoices/[id]/page.tsx).

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type VatRow = { rate: number; base: number; vat: number };

/** Základ a DPH podľa sadzieb (zaokrúhľuje sa po riadkoch, rovnako ako pri vystavení). */
export function vatBreakdown(items: InvoiceItem[]): VatRow[] {
  const rows = new Map<number, VatRow>();
  for (const it of items) {
    const base = r2(Number(it.quantity) * Number(it.unit_price));
    const rate = Number(it.vat_rate);
    const row = rows.get(rate) ?? { rate, base: 0, vat: 0 };
    row.base = r2(row.base + base);
    row.vat = r2(row.vat + r2((base * rate) / 100));
    rows.set(rate, row);
  }
  return [...rows.values()].sort((a, b) => b.rate - a.rate);
}

/** Reťazec PAY by square (slovenské banky ho načítajú z QR). null = nedá sa (napr. neplatný IBAN). */
export async function payBySquareText(p: { iban: string | null; amount: number; vs: string; name: string; due?: string; invoiceId?: string; note?: string }): Promise<string | null> {
  const iban = (p.iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (!iban || !(p.amount > 0)) return null;
  try {
    const { encode, PaymentOptions, CurrencyCode } = await import("bysquare/pay");
    return encode({
      ...(p.invoiceId ? { invoiceId: p.invoiceId } : {}),
      payments: [{
        type: PaymentOptions.PaymentOrder,
        amount: p.amount,
        currencyCode: CurrencyCode.EUR,
        variableSymbol: p.vs.slice(0, 10),
        ...(p.due ? { paymentDueDate: p.due.replace(/-/g, "") } : {}),
        ...(p.note ? { paymentNote: p.note.slice(0, 140) } : {}),
        beneficiary: { name: p.name.slice(0, 70) },
        bankAccounts: [{ iban }],
      }],
    });
  } catch {
    return null; // napr. neplatný IBAN – bez QR
  }
}

/** QR na úhradu faktúry. null = nedá sa (chýba IBAN, zaplatená, stornovaná…). */
export async function payBySquare(company: Company, inv: Invoice): Promise<string | null> {
  if (inv.status === "paid" || inv.status === "cancelled") return null;
  return payBySquareText({
    iban: company.iban, amount: Number(inv.total_gross), vs: inv.variable_symbol,
    name: company.name, due: inv.due_date, invoiceId: inv.number,
  });
}

export const qrDataUrl = (text: string) => QRCode.toDataURL(text, { margin: 1, errorCorrectionLevel: "M", scale: 5 });

// ───────── PDF ─────────

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const ACCENT = "#b5d335";
const DARK = "#24291e";
const MUTED = "#6b6f66";
const CARD = "#f4f5f1";

type Fmt = { money: (n: number) => string; date: (d: string) => string };

// Logá sa nemenia (nové logo = nový kľúč), preto si ich server drží v pamäti:
// ďalšie PDF už hub ani úložisko vôbec nepýta.
const logoCache = new Map<string, Buffer>();

/** Logo do PDF: len PNG/JPEG (pdfkit nevie SVG/WebP – vtedy sa ukáže názov firmy). */
async function logoBuffer(company: Company): Promise<Buffer | null> {
  const path = company.logo_path;
  if (!path || !/\.(png|jpe?g)$/i.test(path)) return null;
  const cached = logoCache.get(path);
  if (cached) return cached;
  try {
    const res = await fetch(signedFileUrl(path), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (logoCache.size >= 200) logoCache.delete(logoCache.keys().next().value!);
    logoCache.set(path, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(opts: {
  company: Company; inv: Invoice; items: InvoiceItem[]; customer?: Customer; jobTitle?: string | null; t: Dict; fmt: Fmt;
}): Promise<Buffer> {
  const { company, inv, items, customer: c, jobTitle, t, fmt } = opts;
  const ti = t.invoices;
  const doc = new PDFDocument({ size: "A4", margin: 40, font: path.join(FONT_DIR, "DejaVuSans.ttf"), info: { Title: `${ti.invoice} ${inv.number}`, Author: company.name } });
  doc.registerFont("R", path.join(FONT_DIR, "DejaVuSans.ttf"));
  doc.registerFont("B", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = 40;
  const W = 515;
  const R = L + W;

  // akcentový pruh
  doc.rect(0, 0, 595.28, 6).fill(ACCENT);

  // hlavička: logo / názov firmy + FAKTÚRA číslo
  const logo = await logoBuffer(company);
  if (logo) {
    try {
      doc.image(logo, L, 34, { fit: [170, 60] });
    } catch {
      doc.font("B").fontSize(18).fillColor(DARK).text(company.name, L, 44, { width: 260 });
    }
  } else {
    doc.font("B").fontSize(18).fillColor(DARK).text(company.name, L, 44, { width: 260 });
  }
  doc.font("B").fontSize(24).fillColor(DARK).text(ti.invoice.toUpperCase(), 300, 34, { width: R - 300, align: "right" });
  doc.font("R").fontSize(13).fillColor(DARK).text(inv.number, 300, 64, { width: R - 300, align: "right" });
  if (company.is_vat_payer) doc.font("R").fontSize(8).fillColor(MUTED).text(ti.taxDocument, 300, 82, { width: R - 300, align: "right" });

  // pečiatka stavu
  const stamp = inv.status === "paid" ? { text: ti.stampPaid, color: "#3d7a1a" } : inv.status === "cancelled" ? { text: ti.stampCancelled, color: "#c0392b" } : inv.status === "draft" ? { text: ti.stampDraft, color: "#888888" } : null;
  if (stamp) {
    doc.save().rotate(-18, { origin: [300, 330] }).fillColor(stamp.color).opacity(0.14).font("B").fontSize(72).text(stamp.text, 60, 300, { width: 480, align: "center" }).restore();
    doc.opacity(1);
  }

  // dodávateľ / odberateľ
  const partyLines = (p: { name: string; address: string | null; zip: string | null; city: string | null; ico: string | null; dic: string | null; ic_dph: string | null }, extra: string[]) =>
    [p.address, [p.zip, p.city].filter(Boolean).join(" "), p.ico && `${t.common.ico}: ${p.ico}`, p.dic && `${t.common.dic}: ${p.dic}`, p.ic_dph && `${t.common.icDph}: ${p.ic_dph}`, ...extra].filter(Boolean) as string[];
  const supplier = partyLines(company, [company.is_vat_payer ? "" : ti.notVatPayer, company.email ?? "", company.phone ?? ""].filter(Boolean));
  const buyer = c ? partyLines(c, [c.email ?? "", c.phone ?? ""].filter(Boolean)) : [];
  const cardH = 40 + Math.max(supplier.length, buyer.length, 1) * 12 + 8;
  const cardY = 112;
  const card = (x: number, label: string, name: string, lines: string[]) => {
    doc.roundedRect(x, cardY, 250, cardH, 6).fill(CARD);
    doc.font("B").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 14, cardY + 12, { characterSpacing: 0.6 });
    doc.font("B").fontSize(11).fillColor(DARK).text(name, x + 14, cardY + 25, { width: 222 });
    doc.font("R").fontSize(9).fillColor(DARK);
    lines.forEach((line, i) => doc.text(line, x + 14, cardY + 42 + i * 12, { width: 222 }));
  };
  card(L, ti.supplier, company.name, supplier);
  card(L + 265, ti.buyer, c?.name ?? "–", buyer);

  // dátumy
  let y = cardY + cardH + 14;
  const boxes: [string, string, boolean][] = [
    [ti.issueDate, fmt.date(inv.issue_date), false],
    [ti.deliveryDate, fmt.date(inv.delivery_date), false],
    [ti.dueDate, fmt.date(inv.due_date), true],
    [ti.variableSymbol, inv.variable_symbol, false],
  ];
  const bw = (W - 3 * 8) / 4;
  boxes.forEach(([label, value, strong], i) => {
    const x = L + i * (bw + 8);
    if (strong) doc.roundedRect(x, y, bw, 40, 5).lineWidth(1.2).strokeColor(ACCENT).stroke();
    else doc.roundedRect(x, y, bw, 40, 5).fill(CARD);
    doc.font("R").fontSize(7).fillColor(MUTED).text(label, x + 10, y + 8, { width: bw - 20 });
    doc.font("B").fontSize(10.5).fillColor(DARK).text(value, x + 10, y + 21, { width: bw - 20 });
  });
  y += 52;
  if (jobTitle) {
    doc.font("R").fontSize(9).fillColor(MUTED).text(`${ti.job}: `, L, y, { continued: true }).fillColor(DARK).font("B").text(jobTitle);
    y += 18;
  }

  // položky
  const cols = [
    { key: "#", w: 20, align: "left" as const },
    // šírky tak, aby sa nadpisy (napr. „Cena/MJ bez DPH“) nelámali na dva riadky
    { key: ti.colItem, w: 157, align: "left" as const },
    { key: ti.qty, w: 50, align: "right" as const },
    { key: ti.unit, w: 28, align: "left" as const },
    { key: ti.unitPriceShort, w: 104, align: "right" as const },
    { key: ti.colVat, w: 38, align: "right" as const },
    { key: ti.colLineNet, w: 118, align: "right" as const },
  ];
  // výška hlavičky podľa najdlhšieho nadpisu (môže byť na 2 riadky)
  doc.font("B").fontSize(7.5);
  const headH = Math.max(...cols.map((col) => doc.heightOfString(col.key, { width: col.w - 12 }))) + 14;
  const header = () => {
    doc.rect(L, y, W, headH).fill(DARK);
    let x = L;
    doc.font("B").fontSize(7.5).fillColor("#ffffff");
    for (const col of cols) {
      doc.text(col.key, x + 6, y + 7, { width: col.w - 12, align: col.align });
      x += col.w;
    }
    y += headH;
  };
  header();
  items.forEach((it, i) => {
    const cells = [
      String(i + 1),
      it.name,
      new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 3 }).format(Number(it.quantity)),
      it.unit,
      fmt.money(Number(it.unit_price)),
      `${Number(it.vat_rate)} %`,
      fmt.money(r2(Number(it.quantity) * Number(it.unit_price))),
    ];
    doc.font("R").fontSize(9);
    const h = Math.max(20, doc.heightOfString(it.name, { width: cols[1].w - 12 }) + 10);
    if (y + h > 760) {
      doc.addPage();
      y = 40;
      header();
    }
    if (i % 2 === 1) doc.rect(L, y, W, h).fill("#f7f8f5");
    let x = L;
    doc.fillColor(DARK);
    cells.forEach((v, ci) => {
      doc.font(ci === 6 ? "B" : "R").fontSize(9).text(v, x + 6, y + 5, { width: cols[ci].w - 12, align: cols[ci].align });
      x += cols[ci].w;
    });
    y += h;
  });
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor("#d8dbd2").stroke();
  y += 16;

  // platba (vľavo) a súčty (vpravo)
  if (y + 150 > 790) {
    doc.addPage();
    y = 40;
  }
  const qr = await payBySquare(company, inv);
  const payLines: [string, string][] = [
    [ti.iban, company.iban ?? "–"],
    [ti.variableSymbol, inv.variable_symbol],
    [ti.dueDate, fmt.date(inv.due_date)],
    [ti.toPay, fmt.money(Number(inv.total_gross))],
  ];
  const valueW = qr ? 150 : 240;
  // výška boxu podľa obsahu (dlhý IBAN sa zalomí)
  doc.font("B").fontSize(9.5);
  const contentH = payLines.reduce((h, [, v]) => h + 10 + doc.heightOfString(v, { width: valueW }) + 6, 0);
  const boxH = Math.max(qr ? 132 : 0, 30 + contentH + 8);
  doc.roundedRect(L, y, 270, boxH, 6).fill(CARD);
  doc.font("B").fontSize(7.5).fillColor(MUTED).text(ti.payment.toUpperCase(), L + 14, y + 12, { characterSpacing: 0.6 });
  let py = y + 30;
  for (const [label, value] of payLines) {
    doc.font("R").fontSize(7.5).fillColor(MUTED).text(label, L + 14, py);
    doc.font("B").fontSize(9.5).fillColor(DARK).text(value, L + 14, py + 10, { width: valueW });
    py = doc.y + 6;
  }
  if (qr) {
    const png = await QRCode.toBuffer(qr, { margin: 1, errorCorrectionLevel: "M", scale: 6 });
    doc.image(png, L + 178, y + 24, { width: 82 });
    doc.font("R").fontSize(6.5).fillColor(MUTED).text("PAY by square", L + 178, y + 110, { width: 82, align: "center" });
  }

  const tx = L + 290;
  const tw = W - 290;
  let ty = y + 4;
  const line = (label: string, value: string) => {
    doc.font("R").fontSize(9).fillColor(MUTED).text(label, tx, ty, { width: tw - 90 });
    doc.font("R").fontSize(9).fillColor(DARK).text(value, tx + tw - 90, ty, { width: 90, align: "right" });
    ty += 16;
  };
  const rows = company.is_vat_payer ? vatBreakdown(items) : [];
  if (rows.length > 1) {
    // viac sadzieb: rozpis podľa sadzby (sadzba / základ / DPH)
    for (const row of rows) line(`${ti.vatBase(row.rate)} · ${ti.vat} ${fmt.money(row.vat)}`, fmt.money(row.base));
    ty += 4;
  }
  if (company.is_vat_payer) {
    line(ti.totalNet, fmt.money(Number(inv.total_net)));
    line(rows.length === 1 ? ti.vatAmount(rows[0].rate) : ti.totalVat, fmt.money(Number(inv.total_vat)));
  } else {
    line(ti.totalPlain, fmt.money(Number(inv.total_net)));
  }
  ty += 4;
  doc.roundedRect(tx, ty, tw, 44, 6).fill(DARK);
  doc.font("B").fontSize(8).fillColor(ACCENT).text(ti.toPay.toUpperCase(), tx + 12, ty + 9, { characterSpacing: 0.6 });
  doc.font("B").fontSize(16).fillColor("#ffffff").text(fmt.money(Number(inv.total_gross)), tx + 12, ty + 20, { width: tw - 24, align: "right" });

  y = Math.max(y + boxH, ty + 44) + 18;
  if (inv.note) {
    doc.font("R").fontSize(9).fillColor(DARK).text(inv.note, L, y, { width: W });
    y = doc.y + 8;
  }
  if (company.invoice_footer) doc.font("R").fontSize(7.5).fillColor(MUTED).text(company.invoice_footer, L, Math.max(y, 780), { width: W, align: "center" });

  doc.end();
  return done;
}
