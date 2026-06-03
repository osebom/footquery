import { ChatCohere } from "@langchain/cohere";
import type { AIMessageChunk } from "@langchain/core/messages";
import type { ChatGenerationChunk } from "@langchain/core/outputs";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";

type CohereToolCall = {
  name: string;
  parameters: unknown;
};

type FormattedCohereToolCall = {
  id: string;
  function: { name: string; arguments: string };
  type: "function";
};

type CohereInternals = {
  _formatCohereToolCalls: (
    toolCalls: CohereToolCall[] | null,
  ) => FormattedCohereToolCall[];
  _streamResponseChunks: (
    messages: BaseMessage[],
    options: ChatCohere["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ) => AsyncGenerator<ChatGenerationChunk>;
};

function stringifyToolArguments(args: unknown): string {
  return typeof args === "string" ? args : JSON.stringify(args ?? {});
}

/**
 * Cohere returns tool parameters as objects, but LangChain's stream merger
 * expects JSON string fragments in tool_call_chunks. Without this patch,
 * merged args become "[object Object]" and land in invalid_tool_calls.
 */
export function createFootqueryChatModel(): ChatCohere {
  const model = new ChatCohere({
    model: process.env.COHERE_MODEL ?? "command-r-plus-08-2024",
    apiKey: process.env.COHERE_API_KEY,
    temperature: 0,
    streaming: true,
  });

  const internals = model as unknown as CohereInternals;

  const originalFormat = internals._formatCohereToolCalls.bind(model);
  internals._formatCohereToolCalls = (toolCalls) => {
    const formatted = originalFormat(toolCalls);
    return formatted.map((toolCall) => ({
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: stringifyToolArguments(toolCall.function.arguments),
      },
    }));
  };

  const originalStream = internals._streamResponseChunks.bind(model);
  internals._streamResponseChunks = async function* (
    messages,
    options,
    runManager,
  ) {
    for await (const chunk of originalStream(messages, options, runManager)) {
      const message = chunk.message as AIMessageChunk;
      const toolCallChunks = message.tool_call_chunks;
      if (toolCallChunks?.length) {
        for (const toolCallChunk of toolCallChunks) {
          if (
            toolCallChunk.args != null &&
            typeof toolCallChunk.args !== "string"
          ) {
            toolCallChunk.args = stringifyToolArguments(toolCallChunk.args);
          }
        }
      }
      yield chunk;
    }
  };

  return model;
}
