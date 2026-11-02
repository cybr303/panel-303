// PIN login and signed session tokens (HMAC-SHA256). No user data is stored.

const enc = new TextEncoder();
const SESSION_DAYS = 90;

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison. */
function same(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function issueToken(secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86_400_000 })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyToken(secret: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !same(sig, await hmac(secret, payload))) return false;
  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

// Simple brute-force brake per worker instance: after 5 wrong PINs from an IP, wait 10 minutes.
const fails = new Map<string, { n: number; until: number }>();

export function pinLocked(ip: string): boolean {
  const f = fails.get(ip);
  return !!f && f.n >= 5 && f.until > Date.now();
}

export function checkPin(expected: string, given: string, ip: string): boolean {
  const ok = same(expected, given);
  if (ok) fails.delete(ip);
  else {
    const f = fails.get(ip) ?? { n: 0, until: 0 };
    f.n += 1;
    f.until = Date.now() + 10 * 60_000;
    fails.set(ip, f);
  }
  return ok;
}
