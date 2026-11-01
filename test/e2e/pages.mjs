// Kontrola všetkých stránok a tlačidiel pre každú rolu, jazyk a šírku obrazovky.
//
//   BASE_URL=http://localhost:3000 \
//   OWNER_EMAIL=majitel@firma.sk OWNER_PASSWORD=… \
//   WEBMASTER_EMAIL=… WEBMASTER_PASSWORD=… \
//   node test/e2e/pages.mjs
//
// Voliteľné: LANGS=sk,en,cs  WIDTHS=1280,390  SHOTS_DIR=./shots (screenshoty)  REPORT=report.json
//
// Čo robí:
// - majiteľ si vytvorí dvoch dočasných členov tímu (predvoľby „zamestnanec“ a „správca“), na konci ich odoberie,
// - pre webmastra, majiteľa, oboch členov a odhláseného návštevníka prejde všetky stránky, na ktoré
//   vedú odkazy (z každého druhu stránky jednu, napr. jednu zákazku),
// - na každej stránke v každom jazyku a šírke skontroluje: odpoveď < 400, žiadne chyby v konzole,
//   žiadne vodorovné posúvanie, žiadne „undefined/NaN/[object Object]“, žiadne pokazené obrázky,
//   v angličtine a češtine žiadne slovenské texty v ovládacích prvkoch,
// - tlačidlá: otvorí každé potvrdzovacie okno (a zruší ho – nič sa nezmaže), rozbalí rozbaľovacie
//   časti, všetky odkazy (aj PDF a exporty) musia odpovedať < 400; prepne jazyk a odhlási sa.
// Nič neukladá ani nemaže okrem dvoch dočasných členov tímu.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LANGS = (process.env.LANGS ?? "sk,en,cs").split(",").map((s) => s.trim()).filter(Boolean);
const WIDTHS = (process.env.WIDTHS ?? "1280,390").split(",").map(Number).filter(Boolean);
const SHOTS = process.env.SHOTS_DIR;
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 60);
const need = (k) => process.env[k] || (console.error(`Chýba ${k} (pozri hlavičku súboru).`), process.exit(2));
const OWNER = { email: need("OWNER_EMAIL"), password: need("OWNER_PASSWORD") };
// demo nemá webmastra – test ho preskočí, ak nie je zadaný
const WM = process.env.WEBMASTER_EMAIL ? { email: process.env.WEBMASTER_EMAIL, password: need("WEBMASTER_PASSWORD") } : null;
const HOST = new URL(BASE).hostname;

const failures = [];
const fail = (where, msg) => {
  failures.push({ where, msg });
  console.log(`FAIL ${where}: ${msg}`);
};
let checks = 0;
const pass = () => checks++;

/** Rovnaký druh stránky = rovnaký vzor (/jobs/<id> → /jobs/:id). */
const pattern = (u) => {
  const url = new URL(u, BASE);
  const path = url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id").replace(/\/\d+(?=\/|$)/g, "/:n");
  const keys = [...url.searchParams.keys()].filter((k) => !["ok", "error", "q"].includes(k)).sort();
  return path + (keys.length ? "?" + keys.join("&") : "");
};
/** Odkazy, ktoré sa neotvárajú ako stránka (súbory) – stačí, že odpovedajú. */
const isFile = (path) => /\/(pdf|export|csv)(\?|$)|\.(pdf|csv|png|jpe?g|svg|webp|mp4)(\?|$)/i.test(path);

async function newContext(browser, lang, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: "lang", value: lang, domain: HOST, path: "/" }]);
  return ctx;
}

/** Stránka so zbieraním chýb z konzoly. */
async function watched(ctx) {
  const page = await ctx.newPage();
  page.errorsSeen = [];
  page.on("pageerror", (e) => page.errorsSeen.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") page.errorsSeen.push(`console: ${m.text().slice(0, 300)}`);
  });
  return page;
}

async function submitAndWait(page, clickable) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST", { timeout: 30_000 }), clickable.click()]);
  await page.waitForLoadState("networkidle");
}

async function loginEmail(page, who) {
  await page.goto(BASE + "/login");
  await page.fill("input[name=email]", who.email);
  await page.fill("input[name=password]", who.password);
  await submitAndWait(page, page.locator("form:has(input[name=email]) button[type=submit], form:has(input[name=email]) button:not([type])").first());
  if (new URL(page.url()).pathname === "/login") throw new Error(`prihlásenie ${who.email} zlyhalo`);
}

