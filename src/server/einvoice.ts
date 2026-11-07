import type { Company, Customer, Invoice, InvoiceItem } from "./queries";

// E-faktúra (povinná na Slovensku od 1. 1. 2027 pre platiteľov DPH pri faktúrach firmám a obciam):
// UBL 2.1 podľa EN 16931 a Peppol BIS Billing 3.0. Firma je v sieti Peppol označená schémou 0245
// a svojím 10-miestnym DIČ. Súčty sú tie isté ako na PDF (DPH po riadkoch, zaokrúhlené na centy).

export type EInvoiceError = "einvoice_seller_dic" | "einvoice_seller_vat" | "einvoice_no_buyer" | "einvoice_buyer_dic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const amt = (n: number) => r2(n).toFixed(2);
/** množstvo a jednotková cena: najviac 4 desatinné miesta, bez zbytočných núl */
const dec = (n: number) => String(Math.round(n * 10000) / 10000);
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Jednotky z cenníka → kódy UN/ECE Rec 20 (neznáma = C62, „kus/jednotka“). */
const UNITS: Record<string, string> = {
  ks: "H87", kus: "H87", kusy: "H87", pc: "H87", pcs: "H87",
  m: "MTR", bm: "MTR", km: "KMT", m2: "MTK", "m²": "MTK", m3: "MTQ", "m³": "MTQ",
  hod: "HUR", h: "HUR", hodina: "HUR", hr: "HUR", min: "MIN", den: "DAY", deň: "DAY", d: "DAY", mes: "MON", mesiac: "MON",
  kg: "KGM", g: "GRM", t: "TNE", l: "LTR", sada: "SET", súprava: "SET", set: "SET", bal: "XPK", balenie: "XPK",
};
const unitCode = (u: string) => UNITS[u.trim().toLowerCase().replace(/\.$/, "")] ?? "C62";

/** Krajina z IČ DPH (SK2020…, CZ…), inak Slovensko. */
const country = (vatId: string | null | undefined) => {
  const m = /^([A-Z]{2})/.exec((vatId ?? "").trim().toUpperCase());
  return m && m[1] !== "EL" ? m[1] : m?.[1] === "EL" ? "GR" : "SK";
};

type Cat = { id: "S" | "E" | "AE" | "O"; rate: number | null; reason?: string; reasonCode?: string };

function categoryOf(company: Company, inv: Invoice, rate: number): Cat {
  if (!company.is_vat_payer) return { id: "O", rate: null, reason: "Nie je platiteľom DPH", reasonCode: "VATEX-EU-O" };
  if (inv.reverse_charge) return { id: "AE", rate: 0, reason: "Prenesenie daňovej povinnosti", reasonCode: "VATEX-EU-AE" };
  if (rate > 0) return { id: "S", rate };
  return { id: "E", rate: 0, reason: "Oslobodené od DPH" };
}

const taxCategory = (tag: "cac:TaxCategory" | "cac:ClassifiedTaxCategory", c: Cat, withReason: boolean) =>
  `<${tag}><cbc:ID>${c.id}</cbc:ID>${c.rate === null ? "" : `<cbc:Percent>${dec(c.rate)}</cbc:Percent>`}` +
  (withReason && c.reasonCode ? `<cbc:TaxExemptionReasonCode>${c.reasonCode}</cbc:TaxExemptionReasonCode>` : "") +
  (withReason && c.reason ? `<cbc:TaxExemptionReason>${esc(c.reason)}</cbc:TaxExemptionReason>` : "") +
  `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></${tag}>`;

type PartyIn = { name: string; ico: string | null; dic: string | null; ic_dph: string | null; address: string | null; zip: string | null; city: string | null; email: string | null; phone: string | null };

