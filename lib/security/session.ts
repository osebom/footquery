import "@/lib/server-guard";
import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET env var is missing or too short. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and set it in .env.local",
    );
  }
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "hex");
    bufB = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signCookieValue(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyCookieValue<T = unknown>(
  raw: string | undefined,
): T | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqualHex(sig, hmac(encoded))) return null;
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
