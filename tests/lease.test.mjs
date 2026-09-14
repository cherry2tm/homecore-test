import test from "node:test";
import assert from "node:assert/strict";

import { LeaseManager } from "../dist/assets/lease.js";

test("lease acquisition, renewal, and release require the current fencing token", () => {
  const manager = new LeaseManager();
  const lease = manager.acquire("lab-a", "worker-1", 1000, 100);
  assert.throws(() => manager.acquire("lab-a", "worker-2", 1000, 200), /已被租用/);
  assert.throws(() => manager.renew(lease.leaseId, lease.fencingToken + 1, 1000, 300), /fencing token/);
  assert.equal(manager.renew(lease.leaseId, lease.fencingToken, 1000, 300).expiresAt, 1300);
  manager.release(lease.leaseId, lease.fencingToken, 400);
  assert.equal(manager.get(lease.leaseId, 400)?.state, "released");
});

test("expired lease no longer blocks the resource", () => {
  const manager = new LeaseManager();
  const old = manager.acquire("lab-a", "worker-1", 100, 0);
  assert.equal(manager.get(old.leaseId, 100)?.state, "expired");
  const fresh = manager.acquire("lab-a", "worker-2", 100, 101);
  assert.equal(fresh.fencingToken > old.fencingToken, true);
});