function party(p: PartyIn, vatPayer: boolean) {
  const vatId = (p.ic_dph ?? "").replace(/\s+/g, "").toUpperCase();
  return (
    `<cac:Party>` +
    `<cbc:EndpointID schemeID="0245">${digits(p.dic)}</cbc:EndpointID>` +
    `<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>` +
    `<cac:PostalAddress>` +
    (p.address ? `<cbc:StreetName>${esc(p.address)}</cbc:StreetName>` : "") +
    (p.city ? `<cbc:CityName>${esc(p.city)}</cbc:CityName>` : "") +
    (p.zip ? `<cbc:PostalZone>${esc(p.zip)}</cbc:PostalZone>` : "") +
    `<cac:Country><cbc:IdentificationCode>${country(vatId)}</cbc:IdentificationCode></cac:Country>` +
    `</cac:PostalAddress>` +
    (vatPayer && vatId ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : "") +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>` +
    (digits(p.ico) ? `<cbc:CompanyID>${digits(p.ico)}</cbc:CompanyID>` : "") +
    `</cac:PartyLegalEntity>` +
    (p.email || p.phone
      ? `<cac:Contact>${p.phone ? `<cbc:Telephone>${esc(p.phone)}</cbc:Telephone>` : ""}${p.email ? `<cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail>` : ""}</cac:Contact>`
      : "") +
    `</cac:Party>`
  );
}

/** XML e-faktúry, alebo čo chýba (DIČ dodávateľa / odberateľ s DIČ – e-faktúra je len pre firmy a obce). */
export function buildEInvoice(p: { company: Company; inv: Invoice; items: InvoiceItem[]; buyer: Customer | undefined }): { xml: string } | { error: EInvoiceError } {
  const { company, inv, items, buyer } = p;
  if (digits(company.dic).length !== 10) return { error: "einvoice_seller_dic" };
  if (company.is_vat_payer && !(company.ic_dph ?? "").trim()) return { error: "einvoice_seller_vat" };
  if (!buyer) return { error: "einvoice_no_buyer" };
  if (digits(buyer.dic).length !== 10) return { error: "einvoice_buyer_dic" };

  // riadky a rozpis DPH podľa kategórie a sadzby (rovnaké zaokrúhlenie ako faktúra)
  const lines = items.map((it, i) => {
    let qty = Number(it.quantity), price = Number(it.unit_price);
    if (price < 0) { price = -price; qty = -qty; } // cena položky nesmie byť záporná (zľava = záporné množstvo)
    const net = r2(Number(it.quantity) * Number(it.unit_price));
    const cat = categoryOf(company, inv, Number(it.vat_rate));
    const vat = cat.id === "S" ? r2((net * Number(it.vat_rate)) / 100) : 0;
    return { n: i + 1, it, qty, price, net, cat, vat };
  });
  const groups = new Map<string, { cat: Cat; base: number; vat: number }>();
  for (const l of lines) {
    const key = `${l.cat.id}:${l.cat.rate ?? ""}`;
    const g = groups.get(key) ?? { cat: l.cat, base: 0, vat: 0 };
    g.base = r2(g.base + l.net);
    g.vat = r2(g.vat + l.vat);
    groups.set(key, g);
  }
  const net = r2(lines.reduce((s, l) => s + l.net, 0));
  const vat = r2([...groups.values()].reduce((s, g) => s + g.vat, 0));
  const gross = r2(net + vat);
  const iban = (company.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const buyerRef = (inv.job_title ?? "").trim() || inv.number;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>` +
    `<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>` +
    `<cbc:ID>${esc(inv.number)}</cbc:ID>` +
    `<cbc:IssueDate>${inv.issue_date}</cbc:IssueDate>` +
    `<cbc:DueDate>${inv.due_date}</cbc:DueDate>` +
    `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>` +
    (inv.note ? `<cbc:Note>${esc(inv.note)}</cbc:Note>` : "") +
    `<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>` +
    `<cbc:BuyerReference>${esc(buyerRef.slice(0, 200))}</cbc:BuyerReference>` +
    `<cac:AccountingSupplierParty>${party(company, company.is_vat_payer)}</cac:AccountingSupplierParty>` +
    // neplatiteľ DPH (kategória O): v e-faktúre nesmie byť IČ DPH ani odberateľa (BR-O-02)
    `<cac:AccountingCustomerParty>${party(buyer, company.is_vat_payer)}</cac:AccountingCustomerParty>` +
    `<cac:Delivery><cbc:ActualDeliveryDate>${inv.delivery_date}</cbc:ActualDeliveryDate></cac:Delivery>` +
    (iban
      ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${esc(inv.variable_symbol)}</cbc:PaymentID>` +
        `<cac:PayeeFinancialAccount><cbc:ID>${esc(iban)}</cbc:ID><cbc:Name>${esc(company.name)}</cbc:Name></cac:PayeeFinancialAccount></cac:PaymentMeans>`
      : "") +
    `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amt(vat)}</cbc:TaxAmount>` +
    [...groups.values()].map((g) =>
      `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amt(g.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amt(g.vat)}</cbc:TaxAmount>` +
      `${taxCategory("cac:TaxCategory", g.cat, true)}</cac:TaxSubtotal>`
    ).join("") +
    `</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="EUR">${amt(net)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="EUR">${amt(net)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="EUR">${amt(gross)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="EUR">${amt(gross)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lines.map((l) =>
      `<cac:InvoiceLine><cbc:ID>${l.n}</cbc:ID>` +
      `<cbc:InvoicedQuantity unitCode="${unitCode(l.it.unit)}">${dec(l.qty)}</cbc:InvoicedQuantity>` +
      `<cbc:LineExtensionAmount currencyID="EUR">${amt(l.net)}</cbc:LineExtensionAmount>` +
      `<cac:Item><cbc:Name>${esc(l.it.name)}</cbc:Name>${taxCategory("cac:ClassifiedTaxCategory", l.cat, false)}</cac:Item>` +
      `<cac:Price><cbc:PriceAmount currencyID="EUR">${dec(l.price)}</cbc:PriceAmount></cac:Price>` +
      `</cac:InvoiceLine>`
    ).join("") +
    `</Invoice>\n`;
  return { xml };
}
