import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openTestStore } from "../dist/assets/persistence.js";
import { recordWorkerHeartbeat, workerStatus } from "../dist/assets/heartbeat.js";

test("worker heartbeat survives store reopen and becomes offline when stale", () => {
  const root = mkdtempSync(join(tmpdir(), "hc-heartbeat-"));
  const filename = join(root, "state.db");
  const first = openTestStore(filename);
  recordWorkerHeartbeat(first, "worker-1", "ready", 1000);
  first.close();
  const second = openTestStore(filename);
  assert.equal(workerStatus(second, "worker-1", 2000, 30000), "ready");
  assert.equal(workerStatus(second, "worker-1", 40000, 30000), "offline");
  second.close();
  rmSync(root, { recursive: true, force: true });
});
