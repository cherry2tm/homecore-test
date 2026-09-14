import test from "node:test";
import assert from "node:assert/strict";

import { catalogVersion, executionBindings, modules, policyVersion, workers } from "../dist/assets/catalog.js";
import { createPlan } from "../dist/assets/planner.js";
import { evaluatePlanGate } from "../dist/assets/gate.js";

const plan = createPlan({ catalog: modules, profile: "hardware-release", mode: "assist", revision: "r1", manual: new Set(), modelAdditions: new Set(), includeImpact: false, workers, bindings: executionBindings, catalogVersion, policyVersion, modelDecisionId: undefined });

test("hardware plan is denied without matching approval", () => {
  const decision = evaluatePlanGate(plan);
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /审批/);
});

test("hardware plan is allowed only with current, unexpired, scoped approval", () => {
  const decision = evaluatePlanGate(plan, { id: "a1", planHash: plan.planHash, actionIds: plan.actionIds, targetIds: plan.targetIds, imageHashes: plan.imageHashes, leaseIds: plan.leaseIds, expiresAt: "2099-01-01T00:00:00Z", approver: "operator", level: "startup", state: "approved" });
  assert.equal(decision.allowed, true);
});

test("expired approval is denied", () => {
  const decision = evaluatePlanGate(plan, { id: "a1", planHash: plan.planHash, actionIds: plan.actionIds, targetIds: plan.targetIds, imageHashes: plan.imageHashes, leaseIds: plan.leaseIds, expiresAt: "2020-01-01T00:00:00Z", approver: "operator", level: "startup", state: "approved" });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /过期/);
});
