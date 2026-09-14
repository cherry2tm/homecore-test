import test from "node:test";
import assert from "node:assert/strict";

import { runHardwarePreflight } from "../dist/assets/preflight.js";

const base = { requiredCapabilities: ["serial", "jlink"], availableCapabilities: ["serial", "jlink"], requiredEvidence: ["device-identity", "serial-capture"], availableEvidence: ["device-identity", "serial-capture"], deviceId: "HC-01", firmwareIdentity: "mcu@rev1", leaseId: "lease-1", leaseActive: true };

test("hardware preflight is ready only with capabilities, identity, evidence, and lease", () => {
  assert.deepEqual(runHardwarePreflight(base), { status: "READY", reasons: [] });
});

test("hardware preflight blocks missing capability and never simulates it", () => {
  const result = runHardwarePreflight({ ...base, availableCapabilities: ["serial"], leaseActive: false });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.reasons.join(" "), /jlink/);
  assert.match(result.reasons.join(" "), /租约/);
});

test("hardware preflight blocks unbound or unidentified device", () => {
  const result = runHardwarePreflight({ ...base, deviceId: undefined, firmwareIdentity: undefined });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.reasons.join(" "), /设备身份/);
  assert.match(result.reasons.join(" "), /固件身份/);
});
