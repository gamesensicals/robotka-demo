import { PRESETS } from "@/lib/perms";
import { hashPassword } from "./auth";
import { type ErrorCode, type EventBody, type SyncEvent, WEBMASTER } from "./events";

// Ukážkové dáta dema. Nahrajú sa pri štarte a po každom hodinovom resete. Dátumy sú vždy
// relatívne k dnešku, aby demo vyzeralo „živo“. Id sú pevné, takže prihlásenie (aj otvorené
// relácie) funguje aj po resete.

export const DEMO_COMPANY_ID = "demo-company";
export const DEMO_OWNER = { id: "demo-owner", email: "demo@robotka.beer", password: "demo-demo" };
export const DEMO_MEMBERS = [
  { id: "demo-maria", username: "maria", password: "maria-demo", preset: "manager" as const },
  { id: "demo-jozef", username: "jozef", password: "jozef-demo", preset: "worker" as const },
];
export const SEED_USER_IDS = [DEMO_OWNER.id, ...DEMO_MEMBERS.map((m) => m.id)];

const g = globalThis as unknown as { __demoHashes?: Record<string, string> };
/** Argon2 je pomalé – heslá sa zahashujú raz za beh servera. */
async function hashes() {
  if (!g.__demoHashes) {
    g.__demoHashes = {
      [DEMO_OWNER.id]: await hashPassword(DEMO_OWNER.password),
      ...Object.fromEntries(await Promise.all(DEMO_MEMBERS.map(async (m) => [m.id, await hashPassword(m.password)] as const))),
    };
  }
  return g.__demoHashes;
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export async function seedDemo(apply: (ev: SyncEvent) => ErrorCode | null) {
  const h = await hashes();
  const C = DEMO_COMPANY_ID;
  let n = 0;
  const now = new Date().toISOString();
  const run = (body: EventBody, actor: string) => {
    const ev = { ...body, id: `demo-ev-${++n}`, at: now, actor } as SyncEvent;
    const err = apply(ev);
    if (err) console.error(`[demo] seed event ${n} (${body.type}) failed: ${err}`);
  };
  const O = DEMO_OWNER.id;

  // firma a ľudia
  run({ type: "company.create", company: { id: C, name: "Elektro Demo s.r.o.", ico: "12345678" }, owner: { id: O, email: DEMO_OWNER.email, password_hash: h[O] }, credit_cents: 5000, requestId: null }, WEBMASTER);
  run({
    type: "company.update", companyId: C,
    patch: {
      name: "Elektro Demo s.r.o.", ico: "12345678", dic: "2020123456", ic_dph: "SK2020123456",
      address: "Hlavná 12", city: "Bratislava", zip: "811 01", email: "demo@robotka.beer", phone: "+421 900 123 456",
      iban: "SK31 1200 0000 1987 4263 7541", is_vat_payer: true, default_vat_rate: 23, invoice_prefix: "",
      invoice_footer: "Ďakujeme za spoluprácu. (Toto je ukážková faktúra z dema Robotky.)", logo_path: null, logo_size: 0,
    },
  }, O);
  // členovia tímu s predvoľbou oprávnení (správca / zamestnanec)
  for (const m of DEMO_MEMBERS) {
    run({ type: "member.add", companyId: C, role: "member", perms: [...PRESETS[m.preset]], user: { id: m.id, username: m.username, password_hash: h[m.id] } }, O);
  }
  run({ type: "credit.add", companyId: C, amount_cents: 3000, kind: "topup", note: "prevod na účet", ref: null, topupRequestId: null }, WEBMASTER);

  // cenník (kategórie Káble, Ističe, Chráničky, S-boxy vznikli so založením firmy)
  const cat = (i: number) => `${C}:cat:${i}`;
  const prices: [string, string, number, number | null, boolean][] = [
    ["Kábel CYKY-J 3x1,5", "m", 0.85, 0], ["Kábel CYKY-J 3x2,5", "m", 1.2, 0], ["Kábel CYKY-J 5x2,5", "m", 2.1, 0], ["Kábel CYKY-J 5x6", "m", 4.9, 0],
    ["Istič B10 1-pólový", "ks", 4.5, 1], ["Istič B16 1-pólový", "ks", 4.5, 1], ["Istič B32 3-pólový", "ks", 18.9, 1],
    ["Prúdový chránič 40A/30mA 4-pólový", "ks", 39, 2], ["Chránič s ističom B16/30mA", "ks", 32.5, 2],
    ["Rozvodnica 24 modulov", "ks", 32, 3], ["Krabica KU 68", "ks", 0.35, 3],
    ["Práca elektrikára", "hod", 28, null, true], ["Revízia elektroinštalácie", "ks", 120, null], ["Doprava", "km", 0.45, null],
  ].map(([name, unit, price, c, labor]) => [name as string, unit as string, price as number, c as number | null, !!labor]);
  prices.forEach(([name, unit, unit_price, c, is_labor], i) =>
    run({ type: "price.add", companyId: C, item: { id: `demo-price-${i}`, name, unit, unit_price, vat_rate: null, is_labor, category_id: c === null ? null : cat(c) } }, O)
  );

  // zákazníci
  const customers = [
    { id: "demo-cust-horvat", name: "Ján Horvát", address: "Lipová 8", zip: "949 01", city: "Nitra", phone: "+421 905 111 222", email: "jan.horvat@example.com" },
    { id: "demo-cust-kovacova", name: "Mária Kováčová", address: "Štefánikova 21", zip: "917 01", city: "Trnava", phone: "+421 907 333 444" },
    { id: "demo-cust-bd", name: "Bytové družstvo Podunajsko", ico: "31234567", dic: "2021234567", address: "Dunajská 5", zip: "821 08", city: "Bratislava", email: "sprava@example.com" },
    { id: "demo-cust-pekaren", name: "Pekáreň U zlatého klasu s.r.o.", ico: "45678912", dic: "2023456789", ic_dph: "SK2023456789", address: "Námestie SNP 3", zip: "010 01", city: "Žilina" },
    { id: "demo-cust-obec", name: "Obec Lúčnica", ico: "00312345", address: "Obecný úrad 1", zip: "900 01", city: "Lúčnica" },
    { id: "demo-cust-novotny", name: "Ing. Peter Novotný", address: "Karpatská 40", zip: "811 05", city: "Bratislava", phone: "+421 908 555 666" },
  ];
  for (const c of customers) {
    const base = { ico: null, dic: null, ic_dph: null, email: null, phone: null };
    run({ type: "customer.create", companyId: C, customer: { ...base, ...c } as never }, O);
  }

  // zákazky v rôznych stavoch
  const jobs: { id: string; title: string; customer: string | null; date: number; status: "open" | "waiting" | "done"; address: string; description: string }[] = [
    { id: "demo-job-rd", title: "Elektroinštalácia v novostavbe RD", customer: "demo-cust-horvat", date: -12, status: "open", address: "Lipová 8, Nitra", description: "Kompletné rozvody, rozvádzač, zásuvkové a svetelné okruhy." },
    { id: "demo-job-rozvadzac", title: "Výmena rozvádzača v byte", customer: "demo-cust-kovacova", date: -6, status: "waiting", address: "Štefánikova 21, Trnava", description: "Čaká sa na dodanie prúdového chrániča." },
    { id: "demo-job-revizia", title: "Revízia elektroinštalácie – bytový dom", customer: "demo-cust-bd", date: -40, status: "done", address: "Dunajská 5, Bratislava", description: "Periodická revízia, 24 bytov + spoločné priestory." },
    { id: "demo-job-predajna", title: "Osvetlenie predajne", customer: "demo-cust-pekaren", date: -3, status: "open", address: "Námestie SNP 3, Žilina", description: "LED panely, núdzové osvetlenie." },
    { id: "demo-job-obec", title: "Oprava verejného osvetlenia", customer: "demo-cust-obec", date: -25, status: "done", address: "Hlavná ulica, Lúčnica", description: "Výmena 6 svietidiel a poistiek." },
    { id: "demo-job-kancelaria", title: "Zásuvky v kancelárii", customer: "demo-cust-novotny", date: -1, status: "open", address: "Karpatská 40, Bratislava", description: "8 dvojzásuviek, nový okruh." },
    { id: "demo-job-wallbox", title: "Montáž wallboxu", customer: "demo-cust-horvat", date: -2, status: "waiting", address: "Lipová 8, Nitra", description: "Čaká sa na súhlas distribučky." },
    { id: "demo-job-garaz", title: "Prípojka pre garáž", customer: null, date: 0, status: "open", address: "", description: "Obhliadka, nacenenie." },
  ];
  for (const j of jobs) {
    run({ type: "job.create", companyId: C, job: { id: j.id, title: j.title, description: j.description, address: j.address || null, customer_id: j.customer, job_date: day(j.date) } }, O);
    if (j.status !== "open") run({ type: "job.setStatus", companyId: C, jobId: j.id, status: j.status }, O);
  }

  // odpracované hodiny (aj s materiálom)
  const [maria, jozef] = DEMO_MEMBERS.map((m) => m.id);
  const time: [string, string, number, number, string | null, string | null][] = [
    // kto, zákazka, deň, minúty, poznámka, materiál
    [jozef, "demo-job-rd", -12, 480, "drážky, krabice", "40 m CYKY-J 3x2,5, 25× KU 68"],
    [jozef, "demo-job-rd", -11, 450, "rozvody 1. poschodie", "60 m CYKY-J 3x1,5"],
    [maria, "demo-job-rd", -10, 300, "rozvádzač", "Rozvodnica 24 modulov, 8× istič B16, chránič 40A"],
    [jozef, "demo-job-rozvadzac", -6, 240, "demontáž starého rozvádzača", null],
    [O, "demo-job-revizia", -40, 420, "meranie, protokol", null],
    [maria, "demo-job-revizia", -39, 360, "meranie spoločné priestory", null],
    [jozef, "demo-job-obec", -25, 330, "výmena svietidiel", "6× LED svietidlo, poistky"],
    [jozef, "demo-job-predajna", -3, 420, "LED panely", "12× LED panel 60x60"],
    [maria, "demo-job-predajna", -2, 180, "núdzové osvetlenie", "4× núdzové svietidlo"],
    [jozef, "demo-job-kancelaria", -1, 360, "nový okruh, zásuvky", "35 m CYKY-J 3x2,5, 8× dvojzásuvka"],
    [O, "demo-job-wallbox", -2, 90, "obhliadka, nacenenie", null],
  ];
  // aj tento mesiac (napr. 1. dňa) nech má Dochádzka čo ukázať: posledné dni v aktuálnom mesiaci
  const elapsed = new Date().getUTCDate(); // koľký deň mesiaca je dnes
  const thisMonth: [string, string, number, number, string | null, string | null][] = [
    [jozef, "demo-job-kancelaria", 0, 240, "zásuvky – dokončenie", "6× dvojzásuvka"],
    [maria, "demo-job-predajna", -1, 300, "LED panely – 2. časť", "8× LED panel 60x60"],
    [jozef, "demo-job-rd", -2, 420, "rozvody prízemie", "50 m CYKY-J 3x2,5"],
    [O, "demo-job-garaz", -3, 60, "obhliadka", null],
    [maria, "demo-job-rd", -4, 360, "zapojenie rozvádzača", "chránič 40A, 6× istič B16"],
  ].map(([who, job, d, ...rest]) => [who, job, Math.max(d as number, 1 - elapsed), ...rest] as [string, string, number, number, string | null, string | null]);
  [...time, ...thisMonth].forEach(([who, job, d, minutes, note, material], i) =>
    run({ type: "time.add", companyId: C, entry: { id: `demo-time-${i}`, job_id: job, user_id: who, work_date: day(d), minutes, note, material } }, O)
  );

  // faktúry: zaplatená, odoslaná, koncept
  const inv = (id: string, customer: string, job: string, issue: number, items: [string, string, number, number][], note: string | null) => {
    run({
      type: "invoice.create", companyId: C,
      invoice: { id, customer_id: customer, job_id: job, issue_date: day(issue), delivery_date: day(issue), due_date: day(issue + 14), note },
      items: items.map(([name, unit, quantity, unit_price]) => ({ name, unit, quantity, unit_price, vat_rate: 23 })),
    }, O);
  };
  inv("demo-inv-revizia", "demo-cust-bd", "demo-job-revizia", -35, [["Revízia elektroinštalácie", "ks", 1, 120], ["Práca elektrikára", "hod", 13, 28], ["Doprava", "km", 30, 0.45]], null);
  run({ type: "invoice.setStatus", companyId: C, invoiceId: "demo-inv-revizia", status: "sent" }, O);
  run({ type: "invoice.setStatus", companyId: C, invoiceId: "demo-inv-revizia", status: "paid" }, O);
  inv("demo-inv-obec", "demo-cust-obec", "demo-job-obec", -20, [["Práca elektrikára", "hod", 5.5, 28], ["LED svietidlo verejného osvetlenia", "ks", 6, 89], ["Doprava", "km", 64, 0.45]], "Objednávka č. 12/2026");
  run({ type: "invoice.setStatus", companyId: C, invoiceId: "demo-inv-obec", status: "sent" }, O);
  inv("demo-inv-rozvadzac", "demo-cust-kovacova", "demo-job-rozvadzac", 0, [["Rozvodnica 24 modulov", "ks", 1, 32], ["Istič B16 1-pólový", "ks", 8, 4.5], ["Práca elektrikára", "hod", 4, 28]], null);

  // podpora: ukážkový chat s odpoveďou webmastra
  run({ type: "ticket.open", companyId: C, ticket: { id: "demo-ticket", subject: "Ako pridám nového člena tímu?", priority: "normal" }, message: { id: "demo-msg-1", body: "Dobrý deň, prijali sme nového elektrikára. Ako mu vytvorím prístup?" } }, O);
  run({ type: "ticket.message", ticketId: "demo-ticket", message: { id: "demo-msg-2", body: "Dobrý deň, v Administrácia → Zamestnanci kliknite na „Pridať člena tímu“, zadajte meno a dočasné heslo a vyberte predvoľbu oprávnení. Prihlási sa kódom firmy na stránke pre tím." } }, WEBMASTER);

  console.log(`[demo] demo data loaded (${n} events)`);
}
