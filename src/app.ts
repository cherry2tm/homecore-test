import { auditEvents, caseRows, catalogVersion, executionBindings, modelBindings, modelDecision, modelProfiles, modules, policyVersion, runHistory, workers } from "./catalog.js";
import type { Approval, AuditEvent, AutomationMode, Conclusion, ExecutionPlan, ModelStage, ModuleId, ProfileId, RunRecord, RunStatus } from "./domain.js";
import { createPlan, mayConcludePass, profileRequirements } from "./planner.js";

type ViewId = "new-run" | "runs" | "workers" | "cases" | "models" | "audit";

interface LiveRun {
  id: string;
  status: RunStatus;
  progress: number;
  activeStage: number;
  logs: string[];
  evidence: number;
  passed: number;
  blocked: number;
  plan: ExecutionPlan;
  conclusion?: Conclusion;
  timer?: number;
}

interface UiState {
  view: ViewId;
  profile: ProfileId;
  mode: AutomationMode;
  manual: Set<ModuleId>;
  modelExcluded: Set<ModuleId>;
  modelDecision: "proposed" | "accepted" | "rejected";
  approvalOpen: boolean;
  approvalConfirmed: boolean;
  approvalPhrase: string;
  liveRun: LiveRun | undefined;
  runDetail: string | undefined;
  runDetailTab: "gates" | "cases" | "evidence" | "issues" | "claims";
  caseQuery: string;
  auditFilter: "all" | "allowed" | "denied" | "recorded";
  enabledModelStages: Set<ModelStage>;
  approvalRecord: Approval | undefined;
  sessionAuditEvents: AuditEvent[];
  toast: string | undefined;
}

declare global {
  interface Window {
    lucide?: { createIcons: (options?: { attrs?: Record<string, string> }) => void };
  }
}

const revision = "08c4bc06c2b3";
const state: UiState = {
  view: "new-run",
  profile: "merge",
  mode: "assist",
  manual: new Set<ModuleId>(),
  modelExcluded: new Set<ModuleId>(),
  modelDecision: "proposed",
  approvalOpen: false,
  approvalConfirmed: false,
  approvalPhrase: "",
  liveRun: undefined,
  runDetail: undefined,
  runDetailTab: "gates",
  caseQuery: "",
  auditFilter: "all",
  enabledModelStages: new Set(modelBindings.filter((binding) => binding.enabled).map((binding) => binding.stage)),
  approvalRecord: undefined,
  sessionAuditEvents: [],
  toast: undefined
};

const app = document.querySelector<HTMLDivElement>("#app")!;

const navItems: Array<{ id: ViewId; label: string; shortLabel: string; icon: string }> = [
  { id: "new-run", label: "新建运行", shortLabel: "新建", icon: "play-square" },
  { id: "runs", label: "运行记录", shortLabel: "记录", icon: "history" },
  { id: "workers", label: "Worker 与实验室", shortLabel: "节点", icon: "server-cog" },
  { id: "cases", label: "用例与门禁", shortLabel: "用例", icon: "list-checks" },
  { id: "models", label: "模型自动化", shortLabel: "模型", icon: "brain-circuit" },
  { id: "audit", label: "审计日志", shortLabel: "审计", icon: "scroll-text" }
];

const profileLabels: Record<ProfileId, string> = {
  inspect: "Inspect / 只读检查",
  merge: "Merge / 双目标构建",
  "hardware-release": "Hardware Release",
  "soak-release": "Soak Release"
};

const sourceLabels = {
  manual: "人工",
  profile: "Profile",
  impact: "影响",
  dependency: "依赖",
  model: "模型"
} as const;

const moduleMap = new Map(modules.map((item) => [item.id, item]));

