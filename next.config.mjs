/**
 * `next dev` povoľuje vývojové požiadavky (HMR, /_next/…) len z localhost. Keď appku otvoríš cez
 * 127.0.0.1 alebo IP v sieti (mobil), treba tú adresu povoliť – inak nefungujú tlačidlá ani prihlásenie.
 * Ďalšie adresy: DEV_ORIGINS=192.168.1.20,mojpc.local v .env / .env.local (Next ich načíta ešte pred týmto
 * súborom; len pre vývoj, na produkciu nemá vplyv).
 */
/** DEV_ORIGINS z panelu webmastra (Konfigurácia) – prečíta sa z lokálnej databázy servera. */
async function panelDevOrigins() {
  try {
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "robotka.db");
    if (!existsSync(file)) return "";
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare("SELECT value FROM app_config WHERE key = 'dev_origins'").get();
    db.close();
    return row?.value ?? "";
  } catch {
    return "";
  }
}

const devOrigins = [
  "127.0.0.1",
  ...[process.env.DEV_ORIGINS ?? "", process.env.NODE_ENV === "production" ? "" : await panelDevOrigins()].join(",").split(",").map((s) => s.trim().replace(/^https?:\/\//, "").replace(/[:/].*$/, "")).filter(Boolean),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Samostatný build pre Docker: žiadny stav na serveri, ľahko sa kopíruje na ďalšie servery.
  output: "standalone",
  allowedDevOrigins: [...new Set(devOrigins)],
  // PDF faktúr: pdfkit číta svoje dátové súbory z disku, preto sa nebalí do bundlu
  serverExternalPackages: ["pdfkit", "qrcode", "bysquare"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" }, // fotky zo stavby
  },
};

export default nextConfig;
