import type { AutomationMode, ExecutionBinding, ExecutionPlan, ModuleId, ModuleSelection, PlanStage, ProfileId, RiskLevel, SelectionSource, TestModule, Worker } from "./domain.js";

export const profileRequirements: Record<ProfileId, ModuleId[]> = {
  inspect: ["integrity", "static", "report"],
  merge: ["integrity", "static", "stm32", "libraries", "esp32", "report"],
  "hardware-release": ["integrity", "static", "stm32", "libraries", "esp32", "uart", "network", "report"],
  "soak-release": ["integrity", "static", "stm32", "libraries", "esp32", "uart", "network", "soak", "report"]
};

const impactRequirements: ModuleId[] = ["static", "stm32", "esp32"];
const sourceOrder: SelectionSource[] = ["profile", "impact", "dependency", "model", "manual"];
const retiredExecutionPatterns = [
  /host[-_. ]?sim/i,
  /\bctest\b/i,
  /tests[\\/]host/i,
  /tests[\\/]sim/i,
  /app[\\/]sim_feed/i
];

export function catalogPolicyViolations(catalog: TestModule[]): string[] {
  const reasons: string[] = [];
  const ids = new Set<ModuleId>();
  const byId = new Map(catalog.map((item) => [item.id, item]));

  for (const item of catalog) {
    if (ids.has(item.id)) reasons.push(`目录包含重复模块 ID：${item.id}`);
    ids.add(item.id);
    const executionSurface = [item.executor, ...item.commandIds].join("|");
    if (item.enabled && retiredExecutionPatterns.some((pattern) => pattern.test(executionSurface))) {
      reasons.push(`ADR-0042 拒绝退役执行入口：${item.id}`);
    }
    for (const dependency of item.dependencies) {
      if (!byId.has(dependency)) reasons.push(`模块 ${item.id} 缺少依赖：${dependency}`);
    }
  }

  for (const [profile, requirements] of Object.entries(profileRequirements)) {
    for (const id of requirements) {
      if (!byId.get(id)?.enabled) reasons.push(`Profile ${profile} 引用了缺失或停用模块：${id}`);
    }
  }

  const visiting = new Set<ModuleId>();
  const visited = new Set<ModuleId>();
  const visit = (id: ModuleId): void => {
    if (visiting.has(id)) {
      reasons.push(`模块依赖存在循环：${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of catalog) visit(item.id);

  return [...new Set(reasons)];
}

function addSource(sourceMap: Map<ModuleId, Set<SelectionSource>>, id: ModuleId, source: SelectionSource): void {
  const current = sourceMap.get(id) ?? new Set<SelectionSource>();
  current.add(source);
  sourceMap.set(id, current);
}

function includeDependencies(sourceMap: Map<ModuleId, Set<SelectionSource>>, catalog: TestModule[]): void {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...sourceMap.keys()]) {
      for (const dependency of byId.get(id)?.dependencies ?? []) {
        if (!sourceMap.has(dependency)) changed = true;
        addSource(sourceMap, dependency, "dependency");
      }
    }
  }
}

export function resolveSelections(
  catalog: TestModule[],
  profile: ProfileId,
  manual: ReadonlySet<ModuleId>,
  includeImpact: boolean,
  modelAdditions: ReadonlySet<ModuleId>
): ModuleSelection[] {
  const selected = new Map<ModuleId, Set<SelectionSource>>();

  for (const id of manual) addSource(selected, id, "manual");
  for (const id of profileRequirements[profile]) addSource(selected, id, "profile");
  if (includeImpact) for (const id of impactRequirements) addSource(selected, id, "impact");
  for (const id of modelAdditions) addSource(selected, id, "model");
  includeDependencies(selected, catalog);

  return catalog.map((item) => {
    const sources = [...(selected.get(item.id) ?? [])].sort((a, b) => sourceOrder.indexOf(a) - sourceOrder.indexOf(b));
    return {
      moduleId: item.id,
      selected: item.enabled && sources.length > 0,
      locked: sources.some((source) => source === "profile" || source === "impact" || source === "dependency"),
      sources
    };
  });
}

function parallelDuration(entries: TestModule[], workers: Worker[]): number {
  const worker = workers.find((item) => item.id === entries[0]?.executor);
  const slots = Math.max(1, Math.min(worker?.slots ?? 1, entries.length));
  const lanes = Array.from({ length: slots }, () => 0);
  for (const duration of entries.map((item) => item.durationMin).sort((a, b) => b - a)) {
    const lane = lanes.indexOf(Math.min(...lanes));
    lanes[lane] = (lanes[lane] ?? 0) + duration;
  }
  return Math.max(...lanes);
}

function makeStages(catalog: TestModule[], selections: ModuleSelection[], workers: Worker[], blockedIds: ReadonlySet<ModuleId>): PlanStage[] {
  const selected = new Set(selections.filter((item) => item.selected).map((item) => item.moduleId));
  const grouped: Array<{ id: string; label: string; platform: PlanStage["platform"]; ids: ModuleId[] }> = [
    { id: "preflight", label: "预检与静态门禁", platform: "linux", ids: ["integrity", "static"] },
    { id: "windows-build", label: "Windows 生产构建", platform: "windows", ids: ["stm32", "libraries", "esp32"] },
    { id: "hardware", label: "硬件与网络验证", platform: "lab", ids: ["uart", "network", "ota", "device-lifecycle", "soak"] },
    { id: "finalize", label: "报告、脱敏与归档", platform: "linux", ids: ["report"] }
  ];

  return grouped.flatMap((group) => {
    const moduleIds = group.ids.filter((id) => selected.has(id));
    if (moduleIds.length === 0) return [];
    const entries = moduleIds.map((id) => catalog.find((item) => item.id === id)).filter((item): item is TestModule => item !== undefined);
    const risk = entries.some((item) => item.risk !== "low");
    return [{
      id: group.id,
      label: group.label,
      platform: group.platform,
      moduleIds,
      durationMin: group.id === "windows-build" ? parallelDuration(entries, workers) : entries.reduce((sum, item) => sum + item.durationMin, 0),
      state: moduleIds.some((id) => blockedIds.has(id)) ? "blocked" : risk ? "approval" : "ready"
    }];
  });
}

function hashPlan(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const part = (hash >>> 0).toString(16).padStart(8, "0");
  return `${part}${part.slice(0, 4)}`;
}

export function approvalForRisk(risks: RiskLevel[]): ExecutionPlan["requiredApproval"] {
  if (risks.includes("high")) return "reauth";
  if (risks.includes("controlled")) return "startup";
  return "none";
}

export function createPlan(options: {
  catalog: TestModule[];
  profile: ProfileId;
  mode: AutomationMode;
  revision: string;
  manual: ReadonlySet<ModuleId>;
  modelAdditions: ReadonlySet<ModuleId>;
  includeImpact: boolean;
  workers: Worker[];
  bindings: ExecutionBinding[];
  catalogVersion: string;
  policyVersion: string;
  modelDecisionId: string | undefined;
  dirtyState?: string;
  diffHash?: string;
}): ExecutionPlan {
  const selections = resolveSelections(options.catalog, options.profile, options.manual, options.includeImpact, options.modelAdditions);
  const selectedIds = selections.filter((item) => item.selected).map((item) => item.moduleId);
  const selectedModules = selectedIds.map((id) => options.catalog.find((item) => item.id === id)).filter((item): item is TestModule => item !== undefined);
  const selectedBindings = options.bindings.filter((binding) => selectedIds.includes(binding.moduleId));
  const blockedIds = new Set<ModuleId>();
  const blockedReasons = catalogPolicyViolations(options.catalog);

  for (const requestedId of [...options.manual, ...options.modelAdditions]) {
    if (!options.catalog.find((item) => item.id === requestedId)?.enabled) {
      blockedReasons.push(`请求了缺失或停用模块：${requestedId}`);
      blockedIds.add(requestedId);
    }
  }

  for (const module of selectedModules) {
    const worker = options.workers.find((item) => item.id === module.executor);
    const binding = selectedBindings.find((item) => item.moduleId === module.id && item.workerId === module.executor);
    const missingCapabilities = module.requiredCapabilities.filter((capability) => !worker?.capabilityIds.includes(capability));
    if (!worker) blockedReasons.push(`${module.title} 缺少执行 Worker：${module.executor}`);
    else if (worker.status === "offline") blockedReasons.push(`${module.title} 的 Worker 已离线：${worker.id}`);
    else if (worker.usedSlots >= worker.slots && !binding?.leaseId) blockedReasons.push(`${module.title} 的 Worker 无可用槽位：${worker.id}`);
    if (missingCapabilities.length > 0) blockedReasons.push(`${module.title} 缺少能力：${missingCapabilities.join(", ")}`);
    if (!binding) blockedReasons.push(`${module.title} 缺少目标绑定`);
    if (module.platform === "lab" && !binding?.leaseId) blockedReasons.push(`${module.title} 缺少实验室租约`);
    if (blockedReasons.some((reason) => reason.startsWith(module.title))) blockedIds.add(module.id);
  }

  const stages = makeStages(options.catalog, selections, options.workers, blockedIds);
  const actionIds = selectedModules.filter((item) => item.risk !== "low").flatMap((item) => item.commandIds).sort();
  const targetIds = [...new Set(selectedBindings.map((item) => item.targetId))].sort();
  const imageHashes = [...new Set(selectedBindings.flatMap((item) => item.imageSha256 ? [item.imageSha256] : []))].sort();
  const leaseIds = [...new Set(selectedBindings.flatMap((item) => item.leaseId ? [item.leaseId] : []))].sort();
  const planKey = JSON.stringify({
    revision: options.revision,
    dirtyState: options.dirtyState ?? "unknown",
    diffHash: options.diffHash ?? "unknown",
    profile: options.profile,
    mode: options.mode,
    catalogVersion: options.catalogVersion,
    policyVersion: options.policyVersion,
    modelDecisionId: options.modelDecisionId ?? null,
    modules: selectedModules.map((item) => ({ id: item.id, dependencies: item.dependencies, risk: item.risk, commandIds: item.commandIds, requiredCapabilities: item.requiredCapabilities })),
    bindings: selectedBindings,
    workers: options.workers.filter((worker) => selectedModules.some((item) => item.executor === worker.id)).map((worker) => ({ id: worker.id, status: worker.status, capabilities: worker.capabilityIds, slots: worker.slots, usedSlots: worker.usedSlots }))
  });

  return {
    planHash: hashPlan(planKey),
    profile: options.profile,
    automationMode: options.mode,
    revision: options.revision,
    selections,
    stages,
    totalDurationMin: stages.reduce((sum, stage) => sum + stage.durationMin, 0),
    gateCount: new Set(selectedModules.map((item) => item.gate)).size,
    requiredApproval: approvalForRisk(selectedModules.map((item) => item.risk)),
    actionIds,
    targetIds,
    imageHashes,
    leaseIds,
    catalogVersion: options.catalogVersion,
    policyVersion: options.policyVersion,
    modelDecisionId: options.modelDecisionId,
    hashAlgorithm: "fnv1a-32-preview",
    blockedReasons: [...new Set(blockedReasons)]
  };
}

export function mayConcludePass(requiredStatuses: Array<"PASS" | "FAIL" | "BLOCKED" | "SKIPPED">): boolean {
  return requiredStatuses.length > 0 && requiredStatuses.every((status) => status === "PASS");
}
