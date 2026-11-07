import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Dvojstupňové prihlásenie: kódy z aplikácie v mobile (TOTP, RFC 6238 – 6 číslic, 30 s, SHA-1),
// ako Google/Microsoft Authenticator či Aegis. Plus záložné kódy (každý platí raz), uložené len ako hash.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Nový tajný kľúč (160 bitov, base32). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Kód pre daný 30-sekundový krok. */
export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Overí 6-miestny kód (toleruje ±1 krok, t. j. posunuté hodiny v mobile o ~30 s). */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const c = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(now / 30_000);
  for (const d of [0, -1, 1]) {
    const expected = Buffer.from(totpAt(secret, step + d));
    if (timingSafeEqual(expected, Buffer.from(c))) return true;
  }
  return false;
}

/** Adresa pre QR kód v aplikácii (Robotka: e-mail/meno). */
export const otpauthUrl = (account: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(`Robotka:${account}`)}?secret=${secret}&issuer=Robotka&algorithm=SHA1&digits=6&period=30`;

// ───────── Záložné kódy ─────────
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // bez zameniteľných znakov (0/o, 1/l/i)
const normalizeCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** 10 záložných kódov v tvare „abcd-efgh“. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(8);
    const s = [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

/** Hash záložného kódu (soľ = id používateľa, aby sa kód nedal použiť u iného). */
export const recoveryHash = (owner: string, code: string) =>
  createHash("sha256").update(`${owner}:${normalizeCode(code)}`).digest("hex");

/** Vyzerá ako záložný kód (nie 6 číslic)? */
export const looksLikeRecovery = (s: string) => normalizeCode(s).length === 8 && !/^\d+$/.test(normalizeCode(s));
