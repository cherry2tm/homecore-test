import type { TestStore } from "./persistence.js";

export function recordWorkerHeartbeat(store: TestStore, workerId: string, status: "ready" | "busy", at = Date.now()): void {
  store.saveHeartbeat(workerId, at, status);
}

export function workerStatus(store: TestStore, workerId: string, now = Date.now(), timeoutMs = 30_000): "ready" | "busy" | "offline" {
  const heartbeat = store.getHeartbeat(workerId);
  if (!heartbeat || now - heartbeat.at > timeoutMs) return "offline";
  return heartbeat.status as "ready" | "busy";
}
