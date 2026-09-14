import type { Artifact, CaseAttempt, FailureKind, Verdict } from "./domain.js";

export const resultSchemaVersion = "1";

export interface ResultEnvelope {
  schemaVersion: typeof resultSchemaVersion;
  runId: string;
  caseInstanceId: string;
  attempt: number;
  executionStatus: CaseAttempt["executionStatus"];
  verdict: Verdict;
  actualMode: CaseAttempt["actualMode"];
  assertions: CaseAttempt["assertions"];
  artifacts: Artifact[];
  cleanupStatus: CaseAttempt["cleanupStatus"];
  failureKind?: FailureKind;
  reason?: string;
}

export function hasCompleteEvidence(result: Pick<ResultEnvelope, "assertions" | "artifacts">): boolean {
  if (result.assertions.length === 0) return false;
  const artifactIds = new Set(result.artifacts.map((artifact) => artifact.id));
  return result.assertions.every((assertion) => assertion.status === "PASS" && assertion.evidenceIds.length > 0 && assertion.evidenceIds.every((id) => artifactIds.has(id)));
}

export function determineVerdict(result: Pick<ResultEnvelope, "assertions" | "artifacts" | "cleanupStatus" | "executionStatus" | "failureKind">): Verdict {
  if (result.executionStatus !== "completed") return "BLOCKED";
  if (result.failureKind === "canceled") return "CANCELED";
  if (result.cleanupStatus === "failed" || result.failureKind === "environment-unavailable" || result.failureKind === "tool-error" || result.failureKind === "unparseable-result") return "BLOCKED";
  if (!hasCompleteEvidence(result)) return "BLOCKED";
  return result.assertions.every((assertion) => assertion.status === "PASS") ? "PASS" : "FAIL";
}
