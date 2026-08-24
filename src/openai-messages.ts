import type { NormalizedMessage } from "./normalize.ts";

export function toFunctionCallingPrompt(messages: NormalizedMessage[]): string {
  return messages
    .map((message) => {
      if (message.role === "tool") {
        return `TOOL (${message.toolCallId ?? "unknown"}):\n${message.content}`.trim();
      }

      if (message.role === "assistant" && message.toolCalls.length > 0) {
        const callBlocks = message.toolCalls
          .map((call) => {
            const args = call.function.arguments?.trim() || "{}";
            return `TOOL_CALL id=${call.id} name=${call.function.name}\nARGS:\n${args}`;
          })
          .join("\n");
        const text = message.content.trim();
        return `ASSISTANT:\n${[text, callBlocks].filter(Boolean).join("\n")}`.trim();
      }

      const label = message.role === "developer" ? "system" : message.role;
      return `${label.toUpperCase()}:\n${message.content}`.trim();
    })
    .join("\n\n");
}
