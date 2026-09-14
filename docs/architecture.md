# HomeCore Test Agent Architecture

## 1. 已确认拓扑

```text
Browser
  -> HTTPS / Linux Control Plane
  -> durable job queue + policy + approval + audit
  <- outbound mTLS polling/stream from Windows Worker
  -> Keil ARMCC5 / PowerShell / ESP-IDF
  -> leased Hardware Lab resources
```

Windows Worker 主动连接 Linux，不开放浏览器到 WinRM、RDP 或任意远程 shell 的执行通道。

Worker job envelope：

```json
{
  "commandId": "homecore.build-app-rebuild",
  "args": { "revision": "08c4bc06c2b3", "clean": true },
  "planHash": "9a7f02c6d18e",
  "jobLease": "lease_...",
  "fencingToken": 42
}
```

Worker 必须从本地白名单解析 `commandId`，对参数做 schema 校验，以参数数组启动进程，不拼接 shell 字符串。

## 2. 责任边界

| 组件 | 拥有的职责 | 明确不负责 |
| --- | --- | --- |
| Browser | 模块选择、查看 plan diff、提交审批、查看日志和报告 | 任意 shell、最终结论、秘密保存 |
| Linux Control Plane | HG 检查、确定性计划、队列、权限、门禁、证据索引、审计 | ARMCC5 本机构建、模型自审批 |
| Windows Worker | 注册命令执行、工具链探测、日志和 artifact 上传 | 修改计划、扩权、任意浏览器命令 |
| Hardware Lab | 设备租约、刷写、串口、仪器、网络和恢复动作 | 用代码/build 结果代替实机证据 |
| Model stages | 影响建议、失败归因、重跑建议、摘要、风险复核 | required 注入、权限、PASS/FAIL 决定 |

## 3. 后端 API 最小契约

前端从样例数据切换到真实服务时，建议先提供以下接口：

```text
GET  /api/v1/system/status
GET  /api/v1/projects/homecore/revisions/current
GET  /api/v1/test-modules
POST /api/v1/plans
POST /api/v1/plans/{planHash}/model-proposal
POST /api/v1/approvals
POST /api/v1/runs
GET  /api/v1/runs/{runId}
GET  /api/v1/runs/{runId}/events        # SSE or WebSocket
GET  /api/v1/runs/{runId}/report
GET  /api/v1/workers
GET  /api/v1/lab/resources
GET  /api/v1/audit-events
```

`POST /plans` 返回服务端根据 canonical JSON 重新计算的 immutable SHA-256 `planHash`。浏览器不得自行生成可执行命令，也不得把前端 preview digest 当作授权依据。`POST /runs` 必须校验 revision、planHash、审批绑定和资源租约仍有效。

## 4. 权限模型

| 动作 | 默认策略 | 批准条件 |
| --- | --- | --- |
| HG 读取、静态检查、构建 | Profile 允许时自动 | 审计记录 |
| Flash、reset、power-cycle、permit join | 启动确认 | planHash + actionIds + targetIds + expiry |
| Remove device、factory reset、OTA 断电注入 | 重新认证 + 确认短语 | 上述绑定 + approver identity |
| eFuse、Secure Boot key、不可逆安全动作 | 默认禁止 | 单独流程，不在普通测试计划中 |

revision、plan、镜像哈希、动作集合或目标设备变化后，批准立即失效。模型不能批准自己的建议。

## 5. 建议继续完善的源文件

### Linux 控制面

```text
server/domain/test-module.ts
server/domain/execution-plan.ts
server/domain/approval.ts
server/domain/run.ts
server/core/impact-selector.ts
server/core/dependency-planner.ts
server/core/policy-engine.ts
server/core/gate-evaluator.ts
server/core/run-coordinator.ts
server/core/job-dispatcher.ts
server/adapters/vcs/mercurial.ts
server/adapters/queue/job-store.ts
server/adapters/evidence/artifact-store.ts
server/adapters/evidence/manifest-writer.ts
server/adapters/security/redactor.ts
server/adapters/audit/append-only-audit.ts
server/http/plans.ts
server/http/runs.ts
server/http/approvals.ts
server/http/workers.ts
server/http/events.ts
```

### Windows Build Worker

```text
worker/agent-service.ts
worker/control-plane-client.ts
worker/command-registry.ts
worker/typed-args.ts
worker/lease-guard.ts
worker/process-runner.ts
worker/toolchain-probe.ts
worker/artifact-uploader.ts
worker/commands/build-homecore-app.ts
worker/commands/build-homecore-libs.ts
worker/commands/build-esp-zigbee.ts
worker/parsers/keil-build.ts
worker/parsers/esp-idf-build.ts
```

### Hardware Lab

```text
lab/device-inventory.ts
lab/device-lease.ts
lab/approval-guard.ts
lab/image-verifier.ts
lab/jlink.ts
lab/serial-capture.ts
lab/power-controller.ts
lab/zigbee-network.ts
lab/instrument-import.ts
lab/screenshot-collector.ts
lab/recovery-runbook.ts
```

### 模型自动化

```text
automation/model-profile.ts
automation/stage-binding.ts
automation/redacted-evidence-view.ts
automation/impact-selection.ts
automation/failure-triage.ts
automation/rerun-advice.ts
automation/report-summary.ts
automation/risk-review.ts
automation/decision-audit.ts
```

模型输出统一为 schema-validated `ModelDecision`，必须包含证据范围、理由、建议增删模块和模型配置版本。模型输出只能形成 proposal，不能直接变更执行中的 immutable plan。

## 6. 证据与结论

每轮至少生成：

```text
plan.json
manifest.json
conclusion.json
report.json
report.md
junit.xml
issues.json
raw/*.stdout.log
raw/*.stderr.log
evidence/**/*
```

`COMPLETED` 只是生命周期终态，不等于 PASS。总体结论只有 `PASS | FAIL | BLOCKED | CANCELED`。静态或构建通过不能关闭 hardware、network、soak 门禁。

## 7. 当前前端替换点

当前 `src/catalog.ts` 保存样例数据，`src/app.ts` 保存本地 UI 状态。接真实 API 时保留 `src/domain.ts` 与 `src/planner.ts` 的展示契约，并新增：

```text
src/api/client.ts
src/api/contracts.ts
src/api/run-events.ts
src/state/run-store.ts
src/state/system-store.ts
src/views/*
src/components/*
```

当页面规模继续增长时再拆分 view/component。当前 demo 仅锁定 TypeScript 与本地 Lucide 资源，避免运行时依赖公共 CDN；产品接口冻结后再按视图和领域边界演进。
