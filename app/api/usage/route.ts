import { getUsageSnapshot } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getUsageSnapshot();
    return Response.json(snapshot, {
      headers: {
        "X-RateLimit-Limit": String(snapshot.limit),
        "X-RateLimit-Remaining": String(snapshot.remaining),
        "X-RateLimit-Reset": snapshot.resetAt,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to read usage.";
    return Response.json({ error: message }, { status: 500 });
  }
}
