"use client";

import { cn } from "@/lib/utils";

type ToolCallPillProps = {
  toolName: string;
  input: unknown;
  output?: unknown;
  state: string;
};

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeOutput(output: unknown): string {
  if (!output || typeof output !== "object") return formatValue(output);

  const obj = output as Record<string, unknown>;

  if ("player_name" in obj) {
    return String(obj.player_name);
  }
  if ("name" in obj && "team_id" in obj) {
    return String(obj.name);
  }
  if ("row_count" in obj) {
    return `${obj.row_count} rows`;
  }
  if ("error" in obj) {
    return `Error: ${obj.error}`;
  }
  if ("candidates" in obj && Array.isArray(obj.candidates)) {
    return `${obj.candidates.length} candidates`;
  }

  return formatValue(output).slice(0, 80);
}

export function ToolCallPill({
  toolName,
  input,
  output,
  state,
}: ToolCallPillProps) {
  const inputObj = (input ?? {}) as Record<string, unknown>;
  const label =
    toolName === "resolve_entity"
      ? `resolve_entity("${inputObj.text ?? ""}")`
      : toolName === "run_sql"
        ? "run_sql"
        : toolName;

  const isDone = state === "output-available" || state === "output-error";
  const summary = isDone ? summarizeOutput(output) : "running…";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono",
        isDone
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
      )}
    >
      <span className="font-semibold">{label}</span>
      {isDone && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className="max-w-[320px] break-words">{summary}</span>
        </>
      )}
      {!isDone && <span className="animate-pulse">{summary}</span>}
    </div>
  );
}
