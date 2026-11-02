// Základný cenník a kategórie, ktoré dostane každá nová firma (majiteľ si ich upraví). Ceny sú orientačné,
// bez DPH. Posielajú sa v udalosti company.create, takže zmena tohto zoznamu nezmení firmy, ktoré už
// existujú. `cat` = poradie v DEFAULT_CATEGORY_NAMES.

export const DEFAULT_CATEGORY_NAMES = ["Káble", "Ističe", "Chráničky", "Rozvádzače", "Krabice"];

export type DefaultPrice = { name: string; unit: string; unit_price: number; is_labor?: boolean; cat: number | null };

export const DEFAULT_PRICES: DefaultPrice[] = [
  // Káble
  { name: "Kábel CYKY-J 3x1,5", unit: "m", unit_price: 0.85, cat: 0 },
  { name: "Kábel CYKY-J 3x2,5", unit: "m", unit_price: 1.2, cat: 0 },
  { name: "Kábel CYKY-J 5x1,5", unit: "m", unit_price: 1.4, cat: 0 },
  { name: "Kábel CYKY-J 5x2,5", unit: "m", unit_price: 2.1, cat: 0 },
  { name: "Kábel CYKY-J 5x6", unit: "m", unit_price: 4.9, cat: 0 },
  { name: "Vodič CY 6 zelenožltý", unit: "m", unit_price: 0.9, cat: 0 },
  // Ističe a prúdové chrániče
  { name: "Istič B10 1-pólový", unit: "ks", unit_price: 4.5, cat: 1 },
  { name: "Istič B16 1-pólový", unit: "ks", unit_price: 4.5, cat: 1 },
  { name: "Istič B32 3-pólový", unit: "ks", unit_price: 18.9, cat: 1 },
  { name: "Prúdový chránič 40A/30mA 4-pólový", unit: "ks", unit_price: 39, cat: 1 },
  { name: "Chránič s ističom B16/30mA", unit: "ks", unit_price: 32.5, cat: 1 },
  // Chráničky = ohybné plastové rúrky na káble
  { name: "Chránička ohybná 16 mm, sivá", unit: "m", unit_price: 0.35, cat: 2 },
  { name: "Chránička ohybná 20 mm, sivá", unit: "m", unit_price: 0.45, cat: 2 },
  { name: "Chránička ohybná 25 mm, sivá", unit: "m", unit_price: 0.65, cat: 2 },
  { name: "Chránička ohybná 20 mm, čierna (UV)", unit: "m", unit_price: 0.6, cat: 2 },
  { name: "Chránička do zeme 40 mm, červená", unit: "m", unit_price: 1.3, cat: 2 },
  // Rozvádzače
  { name: "Rozvádzač 12-modulový", unit: "ks", unit_price: 18, cat: 3 },
  { name: "Rozvádzač 24-modulový", unit: "ks", unit_price: 32, cat: 3 },
  { name: "Rozvádzač 36-modulový", unit: "ks", unit_price: 48, cat: 3 },
  // Krabice
  { name: "Krabica prístrojová KU 68", unit: "ks", unit_price: 0.35, cat: 4 },
  { name: "Krabica odbočná KO 8", unit: "ks", unit_price: 0.9, cat: 4 },
  // práca a ostatné
  { name: "Práca elektrikára", unit: "hod", unit_price: 28, is_labor: true, cat: null },
  { name: "Revízia elektroinštalácie", unit: "ks", unit_price: 120, is_labor: true, cat: null },
  { name: "Doprava", unit: "km", unit_price: 0.45, cat: null },
];
