"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { cn } from "@/lib/utils";

type Usage = {
  remaining: number;
  limit: number;
  resetAt: string;
};

function formatResetIn(resetAt: string): string {
  const ms = new Date(resetAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "shortly";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `in ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function Chat() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Usage;
      setUsage(data);
      if (data.remaining > 0) setLimitMessage(null);
    } catch {
      // ignore — UI will fall back to letting the server respond
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshUsage(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshUsage]);

  const limitReached = usage !== null && usage.remaining <= 0;
  const transport = useMemo(
    () => new AssistantChatTransport({ api: "/api/chat" }),
    [],
  );
  const runtime = useChatRuntime({
    transport,
    isDisabled: limitReached,
    onError: async (err) => {
      try {
        const parsed = JSON.parse(err.message) as {
          error?: string;
          remaining?: number;
          limit?: number;
          resetAt?: string;
        };
        if (parsed.error) {
          setLimitMessage(parsed.error);
          setErrorMessage(null);
          if (
            typeof parsed.remaining === "number" &&
            typeof parsed.limit === "number" &&
            typeof parsed.resetAt === "string"
          ) {
            setUsage({
              remaining: parsed.remaining,
              limit: parsed.limit,
              resetAt: parsed.resetAt,
            });
          }
          return;
        }
      } catch {
        // Not a structured rate-limit response. Show the runtime error below.
      }
      setErrorMessage(err.message);
      void refreshUsage();
    },
    onFinish: () => {
      setErrorMessage(null);
      void refreshUsage();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <header className="border-b bg-background/90 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">FootQuery</h1>
              <p className="text-sm text-muted-foreground">
                Premier League 2024/25 analytics
              </p>
            </div>
            {usage && (
              <div
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                  limitReached
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
                title={`Resets ${formatResetIn(usage.resetAt)}`}
              >
                {usage.remaining} / {usage.limit} messages left
              </div>
            )}
          </div>
        </header>

        {(limitMessage || (limitReached && usage)) && (
          <div className="mx-4 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {limitMessage ??
              `You've used all ${usage?.limit} of today's free messages. Try again ${formatResetIn(usage?.resetAt ?? "")}.`}
          </div>
        )}

        {errorMessage && !limitMessage && (
          <div className="mx-4 mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
