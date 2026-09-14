import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Artifact, CaseAttempt } from "./domain.js";
import type { ExecutorResult } from "./executor.js";
import type { TestStore } from "./persistence.js";

function writeArtifact(root: string, id: string, content: string): Artifact {
  mkdirSync(root, { recursive: true });
  const relativePath = `${id}.log`;
  const fullPath = join(root, relativePath);
  writeFileSync(fullPath, content, "utf8");
  const bytes = Buffer.from(content, "utf8");
  return { id, relativePath, mediaType: "text/plain", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: statSync(fullPath).size, source: "worker" };
}

export function recordExecution(store: TestStore, root: string, runId: string, caseId: string, result: ExecutorResult): CaseAttempt {
  const stdout = writeArtifact(root, `${caseId}-stdout`, result.stdout);
  const stderr = writeArtifact(root, `${caseId}-stderr`, result.stderr);
  store.saveArtifact(runId, stdout);
  store.saveArtifact(runId, stderr);
  const attempt: CaseAttempt = { id: `${runId}-${caseId}-1`, caseId, attempt: 1, executionStatus: "completed", verdict: result.executionStatus === "completed" && result.exitCode === 0 ? "PASS" : result.executionStatus === "timeout" ? "BLOCKED" : "FAIL", failureKind: result.executionStatus === "timeout" ? "environment-unavailable" : result.executionStatus === "tool-error" ? "tool-error" : undefined, actualMode: "logical-simulation", assertions: [], artifactIds: [stdout.id, stderr.id], cleanupStatus: "completed", reason: result.executionStatus === "completed" ? undefined : result.executionStatus };
  store.saveAttempt(runId, attempt);
  return attempt;
}
