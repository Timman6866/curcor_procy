import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildModelParams,
  expandModelCatalog,
  hasFastModelSuffix,
  hasThinkingModelSuffix,
  parseModelVariants,
  resolveModelBaseId,
  stripThinkingModelSuffix,
} from "./model-variants.ts";

test("detects and strips thinking model suffixes", () => {
  assert.equal(hasThinkingModelSuffix("composer-2.5-thinking"), true);
  assert.equal(stripThinkingModelSuffix("composer-2.5-thinking"), "composer-2.5");
  assert.equal(stripThinkingModelSuffix("gpt-5-reasoning"), "gpt-5");
});

test("detects fast and standard suffixes", () => {
  assert.equal(hasFastModelSuffix("composer-2.5-fast"), true);
  const fast = parseModelVariants("composer-2.5-fast", {});
  assert.equal(fast.baseId, "composer-2.5");
  assert.deepEqual(fast.fast, { enabled: true });

  const standard = parseModelVariants("composer-2.5-standard", {});
  assert.equal(standard.baseId, "composer-2.5");
  assert.deepEqual(standard.fast, { enabled: false });
});

test("parses combined fast and thinking suffixes", () => {
  const variants = parseModelVariants("composer-2.5-fast-thinking", {});
  assert.equal(variants.baseId, "composer-2.5");
  assert.deepEqual(variants.fast, { enabled: true });
  assert.deepEqual(variants.reasoning, { enabled: true, effort: "medium" });
  assert.equal(resolveModelBaseId("composer-2.5-fast-thinking", "composer-2.5"), "composer-2.5");
});

test("enables reasoning for thinking model ids", () => {
  assert.deepEqual(parseModelVariants("composer-2.5-thinking", {}).reasoning, {
    enabled: true,
    effort: "medium",
  });
});

test("enables reasoning from reasoning_effort", () => {
  assert.deepEqual(parseModelVariants("composer-2.5", { reasoning_effort: "high" }).reasoning, {
    enabled: true,
    effort: "high",
  });
});

test("disables reasoning when reasoning_effort is none", () => {
  assert.deepEqual(parseModelVariants("composer-2.5-thinking", { reasoning_effort: "none" }).reasoning, {
    enabled: false,
  });
});

test("reads fast overrides from request body", () => {
  assert.deepEqual(parseModelVariants("composer-2.5", { fast: true }).fast, { enabled: true });
  assert.deepEqual(parseModelVariants("composer-2.5", { model_speed: "standard" }).fast, {
    enabled: false,
  });
});

test("parses Cursor bracket syntax for fast", () => {
  const variants = parseModelVariants("composer-2.5[fast=false]", {});
  assert.equal(variants.baseId, "composer-2.5");
  assert.deepEqual(variants.fast, { enabled: false });
});

test("builds model params for fast and reasoning", () => {
  assert.deepEqual(
    buildModelParams({ enabled: true, effort: "high" }, { enabled: true }),
    [
      { id: "fast", value: "true" },
      { id: "reasoning_effort", value: "high" },
    ],
  );
  assert.deepEqual(buildModelParams({ enabled: false }, { enabled: false }), [
    { id: "fast", value: "false" },
  ]);
});

test("expands composer catalog with standard and thinking (base is already fast)", () => {
  assert.deepEqual(expandModelCatalog(["composer-2.5"]), [
    "composer-2.5",
    "composer-2.5-standard",
    "composer-2.5-thinking",
    "composer-2.5-standard-thinking",
  ]);
});

test("expands non-composer models with fast and standard variants", () => {
  assert.deepEqual(expandModelCatalog(["cursor-grok-4.6-high"]), [
    "cursor-grok-4.6-high",
    "cursor-grok-4.6-high-fast",
    "cursor-grok-4.6-high-standard",
    "cursor-grok-4.6-high-thinking",
    "cursor-grok-4.6-high-fast-thinking",
  ]);
});

test("adds thinking variant for existing fast model ids", () => {
  assert.deepEqual(expandModelCatalog(["cursor-grok-4.5-high-fast"]), [
    "cursor-grok-4.5-high-fast",
    "cursor-grok-4.5-high-fast-thinking",
  ]);
});
