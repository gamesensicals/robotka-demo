import { CONFIG_KEYS, type ConfigKey } from "./events";
import { getDb } from "./db";
import { openSecret } from "./secret";

// Nastavenia, ktoré webmaster mení v paneli (Webmaster → Konfigurácia). Hodnota z panelu (cez hub,
// rovnaká na všetkých serveroch) má prednosť; inak platí .env.

export const ENV_NAME: Record<ConfigKey, string> = {
  polar_access_token: "POLAR_ACCESS_TOKEN",
  polar_webhook_secret: "POLAR_WEBHOOK_SECRET",
  polar_product_id: "POLAR_PRODUCT_ID",
  polar_server: "POLAR_SERVER",
  app_url: "APP_URL",
  webmaster_email: "WEBMASTER_EMAIL",
  webmaster_password_hash: "WEBMASTER_PASSWORD_HASH",
  dev_origins: "DEV_ORIGINS",
  demo_url: "DEMO_URL",
};
/** Demo na vyskúšanie (odkaz na úvodnej stránke), ak nie je nastavené inak. */
export const DEFAULT_DEMO_URL = "https://demo.robotka.beer";
export const demoUrl = () => config("demo_url") || DEFAULT_DEMO_URL;
/** Tieto sa ukladajú zašifrované. */
export const SECRET_KEYS: readonly ConfigKey[] = ["polar_access_token", "polar_webhook_secret"];

/** Hodnota z panelu (dešifrovaná), alebo null. */
export function panelValue(key: ConfigKey): string | null {
  let raw: string | undefined;
  try {
    raw = (getDb().prepare("SELECT value FROM app_config WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  } catch {
    return null; // databáza ešte nie je pripravená
  }
  if (raw == null) return null;
  return SECRET_KEYS.includes(key) ? openSecret(raw) : raw;
}

/** Platná hodnota: panel, inak .env. */
export function config(key: ConfigKey): string | undefined {
  const v = panelValue(key);
  if (v) return v;
  return process.env[ENV_NAME[key]]?.trim() || undefined;
}

/** Odkiaľ hodnota je (pre panel). */
export function configSource(key: ConfigKey): "panel" | "env" | null {
  if (panelValue(key)) return "panel";
  return process.env[ENV_NAME[key]]?.trim() ? "env" : null;
}

export const ALL_CONFIG_KEYS = CONFIG_KEYS;
