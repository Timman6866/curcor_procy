import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandModelCatalog,
  hasThinkingModelSuffix,
  parseReasoningOptions,
  stripThinkingModelSuffix,
} from "./reasoning.ts";

test("detects and strips thinking model suffixes", () => {
  assert.equal(hasThinkingModelSuffix("composer-2.5-thinking"), true);
  assert.equal(stripThinkingModelSuffix("composer-2.5-thinking"), "composer-2.5");
  assert.equal(stripThinkingModelSuffix("gpt-5-reasoning"), "gpt-5");
});

test("enables reasoning for thinking model ids", () => {
  assert.deepEqual(parseReasoningOptions("composer-2.5-thinking", {}), {
    enabled: true,
    effort: "medium",
  });
});

test("enables reasoning from reasoning_effort", () => {
  assert.deepEqual(parseReasoningOptions("composer-2.5", { reasoning_effort: "high" }), {
    enabled: true,
    effort: "high",
  });
});

test("disables reasoning when reasoning_effort is none", () => {
  assert.deepEqual(parseReasoningOptions("composer-2.5-thinking", { reasoning_effort: "none" }), {
    enabled: false,
  });
});

test("expands model catalog with thinking variants", () => {
  assert.deepEqual(expandModelCatalog(["composer-2.5"]), ["composer-2.5", "composer-2.5-thinking"]);
});
