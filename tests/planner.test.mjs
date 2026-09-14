import test from "node:test";
import assert from "node:assert/strict";

import { catalogVersion, executionBindings, modules, policyVersion, workers } from "../dist/assets/catalog.js";
import { approvalForRisk, catalogPolicyViolations, createPlan, mayConcludePass, resolveSelections } from "../dist/assets/planner.js";

const base = {
  catalog: modules,
  revision: "08c4bc06c2b3",
  manual: new Set(),
  modelAdditions: new Set(),
  includeImpact: false,
  workers,
  bindings: executionBindings,
  catalogVersion,
  policyVersion,
  modelDecisionId: undefined,
  dirtyState: "clean",
  diffHash: "sha256:test-diff"
};

test("merge profile injects and locks every required build module", () => {
  const plan = createPlan({ ...base, profile: "merge", mode: "assist" });
  const selected = plan.selections.filter((item) => item.selected);
  const ids = selected.map((item) => item.moduleId);

  assert.deepEqual(ids, ["integrity", "static", "stm32", "libraries", "esp32", "report"]);
  assert.equal(selected.every((item) => item.locked), true);
  assert.equal(plan.requiredApproval, "none");
  assert.equal(plan.stages.some((stage) => stage.platform === "windows"), true);
  assert.deepEqual(plan.blockedReasons, []);
});

test("manual hardware selection injects and locks transitive dependencies", () => {
  const selections = resolveSelections(modules, "inspect", new Set(["uart"]), false, new Set());
  const uart = selections.find((item) => item.moduleId === "uart");
  const stm32 = selections.find((item) => item.moduleId === "stm32");
  const esp32 = selections.find((item) => item.moduleId === "esp32");

  assert.deepEqual(uart, { moduleId: "uart", selected: true, locked: false, sources: ["manual"] });
  assert.equal(stm32?.selected, true);
  assert.equal(stm32?.locked, true);
  assert.equal(stm32?.sources.includes("dependency"), true);
  assert.equal(esp32?.selected, true);
  assert.equal(esp32?.locked, true);
});

test("accepted model additions are visible and still receive deterministic dependencies", () => {
  const plan = createPlan({
    ...base,
    profile: "merge",
    mode: "assist",
    modelAdditions: new Set(["uart", "network"])
  });
  const network = plan.selections.find((item) => item.moduleId === "network");
  const uart = plan.selections.find((item) => item.moduleId === "uart");

  assert.equal(network?.sources.includes("model"), true);
  assert.equal(network?.locked, false);
  assert.equal(uart?.sources.includes("dependency"), true);
  assert.equal(plan.requiredApproval, "startup");
});

test("OTA actions always raise approval to reauthentication", () => {
  const plan = createPlan({
    ...base,
    profile: "inspect",
    mode: "manual",
    manual: new Set(["ota"])
  });

  assert.equal(plan.requiredApproval, "reauth");
  assert.equal(approvalForRisk(["low", "controlled", "high"]), "reauth");
  assert.equal(plan.actionIds.includes("lab.power-loss-injection"), true);
  assert.equal(plan.targetIds.includes("HC-F767-DEV-04"), true);
  assert.equal(plan.imageHashes.length > 0, true);
  assert.equal(plan.leaseIds.includes("lease-lab-a-slot-02"), true);
});

test("plan hash is stable and changes with policy-relevant input", () => {
  const one = createPlan({ ...base, profile: "merge", mode: "assist" });
  const two = createPlan({ ...base, profile: "merge", mode: "assist" });
  const changedMode = createPlan({ ...base, profile: "merge", mode: "manual" });
  const changedRevision = createPlan({ ...base, profile: "merge", mode: "assist", revision: "b108da1f23ec" });

  assert.equal(one.planHash, two.planHash);
  assert.notEqual(one.planHash, changedMode.planHash);
  assert.notEqual(one.planHash, changedRevision.planHash);

  const changedCatalog = structuredClone(modules);
  changedCatalog.find((item) => item.id === "esp32").commandIds = ["homecore.esp-zigbee-build-v2"];
  const changedCommand = createPlan({ ...base, catalog: changedCatalog, profile: "merge", mode: "assist" });
  const changedPolicy = createPlan({ ...base, policyVersion: "policy-v8", profile: "merge", mode: "assist" });
  assert.notEqual(one.planHash, changedCommand.planHash);
  assert.notEqual(one.planHash, changedPolicy.planHash);
});

test("required blocked or skipped cases can never conclude PASS", () => {
  assert.equal(mayConcludePass(["PASS", "PASS"]), true);
  assert.equal(mayConcludePass(["PASS", "BLOCKED"]), false);
  assert.equal(mayConcludePass(["PASS", "SKIPPED"]), false);
  assert.equal(mayConcludePass(["PASS", "FAIL"]), false);
  assert.equal(mayConcludePass([]), false);
});

test("catalog exposes no retired simulation execution module", () => {
  const serialized = JSON.stringify(modules).toLowerCase();
  assert.equal(serialized.includes("host-sim"), false);
  assert.equal(serialized.includes("ctest"), false);
  assert.equal(serialized.includes("sim_feed"), false);
});

test("ADR-0042 rejects an enabled retired execution command fail-closed", () => {
  const unsafeCatalog = structuredClone(modules);
  unsafeCatalog.find((item) => item.id === "static").commandIds.push("homecore.host-sim.run");
  const plan = createPlan({ ...base, catalog: unsafeCatalog, profile: "inspect", mode: "manual" });

  assert.equal(catalogPolicyViolations(unsafeCatalog).some((reason) => reason.includes("ADR-0042")), true);
  assert.equal(plan.blockedReasons.some((reason) => reason.includes("ADR-0042")), true);
});

test("missing dependencies and worker capabilities block the plan", () => {
  const incompleteCatalog = modules.filter((item) => item.id !== "stm32");
  const weakWorkers = structuredClone(workers);
  weakWorkers.find((worker) => worker.id === "win-build-01").capabilityIds = ["esp-idf"];
  const plan = createPlan({
    ...base,
    catalog: incompleteCatalog,
    workers: weakWorkers,
    profile: "hardware-release",
    mode: "assist"
  });

  assert.equal(plan.blockedReasons.some((reason) => reason.includes("缺少依赖") || reason.includes("缺失或停用")), true);
  assert.equal(plan.blockedReasons.some((reason) => reason.includes("缺少能力")), true);
});

test("device lifecycle actions require reauthentication and explicit bindings", () => {
  const plan = createPlan({
    ...base,
    profile: "hardware-release",
    mode: "manual",
    manual: new Set(["device-lifecycle"])
  });

  assert.equal(plan.requiredApproval, "reauth");
  assert.equal(plan.actionIds.includes("lab.remove-device"), true);
  assert.equal(plan.actionIds.includes("lab.factory-reset"), true);
  assert.equal(plan.targetIds.includes("ZIGBEE-RACK-16"), true);
  assert.equal(plan.blockedReasons.length, 0);
});
