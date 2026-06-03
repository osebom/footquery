import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createFootqueryChatModel } from "./cohere-model";
import { SYSTEM_PROMPT } from "./system-prompt";
import { agentTools } from "./tools";

export const agent = createReactAgent({
  llm: createFootqueryChatModel(),
  tools: agentTools,
  prompt: SYSTEM_PROMPT,
});
