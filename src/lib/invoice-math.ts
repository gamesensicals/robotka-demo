export type Line = { quantity: number; unit_price: number; vat_rate: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Súčty faktúry: základ a DPH sa počítajú po riadkoch a zaokrúhľujú na 2 desatinné miesta. */
export function totals(lines: Line[]) {
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const lineNet = r2(l.quantity * l.unit_price);
    net += lineNet;
    vat += r2((lineNet * l.vat_rate) / 100);
  }
  return { net: r2(net), vat: r2(vat), gross: r2(net + vat) };
}

/** Splatnosť faktúry: dátum dodania + 14 dní. */
export const DUE_DAYS = 14;
