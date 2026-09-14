export type ModuleId =
  | "integrity"
  | "static"
  | "stm32"
  | "libraries"
  | "esp32"
  | "uart"
  | "network"
  | "ota"
  | "device-lifecycle"
  | "soak"
  | "report";

export type Platform = "linux" | "windows" | "lab";
export type RiskLevel = "low" | "controlled" | "high";
export type SelectionSource = "manual" | "profile" | "impact" | "dependency" | "model";
export type AutomationMode = "manual" | "assist" | "auto";
export type ProfileId = "inspect" | "merge" | "hardware-release" | "soak-release";
export type Conclusion = "PASS" | "FAIL" | "BLOCKED" | "CANCELED";
export type RunStatus =
  | "DRAFT"
  | "PREFLIGHT"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "QUEUED"
  | "RUNNING"
  | "FINALIZING"
  | "COMPLETED";

export interface TestModule {
  id: ModuleId;
  title: string;
  summary: string;
  caseCount: number;
  durationMin: number;
  platform: Platform;
  executor: string;
  evidence: string[];
  dependencies: ModuleId[];
  risk: RiskLevel;
  gate: string;
  commandIds: string[];
  requiredCapabilities: string[];
  enabled: boolean;
  policyRefs: string[];
}

export interface ModuleSelection {
  moduleId: ModuleId;
  selected: boolean;
  locked: boolean;
  sources: SelectionSource[];
}

export interface Worker {
  id: string;
  label: string;
  os: string;
  status: "ready" | "busy" | "offline";
  lastSeen: string;
  capabilities: string[];
  capabilityIds: string[];
  slots: number;
  usedSlots: number;
  connection: "mtls-outbound" | "local";
}

export interface PlanStage {
  id: string;
  label: string;
  platform: Platform;
  moduleIds: ModuleId[];
  durationMin: number;
  state: "ready" | "approval" | "blocked";
}

export interface ExecutionBinding {
  moduleId: ModuleId;
  workerId: string;
  targetId: string;
  leaseId?: string;
  imageSha256?: string;
}

export interface ExecutionPlan {
  planHash: string;
  profile: ProfileId;
  automationMode: AutomationMode;
  revision: string;
  selections: ModuleSelection[];
  stages: PlanStage[];
  totalDurationMin: number;
  gateCount: number;
  requiredApproval: "none" | "startup" | "reauth";
  actionIds: string[];
  targetIds: string[];
  imageHashes: string[];
  leaseIds: string[];
  catalogVersion: string;
  policyVersion: string;
  modelDecisionId: string | undefined;
  hashAlgorithm: "fnv1a-32-preview";
  blockedReasons: string[];
}

export interface Approval {
  id: string;
  planHash: string;
  actionIds: string[];
  targetIds: string[];
  imageHashes: string[];
  leaseIds: string[];
  expiresAt: string;
  approver: string;
  level: "startup" | "reauth";
  state: "requested" | "approved" | "expired" | "invalidated";
}

export interface ModelDecision {
  id: string;
  stage: ModelStage;
  model: string;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  outputHash: string;
  policyEvaluation: "pending" | "accepted" | "rejected";
  createdAt: string;
  proposedAdditions: ModuleId[];
  proposedRemovals: ModuleId[];
  reasons: string[];
  state: "proposed" | "accepted" | "rejected";
  evidenceScope: string;
}

export type ModelStage = "impact-selection" | "failure-triage" | "rerun-advice" | "report-summary" | "risk-review";

export interface ModelStageBinding {
  stage: ModelStage;
  label: string;
  model: string;
  reasoning: "low" | "medium" | "high";
  enabled: boolean;
  inputPolicy: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  status: "ready" | "degraded";
  latencyMs: number;
  use: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  result: "allowed" | "denied" | "recorded";
  planHash?: string;
  detail: string;
}

export interface RunRecord {
  id: string;
  revision: string;
  branch: string;
  profile: ProfileId;
  status: RunStatus;
  conclusion: Conclusion;
  startedAt: string;
  duration: string;
  passed: number;
  failed: number;
  blocked: number;
  evidenceCount: number;
  planHash: string;
}