function icon(name: string, size = 17): string {
  return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function getPlan(): ExecutionPlan {
  const modelAdditions = state.modelDecision === "accepted" || state.mode === "auto"
    ? new Set(modelDecision.proposedAdditions.filter((id) => !state.modelExcluded.has(id)))
    : new Set<ModuleId>();
  return createPlan({
    catalog: modules,
    profile: state.profile,
    mode: state.mode,
    revision,
    manual: state.manual,
    modelAdditions,
    includeImpact: true,
    workers,
    bindings: executionBindings,
    catalogVersion,
    policyVersion,
    modelDecisionId: state.modelDecision === "accepted" || state.mode === "auto" ? modelDecision.id : undefined,
    dirtyState: "dirty:1",
    diffHash: "sha256:demo-redacted-diff"
  });
}

function statusBadge(status: string, extra = ""): string {
  return `<span class="status-badge status-${status.toLowerCase()} ${extra}"><span class="status-dot"></span>${escapeHtml(status)}</span>`;
}

function platformIcon(platform: string): string {
  if (platform === "windows") return "monitor-cog";
  if (platform === "lab") return "microchip";
  return "container";
}

function renderShell(): string {
  const content = state.view === "new-run"
    ? renderNewRun()
    : state.view === "runs"
      ? renderRuns()
      : state.view === "workers"
        ? renderWorkers()
        : state.view === "cases"
          ? renderCases()
          : state.view === "models"
            ? renderModels()
            : renderAudit();

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">HC</div>
          <div><strong>HomeCore</strong><span>TEST AGENT</span></div>
        </div>
        <nav class="side-nav" aria-label="主导航">
          ${navItems.map((item) => `
            <button class="nav-item ${state.view === item.id ? "active" : ""}" data-view="${item.id}" title="${item.label}">
              ${icon(item.icon, 18)}<span class="nav-label-full">${item.label}</span><span class="nav-label-short">${item.shortLabel}</span>
            </button>`).join("")}
        </nav>
        <div class="policy-lock">
          ${icon("shield-check", 17)}
          <div><strong>Policy locked</strong><span>ADR-0042 已强制</span></div>
        </div>
        <div class="operator">
          <span class="avatar">YL</span>
          <div><strong>yawaiot.lab</strong><span>Test operator</span></div>
          <button class="icon-button" title="操作员菜单">${icon("more-horizontal", 17)}</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="system-bar">
          <div class="system-item revision-item">${icon("git-commit-horizontal", 16)}<span>HG</span><strong>${revision}</strong><span class="branch">default</span><span class="dirty">DIRTY · 1</span></div>
          <div class="system-divider"></div>
          <div class="system-item"><span class="health-dot ok"></span><span>Linux 控制面</span><strong>正常</strong></div>
          <div class="system-item"><span class="health-dot ok"></span><span>Windows Worker</span><strong>1 / 1</strong></div>
          <div class="system-item"><span class="health-dot ok"></span><span>Lab A</span><strong>1 / 2</strong></div>
          <div class="bar-actions">
            <button class="icon-button" data-action="refresh-status" title="刷新状态">${icon("refresh-cw", 17)}</button>
            <button class="icon-button has-notice" data-view="audit" title="查看告警">${icon("bell", 17)}</button>
          </div>
        </header>
        <main class="main-content">${content}</main>
      </section>
      ${state.toast ? `<div class="toast" role="status">${icon("check-circle-2", 17)}${escapeHtml(state.toast)}</div>` : ""}
      ${renderApprovalDialog()}
    </div>`;
}

function renderPageHeader(title: string, subtitle: string, actions = ""): string {
  return `<div class="page-header"><div><div class="eyebrow">HOMECORE QUALITY CONTROL</div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></div>`;
}

function renderNewRun(): string {
  if (state.liveRun) return renderLiveRun(state.liveRun);
  const plan = getPlan();
  const selected = plan.selections.filter((item) => item.selected);
  const selectedCases = selected.reduce((sum, selection) => sum + (moduleMap.get(selection.moduleId)?.caseCount ?? 0), 0);
  const hardwareSelected = selected.some((selection) => moduleMap.get(selection.moduleId)?.platform === "lab");
  const windowsBlocked = plan.stages.some((stage) => stage.platform === "windows" && stage.state === "blocked");
  const labBlocked = plan.stages.some((stage) => stage.platform === "lab" && stage.state === "blocked");
  const action = `<button class="secondary-button" data-action="save-draft">${icon("save", 16)}保存草稿</button>`;

  return `
    ${renderPageHeader("新建测试运行", "编排 Linux 控制面、Windows 构建与真实硬件证据。", action)}
    <div class="draft-strip">
      <div><span class="draft-state">DRAFT</span><strong>计划 ${plan.planHash}</strong><span>每次变更会使既有审批失效</span></div>
      <div><span>${selected.length} 模块</span><span>${selectedCases} 用例</span><span>${plan.gateCount} 门禁</span></div>
    </div>
    <div class="run-builder">
      <section class="builder-column module-column" aria-labelledby="module-heading">
        <div class="section-heading"><div><h2 id="module-heading">测试模块</h2><span>按依赖自动锁定</span></div><span>${selected.length} / ${modules.length}</span></div>
        <div class="module-list">
          ${modules.map((item) => renderModule(item.id, plan)).join("")}
        </div>
      </section>
      <section class="builder-column plan-column" aria-labelledby="plan-heading">
        <div class="section-heading"><div><h2 id="plan-heading">执行计划</h2><span>策略引擎生成 · 模型不可改门禁</span></div><button class="icon-button" data-action="copy-plan" title="复制计划哈希">${icon("copy", 16)}</button></div>
        ${renderModelProposal()}
        <div class="plan-metrics">
          <div><span>预计耗时</span><strong>${formatDuration(plan.totalDurationMin)}</strong></div>
          <div><span>执行阶段</span><strong>${plan.stages.length}</strong></div>
          <div><span>并行构建</span><strong>${selected.some((s) => s.moduleId === "stm32") && selected.some((s) => s.moduleId === "esp32") ? "2 路" : "关闭"}</strong></div>
          <div><span>审批级别</span><strong>${approvalLabel(plan.requiredApproval)}</strong></div>
        </div>
        <div class="topology">
          <div class="topology-node"><span class="topology-icon linux">${icon("container", 18)}</span><div><strong>Linux Control</strong><span>计划 / 策略 / 归档</span></div><span class="node-status">READY</span></div>
          <div class="route-arrow"><span>mTLS · typed job</span>${icon("arrow-right", 17)}</div>
          <div class="topology-node"><span class="topology-icon windows">${icon("monitor-cog", 18)}</span><div><strong>Windows Worker</strong><span>Keil / ARMCC5 / IDF</span></div><span class="node-status ${windowsBlocked ? "waiting" : ""}">${windowsBlocked ? "BLOCKED" : "READY"}</span></div>
          ${hardwareSelected ? `<div class="route-arrow"><span>lease + approval</span>${icon("arrow-right", 17)}</div><div class="topology-node"><span class="topology-icon lab">${icon("microchip", 18)}</span><div><strong>Hardware Lab A</strong><span>Board / UART / Zigbee</span></div><span class="node-status ${labBlocked ? "waiting" : ""}">${labBlocked ? "BLOCKED" : "LEASED"}</span></div>` : ""}
        </div>
        <div class="stage-list">
          ${plan.stages.map((stage, index) => `
            <div class="stage-row">
              <div class="stage-index">${String(index + 1).padStart(2, "0")}</div>
              <div class="stage-body">
                <div class="stage-title"><span>${icon(platformIcon(stage.platform), 16)}<strong>${stage.label}</strong></span><span>${formatDuration(stage.durationMin)}</span></div>
                <div class="stage-modules">${stage.moduleIds.map((id) => `<span>${escapeHtml(moduleMap.get(id)?.title ?? id)}</span>`).join("")}</div>
              </div>
              <span class="stage-state ${stage.state}">${stage.state === "approval" ? "需审批" : stage.state === "blocked" ? "阻塞" : "就绪"}</span>
            </div>`).join("")}
        </div>
        ${plan.blockedReasons.length > 0 ? `<div class="plan-blocked">${icon("circle-slash-2", 17)}<div><strong>计划不可启动</strong>${plan.blockedReasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div></div>` : ""}
        <div class="gate-section">
          <div class="subsection-title"><h3>门禁声明边界</h3><span>${icon("shield-check", 15)} deterministic</span></div>
          <div class="gate-grid">
            ${renderGate("代码 / 静态", selected.some((s) => s.moduleId === "static"), "static")}
            ${renderGate("生产构建", selected.some((s) => s.moduleId === "stm32" || s.moduleId === "esp32"), "build")}
            ${renderGate("真实硬件", selected.some((s) => s.moduleId === "uart"), "hardware")}
            ${renderGate("网络闭环", selected.some((s) => s.moduleId === "network"), "network")}
          </div>
        </div>
      </section>
      <aside class="builder-column settings-column" aria-labelledby="settings-heading">
        <div class="section-heading"><div><h2 id="settings-heading">运行设置</h2><span>revision 与计划绑定</span></div></div>
        <label class="field"><span>门禁 Profile</span><select id="profile-select">${Object.entries(profileLabels).map(([id, label]) => `<option value="${id}" ${state.profile === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field"><span>目标 Revision</span><div class="input-with-icon">${icon("git-commit-horizontal", 16)}<input value="${revision}" readonly /></div></label>
        <div class="field"><span>自动化模式</span><div class="segmented" role="group" aria-label="自动化模式">
          ${(["manual", "assist", "auto"] as const).map((mode) => `<button class="${state.mode === mode ? "active" : ""}" data-mode="${mode}">${mode === "manual" ? "手动" : mode === "assist" ? "辅助" : "自动"}</button>`).join("")}
        </div></div>
        <div class="mode-note">${renderModePolicy()}</div>
        <div class="settings-section">
          <div class="subsection-title"><h3>执行权限</h3><button class="text-button" data-view="audit">审计</button></div>
          <div class="permission-list">
            <div>${icon("eye", 15)}<span>读取 / 检查 / 构建</span><strong>自动</strong></div>
            <div>${icon("zap", 15)}<span>刷写 / 复位 / 入网</span><strong>启动确认</strong></div>
            <div>${icon("triangle-alert", 15)}<span>断电 / 移除设备 / 恢复出厂</span><strong>重新认证</strong></div>
          </div>
        </div>
        <div class="risk-box ${plan.requiredApproval === "reauth" ? "danger" : plan.requiredApproval === "startup" ? "warning" : "safe"}">
          <div>${icon(plan.requiredApproval === "none" ? "shield-check" : "shield-alert", 19)}<strong>${riskTitle(plan.requiredApproval)}</strong></div>
          <p>${riskCopy(plan.requiredApproval)}</p>
          <span>审批绑定 ${plan.planHash}</span>
        </div>
        <button class="primary-button start-button" data-action="start-run" ${plan.blockedReasons.length > 0 ? "disabled" : ""}>${icon("play", 17)}启动 ${selectedCases} 个用例</button>
        <div class="start-meta"><span>${icon("lock-keyhole", 13)}仅下发 commandId + typed args</span><span>${formatDuration(plan.totalDurationMin)}</span></div>
      </aside>
    </div>`;
}

function renderModule(id: ModuleId, plan: ExecutionPlan): string {
  const item = moduleMap.get(id);
  const selection = plan.selections.find((entry) => entry.moduleId === id);
  if (!item || !selection) return "";
  return `<label class="module-card ${selection.selected ? "selected" : ""} ${selection.locked ? "locked" : ""}">
    <input type="checkbox" data-module="${item.id}" ${selection.selected ? "checked" : ""} ${selection.locked ? "disabled" : ""} />
    <span class="custom-check">${icon(selection.locked ? "lock" : "check", 13)}</span>
    <span class="module-main">
      <span class="module-title"><strong>${escapeHtml(item.title)}</strong><span class="risk-tag risk-${item.risk}">${item.risk === "low" ? "低风险" : item.risk === "controlled" ? "受控" : "高风险"}</span></span>
      <span class="module-summary">${escapeHtml(item.summary)}</span>
      <span class="module-meta"><span>${icon(platformIcon(item.platform), 13)}${item.platform.toUpperCase()}</span><span>${item.caseCount} 用例</span><span>${formatDuration(item.durationMin)}</span></span>
      ${selection.sources.length > 0 ? `<span class="source-list">${selection.sources.map((source) => `<em class="source-${source}">${sourceLabels[source]}</em>`).join("")}</span>` : ""}
    </span>
  </label>`;
}

function renderModelProposal(): string {
  if (state.mode === "manual") return "";
  if (state.modelDecision === "accepted" || state.mode === "auto") {
    return `<div class="model-proposal accepted"><div class="model-symbol">${icon("sparkles", 18)}</div><div><strong>模型建议已进入计划</strong><p>增加 UART 与网络闭环；确定性策略已重新计算依赖、门禁和审批。</p></div><button class="text-button" data-action="reset-model">撤销</button></div>`;
  }
  if (state.modelDecision === "rejected") {
    return `<div class="model-proposal muted"><div class="model-symbol">${icon("brain-circuit", 18)}</div><div><strong>本轮未采用模型建议</strong><p>人工选择仍受 required 与 dependency 规则约束。</p></div><button class="text-button" data-action="reset-model">重新查看</button></div>`;
  }
  return `<div class="model-proposal">
    <div class="model-symbol">${icon("sparkles", 18)}</div>
    <div class="proposal-content"><div class="proposal-title"><strong>影响分析建议 +2</strong><span>reasoning high</span></div><p>${escapeHtml(modelDecision.reasons[0] ?? "")}</p><div class="plan-diff"><span>+ UART 与硬件链路</span><span>+ Zigbee / MQTT / HA</span></div><small>${escapeHtml(modelDecision.evidenceScope)}</small></div>
    <div class="proposal-actions"><button class="mini-primary" data-action="accept-model">应用</button><button class="icon-button" data-action="reject-model" title="拒绝建议">${icon("x", 16)}</button></div>
  </div>`;
}

function renderGate(label: string, included: boolean, kind: string): string {
  return `<div class="gate-item"><span class="gate-icon ${included ? "included" : "not-run"}">${icon(included ? "check" : "minus", 14)}</span><div><strong>${label}</strong><span>${included ? "本轮纳入" : "NOT RUN"}</span></div><em>${kind}</em></div>`;
}

function renderModePolicy(): string {
  if (state.mode === "manual") return `${icon("mouse-pointer-2", 15)}<span>人工选择模块；依赖与必选门禁仍由策略注入。</span>`;
  if (state.mode === "auto") return `${icon("bot", 15)}<span>模型可选模块并重试非破坏用例；硬件动作仍需人工批准。</span>`;
  return `${icon("git-compare-arrows", 15)}<span>模型输出可见计划差异，接受后才进入执行计划。</span>`;
}

function renderLiveRun(run: LiveRun): string {
  const plan = run.plan;
  const activeStage = plan.stages[Math.min(run.activeStage, plan.stages.length - 1)];
  const completed = run.status === "COMPLETED";
  const hardware = plan.selections.some((selection) => selection.selected && moduleMap.get(selection.moduleId)?.platform === "lab");
  const actions = completed
    ? `<button class="secondary-button" data-action="return-plan">${icon("arrow-left", 16)}返回计划</button><button class="primary-button compact" data-action="open-live-report">${icon("file-text", 16)}查看报告</button>`
    : `<button class="danger-button" data-action="cancel-run">${icon("square", 15)}取消运行</button>`;
  return `
    ${renderPageHeader(completed ? `运行 ${run.conclusion ?? "COMPLETED"}` : "测试运行中", `演示运行 · ${run.id} · 计划 ${plan.planHash}`, actions)}
    <div class="simulation-banner">${icon("info", 16)}这是前端交互演示，日志与证据为样例数据，不构成 HomeCore 真实验证结论。</div>
    <div class="run-overview">
      <div class="run-progress-block">
        <div class="progress-top"><div><span>${completed ? "最终状态" : activeStage?.label ?? "正在准备"}</span><strong>${completed ? run.conclusion : run.status}</strong></div><b>${run.progress}%</b></div>
        <div class="progress-track"><span style="width:${run.progress}%"></span></div>
        <div class="run-counts"><span><b>${run.passed}</b> PASS</span><span><b>0</b> FAIL</span><span><b>${run.blocked}</b> BLOCKED</span><span><b>${run.evidence}</b> EVIDENCE</span></div>
      </div>
      <div class="conclusion-boundary ${completed ? (run.conclusion ?? "").toLowerCase() : "running"}">
        <span>${icon(completed && run.conclusion === "PASS" ? "circle-check-big" : completed ? "circle-slash-2" : "loader-circle", 24)}</span>
        <div><small>GATE CONCLUSION</small><strong>${completed ? run.conclusion : "PENDING"}</strong><p>${completed ? hardware ? "代码与构建样例通过；未连接真实 Lab，硬件门禁保持 BLOCKED。" : "本次 merge 样例的必需静态与构建门禁全部通过。" : "最终结论仅由确定性 Gate Evaluator 写入。"}</p></div>
      </div>
    </div>
    <div class="run-monitor-grid">
      <section class="monitor-panel">
        <div class="section-heading"><div><h2>阶段进度</h2><span>Linux → Windows → Finalize</span></div><span>${run.activeStage + 1} / ${plan.stages.length}</span></div>
        <div class="execution-stages">
          ${plan.stages.map((stage, index) => {
            const hardwareBlocked = completed && hardware && stage.platform === "lab";
            const stageState = hardwareBlocked ? "blocked" : completed || index < run.activeStage ? "complete" : index === run.activeStage ? "active" : "pending";
            const stageLabel = stageState === "blocked" ? "BLOCKED" : stageState === "complete" ? "PASS" : stageState === "active" ? "RUNNING" : "QUEUED";
            return `<div class="execution-stage ${stageState}"><span class="execution-marker">${stageState === "complete" ? icon("check", 14) : stageState === "blocked" ? icon("minus", 14) : index + 1}</span><div><strong>${stage.label}</strong><span>${stage.moduleIds.length} 模块 · ${formatDuration(stage.durationMin)} · ${stage.platform}</span></div><em>${stageLabel}</em></div>`;
          }).join("")}
        </div>
        <div class="evidence-strip"><div><span>Manifest</span><strong>${completed ? "sealed" : "writing"}</strong></div><div><span>Artifacts</span><strong>${run.evidence}</strong></div><div><span>Redaction</span><strong>${completed ? "PASS" : "active"}</strong></div><div><span>Audit</span><strong>append-only</strong></div></div>
      </section>
      <section class="monitor-panel console-panel">
        <div class="section-heading"><div><h2>事件与日志</h2><span>已脱敏 · 原始日志写入 artifact</span></div><button class="icon-button" data-action="copy-logs" title="复制可见日志">${icon("copy", 16)}</button></div>
        <div class="console" aria-live="polite">
          ${run.logs.map((line) => {
            const [time = "", source = "", ...message] = line.split("|");
            return `<div><time>${escapeHtml(time)}</time><span>${escapeHtml(source)}</span><code>${escapeHtml(message.join("|"))}</code></div>`;
          }).join("")}
          ${!completed ? `<div class="console-cursor"><time>NOW</time><span>agent</span><code>等待下一事件<span class="blink">_</span></code></div>` : ""}
        </div>
      </section>
    </div>`;
}

function renderRuns(): string {
  const actions = `<button class="secondary-button" data-action="export-runs">${icon("download", 16)}导出索引</button><button class="primary-button compact" data-view="new-run">${icon("plus", 16)}新建运行</button>`;
  return `
    ${renderPageHeader("运行记录", "从 HG revision 追溯计划、用例、Worker、证据与审批。", actions)}
    <div class="summary-band">
      <div><span>最近 7 天</span><strong>48</strong><small>运行</small></div><div><span>可信通过率</span><strong>91.7%</strong><small>required gates</small></div><div><span>阻塞</span><strong>3</strong><small>环境 / 硬件</small></div><div><span>新增问题</span><strong>2</strong><small>待归因</small></div><div><span>证据对象</span><strong>2,184</strong><small>SHA256 indexed</small></div>
    </div>
    <section class="table-section">
      <div class="table-toolbar"><div class="search-box">${icon("search", 16)}<input placeholder="搜索 run ID、revision 或 plan hash" aria-label="搜索运行" /></div><div><select aria-label="结论筛选"><option>全部结论</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option></select><button class="icon-button" title="筛选">${icon("sliders-horizontal", 16)}</button></div></div>
      <div class="data-table-wrap"><table class="data-table run-table"><thead><tr><th>运行</th><th>Revision</th><th>Profile</th><th>结论</th><th>用例</th><th>证据</th><th>开始 / 耗时</th><th></th></tr></thead><tbody>
        ${runHistory.map((run) => `<tr><td><strong>${escapeHtml(run.id)}</strong><span>plan ${escapeHtml(run.planHash)}</span></td><td><code>${escapeHtml(run.revision)}</code><span>${escapeHtml(run.branch)}</span></td><td>${escapeHtml(profileLabels[run.profile])}</td><td>${statusBadge(run.conclusion)}</td><td><span class="case-count pass">${run.passed} P</span>${run.failed ? `<span class="case-count fail">${run.failed} F</span>` : ""}${run.blocked ? `<span class="case-count blocked">${run.blocked} B</span>` : ""}</td><td>${run.evidenceCount} 项</td><td><strong>${escapeHtml(run.startedAt)}</strong><span>${escapeHtml(run.duration)}</span></td><td><button class="icon-button" data-run-detail="${escapeHtml(run.id)}" title="查看运行详情">${icon("chevron-right", 17)}</button></td></tr>`).join("")}
      </tbody></table></div>
    </section>
    ${state.runDetail ? renderRunDrawer(runHistory.find((run) => run.id === state.runDetail)) : ""}`;
}

type DetailStatus = Conclusion | "SKIPPED";

interface GateDetail {
  gate: string;
  label: string;
  status: DetailStatus;
  detail: string;
}

const gateCatalog = [
  ["repository", "Repository integrity"],
  ["static", "Static & contracts"],
  ["mcu-build", "STM32 production"],
  ["mcu-libraries", "MCU libraries & link"],
  ["esp-build", "ESP32-C6 build"],
  ["hardware", "Hardware evidence"],
  ["network", "Network closed loop"],
  ["device-lifecycle", "Device lifecycle"],
  ["soak", "24h soak"],
  ["report", "Report integrity"]
] as const;

function runGateDetails(run: RunRecord): GateDetail[] {
  const includedGates = new Set(profileRequirements[run.profile].map((id) => moduleMap.get(id)?.gate).filter((gate): gate is string => Boolean(gate)));
  return gateCatalog.map(([gate, label]) => {
    if (!includedGates.has(gate)) return { gate, label, status: "SKIPPED", detail: "本 profile 未纳入" };
    if (run.conclusion === "BLOCKED" && ["hardware", "network", "soak"].includes(gate)) return { gate, label, status: "BLOCKED", detail: "缺少 required 实机证据" };
    if (run.conclusion === "FAIL" && gate === "mcu-build") return { gate, label, status: "FAIL", detail: "required build assertion failed" };
    if (run.conclusion === "CANCELED" && ["hardware", "network", "soak", "report"].includes(gate)) return { gate, label, status: "CANCELED", detail: "运行终止，不复用部分结果" };
    return { gate, label, status: "PASS", detail: "required assertions satisfied" };
  });
}

function detailStatusIcon(status: DetailStatus): string {
  if (status === "PASS") return "check";
  if (status === "FAIL") return "x";
  if (status === "BLOCKED") return "minus";
  if (status === "CANCELED") return "square";
  return "circle-dashed";
}

function renderRunDetailTab(run: RunRecord, gates: GateDetail[]): string {
  if (state.runDetailTab === "gates") {
    return `<div class="drawer-section"><h3>门禁结果</h3>${gates.map((gate) => `<div class="drawer-gate result-${gate.status.toLowerCase()}"><span>${icon(detailStatusIcon(gate.status), 14)}</span><div><strong>${gate.label}</strong><small>${escapeHtml(gate.detail)}</small></div><em>${gate.status}</em></div>`).join("")}</div>`;
  }
  if (state.runDetailTab === "cases") {
    const byGate = new Map(gates.map((gate) => [gate.gate, gate.status]));
    return `<div class="drawer-section"><h3>用例结果</h3><div class="drawer-case-list">${caseRows.map((row) => {
      const retired = row[5] === "ADR-0042";
      const status = retired ? "SKIPPED" : byGate.get(row[2]) ?? "SKIPPED";
      const assertion = retired ? "disabled_by_adr_0042 · gate_eligible=false" : status === "PASS" ? "断言通过 · 证据引用已校验" : status === "SKIPPED" ? "本 profile 未执行" : status === "BLOCKED" ? "required evidence unavailable" : status === "FAIL" ? "required assertion failed" : "operator canceled";
      return `<div class="drawer-case"><div><code>${escapeHtml(row[0])}</code>${statusBadge(status)}</div><strong>${escapeHtml(row[1])}</strong><span>${escapeHtml(assertion)}</span></div>`;
    }).join("")}</div></div>`;
  }
  if (state.runDetailTab === "evidence") {
    const evidence = [
      ["manifest.json", "linux-control-01", "18 KB", "sha256:91a4...8f20"],
      ["conclusion.json", "gate-evaluator", "4 KB", "sha256:70c8...11ef"],
      ["junit.xml", "reporter", "31 KB", "sha256:cc47...901a"],
      ...(run.profile === "inspect" ? [] : [["build/armcc5-production.log", "win-build-01", "214 KB", "sha256:2f98...cc11"]]),
      ...(["hardware-release", "soak-release"].includes(run.profile) ? [["lab/serial-capture.bin", "lab-a", "1.8 MB", "sha256:76be...21d4"]] : [])
    ];
    return `<div class="drawer-section"><h3>证据清单</h3><div class="drawer-evidence-list">${evidence.map(([name, source, size, hash]) => `<div><span>${icon("file-lock-2", 15)}</span><div><strong>${escapeHtml(name ?? "")}</strong><small>${escapeHtml(source ?? "")} · ${escapeHtml(size ?? "")}</small><code>${escapeHtml(hash ?? "")}</code></div><button class="icon-button" data-action="download-evidence" title="下载证据">${icon("download", 14)}</button></div>`).join("")}</div><div class="manifest-note">${icon("badge-check", 15)}${run.evidenceCount} objects · SHA256 manifest sealed · sample metadata</div></div>`;
  }
  if (state.runDetailTab === "issues") {
    const issues = run.conclusion === "FAIL"
      ? [["ISSUE-260821-011", "product-defect", "blocker", "ARMCC5 production required assertion failed"]]
      : run.conclusion === "BLOCKED"
        ? [["ISSUE-260822-006", "hardware-blocked", "blocker", "UART / Zigbee required evidence unavailable"]]
        : [];
    return `<div class="drawer-section"><h3>问题</h3>${issues.length > 0 ? `<div class="drawer-issue-list">${issues.map(([id, kind, severity, summary]) => `<div><div><code>${id}</code><em>${severity}</em></div><strong>${kind}</strong><span>${summary}</span></div>`).join("")}</div>` : `<div class="drawer-empty">${icon("circle-check", 18)}本轮没有未关闭问题</div>`}</div>`;
  }
  const allowed = run.profile === "inspect"
    ? ["本轮 repository / static / report 门禁通过"]
    : run.conclusion === "FAIL" || run.conclusion === "CANCELED"
      ? ["本轮已完成的静态门禁通过"]
      : ["本轮静态门禁通过", "本轮配置的 MCU 与 ESP 构建门禁通过"];
  const forbidden = [
    "未执行的硬件验证通过",
    "未执行的 Zigbee 网络验证通过",
    ...(run.conclusion === "FAIL" ? ["生产构建门禁通过"] : []),
    ...(run.conclusion === "PASS" ? [] : ["发布验收通过"])
  ];
  return `<div class="drawer-section claim-section"><h3>结论声明</h3><div><strong>允许声明</strong>${allowed.map((claim) => `<span>${icon("check", 13)}${escapeHtml(claim)}</span>`).join("")}</div><div class="forbidden"><strong>禁止声明</strong>${forbidden.map((claim) => `<span>${icon("ban", 13)}${escapeHtml(claim)}</span>`).join("")}</div></div>`;
}

function renderRunDrawer(run: RunRecord | undefined): string {
  if (!run) return "";
  const gates = runGateDetails(run);
  const summary = run.conclusion === "PASS" ? "本 profile 的 required 门禁均通过" : run.conclusion === "BLOCKED" ? "构建通过，硬件证据不足" : run.conclusion === "FAIL" ? "必需构建用例失败" : "运行由操作员取消";
  const tabs = [["gates", "门禁"], ["cases", "用例"], ["evidence", "证据"], ["issues", "问题"], ["claims", "声明"]] as const;
  return `<div class="drawer-backdrop" data-action="close-run-detail"></div><aside class="detail-drawer" aria-label="运行详情">
    <div class="drawer-header"><div><span>RUN REPORT · SAMPLE DATA</span><h2>${escapeHtml(run.id)}</h2></div><button class="icon-button" data-action="close-run-detail" title="关闭">${icon("x", 18)}</button></div>
    <div class="drawer-conclusion"><div>${statusBadge(run.conclusion)}</div><strong>${summary}</strong><p>SKIPPED 不等于 PASS；最终质量判断以 conclusion.json 为准。</p></div>
    <dl class="detail-list"><div><dt>HG revision</dt><dd><code>${escapeHtml(run.revision)}</code> · ${escapeHtml(run.branch)}</dd></div><div><dt>Plan hash</dt><dd><code>${escapeHtml(run.planHash)}</code></dd></div><div><dt>Profile</dt><dd>${escapeHtml(profileLabels[run.profile])}</dd></div><div><dt>Evidence</dt><dd>${run.evidenceCount} objects · manifest sealed</dd></div></dl>
    <div class="drawer-tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${state.runDetailTab === id}" class="${state.runDetailTab === id ? "active" : ""}" data-run-tab="${id}">${label}</button>`).join("")}</div>
    ${renderRunDetailTab(run, gates)}
    <div class="drawer-actions"><button class="secondary-button" data-action="download-report">${icon("download", 16)}报告包</button><button class="primary-button compact" data-action="open-audit">${icon("scroll-text", 16)}审计链</button></div>
  </aside>`;
}

function renderWorkers(): string {
  return `
    ${renderPageHeader("Worker 与实验室", "控制面只分发白名单命令；Worker 通过 mTLS 主动连接 Linux。", `<button class="secondary-button" data-action="register-worker">${icon("plus", 16)}注册 Worker</button>`)}
    <div class="architecture-band">
      <div class="arch-node primary"><span>${icon("container", 22)}</span><div><small>CONTROL PLANE</small><strong>linux-control-01</strong><em>policy / queue / evidence</em></div>${statusBadge("READY")}</div>
      <div class="arch-link"><span>outbound mTLS</span><div></div><small>lease + fencing token</small></div>
      <div class="arch-targets"><div><span>${icon("monitor-cog", 20)}</span><div><small>BUILD</small><strong>win-build-01</strong></div><em>READY</em></div><div><span>${icon("microchip", 20)}</span><div><small>LAB</small><strong>hardware-lab-a</strong></div><em class="busy">BUSY</em></div></div>
    </div>
    <section class="resource-section">
      <div class="section-heading"><div><h2>执行节点</h2><span>${workers.length} 注册 · 3 在线 · 1 忙碌</span></div><button class="icon-button" data-action="refresh-workers" title="刷新节点">${icon("refresh-cw", 16)}</button></div>
      <div class="worker-grid">${workers.map((worker) => `<article class="worker-card"><div class="worker-top"><span class="worker-icon ${worker.status}">${icon(worker.id.includes("win") ? "monitor-cog" : worker.id.includes("lab") ? "microchip" : "server", 20)}</span><div><strong>${escapeHtml(worker.label)}</strong><span>${escapeHtml(worker.id)}</span></div>${statusBadge(worker.status.toUpperCase())}</div><div class="worker-os">${icon("cpu", 14)}${escapeHtml(worker.os)}<span>${worker.connection === "mtls-outbound" ? "mTLS outbound" : "local"}</span></div><div class="capability-list">${worker.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join("")}</div><div class="slot-meter"><div><span>执行槽位</span><strong>${worker.usedSlots} / ${worker.slots}</strong></div><div><span style="width:${(worker.usedSlots / worker.slots) * 100}%"></span></div></div><footer><span>心跳 ${escapeHtml(worker.lastSeen)}</span><button class="text-button" data-action="worker-diagnose">诊断 ${icon("arrow-up-right", 13)}</button></footer></article>`).join("")}</div>
    </section>
    <section class="inventory-section"><div class="section-heading"><div><h2>实验室资源</h2><span>租约阻止并发占用</span></div></div><div class="inventory-row"><div><span class="resource-icon">${icon("circuit-board", 18)}</span><div><strong>HC-F767-DEV-04</strong><span>STM32F767IGT6 · PCB V1.3</span></div></div><div><span>J-Link</span><strong>SN 8012••47</strong></div><div><span>串口</span><strong>COM14 / COM15</strong></div><div><span>当前租约</span><strong class="amber">RUN-260822-0145</strong></div><button class="icon-button" title="资源详情">${icon("chevron-right", 17)}</button></div><div class="inventory-row"><div><span class="resource-icon">${icon("radio-tower", 18)}</span><div><strong>Zigbee Rack 16</strong><span>协调器 + 16 个真实设备</span></div></div><div><span>Channel</span><strong>15</strong></div><div><span>电源遥测</span><strong>16 / 16</strong></div><div><span>当前租约</span><strong class="green">空闲</strong></div><button class="icon-button" title="资源详情">${icon("chevron-right", 17)}</button></div></section>`;
}

function renderCases(): string {
  const query = state.caseQuery.trim().toLowerCase();
  const filtered = caseRows.filter((row) => row.join(" ").toLowerCase().includes(query));
  return `
    ${renderPageHeader("用例与门禁", "声明式用例目录、证据要求与不可绕过的策略边界。", `<button class="secondary-button" data-action="validate-catalog">${icon("shield-check", 16)}校验目录</button><button class="primary-button compact" data-action="new-case">${icon("plus", 16)}新建用例</button>`)}
    <div class="policy-banner">${icon("ban", 18)}<div><strong>ADR-0042 绝对禁止</strong><span>Host-Sim、CTest、tests/host、tests/sim 与 app/sim_feed 不得进入当前门禁。</span></div><em>ENFORCED</em></div>
    <div class="gate-profile-row">${Object.entries(profileLabels).map(([id, label]) => `<button class="profile-tile ${state.profile === id ? "active" : ""}" data-profile="${id}"><span>${icon(id === "inspect" ? "scan-search" : id === "merge" ? "git-merge" : id === "hardware-release" ? "microchip" : "timer", 18)}</span><div><strong>${label.split(" / ")[0]}</strong><small>${id === "inspect" ? "3 modules · read-only" : id === "merge" ? "6 modules · build" : id === "hardware-release" ? "8 modules · lab" : "9 modules · 24h"}</small></div>${state.profile === id ? icon("check", 15) : ""}</button>`).join("")}</div>
    <section class="table-section"><div class="table-toolbar"><div class="search-box">${icon("search", 16)}<input id="case-search" value="${escapeHtml(state.caseQuery)}" placeholder="搜索 case ID、标题或 gate" aria-label="搜索用例" /></div><div><span class="catalog-status">${icon("badge-check", 15)}Catalog v42 · 已签名</span><button class="icon-button" title="筛选">${icon("sliders-horizontal", 16)}</button></div></div><div class="data-table-wrap"><table class="data-table cases-table"><thead><tr><th>Case ID</th><th>用例</th><th>Gate</th><th>执行环境</th><th>级别</th><th>状态</th><th></th></tr></thead><tbody>${filtered.map((row) => `<tr class="${row[5] === "ADR-0042" ? "retired" : ""}"><td><code>${escapeHtml(row[0])}</code></td><td><strong>${escapeHtml(row[1])}</strong>${row[5] === "ADR-0042" ? "<span>disabled_by_adr_0042</span>" : ""}</td><td><span class="gate-label">${escapeHtml(row[2])}</span></td><td>${escapeHtml(row[3])}</td><td>${escapeHtml(row[4])}</td><td>${row[5] === "ADR-0042" ? statusBadge("RETIRED") : statusBadge("ENABLED")}</td><td><button class="icon-button" title="查看用例">${icon("chevron-right", 16)}</button></td></tr>`).join("")}</tbody></table></div></section>`;
}

function renderModels(): string {
  return `
    ${renderPageHeader("模型自动化", "模型负责建议与归因；策略引擎负责必选用例、权限和最终结论。", `<button class="secondary-button" data-action="test-models">${icon("activity", 16)}连通性测试</button><button class="primary-button compact" data-action="save-models">${icon("save", 16)}保存配置</button>`)}
    <div class="model-boundary"><div>${icon("brain-circuit", 22)}<span>MODEL</span><strong>建议模块 · 失败归因 · 重跑建议 · 报告摘要</strong></div><div class="boundary-line"><span>${icon("arrow-right", 15)}</span><em>typed decision</em></div><div>${icon("shield-check", 22)}<span>POLICY</span><strong>必选注入 · 权限校验 · Gate Conclusion</strong></div></div>
    <section class="model-section"><div class="section-heading"><div><h2>模型配置</h2><span>仅接收脱敏摘要与受限证据切片</span></div></div><div class="model-grid">${modelProfiles.map((profile) => `<article class="model-card"><div><span class="model-avatar">${icon(profile.id === "quality-planner" ? "route" : profile.id === "failure-triage" ? "bug" : "file-text", 19)}</span><div><strong>${escapeHtml(profile.name)}</strong><span>${escapeHtml(profile.use)}</span></div>${statusBadge(profile.status.toUpperCase())}</div><dl><div><dt>Provider</dt><dd>${escapeHtml(profile.provider)}</dd></div><div><dt>Model</dt><dd><code>${escapeHtml(profile.model)}</code></dd></div><div><dt>P50 latency</dt><dd>${profile.latencyMs.toLocaleString()} ms</dd></div></dl><footer><span>${icon("shield", 13)}redacted input</span><button class="text-button" data-action="edit-model">配置 ${icon("arrow-up-right", 13)}</button></footer></article>`).join("")}</div></section>
    <section class="stage-binding-section"><div class="section-heading"><div><h2>阶段绑定</h2><span>各阶段可独立选择模型与推理强度</span></div></div><div class="binding-table"><div class="binding-head"><span>阶段</span><span>模型</span><span>推理</span><span>输入边界</span><span>启用</span></div>${modelBindings.map((binding) => { const enabled = state.enabledModelStages.has(binding.stage); return `<div class="binding-row"><span><strong>${escapeHtml(binding.label)}</strong><small>${binding.stage}</small></span><span><select aria-label="${escapeHtml(binding.label)} 模型"><option>${escapeHtml(binding.model)}</option><option>disabled</option></select></span><span><select aria-label="${escapeHtml(binding.label)} 推理强度"><option>${binding.reasoning}</option><option>medium</option><option>low</option></select></span><span>${escapeHtml(binding.inputPolicy)}</span><span><button class="toggle ${enabled ? "on" : ""}" data-action="toggle-binding" data-binding-stage="${binding.stage}" aria-label="切换${escapeHtml(binding.label)}" aria-pressed="${enabled}"><i></i></button></span></div>`; }).join("")}</div></section>
    <section class="decision-section"><div class="section-heading"><div><h2>最近模型决策</h2><span>决策不可覆盖确定性结论</span></div><button class="text-button" data-view="audit">完整审计 ${icon("arrow-right", 13)}</button></div><div class="decision-row"><span class="decision-icon">${icon("git-compare-arrows", 18)}</span><div><strong>${escapeHtml(modelDecision.id)}</strong><span>${modelDecision.stage} · ${escapeHtml(modelDecision.model)}</span></div><div class="decision-diff"><em>+2 modules</em><span>UART / Network</span></div><div><strong>${escapeHtml(modelDecision.schemaVersion)}</strong><span>${escapeHtml(modelDecision.promptVersion)} · input ${escapeHtml(modelDecision.inputHash.slice(-8))}</span></div>${statusBadge("PROPOSED")}</div></section>`;
}

function renderAudit(): string {
  const allEvents = [...state.sessionAuditEvents, ...auditEvents];
  const filtered = state.auditFilter === "all" ? allEvents : allEvents.filter((event) => event.result === state.auditFilter);
  return `
    ${renderPageHeader("审计日志", "审批、计划差异、命令拒绝和证据访问均以追加方式记录。", `<button class="secondary-button" data-action="verify-audit">${icon("badge-check", 16)}验证审计链</button><button class="primary-button compact" data-action="export-audit">${icon("download", 16)}导出</button>`)}
    <div class="audit-integrity"><div>${icon("fingerprint", 22)}<div><span>AUDIT CHAIN</span><strong>完整 · 8,803 events</strong></div></div><div><span>Head hash</span><code>fa80c9b1…21de</code></div><div><span>最后签名</span><strong>13:26:43 · linux-control-01</strong></div>${statusBadge("VERIFIED")}</div>
    <section class="audit-section"><div class="table-toolbar"><div class="search-box">${icon("search", 16)}<input placeholder="搜索 actor、action、target 或 plan hash" aria-label="搜索审计日志" /></div><div><select id="audit-filter" aria-label="审计结果筛选"><option value="all" ${state.auditFilter === "all" ? "selected" : ""}>全部结果</option><option value="allowed" ${state.auditFilter === "allowed" ? "selected" : ""}>Allowed</option><option value="denied" ${state.auditFilter === "denied" ? "selected" : ""}>Denied</option><option value="recorded" ${state.auditFilter === "recorded" ? "selected" : ""}>Recorded</option></select><button class="icon-button" title="日期筛选">${icon("calendar-days", 16)}</button></div></div><div class="audit-list">${filtered.map((event) => `<article class="audit-event result-${event.result}"><div class="audit-time"><strong>${escapeHtml(event.at)}</strong><span>2026-08-22</span></div><span class="audit-marker">${icon(event.result === "denied" ? "shield-x" : event.result === "allowed" ? "shield-check" : "circle-dot", 16)}</span><div class="audit-main"><div><strong>${escapeHtml(event.action)}</strong><span class="result-label">${event.result}</span></div><p>${escapeHtml(event.detail)}</p><footer><span>${icon("user-round", 13)}${escapeHtml(event.actor)}</span><span>${icon("crosshair", 13)}${escapeHtml(event.target)}</span>${event.planHash ? `<span>${icon("hash", 13)}${escapeHtml(event.planHash)}</span>` : ""}</footer></div><button class="icon-button" title="查看原始事件">${icon("chevron-right", 16)}</button></article>`).join("")}</div></section>`;
}

function renderApprovalDialog(): string {
  if (!state.approvalOpen) return "";
  const plan = getPlan();
  const reauth = plan.requiredApproval === "reauth";
  const selectedHighRisk = plan.selections.filter((selection) => selection.selected && moduleMap.get(selection.moduleId)?.risk !== "low");
  const phrase = `确认执行 HC-LAB-${plan.planHash.slice(0, 4).toUpperCase()}`;
  const valid = state.approvalConfirmed && (!reauth || state.approvalPhrase === phrase);
  return `<dialog id="approval-dialog" class="approval-dialog">
    <div class="dialog-header"><span class="dialog-risk-icon">${icon(reauth ? "triangle-alert" : "shield-alert", 22)}</span><div><span>${reauth ? "REAUTH FLOW · DEMO" : "STARTUP CONFIRMATION · DEMO"}</span><h2>${reauth ? "确认高风险硬件动作" : "确认实验室动作"}</h2></div><button class="icon-button" data-action="close-approval" title="关闭">${icon("x", 18)}</button></div>
    <div class="approval-summary"><div><span>Plan preview digest</span><code>${plan.planHash}</code></div><div><span>目标 revision</span><code>${escapeHtml(plan.revision)}</code></div><div><span>Catalog / Policy</span><strong>${escapeHtml(plan.catalogVersion)}<br />${escapeHtml(plan.policyVersion)}</strong></div><div><span>有效期</span><strong>30 分钟</strong></div></div>
    <div class="approval-actions-list"><h3>将授权的动作</h3>${selectedHighRisk.map((selection) => { const item = moduleMap.get(selection.moduleId); return `<div><span>${icon(item?.risk === "high" ? "zap" : "circle-check", 15)}</span><div><strong>${escapeHtml(item?.title ?? selection.moduleId)}</strong><small>${escapeHtml(item?.commandIds.join(" · ") ?? "")}</small></div><em>${item?.risk === "high" ? "高风险" : "受控"}</em></div>`; }).join("")}</div>
    <div class="approval-bindings"><h3>绑定目标与证据</h3><dl><div><dt>actionIds</dt><dd>${plan.actionIds.map((id) => `<code>${escapeHtml(id)}</code>`).join("")}</dd></div><div><dt>targetIds</dt><dd>${plan.targetIds.map((id) => `<code>${escapeHtml(id)}</code>`).join("")}</dd></div><div><dt>image SHA256</dt><dd>${plan.imageHashes.map((hash) => `<code>${escapeHtml(hash)}</code>`).join("") || "<em>无镜像动作</em>"}</dd></div><div><dt>resource leases</dt><dd>${plan.leaseIds.map((id) => `<code>${escapeHtml(id)}</code>`).join("")}</dd></div></dl></div>
    <label class="confirm-check"><input id="approval-check" type="checkbox" ${state.approvalConfirmed ? "checked" : ""} /><span>${icon("check", 13)}</span><p>我确认目标设备、镜像哈希、恢复步骤和实验室租约与本计划一致。</p></label>
    ${reauth ? `<label class="field phrase-field"><span>输入确认短语</span><input id="approval-phrase" autocomplete="off" placeholder="${phrase}" value="${escapeHtml(state.approvalPhrase)}" /><small>${phrase}</small></label>` : ""}
    <div class="dialog-policy">${icon("lock-keyhole", 15)}<span>Demo 会生成绑定 actionIds、targetIds、镜像和租约的审批记录；生产环境由服务端 SHA-256、SSO 重新认证和不可变审计完成授权。</span></div>
    <div class="dialog-footer"><button class="secondary-button" data-action="close-approval">取消</button><button id="confirm-approval" class="primary-button compact" data-action="confirm-approval" ${valid ? "" : "disabled"}>${icon("fingerprint", 16)}批准并启动</button></div>
  </dialog>`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function approvalLabel(level: ExecutionPlan["requiredApproval"]): string {
  return level === "none" ? "无需" : level === "startup" ? "启动确认" : "重新认证";
}

function riskTitle(level: ExecutionPlan["requiredApproval"]): string {
  return level === "none" ? "低风险计划" : level === "startup" ? "包含受控硬件动作" : "包含高风险恢复动作";
}

function riskCopy(level: ExecutionPlan["requiredApproval"]): string {
  return level === "none" ? "只读检查与构建可按当前 Profile 自动执行。" : level === "startup" ? "刷写、复位或入网会在启动前绑定设备和镜像。" : "断电、移除设备、恢复出厂或恢复流程需要重新认证和输入确认短语。";
}

function refreshIcons(): void {
  window.lucide?.createIcons({ attrs: { "stroke-width": "1.8" } });
}

function render(): void {
  app.innerHTML = renderShell();
  refreshIcons();
  if (state.approvalOpen) {
    const dialog = document.querySelector<HTMLDialogElement>("#approval-dialog");
    if (dialog && !dialog.open) dialog.showModal();
  }
}

function showToast(message: string): void {
  state.toast = message;
  render();
  window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = undefined;
      render();
    }
  }, 2200);
}

function startDemoRun(sourcePlan: ExecutionPlan): void {
  if (sourcePlan.blockedReasons.length > 0) {
    showToast("计划存在阻塞项，不能启动");
    return;
  }
  const plan = structuredClone(sourcePlan);
  state.approvalOpen = false;
  state.approvalConfirmed = false;
  state.approvalPhrase = "";
  const run: LiveRun = {
    id: `RUN-DEMO-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}`,
    status: "PREFLIGHT",
    progress: 4,
    activeStage: 0,
    logs: ["13:27:01|agent|run created; immutable plan snapshot bound", `13:27:01|policy|plan ${plan.planHash} accepted; command registry sealed`],
    evidence: 2,
    passed: 0,
    blocked: 0,
    plan
  };
  state.liveRun = run;
  render();

  const events = [
    ["13:27:02", "hg", "parent=08c4bc06c2b3 branch=default dirty=true", "PREFLIGHT"],
    ["13:27:03", "integrity", "project manifest written; ADR-0042 policy PASS", "PLANNING"],
    ["13:27:04", "static", "architecture layers and HCRP contract PASS", "RUNNING"],
    ["13:27:05", "dispatcher", "lease issued to win-build-01; fencingToken=7", "RUNNING"],
    ["13:27:06", "win-build", "ARMCC5 production: 0 errors, 0 warnings", "RUNNING"],
    ["13:27:07", "win-build", "ESP32-C6 image size and SHA256 verified", "RUNNING"],
    ["13:27:08", "evidence", "build artifacts indexed; secrets scan PASS", "FINALIZING"],
    ["13:27:09", "gate", "deterministic conclusion written; manifest sealed", "COMPLETED"]
  ] as const;
  let index = 0;
  run.timer = window.setInterval(() => {
    const event = events[index];
    if (!event || !state.liveRun) return;
    state.liveRun.logs.push(`${event[0]}|${event[1]}|${event[2]}`);
    state.liveRun.status = event[3];
    state.liveRun.progress = Math.min(100, 12 + index * 12);
    state.liveRun.evidence += index % 2 === 0 ? 4 : 7;
    state.liveRun.passed += index < 6 ? 5 : 2;
    state.liveRun.activeStage = Math.min(plan.stages.length - 1, Math.floor((index + 1) / 2));
    index += 1;
    if (index === events.length) {
      const selectedModules = plan.selections
        .filter((selection) => selection.selected)
        .map((selection) => moduleMap.get(selection.moduleId))
        .filter((item) => item !== undefined);
      const hasHardware = selectedModules.some((item) => item.platform === "lab");
      state.liveRun.progress = 100;
      const requiredStatuses = selectedModules.map((item) => item.platform === "lab" ? "BLOCKED" as const : "PASS" as const);
      state.liveRun.conclusion = mayConcludePass(requiredStatuses) ? "PASS" : hasHardware ? "BLOCKED" : "FAIL";
      state.liveRun.passed = selectedModules.filter((item) => item.platform !== "lab").reduce((sum, item) => sum + item.caseCount, 0);
      state.liveRun.blocked = selectedModules.filter((item) => item.platform === "lab").reduce((sum, item) => sum + item.caseCount, 0);
      if (state.liveRun.timer) window.clearInterval(state.liveRun.timer);
    }
    render();
  }, 650);
}

function handleClick(target: HTMLElement): void {
  const viewButton = target.closest<HTMLElement>("[data-view]");
  if (viewButton?.dataset.view) {
    state.view = viewButton.dataset.view as ViewId;
    state.runDetail = undefined;
    render();
    return;
  }
  const modeButton = target.closest<HTMLElement>("[data-mode]");
  if (modeButton?.dataset.mode) {
    state.mode = modeButton.dataset.mode as AutomationMode;
    state.modelDecision = "proposed";
    state.modelExcluded.clear();
    render();
    return;
  }
  const profileButton = target.closest<HTMLElement>("[data-profile]");
  if (profileButton?.dataset.profile) {
    state.profile = profileButton.dataset.profile as ProfileId;
    render();
    return;
  }
  const detailButton = target.closest<HTMLElement>("[data-run-detail]");
  if (detailButton?.dataset.runDetail) {
    state.runDetail = detailButton.dataset.runDetail;
    state.runDetailTab = "gates";
    render();
    return;
  }
  const runTabButton = target.closest<HTMLElement>("[data-run-tab]");
  if (runTabButton?.dataset.runTab) {
    state.runDetailTab = runTabButton.dataset.runTab as UiState["runDetailTab"];
    render();
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "accept-model") {
    state.modelDecision = "accepted";
    state.modelExcluded.clear();
  }
  else if (action === "reject-model") state.modelDecision = "rejected";
  else if (action === "reset-model") {
    state.modelDecision = "proposed";
    state.modelExcluded.clear();
  }
  else if (action === "start-run") {
    const plan = getPlan();
    if (plan.blockedReasons.length > 0) {
      showToast("计划存在阻塞项，不能启动");
      return;
    }
    const approval = plan.requiredApproval;
    if (approval === "none") startDemoRun(plan);
    else {
      state.approvalOpen = true;
      render();
    }
    return;
  } else if (action === "close-approval") {
    state.approvalOpen = false;
    state.approvalConfirmed = false;
    state.approvalPhrase = "";
  } else if (action === "confirm-approval") {
    const plan = getPlan();
    const phrase = `确认执行 HC-LAB-${plan.planHash.slice(0, 4).toUpperCase()}`;
    if (state.approvalConfirmed && (plan.requiredApproval !== "reauth" || state.approvalPhrase === phrase)) {
      const approval: Approval = {
        id: `APR-DEMO-${Date.now()}`,
        planHash: plan.planHash,
        actionIds: [...plan.actionIds],
        targetIds: [...plan.targetIds],
        imageHashes: [...plan.imageHashes],
        leaseIds: [...plan.leaseIds],
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        approver: "demo/yawaiot.lab",
        level: plan.requiredApproval === "reauth" ? "reauth" : "startup",
        state: "approved"
      };
      state.approvalRecord = approval;
      state.sessionAuditEvents.unshift({
        id: `AE-DEMO-${Date.now()}`,
        at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        actor: approval.approver,
        action: approval.level === "reauth" ? "APPROVE_REAUTH_DEMO" : "APPROVE_STARTUP_DEMO",
        target: approval.targetIds.join(", "),
        result: "allowed",
        planHash: approval.planHash,
        detail: `样例审批绑定 ${approval.actionIds.length} actions / ${approval.targetIds.length} targets / ${approval.leaseIds.length} leases。`
      });
      startDemoRun(plan);
    }
    return;
  } else if (action === "cancel-run") {
    if (state.liveRun?.timer) window.clearInterval(state.liveRun.timer);
    if (state.liveRun) {
      state.liveRun.status = "COMPLETED";
      state.liveRun.conclusion = "CANCELED";
      state.liveRun.logs.push("NOW|operator|run canceled; partial results cannot produce PASS");
    }
  } else if (action === "return-plan") state.liveRun = undefined;
  else if (action === "close-run-detail") state.runDetail = undefined;
  else if (action === "open-live-report") {
    state.liveRun = undefined;
    state.view = "runs";
    state.runDetail = runHistory[0]?.id;
  } else if (action === "open-audit") {
    state.runDetail = undefined;
    state.view = "audit";
  } else if (action === "copy-plan") {
    void navigator.clipboard?.writeText(getPlan().planHash);
    showToast("计划哈希已复制");
    return;
  } else if (action === "copy-logs") {
    void navigator.clipboard?.writeText(state.liveRun?.logs.join("\n") ?? "");
    showToast("可见日志已复制");
    return;
  } else if (action === "toggle-binding") {
    const stage = target.closest<HTMLButtonElement>("button")?.dataset.bindingStage as ModelStage | undefined;
    if (stage) {
      if (state.enabledModelStages.has(stage)) state.enabledModelStages.delete(stage);
      else state.enabledModelStages.add(stage);
      render();
    }
    return;
  } else {
    const messages: Record<string, string> = {
      "save-draft": "草稿已保存在本地会话",
      "refresh-status": "控制面与 Worker 状态已刷新",
      "refresh-workers": "Worker 心跳已刷新",
      "worker-diagnose": "诊断任务已加入只读队列",
      "register-worker": "已生成一次性注册请求",
      "export-runs": "运行索引导出任务已创建",
      "download-report": "报告包已加入下载队列",
      "download-evidence": "证据对象下载任务已创建",
      "validate-catalog": "用例目录签名与 schema 校验通过",
      "new-case": "已打开用例草稿",
      "test-models": "3 个模型端点连通正常",
      "save-models": "阶段绑定已保存并生成配置版本",
      "edit-model": "模型配置已进入编辑状态",
      "verify-audit": "审计哈希链验证通过",
      "export-audit": "脱敏审计导出任务已创建"
    };
    showToast(messages[action] ?? "操作已记录");
    return;
  }
  render();
}

app.addEventListener("click", (event) => handleClick(event.target as HTMLElement));
app.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.module) {
    const id = target.dataset.module as ModuleId;
    const selection = getPlan().selections.find((item) => item.moduleId === id);
    if (target.checked) {
      state.manual.add(id);
      state.modelExcluded.delete(id);
    } else {
      state.manual.delete(id);
      if (selection?.sources.includes("model")) state.modelExcluded.add(id);
    }
    state.modelDecision = state.modelDecision === "accepted" ? "accepted" : "proposed";
    render();
  } else if (target instanceof HTMLSelectElement && target.id === "profile-select") {
    state.profile = target.value as ProfileId;
    render();
  } else if (target instanceof HTMLSelectElement && target.id === "audit-filter") {
    state.auditFilter = target.value as UiState["auditFilter"];
    render();
  } else if (target instanceof HTMLInputElement && target.id === "approval-check") {
    state.approvalConfirmed = target.checked;
    const plan = getPlan();
    const phrase = `确认执行 HC-LAB-${plan.planHash.slice(0, 4).toUpperCase()}`;
    const button = document.querySelector<HTMLButtonElement>("#confirm-approval");
    if (button) button.disabled = !(state.approvalConfirmed && (plan.requiredApproval !== "reauth" || state.approvalPhrase === phrase));
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "approval-phrase") {
    state.approvalPhrase = target.value;
    const plan = getPlan();
    const phrase = `确认执行 HC-LAB-${plan.planHash.slice(0, 4).toUpperCase()}`;
    const button = document.querySelector<HTMLButtonElement>("#confirm-approval");
    if (button) button.disabled = !(state.approvalConfirmed && state.approvalPhrase === phrase);
  } else if (target instanceof HTMLInputElement && target.id === "case-search") {
    state.caseQuery = target.value;
    render();
    document.querySelector<HTMLInputElement>("#case-search")?.focus();
  }
});

window.addEventListener("load", refreshIcons);
render();
