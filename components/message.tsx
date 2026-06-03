"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { ToolCallPill } from "./tool-call-pill";
import { cn } from "@/lib/utils";

type MessageProps = {
  message: UIMessage;
};

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-emerald-600 text-white"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
        )}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <p key={index} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            return (
              <ToolCallPill
                key={index}
                toolName={toolName}
                input={"input" in part ? part.input : undefined}
                output={"output" in part ? part.output : undefined}
                state={part.state}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
