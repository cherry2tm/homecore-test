import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeRegisteredCommand } from "../dist/assets/executor.js";
import { recordExecution } from "../dist/assets/execution-record.js";
import { openTestStore } from "../dist/assets/persistence.js";

test("execution record stores hashed stdout/stderr artifacts and attempt", async () => {
  const root = mkdtempSync(join(tmpdir(), "hc-record-"));
  const store = openTestStore(join(root, "state.db"));
  store.saveRun({ id: "RUN-1", revision: "r", branch: "main", profile: "inspect", status: "RUNNING", conclusion: "BLOCKED", startedAt: "now", duration: "0", passed: 0, failed: 0, blocked: 0, evidenceCount: 0, planHash: "p" });
  const result = await executeRegisteredCommand([{ commandId: "echo", executable: process.execPath, runtime: "native", workingDirectory: process.cwd(), fixedArgs: ["-e", "process.stdout.write('ok')"], args: {} }], "echo", {}, 1000);
  const attempt = recordExecution(store, join(root, "artifacts"), "RUN-1", "TC-1", result);
  assert.equal(attempt.verdict, "PASS");
  assert.equal(attempt.artifactIds.length, 2);
  assert.match(attempt.artifactIds[0], /stdout/);
  store.close();
  rmSync(root, { recursive: true, force: true });
});
