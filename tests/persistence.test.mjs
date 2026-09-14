import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openTestStore } from "../dist/assets/persistence.js";

const run = { id: "RUN-PERSIST-1", revision: "rev-1", branch: "main", profile: "inspect", status: "COMPLETED", conclusion: "PASS", startedAt: "2026-09-15T00:00:00Z", duration: "1s", passed: 1, failed: 0, blocked: 0, evidenceCount: 1, planHash: "hash-1" };

test("run records survive closing and reopening the SQLite store", () => {
  const root = mkdtempSync(join(tmpdir(), "homecore-test-"));
  const filename = join(root, "state", "runs.db");
  const first = openTestStore(filename);
  first.saveRun(run);
  first.close();

  const second = openTestStore(filename);
  assert.deepEqual(second.listRuns(), [run]);
  second.close();
  rmSync(root, { recursive: true, force: true });
});
