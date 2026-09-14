import test from "node:test";
import assert from "node:assert/strict";

import { determineVerdict, hasCompleteEvidence } from "../dist/assets/result-contract.js";

const artifact = { id: "raw-1", relativePath: "raw/result.json", mediaType: "application/json", source: "executor" };
const passing = {
  executionStatus: "completed",
  cleanupStatus: "completed",
  assertions: [{ id: "a1", status: "PASS", expected: "ready", actual: "ready", evidenceIds: ["raw-1"] }],
  artifacts: [artifact]
};

test("complete assertions with linked evidence produce PASS", () => {
  assert.equal(hasCompleteEvidence(passing), true);
  assert.equal(determineVerdict(passing), "PASS");
});

test("missing evidence produces BLOCKED instead of PASS", () => {
  const result = { ...passing, artifacts: [] };
  assert.equal(hasCompleteEvidence(result), false);
  assert.equal(determineVerdict(result), "BLOCKED");
});

test("cleanup failure and tool failure remain BLOCKED", () => {
  assert.equal(determineVerdict({ ...passing, cleanupStatus: "failed" }), "BLOCKED");
  assert.equal(determineVerdict({ ...passing, failureKind: "tool-error" }), "BLOCKED");
});

test("a failed product assertion produces FAIL when evidence is complete", () => {
  const result = { ...passing, assertions: [{ ...passing.assertions[0], status: "FAIL" }] };
  assert.equal(determineVerdict(result), "FAIL");
});
