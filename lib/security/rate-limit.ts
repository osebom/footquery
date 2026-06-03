import "@/lib/server-guard";
import { cookies } from "next/headers";
import { signCookieValue, verifyCookieValue } from "./session";

export const MESSAGE_LIMIT = Number(process.env.CHAT_MESSAGE_LIMIT ?? "5");
const WINDOW_MINUTES = Number(process.env.CHAT_WINDOW_MINUTES ?? "1440");
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const COOKIE_NAME = "fq_quota";

type QuotaPayload = { c: number; w: number };

export type UsageSnapshot = {
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
};

export type RateLimitResult =
  | ({ allowed: true } & UsageSnapshot)
  | ({ allowed: false; reason: "limit_reached" } & UsageSnapshot);

function loadPayload(raw: string | undefined, now: number): QuotaPayload {
  const parsed = verifyCookieValue<QuotaPayload>(raw);
  if (
    !parsed ||
    typeof parsed.c !== "number" ||
    typeof parsed.w !== "number" ||
    !Number.isFinite(parsed.c) ||
    !Number.isFinite(parsed.w) ||
    parsed.c < 0 ||
    parsed.c > 10_000
  ) {
    return { c: 0, w: now };
  }
  if (now - parsed.w > WINDOW_MS) {
    return { c: 0, w: now };
  }
  return parsed;
}

function toSnapshot(payload: QuotaPayload): UsageSnapshot {
  const used = Math.min(payload.c, MESSAGE_LIMIT);
  return {
    used,
    remaining: Math.max(0, MESSAGE_LIMIT - used),
    limit: MESSAGE_LIMIT,
    resetAt: new Date(payload.w + WINDOW_MS).toISOString(),
  };
}

async function writeCookie(payload: QuotaPayload): Promise<void> {
  const store = await cookies();
  try {
    store.set(COOKIE_NAME, signCookieValue(payload), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.ceil(WINDOW_MS / 1000) + 60,
    });
  } catch {
    // cookies().set is only writable from Route Handlers / Server Actions.
    // Read-only contexts (e.g. RSC render) will hit this branch; the next
    // mutating request will persist the cookie.
  }
}

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  const store = await cookies();
  const payload = loadPayload(store.get(COOKIE_NAME)?.value, Date.now());
  return toSnapshot(payload);
}

export async function consumeMessageCredit(): Promise<RateLimitResult> {
  const store = await cookies();
  const now = Date.now();
  const payload = loadPayload(store.get(COOKIE_NAME)?.value, now);

  if (payload.c >= MESSAGE_LIMIT) {
    return {
      allowed: false,
      reason: "limit_reached",
      ...toSnapshot(payload),
    };
  }

  const next: QuotaPayload = { c: payload.c + 1, w: payload.w };
  await writeCookie(next);

  return { allowed: true, ...toSnapshot(next) };
}
