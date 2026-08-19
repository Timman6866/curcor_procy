import assert from "node:assert/strict";
import { test } from "node:test";
import { filterModelIds, parseDisabledModels } from "./model-catalog.ts";

test("parseDisabledModels deduplicates and trims ids", () => {
  assert.deepEqual(parseDisabledModels([" gpt-5 ", "gpt-5", "", 1]), ["gpt-5"]);
});

test("filterModelIds hides disabled models", () => {
  const ids = ["composer-2.5", "grok-4.6", "composer-2.5-thinking"];
  assert.deepEqual(filterModelIds(ids, new Set(["grok-4.6"])), [
    "composer-2.5",
    "composer-2.5-thinking",
  ]);
});