async function loginTeam(page, code, user) {
  await page.goto(`${BASE}/team/${code}`);
  await page.fill("input[name=username]", user.username);
  await page.fill("input[name=password]", user.password);
  await submitAndWait(page, page.locator("form:has(input[name=username]) button").first());
  if (new URL(page.url()).pathname.startsWith("/team")) throw new Error(`prihlásenie člena ${user.username} zlyhalo`);
}

/** Všetky interné odkazy na stránke (bez odhlásenia a API). */
const linksOf = (page) =>
  page.evaluate((base) => {
    const out = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const u = new URL(a.getAttribute("href"), location.href);
      if (u.origin !== base || u.pathname.startsWith("/api/") || a.getAttribute("download") !== null && false) continue;
      u.hash = "";
      out.add(u.pathname + u.search);
    }
    return [...out];
  }, BASE);

/** Stránky, na ktoré sa rola dostane kliknutím (z každého druhu jedna). */
async function discover(page, seeds) {
  const seen = new Map(); // vzor → cesta
  const files = new Set();
  const queue = [...seeds];
  while (queue.length && seen.size < MAX_PAGES) {
    const path = queue.shift();
    if (isFile(path)) { files.add(path); continue; }
    const pat = pattern(path);
    if (seen.has(pat)) continue;
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => null);
    const landed = new URL(page.url());
    if (!res || res.status() >= 400) { fail(path, `odkaz vracia ${res?.status() ?? "chybu"}`); seen.set(pat, path); continue; }
    if (landed.pathname !== new URL(path, BASE).pathname) {
      // odkaz, ktorý rola vidí, ju nesmie poslať inam; výnimky: štartovacie adresy (napr. webmaster z „/“
      // na svoj panel) a prihlasovacie stránky, z ktorých prihláseného pošle domov
      // a „/“ (logo, drobčeky), ktoré každú rolu pošle na jej úvod
      const from = new URL(path, BASE).pathname;
      const auth = /^\/(login|team)(\/|$)/.test(from);
      if (!seeds.includes(path) && !auth && from !== "/") fail(path, `presmerované na ${landed.pathname}`);
      seen.set(pat, path);
      continue;
    }
    seen.set(pat, path);
    for (const l of await linksOf(page)) if (!seen.has(pattern(l))) queue.push(l);
  }
  return { pages: [...seen.values()], files: [...files] };
}

// slová, ktoré sú len slovenské (napr. „Zákazníci“ a „Kredity“ sú rovnaké aj v češtine)
const SK_WORDS = /(Uložiť|Zmazať|Zrušiť|Pridať|Prehľad|Zákazky|Dochádzka|Odhlásiť|Hľadať|Nastavenia|Faktúry|Upraviť|Odoslať)/;
const SK_ONLY_CHARS = /[ľĺŕôä]/;
const ANY_DIACRITICS = /[áäčďéíĺľňóôŕšťúýžěřů]/i;

