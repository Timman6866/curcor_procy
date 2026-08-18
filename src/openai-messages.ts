import type { NormalizedMessage } from "./normalize.ts";

export function toFunctionCallingPrompt(messages: NormalizedMessage[]): string {
  return messages
    .map((message) => {
      if (message.role === "tool") {
        return `TOOL (${message.toolCallId ?? "unknown"}):\n${message.content}`.trim();
      }

      if (message.role === "assistant" && message.toolCalls.length > 0) {
        const callLines = message.toolCalls
          .map(
            (call) =>
              `[tool_call id=${call.id} name=${call.function.name} args=${call.function.arguments}]`,
          )
          .join("\n");
        const text = message.content.trim();
        return `ASSISTANT:\n${[text, callLines].filter(Boolean).join("\n")}`.trim();
      }

      const label = message.role === "developer" ? "system" : message.role;
      return `${label.toUpperCase()}:\n${message.content}`.trim();
    })
    .join("\n\n");
}
