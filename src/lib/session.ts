// Relácia = podpísaná cookie "userId.platnosť.podpis". Podpis (HMAC) pozná každý server
// cez spoločné SESSION_SECRET, takže požiadavku vybaví ktorýkoľvek server bez databázy.
// Len Web Crypto, aby to fungovalo aj v proxy.ts.

export const SESSION_COOKIE = "robotka_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is missing");
  return s;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSessionValue(userId: string, days = SESSION_DAYS): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  return `${userId}.${exp}.${await sign(`${userId}.${exp}`)}`;
}

/** Vráti id používateľa, ak je cookie platná a nevypršala. */
export async function verifySession(value: string | undefined): Promise<string | null> {
  const [userId, exp, sig] = value?.split(".") ?? [];
  if (!userId || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
  const expected = await sign(`${userId}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? userId : null;
}
