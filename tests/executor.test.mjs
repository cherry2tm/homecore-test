import test from "node:test";
import assert from "node:assert/strict";

import { executeRegisteredCommand, executeWithLease } from "../dist/assets/executor.js";
import { LeaseManager } from "../dist/assets/lease.js";

const registry = [{ commandId: "node.echo", executable: process.execPath, runtime: "native", workingDirectory: process.cwd(), fixedArgs: ["-e", "process.stdout.write('ok')"], args: {} }];

test("executor returns completed process result", async () => {
  const result = await executeRegisteredCommand(registry, "node.echo", {}, 1000);
  assert.equal(result.executionStatus, "completed");
  assert.equal(result.exitCode, 0);
});

test("executor classifies timeout", async () => {
  const slow = [{ ...registry[0], fixedArgs: ["-e", "setTimeout(() => {}, 10000)"] }];
  const result = await executeRegisteredCommand(slow, "node.echo", {}, 20);
  assert.equal(result.executionStatus, "timeout");
});

test("executor preserves command validation errors", async () => {
  await assert.rejects(() => executeRegisteredCommand(registry, "missing", {}, 1000), /未注册/);
});

test("executor refuses to start without a valid lease", async () => {
  const manager = new LeaseManager();
  const result = await executeWithLease(manager, "missing", 1, registry, "node.echo", {}, 1000);
  assert.equal(result.executionStatus, "tool-error");
  assert.match(result.stderr, /租约/);
});
