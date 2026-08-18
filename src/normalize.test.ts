import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBody, resolveModel, toPrompt } from "./normalize.ts";

test("normalizes chat completions messages", () => {
  const req = normalizeBody({
    model: "composer-2.5",
    messages: [
      { role: "system", content: "Be brief." },
      { role: "user", content: [{ type: "text", text: "Hi" }] },
    ],
  });
  assert.equal(req.model, "composer-2.5");
  assert.equal(req.displayModel, "composer-2.5");
  assert.equal(req.messages.length, 2);
  assert.equal(toPrompt(req.messages), "SYSTEM:\nBe brief.\n\nUSER:\nHi");
});

test("normalizes Responses API input arrays", () => {
  const req = normalizeBody({
    model: "composer-2.5",
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Ping" }] },
    ],
  });
  assert.equal(req.messages[0]?.content, "Ping");
});

test("rejects empty bodies", () => {
  assert.throws(() => normalizeBody({}), /messages or input/);
});

test("maps thinking model ids and enables reasoning", () => {
  const req = normalizeBody({
    model: "composer-2.5-thinking",
    messages: [{ role: "user", content: "Think" }],
  });
  assert.equal(req.model, "composer-2.5-thinking");
  assert.equal(req.displayModel, "composer-2.5-thinking");
  assert.equal(req.reasoning.enabled, true);
  assert.equal(resolveModel(req.model, "composer-2.5"), "composer-2.5");
});

test("maps placeholder OpenAI model ids to the default", () => {
  assert.equal(resolveModel("gpt-4o", "composer-2.5"), "composer-2.5");
  assert.equal(resolveModel("composer-2.5-fast", "composer-2.5"), "composer-2.5-fast");
});