/** Kontroly jednej stránky v danom jazyku a šírke. */
async function checkPage(page, path, label, lang, width) {
  const where = `${label} ${lang} ${width}px ${path}`;
  page.errorsSeen.length = 0;
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch((e) => (fail(where, e.message), null));
  if (!res) return;
  if (res.status() >= 400) return fail(where, `odpoveď ${res.status()}`);
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    const chrome = [
      // nadpisy panelov vynechané – často v nich sú dáta (názov firmy, zákazky)
      // kategórie cenníka (button.chip) sú dáta firmy, nie preklad
      ...[...document.querySelectorAll(".nav-left a, aside .menu a, button:not(.chip), th, legend, summary")].map((e) => e.textContent.trim()),
      ...[...document.querySelectorAll("label")].map(own),
    ].filter(Boolean);
    const overflowing = [...document.querySelectorAll("body *")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed"; })
      .slice(0, 3)
      .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
    const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== "lazy" && i.getAttribute("src")).map((i) => i.getAttribute("src").slice(0, 80));
    return {
      lang: document.documentElement.lang,
      scrollW: document.documentElement.scrollWidth,
      innerW: innerWidth,
      text: document.body.innerText,
      chrome,
      overflowing,
      broken,
    };
  });
  if (info.lang !== lang) fail(where, `html lang="${info.lang}"`); else pass();
  if (info.scrollW > info.innerW + 1) fail(where, `vodorovné posúvanie (${info.scrollW} > ${info.innerW}) – ${info.overflowing.join(", ")}`); else pass();
  const bad = info.text.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/);
  if (bad) fail(where, `text „${bad[0]}“`); else pass();
  if (info.broken.length) fail(where, `pokazené obrázky: ${info.broken.join(", ")}`); else pass();
  if (lang !== "sk") {
    // IČO, DIČ, IČ DPH sú slovenské názvy údajov, v angličtine ich nechávame v zátvorke
    const leaks = info.chrome
      .map((t) => t.replace(/IČ DPH|IČO|DIČ/g, ""))
      .filter((t) => SK_WORDS.test(t) || SK_ONLY_CHARS.test(t) || (lang === "en" && ANY_DIACRITICS.test(t)));
    // názvy jazykov v prepínači a dáta firmy (napr. meno v nadpise) nie sú preklad
    const real = leaks.filter((t) => !/Slovenčina|Čeština|^SK$|^CZ$/.test(t) && !/\d/.test(t));
    if (real.length) fail(where, `nepreložené: ${[...new Set(real)].slice(0, 5).join(" | ")}`); else pass();
  }
  if (page.errorsSeen.length) fail(where, page.errorsSeen.slice(0, 3).join(" ‖ ")); else pass();
  if (SHOTS) {
    const name = `${label}-${lang}-${width}${path.replace(/[^a-z0-9]+/gi, "_")}`.slice(0, 120);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
  }

  // potvrdzovacie okná: otvoriť a zrušiť (nič sa neodošle)
  const confirms = page.locator("button[type=button]:visible + button[hidden] + dialog.confirm");
  const nConfirm = Math.min(await confirms.count(), 4);
  for (let i = 0; i < nConfirm; i++) {
    const dialog = confirms.nth(i);
    const opener = page.locator("button[type=button]:visible + button[hidden] + dialog.confirm").nth(i).locator("xpath=preceding-sibling::button[@type='button'][1]");
    let posted = false;
    const onReq = (r) => { if (r.method() === "POST") posted = true; };
    page.on("request", onReq);
    try {
      await opener.click({ timeout: 5000 });
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      const box = await dialog.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > width + 1) fail(where, `potvrdzovacie okno ${i + 1} sa nezmestí na obrazovku`); else pass();
      await dialog.locator("button").first().click(); // Zrušiť
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      if (posted) fail(where, `zrušené potvrdzovacie okno ${i + 1} aj tak niečo odoslalo`); else pass();
    } catch (e) {
      fail(where, `potvrdzovacie okno ${i + 1}: ${e.message.split("\n")[0]}`);
    } finally {
      page.off("request", onReq);
    }
  }

  // rozbaľovacie časti (formuláre, oprávnenia…): rozbaliť a skontrolovať, že nič netrčí
  const summaries = page.locator("details:not([open]) > summary:visible");
  const nSum = Math.min(await summaries.count(), 6);
  for (let i = 0; i < nSum; i++) {
    const s = page.locator("details:not([open]) > summary:visible").first();
    if (!(await s.count())) break;
    await s.click().catch(() => {});
    await page.waitForTimeout(150);
  }
  if (nSum) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > width + 1) fail(where, `po rozbalení vodorovné posúvanie (${sw}px)`); else pass();
  }
  if (page.errorsSeen.length) fail(where + " (po kliknutiach)", page.errorsSeen.slice(0, 3).join(" ‖ "));
}

