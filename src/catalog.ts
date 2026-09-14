import type { AuditEvent, ExecutionBinding, ModelDecision, ModelProfile, ModelStageBinding, RunRecord, TestModule, Worker } from "./domain.js";

export const catalogVersion = "homecore-catalog-v42";
export const policyVersion = "homecore-policy-v7-adr0042";

export const modules: TestModule[] = [
  {
    id: "integrity",
    title: "HG 与工程完整性",
    summary: "锁定 parent、branch、dirty、heads 与工程文件哈希。",
    caseCount: 4,
    durationMin: 2,
    platform: "linux",
    executor: "linux-control-01",
    evidence: ["hg snapshot", "diff hash", "project manifest"],
    dependencies: [],
    risk: "low",
    gate: "repository",
    commandIds: ["homecore.hg.inspect", "homecore.project.audit"],
    requiredCapabilities: ["mercurial", "policy-engine"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "static",
    title: "静态检查与协议契约",
    summary: "检查架构分层、HCRP 镜像常量、格式和禁止项。",
    caseCount: 12,
    durationMin: 7,
    platform: "linux",
    executor: "linux-control-01",
    evidence: ["check logs", "contract hash", "violations.json"],
    dependencies: ["integrity"],
    risk: "low",
    gate: "static",
    commandIds: ["homecore.check.layers", "homecore.check.contracts"],
    requiredCapabilities: ["python", "policy-engine"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "stm32",
    title: "STM32 ARMCC5 生产构建",
    summary: "Windows Worker 执行 production rebuild 与 AXF/HEX/MAP 审计。",
    caseCount: 5,
    durationMin: 14,
    platform: "windows",
    executor: "win-build-01",
    evidence: ["Keil log", "AXF/HEX/MAP", "artifact SHA256"],
    dependencies: ["integrity", "static"],
    risk: "low",
    gate: "mcu-build",
    commandIds: ["homecore.build-app-rebuild"],
    requiredCapabilities: ["keil", "armcc5"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "libraries",
    title: "MCU 库与 Release Link",
    summary: "构建 libos/libdrv/libdev，并验证 release link-test。",
    caseCount: 6,
    durationMin: 11,
    platform: "windows",
    executor: "win-build-01",
    evidence: ["library logs", "release hashes", "link map"],
    dependencies: ["integrity", "static"],
    risk: "low",
    gate: "mcu-libraries",
    commandIds: ["homecore.build-libraries"],
    requiredCapabilities: ["keil", "armcc5"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "esp32",
    title: "ESP32-C6 Zigbee 构建",
    summary: "校验 ESP-IDF v5.5.4、依赖锁、分区余量和镜像哈希。",
    caseCount: 7,
    durationMin: 12,
    platform: "windows",
    executor: "win-build-01",
    evidence: ["IDF log", "size report", "BIN SHA256"],
    dependencies: ["integrity", "static"],
    risk: "low",
    gate: "esp-build",
    commandIds: ["homecore.esp-zigbee-build"],
    requiredCapabilities: ["esp-idf"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "uart",
    title: "UART 与硬件链路",
    summary: "刷写锁定镜像，采集 2 Mbps、RTS/CTS、电源与复位证据。",
    caseCount: 9,
    durationMin: 24,
    platform: "lab",
    executor: "lab-a",
    evidence: ["serial capture", "logic trace", "image manifest"],
    dependencies: ["stm32", "esp32"],
    risk: "controlled",
    gate: "hardware",
    commandIds: ["lab.flash-verified", "lab.uart-capture", "lab.reset"],
    requiredCapabilities: ["jlink", "serial", "logic-analyzer"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "network",
    title: "Zigbee、MQTT、HA 与网络",
    summary: "执行真实建网、设备控制、上报、恢复和外部系统闭环。",
    caseCount: 14,
    durationMin: 38,
    platform: "lab",
    executor: "lab-a",
    evidence: ["PCAP", "device timeline", "HA screenshots"],
    dependencies: ["uart"],
    risk: "controlled",
    gate: "network",
    commandIds: ["lab.zigbee-join", "lab.network-contract", "lab.ha-flow"],
    requiredCapabilities: ["zigbee", "serial"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "ota",
    title: "OTA 与恢复",
    summary: "验证升级、回滚及受控断网/断电恢复；动作需要重新认证。",
    caseCount: 8,
    durationMin: 46,
    platform: "lab",
    executor: "lab-a",
    evidence: ["OTA timeline", "power trace", "boot evidence"],
    dependencies: ["uart", "network"],
    risk: "high",
    gate: "recovery",
    commandIds: ["lab.ota-upgrade", "lab.power-loss-injection", "lab.rollback"],
    requiredCapabilities: ["jlink", "power-relay", "serial"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "device-lifecycle",
    title: "设备移除与恢复出厂",
    summary: "验证 remove device、factory reset、重新入网与失败恢复；动作需要重新认证。",
    caseCount: 5,
    durationMin: 22,
    platform: "lab",
    executor: "lab-a",
    evidence: ["device timeline", "reset evidence", "rejoin assertions"],
    dependencies: ["uart", "network"],
    risk: "high",
    gate: "device-lifecycle",
    commandIds: ["lab.remove-device", "lab.factory-reset", "lab.rejoin-verify"],
    requiredCapabilities: ["zigbee", "power-relay", "serial"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "soak",
    title: "Soak 长稳",
    summary: "持续采集资源、日志丢弃、连接恢复与 24 小时稳定性。",
    caseCount: 6,
    durationMin: 1440,
    platform: "lab",
    executor: "lab-soak-01",
    evidence: ["metrics series", "serial archive", "incident timeline"],
    dependencies: ["uart", "network"],
    risk: "controlled",
    gate: "soak",
    commandIds: ["lab.soak-24h"],
    requiredCapabilities: ["zigbee-rack", "retention-24h"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  },
  {
    id: "report",
    title: "报告完整性与脱敏",
    summary: "验证 JSON/JUnit/Markdown、证据哈希、链接与敏感字段脱敏。",
    caseCount: 5,
    durationMin: 3,
    platform: "linux",
    executor: "linux-control-01",
    evidence: ["manifest", "redaction scan", "conclusion.json"],
    dependencies: ["integrity"],
    risk: "low",
    gate: "report",
    commandIds: ["agent.report.verify", "agent.redaction.scan"],
    requiredCapabilities: ["artifact-signer", "policy-engine"],
    enabled: true,
    policyRefs: ["ADR-0042"]
  }
];

export const workers: Worker[] = [
  {
    id: "linux-control-01",
    label: "Linux Control Plane",
    os: "Ubuntu 24.04 LTS",
    status: "ready",
    lastSeen: "刚刚",
    capabilities: ["Mercurial 6.7", "Python 3.12", "Artifact signer", "Policy engine"],
    capabilityIds: ["mercurial", "python", "artifact-signer", "policy-engine"],
    slots: 6,
    usedSlots: 1,
    connection: "local"
  },
  {
    id: "win-build-01",
    label: "Windows Build Worker 01",
    os: "Windows 11 Enterprise",
    status: "ready",
    lastSeen: "8 秒前",
    capabilities: ["Keil MDK 5.38", "ARMCC 5.06u7", "ESP-IDF 5.5.4", "AStyle 3.1"],
    capabilityIds: ["keil", "armcc5", "esp-idf", "astyle"],
    slots: 2,
    usedSlots: 0,
    connection: "mtls-outbound"
  },
  {
    id: "lab-a",
    label: "Hardware Lab A",
    os: "Windows 11 Lab Host",
    status: "busy",
    lastSeen: "12 秒前",
    capabilities: ["J-Link", "4 serial ports", "Power relay", "Logic analyzer"],
    capabilityIds: ["jlink", "serial", "power-relay", "logic-analyzer", "zigbee"],
    slots: 2,
    usedSlots: 1,
    connection: "mtls-outbound"
  },
  {
    id: "lab-soak-01",
    label: "Soak Rack 01",
    os: "Ubuntu Lab Gateway",
    status: "ready",
    lastSeen: "21 秒前",
    capabilities: ["16-device Zigbee rack", "24h retention", "Power telemetry"],
    capabilityIds: ["zigbee-rack", "retention-24h", "power-telemetry"],
    slots: 1,
    usedSlots: 0,
    connection: "mtls-outbound"
  }
];

export const executionBindings: ExecutionBinding[] = [
  { moduleId: "integrity", workerId: "linux-control-01", targetId: "homecore-worktree" },
  { moduleId: "static", workerId: "linux-control-01", targetId: "homecore-worktree" },
  { moduleId: "stm32", workerId: "win-build-01", targetId: "homecore-stm32f767", imageSha256: "sha256:5d36c892...984f" },
  { moduleId: "libraries", workerId: "win-build-01", targetId: "homecore-release-libs" },
  { moduleId: "esp32", workerId: "win-build-01", targetId: "homecore-esp32c6", imageSha256: "sha256:d81fc092...121a" },
  { moduleId: "uart", workerId: "lab-a", targetId: "HC-F767-DEV-04", leaseId: "lease-lab-a-slot-02", imageSha256: "sha256:5d36c892...984f" },
  { moduleId: "network", workerId: "lab-a", targetId: "ZIGBEE-RACK-16", leaseId: "lease-lab-a-slot-02" },
  { moduleId: "ota", workerId: "lab-a", targetId: "HC-F767-DEV-04", leaseId: "lease-lab-a-slot-02", imageSha256: "sha256:aa91e08b...72c0" },
  { moduleId: "device-lifecycle", workerId: "lab-a", targetId: "ZIGBEE-RACK-16", leaseId: "lease-lab-a-slot-02" },
  { moduleId: "soak", workerId: "lab-soak-01", targetId: "ZIGBEE-RACK-16", leaseId: "lease-soak-rack-01" },
  { moduleId: "report", workerId: "linux-control-01", targetId: "artifact-store-homecore" }
];

export const modelDecision: ModelDecision = {
  id: "md-20260822-031",
  stage: "impact-selection",
  model: "quality-planner / reasoning high",
  provider: "Internal Gateway",
  promptVersion: "impact-selection-v3",
  schemaVersion: "model-decision-v2",
  inputHash: "sha256:4211f0b2...31a9",
  outputHash: "sha256:d7c1d9e0...8004",
  policyEvaluation: "pending",
  createdAt: "13:26:41",
  proposedAdditions: ["uart", "network"],
  proposedRemovals: [],
  reasons: [
    "HCRP 双端协议文件有变更，静态契约与双目标构建不足以证明真实链路。",
    "Zigbee mapper 变更触及 report/config/control 路径，建议补真实网络闭环。"
  ],
  state: "proposed",
  evidenceScope: "已脱敏变更摘要：18 files / 7 protocol symbols / 2 task refs"
};

export const modelProfiles: ModelProfile[] = [
  { id: "quality-planner", name: "Quality Planner", provider: "Internal Gateway", model: "planner-large", status: "ready", latencyMs: 1840, use: "影响选择 / 风险审查" },
  { id: "failure-triage", name: "Failure Triage", provider: "Internal Gateway", model: "code-reasoner", status: "ready", latencyMs: 2280, use: "失败归因 / 重跑建议" },
  { id: "report-writer", name: "Report Writer", provider: "Internal Gateway", model: "summary-medium", status: "ready", latencyMs: 920, use: "报告摘要" }
];

export const modelBindings: ModelStageBinding[] = [
  { stage: "impact-selection", label: "影响选择", model: "planner-large", reasoning: "high", enabled: true, inputPolicy: "diff 摘要 + 依赖图" },
  { stage: "failure-triage", label: "失败归因", model: "code-reasoner", reasoning: "high", enabled: true, inputPolicy: "脱敏堆栈 + 证据切片" },
  { stage: "rerun-advice", label: "重跑建议", model: "code-reasoner", reasoning: "medium", enabled: true, inputPolicy: "失败指纹 + 环境摘要" },
  { stage: "report-summary", label: "报告摘要", model: "summary-medium", reasoning: "medium", enabled: true, inputPolicy: "确定性结论 + 问题清单" },
  { stage: "risk-review", label: "风险复核", model: "planner-large", reasoning: "high", enabled: true, inputPolicy: "计划差异 + 权限策略" }
];

export const runHistory: RunRecord[] = [
  { id: "RUN-260822-0142", revision: "08c4bc06c2b3", branch: "default", profile: "merge", status: "COMPLETED", conclusion: "PASS", startedAt: "今天 12:42", duration: "31m 08s", passed: 39, failed: 0, blocked: 0, evidenceCount: 74, planHash: "9a7f02c6d18e" },
  { id: "RUN-260822-0137", revision: "a97d4c2f8101", branch: "HV10", profile: "hardware-release", status: "COMPLETED", conclusion: "BLOCKED", startedAt: "今天 10:18", duration: "48m 12s", passed: 42, failed: 0, blocked: 3, evidenceCount: 103, planHash: "22b148c08ef9" },
  { id: "RUN-260821-0098", revision: "f71eae90cc42", branch: "default", profile: "merge", status: "COMPLETED", conclusion: "FAIL", startedAt: "昨天 18:07", duration: "19m 44s", passed: 27, failed: 2, blocked: 0, evidenceCount: 61, planHash: "697e9b1c88e1" },
  { id: "RUN-260821-0084", revision: "f71eae90cc42", branch: "default", profile: "inspect", status: "COMPLETED", conclusion: "PASS", startedAt: "昨天 15:31", duration: "06m 03s", passed: 21, failed: 0, blocked: 0, evidenceCount: 32, planHash: "c01e28e8171f" },
  { id: "RUN-260820-0061", revision: "0c992ba7d311", branch: "HV10", profile: "soak-release", status: "COMPLETED", conclusion: "CANCELED", startedAt: "8 月 20 日 09:00", duration: "7h 12m", passed: 48, failed: 0, blocked: 0, evidenceCount: 218, planHash: "af0c0294c62e" }
];

export const auditEvents: AuditEvent[] = [
  { id: "AE-88031", at: "13:26:43", actor: "model/quality-planner", action: "PROPOSE_PLAN_DIFF", target: "draft/current", result: "recorded", planHash: "pending", detail: "建议增加 UART 与网络闭环；无权限决策。" },
  { id: "AE-88030", at: "13:25:58", actor: "worker/win-build-01", action: "CAPABILITY_HEARTBEAT", target: "worker-registry", result: "recorded", detail: "Keil、ARMCC5、ESP-IDF 工具链可用。" },
  { id: "AE-88029", at: "13:24:12", actor: "operator/zhang", action: "READ_EVIDENCE", target: "RUN-260822-0137", result: "allowed", planHash: "22b148c08ef9", detail: "读取脱敏的 UART 启动日志。" },
  { id: "AE-88028", at: "13:18:09", actor: "policy-engine", action: "DENY_COMMAND", target: "worker/win-build-01", result: "denied", detail: "拒绝未注册的 shell 文本；仅允许 commandId + typed args。" },
  { id: "AE-88027", at: "12:43:01", actor: "operator/li", action: "APPROVE_STARTUP", target: "RUN-260822-0142", result: "allowed", planHash: "9a7f02c6d18e", detail: "审批绑定 revision、planHash、actionIds 和 30 分钟有效期。" }
];

export const caseRows = [
  ["HC-PREFLIGHT-HG-001", "HG revision / dirty / heads", "repository", "Linux", "required", "启用"],
  ["HC-INTEGRITY-PROJECT-001", "Production uvprojx XML audit", "repository", "Linux", "required", "启用"],
  ["HC-STATIC-LAYERS-001", "架构层与命名映射", "static", "Linux", "required", "启用"],
  ["HC-CONTRACT-HCRP-001", "HCRP 双端 wire contract", "static", "Linux + Windows", "required", "启用"],
  ["HC-BUILD-MCU-PRODUCTION-001", "ARMCC5 production rebuild", "mcu-build", "Windows", "required", "启用"],
  ["HC-BUILD-ESP-ZIGBEE-001", "ESP32-C6 Zigbee clean build", "esp-build", "Windows", "required", "启用"],
  ["HC-HW-UART-2M-001", "2 Mbps UART / RTS / CTS", "hardware", "Lab", "profile", "启用"],
  ["HC-NETWORK-ZIGBEE-016", "16 设备建网与恢复", "network", "Lab", "profile", "启用"],
  ["HC-DEVICE-LIFECYCLE-001", "移除设备 / 恢复出厂 / 重新入网", "device-lifecycle", "Lab", "reauth", "启用"],
  ["HC-POLICY-SIM-RETIRED-001", "Host-Sim / CTest 退役保护", "policy", "禁止执行", "absolute", "ADR-0042"]
] as const;
