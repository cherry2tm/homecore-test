export interface Lease {
  leaseId: string;
  resourceId: string;
  workerId: string;
  fencingToken: number;
  expiresAt: number;
  state: "active" | "expired" | "released";
}

export class LeaseManager {
  private readonly leases = new Map<string, Lease>();
  private sequence = 0;

  acquire(resourceId: string, workerId: string, ttlMs: number, now = Date.now()): Lease {
    this.expire(now);
    const occupied = [...this.leases.values()].find((lease) => lease.resourceId === resourceId && lease.state === "active");
    if (occupied) throw new Error(`资源已被租用：${resourceId}`);
    const lease = { leaseId: `lease-${++this.sequence}`, resourceId, workerId, fencingToken: this.sequence, expiresAt: now + ttlMs, state: "active" as const };
    this.leases.set(lease.leaseId, lease);
    return { ...lease };
  }

  renew(leaseId: string, fencingToken: number, ttlMs: number, now = Date.now()): Lease {
    const lease = this.requireActive(leaseId, fencingToken, now);
    lease.expiresAt = now + ttlMs;
    return { ...lease };
  }

  release(leaseId: string, fencingToken: number, now = Date.now()): void {
    const lease = this.requireActive(leaseId, fencingToken, now);
    lease.state = "released";
  }

  get(leaseId: string, now = Date.now()): Lease | undefined {
    this.expire(now);
    const lease = this.leases.get(leaseId);
    return lease ? { ...lease } : undefined;
  }

  private requireActive(leaseId: string, fencingToken: number, now: number): Lease {
    this.expire(now);
    const lease = this.leases.get(leaseId);
    if (!lease || lease.state !== "active") throw new Error(`租约不可用：${leaseId}`);
    if (lease.fencingToken !== fencingToken) throw new Error(`fencing token 不匹配：${leaseId}`);
    return lease;
  }

  private expire(now: number): void {
    for (const lease of this.leases.values()) if (lease.state === "active" && lease.expiresAt <= now) lease.state = "expired";
  }
}
