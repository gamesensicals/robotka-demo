// Oprávnenia členov tímu. Majiteľ smie vždy všetko; člen tímu len to, čo má zaškrtnuté.
// „Zamestnanec“ a „správca“ sú len predvoľby (rýchle zaškrtnutie), nie roly.
// Súbor používa server (kontrola v applyEvent) aj prehliadač (formulár oprávnení).

export const PERMS = [
  "jobs.view",
  "jobs.create",
  "jobs.edit",
  "jobs.status",
  "jobs.delete",
  "files.upload",
  "files.delete",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.delete",
  "time.own",
  "time.others",
  "time.all",
  "invoices.view",
  "invoices.create",
  "invoices.edit",
  "invoices.status",
  "invoices.delete",
  "prices.view",
  "prices.edit",
  "company.settings",
  "company.credits",
  "company.team",
  "company.code",
  "support",
] as const;
export type Perm = (typeof PERMS)[number];

/** Skupiny vo formulári oprávnení (poradie = poradie na stránke). */
export const PERM_GROUPS = [
  { key: "jobs", perms: ["jobs.view", "jobs.create", "jobs.edit", "jobs.status", "jobs.delete", "files.upload", "files.delete"] },
  { key: "customers", perms: ["customers.view", "customers.create", "customers.edit", "customers.delete"] },
  { key: "time", perms: ["time.own", "time.others", "time.all"] },
  { key: "invoices", perms: ["invoices.view", "invoices.create", "invoices.edit", "invoices.status", "invoices.delete"] },
  { key: "prices", perms: ["prices.view", "prices.edit"] },
  { key: "company", perms: ["company.settings", "company.credits", "company.team", "company.code", "support"] },
] as const satisfies readonly { key: string; perms: readonly Perm[] }[];

export const PRESETS = {
  worker: ["jobs.view", "customers.view", "files.upload", "time.own"],
  manager: [
    "jobs.view", "jobs.create", "jobs.edit", "jobs.status", "files.upload",
    "customers.view", "customers.create", "customers.edit",
    "time.own", "time.others", "time.all", "prices.view",
  ],
} as const satisfies Record<string, readonly Perm[]>;
export type Preset = keyof typeof PRESETS;

/** Oprávnenia, kvôli ktorým má človek záložku Administrácia. */
export const ADMIN_PERMS: Perm[] = ["invoices.view", "prices.view", "company.settings", "company.credits", "company.team", "company.code", "support"];

const known = new Set<string>(PERMS);

/** Platné oprávnenia bez duplikátov, v pevnom poradí (rovnaký text na všetkých serveroch). */
export function normalizePerms(list: readonly string[] | null | undefined): Perm[] {
  const set = new Set((list ?? []).filter((p) => known.has(p)));
  // bez zobrazenia nemá zmysel ani úprava
  if ([...set].some((p) => p.startsWith("jobs.") || p.startsWith("files."))) set.add("jobs.view");
  if ([...set].some((p) => p.startsWith("customers."))) set.add("customers.view");
  if ([...set].some((p) => p.startsWith("invoices."))) set.add("invoices.view");
  if (set.has("prices.edit")) set.add("prices.view");
  if (set.has("time.others")) set.add("time.all");
  return PERMS.filter((p) => set.has(p));
}

export const permsText = (list: readonly string[]) => normalizePerms(list).join(" ");
export const parsePerms = (text: string | null | undefined): Perm[] => normalizePerms((text ?? "").split(" "));

/** Staré oprávnenia zamestnanca (do schémy 6): pridávať zákazky, meniť stav, pridávať zákazníkov. */
export function legacyPerms(p: { jobs?: boolean; status?: boolean; customers?: boolean }): Perm[] {
  const list: Perm[] = [...PRESETS.worker];
  if (p.jobs) list.push("jobs.create");
  if (p.status) list.push("jobs.status");
  if (p.customers) list.push("customers.create");
  return normalizePerms(list);
}

/** Ktorej predvoľbe zodpovedajú oprávnenia (null = vlastný výber). */
export function presetOf(list: readonly string[]): Preset | null {
  const t = permsText(list);
  for (const [k, v] of Object.entries(PRESETS)) if (permsText(v) === t) return k as Preset;
  return null;
}
