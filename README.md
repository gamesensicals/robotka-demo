# Robotka – demo (demo.robotka.beer)

Verejné demo aplikácie [Robotka](https://robotka.beer) pre elektrikárske firmy: zákazky, fotky zo stavby,
zákazníci, cenník, faktúry a dochádzka. Každý si ho môže vyskúšať bez registrácie.

**Prihlásenie** (je aj na úvodnej stránke dema, s prihlásením jedným klikom):

| Kto | Prihlásenie |
|---|---|
| Majiteľ | e-mail `demo@robotka.beer`, heslo `demo-demo` |
| Člen tímu – správca | kód firmy (na úvodnej stránke), meno `maria`, heslo `maria-demo` |
| Člen tímu – zamestnanec | kód firmy, meno `jozef`, heslo `jozef-demo` |

Údaje sa **každú celú hodinu** vrátia do pôvodného stavu (aj nahraté fotky sa zmažú).

## Ako sa demo líši od ostrej Robotky
- **Bez hubu a synchronizácie.** Je jeden server; každá zmena sa hneď zapíše do lokálnej SQLite
  (`src/server/sync.ts`, rovnaký `applyEvent` ako v ostrej aplikácii).
- **Súbory na disku** servera (`DATA_DIR/files`), podávané cez podpísané odkazy `/files/…`
  (`src/server/files.ts`, `src/app/files/[...key]/route.ts`). Menšie limity veľkosti.
- **Reset** pri štarte a každú celú hodinu (`src/server/demo.ts`): databáza aj súbory sa zmažú
  a nahrajú sa ukážkové dáta (`src/server/demo-seed.ts`) – dátumy sú vždy relatívne k dnešku.
  Ukážkové účty majú pevné id, takže prihlásení ostanú prihlásení.
- **Podmienky** sú len na robotka.beer: odkaz v pätičke vedie tam a `/terms` dema presmeruje na
  `https://robotka.beer/terms` (`src/lib/main-site.ts`).
- **Vypnuté:** webmaster (nie je), žiadosť o účet (odkaz na robotka.beer), platba kartou, e-maily,
  zmena hesla, nový kód firmy a odobratie / zmena roly ukážkových účtov.
- Pruh „Demo“ navrchu s časom najbližšieho resetu (`src/components/DemoBanner.tsx`), prihlasovacie
  údaje na úvode (`src/components/DemoBox.tsx`, `src/app/demo-actions.ts`), `noindex` pre vyhľadávače.

## Nasadenie na Render (zadarmo)
1. [render.com](https://render.com) → **New → Blueprint** → vyber repozitár `robotka-demo` → **Apply**.
   `render.yaml` založí službu typu Docker na pláne Free (Frankfurt), vygeneruje `SESSION_SECRET`
   a `FILES_SECRET` a nastaví `APP_URL=https://demo.robotka.beer`.
2. Po prvom zostavení skontroluj adresu `https://robotka-demo-….onrender.com`.
3. **Vlastná doména:** v Rendri pri službe **Settings → Custom Domains** je `demo.robotka.beer`
   (z `render.yaml`). V Cloudflare DNS pridaj záznam:
   ```
   CNAME  demo  robotka-demo-….onrender.com   (Proxy status: DNS only – sivý obláčik)
   ```
   Render potom sám vydá HTTPS certifikát (pár minút). „DNS only“ je potrebné, aby certifikát
   vedel overiť; neskôr sa dá proxy zapnúť (SSL/TLS režim **Full**).
4. Každý push do hlavnej vetvy repozitára Render nasadí sám.

**Ak službu zakladáš ručne** (New → Web Service namiesto Blueprintu): runtime Docker a v Environment
nastav len `SESSION_SECRET` a `FILES_SECRET` (dlhé náhodné reťazce) a `APP_URL=https://demo.robotka.beer`.
`DATA_DIR` **nenastavuj** – obraz používa `/data`. (Keby sa do `DATA_DIR` nedalo zapisovať, demo
nespadne, ale použije dočasný priečinok a v logu napíše `cannot write to …`.)

Na pláne Free: po 15 minútach bez návštevy služba zaspí a prvý návštevník čaká asi minútu.
Disk sa pri uspaní vymaže – demo sa aj tak pri štarte nahrá nanovo.

## Lokálne spustenie
```
cp .env.example .env.local
npm ci
npm run dev                 # http://localhost:3000
```
Rýchlejší reset na skúšku: `DEMO_RESET_MINUTES=3` (pruh potom píše „každé 3 minúty“, predvolene „každú celú hodinu“).

## Prenos zmien z ostrej Robotky
Demo je kópia aplikácie z repozitára `robotka`. Pri prenose novej verzie skopíruj `src/` a ponechaj
(alebo ručne zlúč) tieto súbory dema:
- `src/server/sync.ts`, `src/server/files.ts`, `src/server/db.ts` (záložný priečinok), `src/server/demo.ts`, `src/server/demo-seed.ts`
- `src/instrumentation.ts`, `src/proxy.ts` (verejné `/files`), `src/app/files/[...key]/route.ts`
- `src/app/demo-actions.ts`, `src/components/DemoBox.tsx`, `src/components/DemoBanner.tsx`
- `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/team/page.tsx`, `src/app/terms/page.tsx`,
  `src/components/SiteFooter.tsx`, `src/lib/main-site.ts`,
  `src/app/request-account/page.tsx`, `src/app/account/page.tsx`
- v prekladoch (`src/i18n/*.ts`) sekcia `demo` a chyba `demo_disabled`, v `src/server/events.ts`
  kód chyby `demo_disabled`, v `src/app/globals.css` časť `/* DEMO */`
Ak nová verzia mení schému, ukážkové dáta v `demo-seed.ts` môže byť treba doplniť. Ukážkový cenník
je `src/server/default-prices.ts` z ostrej Robotky (ten istý, aký dostane nová firma).
Najjednoduchší prenos: `git diff <posledná prenesená verzia> -- src` v repozitári robotka a `git apply`
(bez `src/app/login/page.tsx` a `src/app/request-account/page.tsx`).

## Test
`test/e2e/pages.mjs` prejde všetky stránky (majiteľ, členovia tímu, návštevník; SK/EN/CS; počítač aj mobil):
```
BASE_URL=http://localhost:3000 OWNER_EMAIL=demo@robotka.beer OWNER_PASSWORD=demo-demo npm run test:pages
```