/** Odkazy na súbory (PDF, exporty) a všetky ostatné odkazy musia odpovedať < 400. */
async function checkLinks(ctx, label, paths) {
  for (const p of paths) {
    const r = await ctx.request.get(BASE + p, { maxRedirects: 0 }).catch((e) => ({ status: () => 0, e }));
    const st = r.status();
    if (st === 0 || st >= 400) fail(`${label} odkaz ${p}`, `odpoveď ${st}`); else pass();
  }
}

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const rnd = Date.now().toString(36).slice(-5);
  const team = [
    { username: `e2e-zam-${rnd}`, password: `e2e-heslo-${rnd}-1`, preset: "worker", label: "zamestnanec" },
    { username: `e2e-spr-${rnd}`, password: `e2e-heslo-${rnd}-2`, preset: "manager", label: "spravca" },
  ];

  // príprava: majiteľ pridá dvoch dočasných členov tímu
  const ownerCtx = await newContext(browser, "sk", 1280);
  const owner = await watched(ownerCtx);
  await loginEmail(owner, OWNER);
  await owner.goto(BASE + "/admin/employees");
  const code = (await owner.locator(".code-box").first().textContent())?.trim();
  for (const m of team) {
    if (!(await owner.locator("details.create-member[open]").count())) await owner.click("details.create-member summary");
    await owner.fill(".add-member input[name=username]", m.username);
    await owner.fill(".add-member input[name=password]", m.password);
    await owner.selectOption(".add-member select[name=preset]", m.preset);
    await submitAndWait(owner, owner.locator(".add-member button.primary").first());
  }

  const roles = [
    ...(WM ? [{ label: "webmaster", login: (p) => loginEmail(p, WM), seeds: ["/webmaster", "/account"] }] : []),
    { label: "majitel", login: (p) => loginEmail(p, OWNER), seeds: ["/", "/admin", "/account"] },
    ...team.map((m) => ({ label: m.label, login: (p) => loginTeam(p, code, m), seeds: ["/", "/admin", "/account"] })),
    { label: "navstevnik", login: async () => {}, seeds: ["/login", "/team", `/team/${code}`, "/request-account"] },
  ];

  try {
    for (const role of roles) {
      console.log(`\n== ${role.label}`);
      // 1) zistiť stránky (sk, desktop)
      const ctx = await newContext(browser, "sk", 1280);
      const page = await watched(ctx);
      await role.login(page);
      const { pages, files } = await discover(page, role.seeds);
      console.log(`   stránok: ${pages.length}, súborov: ${files.length}`);
      await checkLinks(ctx, role.label, files);

      // 2) každá stránka v každom jazyku a šírke
      for (const lang of LANGS) {
        for (const width of WIDTHS) {
          await ctx.addCookies([{ name: "lang", value: lang, domain: HOST, path: "/" }]);
          await page.setViewportSize({ width, height: 900 });
          for (const p of pages) await checkPage(page, p, role.label, lang, width);
        }
      }

      // 3) prepínač jazyka a odhlásenie
      await ctx.addCookies([{ name: "lang", value: "sk", domain: HOST, path: "/" }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(BASE + (role.label === "navstevnik" ? "/login" : "/account"));
      await submitAndWait(page, page.locator(".langs button[value=en]"));
      if ((await page.evaluate(() => document.documentElement.lang)) !== "en") fail(role.label, "prepínač jazyka nefunguje"); else pass();
      await ctx.addCookies([{ name: "lang", value: "sk", domain: HOST, path: "/" }]);
      if (role.label !== "navstevnik") {
        await page.goto(BASE + "/account");
        const out = page.locator(".nav-right form button, .nav-right button").last();
        await submitAndWait(page, out);
        const after = new URL(page.url()).pathname;
        if (!["/login", "/team", "/"].includes(after) || (await page.locator("input[name=password]").count()) === 0 && after !== "/") fail(role.label, `odhlásenie skončilo na ${after}`); else pass();
      }
      await ctx.close();
    }
  } finally {
    // upratanie: odobrať dočasných členov tímu (aj tých, čo ostali po prerušenom behu)
    for (let i = 0; i < 20; i++) {
      await owner.goto(BASE + "/admin/employees").catch(() => {});
      const row = owner.locator(".members tr", { has: owner.locator('.row-title:text-matches("^e2e-(zam|spr)-")') }).first();
      if (!(await row.count())) break;
      await row.locator("button.danger.small[type=button]:visible").first().click();
      await owner.locator("dialog[open]").waitFor();
      await submitAndWait(owner, owner.locator("dialog[open] button.danger"));
    }
    await browser.close();
  }

  console.log(`\n${checks} kontrol v poriadku, ${failures.length} chýb`);
  if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify({ checks, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
