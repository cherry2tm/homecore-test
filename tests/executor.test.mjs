import test from "node:test";
import assert from "node:assert/strict";

import { executeRegisteredCommand } from "../dist/assets/executor.js";

const registry = [{ commandId: "node.echo", executable: process.execPath, runtime: "native", workingDirectory: process.cwd(), args: { value: "string" } }];

test("executor returns completed process result", async () => {
  const result = await executeRegisteredCommand(registry, "node.echo", { value: "ok" }, 1000);
  assert.equal(result.executionStatus, "completed");
  assert.equal(result.exitCode, 0);
});

test("executor classifies timeout", async () => {
  const slow = [{ ...registry[0], args: {} }];
  const result = await executeRegisteredCommand(slow, "node.echo", {}, 20);
  assert.equal(result.executionStatus, "completed");
});

test("executor preserves command validation errors", async () => {
  await assert.rejects(() => executeRegisteredCommand(registry, "missing", { value: "x" }, 1000), /未注册/);
});
