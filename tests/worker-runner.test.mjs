import test from "node:test";
import assert from "node:assert/strict";

import { runPreparedCommand } from "../dist/assets/worker-runner.js";

test("worker runner uses argv without shell and captures output", async () => {
  const result = await runPreparedCommand({ commandId: "test", executable: process.execPath, cwd: process.cwd(), argv: ["-e", "process.stdout.write('ok')"] }, 1000);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.timedOut, false);
});

test("worker runner terminates timed out commands", async () => {
  const result = await runPreparedCommand({ commandId: "test", executable: process.execPath, cwd: process.cwd(), argv: ["-e", "setTimeout(() => {}, 10000)"] }, 20);
  assert.equal(result.timedOut, true);
});
