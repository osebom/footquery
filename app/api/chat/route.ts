import { toBaseMessages, toUIMessageStream } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { agent } from "@/lib/agent/graph";
import { consumeMessageCredit } from "@/lib/security/rate-limit";

export const maxDuration = 60;

// Recursion budget = MAX_AGENT_STEPS * 2 (LangGraph counts the agent node +
// the tools node as 2 steps per "round"). 10 rounds is plenty for normal flows
// (resolve_entity → run_sql → answer is 3 rounds) and still bounds runaway
// loops if the model gets stuck retrying a broken query.
const MAX_AGENT_STEPS = 10;

function rateLimitHeaders(snapshot: {
  limit: number;
  remaining: number;
  resetAt: string;
}): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(snapshot.limit),
    "X-RateLimit-Remaining": String(snapshot.remaining),
    "X-RateLimit-Reset": snapshot.resetAt,
  };
}

type ResolvedEntity = {
  name: string;
  type: "player" | "team";
  id: string | number;
};

// Append the @-picked entity ids to the user's turn as a short note, so the
// agent can use them directly instead of calling resolve_entity.
function applyResolvedEntities(
  message: UIMessage,
  entities: ResolvedEntity[],
): void {
  const valid = entities.filter(
    (e) =>
      e &&
      (e.type === "player" || e.type === "team") &&
      typeof e.name === "string" &&
      (typeof e.id === "string" || typeof e.id === "number"),
  );
  if (valid.length === 0) return;

  const note = valid
    .map((e) => `${e.name} = ${e.type}_id ${e.id}`)
    .join("; ");

  message.parts = [
    ...(message.parts ?? []),
    {
      type: "text",
      text: `\n\n[Pre-resolved entities (already mapped from the user's @ mentions — use these IDs directly and do NOT call resolve_entity for them): ${note}]`,
    },
  ];
}

export async function POST(req: Request) {
  let body: { messages?: UIMessage[]; resolvedEntities?: ResolvedEntity[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return Response.json(
      { error: "Expected a user message at the end of `messages`." },
      { status: 400 },
    );
  }

  if (Array.isArray(body.resolvedEntities) && body.resolvedEntities.length > 0) {
    applyResolvedEntities(messages[messages.length - 1], body.resolvedEntities);
  }

  let limit;
  try {
    limit = await consumeMessageCredit();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Rate limit check failed.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!limit.allowed) {
    const resetMs = Math.max(0, new Date(limit.resetAt).getTime() - Date.now());
    const retrySeconds = Math.max(1, Math.ceil(resetMs / 1000));
    const retryLabel =
      retrySeconds < 60
        ? `${retrySeconds} second${retrySeconds === 1 ? "" : "s"}`
        : retrySeconds < 3600
          ? `${Math.ceil(retrySeconds / 60)} minute${Math.ceil(retrySeconds / 60) === 1 ? "" : "s"}`
          : `about ${Math.ceil(retrySeconds / 3600)} hour${Math.ceil(retrySeconds / 3600) === 1 ? "" : "s"}`;
    return Response.json(
      {
        error: `You've reached the free message limit (${limit.limit}). Try again in ${retryLabel}.`,
        ...limit,
      },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(limit),
          "Retry-After": String(Math.ceil(resetMs / 1000)),
        },
      },
    );
  }

  const langchainMessages = await toBaseMessages(messages);

  const eventStream = await agent.stream(
    { messages: langchainMessages },
    {
      streamMode: ["messages", "values"],
      recursionLimit: MAX_AGENT_STEPS * 2,
    },
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(eventStream),
    headers: rateLimitHeaders(limit),
  });
}
