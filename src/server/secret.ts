import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Tajné hodnoty (heslo k SMTP, tokeny Polaru) idú cez hub zašifrované kľúčom, ktorý majú len
// servery (odvodený zo SESSION_SECRET). Po zmene SESSION_SECRET ich treba v paneli zadať znova.
const key = () => Buffer.from(hkdfSync("sha256", process.env.SESSION_SECRET ?? "", "robotka", "smtp-password", 32));

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed?.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null; // iný SESSION_SECRET – treba zadať znova
  }
}
