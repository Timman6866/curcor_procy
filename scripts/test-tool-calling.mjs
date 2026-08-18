import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const apiKey = env.CURSOR_API_KEY;
const base = process.env.COMPAT_BASE_URL ?? "http://127.0.0.1:8787/v1";

const body = {
  model: "composer-2.5",
  stream: false,
  tools: [
    {
      type: "function",
      function: {
        name: "bash",
        description: "Run a bash command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
      },
    },
  ],
  tool_choice: "required",
  messages: [
    {
      role: "user",
      content: "Run bash to print exactly: tool-ok",
    },
  ],
};

const res = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 2000));
