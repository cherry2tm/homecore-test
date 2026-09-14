import test from "node:test";
import assert from "node:assert/strict";

import { executeRegisteredCommand } from "../dist/assets/executor.js";

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
