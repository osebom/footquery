"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Message } from "./message";
import { Send } from "lucide-react";

const EXAMPLE_QUESTIONS = [
  "Who scored the most goals in 2024/25?",
  "What was Chelsea's worst defeat of the season?",
  "Which defender had the longest scoring streak?",
  "Which player scored the most match-winning goals?",
];

type Usage = {
  remaining: number;
  limit: number;
  resetAt: string;
};

function formatResetIn(resetAt: string): string {
  const ms = new Date(resetAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "shortly";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60)
    return `in ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60)
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function Chat() {
  const [input, setInput] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, clearError } = useChat({
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
        // not JSON — fall through to refetching the snapshot
      }
      void refreshUsage();
    },
    onFinish: () => {
      void refreshUsage();
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

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
    void refreshUsage();
  }, [refreshUsage]);

  const limitReached = usage !== null && usage.remaining <= 0;
  const inputDisabled = isLoading || limitReached;

  const submit = async (text: string) => {
    if (!text || inputDisabled) return;
    clearError?.();
    setLimitMessage(null);
    await sendMessage({ text });
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await submit(text);
  };

  const askExample = async (question: string) => {
    await submit(question);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">FootQuery</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Premier League 2024/25 analytics — ask anything in plain English
            </p>
          </div>
          {usage && (
            <div
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                limitReached
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
              title={`Resets ${formatResetIn(usage.resetAt)}`}
            >
              {usage.remaining} / {usage.limit} messages left
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <p className="text-center text-zinc-500 dark:text-zinc-400">
              Ask a statistical question about the 2024/25 Premier League season.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askExample(q)}
                  disabled={inputDisabled}
                  className="rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:border-emerald-600 dark:hover:bg-emerald-950"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {(limitMessage || (limitReached && usage)) && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {limitMessage ??
            `You've used all ${usage?.limit} of today's free messages. Try again ${formatResetIn(usage?.resetAt ?? "")}.`}
        </div>
      )}

      {error && !limitMessage && (
        <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              limitReached
                ? "Daily message limit reached"
                : "e.g. What's the most goals Jackson scored in a single match?"
            }
            disabled={inputDisabled}
            className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={inputDisabled || !input.trim()}
            className="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
