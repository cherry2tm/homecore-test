# HomeCore Test Agent 与 Codex Subagent 协作手册

## 1. 文档目的

本文面向参与 HomeCore 测试工程建设、代码审查、自动化测试和故障分析的协作者，说明：

- HomeCore 源码、Test Agent、Codex 主代理、Codex subagent 和 Windows Build Worker 的关系；
- 如何在 HomeCore 项目中配置 Codex subagent；
- 如何发起一次可审计的代码检查或测试运行；
- 每个参与者应提交哪些日志、证据、问题和结论；
- 当前 Demo 已经具备什么，以及继续接入真实工程时还缺什么。

本文不保存服务器密码、API key、私钥或设备秘密。协作者应通过团队批准的凭据渠道申请访问权限。

## 2. 当前可用环境

| 项目 | 位置 | 用途 |
| --- | --- | --- |
| HomeCore 源码 | `/home/yawaiot/test/homecore/homecore` | 被检查和被测试的真实工程 |
| HomeCore Test Agent | `/home/yawaiot/test/homecore/homecore-test-agent` | 独立测试控制台和后续控制面工程 |
| Demo 页面 | `http://192.168.30.31:4174/` | 查看测试模块、Worker、门禁、日志和证据交互 |
| 运行日志 | `homecore-test-agent/artifacts/runtime/server.log` | 当前 Node 静态服务日志 |
| 服务 PID | `homecore-test-agent/artifacts/runtime/server.pid` | 当前 Demo 服务进程记录 |

重要：当前页面是可操作的前端 Demo，运行历史、Worker 心跳、证据数量和部分日志是样例数据。它们不能证明真实 HomeCore、Windows 工具链或硬件已经通过测试。

## 3. 组件职责

```text
Developer / Reviewer
        |
        v
Codex primary agent
        |
        +--> test_planner       变更影响和用例建议
        +--> code_reviewer      缺陷、回归和测试缺口
        +--> linux_test_runner  提交允许的测试计划并读取结果
        +--> failure_triage     失败归因和重跑建议
        +--> evidence_auditor   证据完整性和脱敏检查
        |
        v
Linux Test Agent control plane
        |
        +--> deterministic planner / policy / gates
        +--> Windows Build Worker
        +--> Hardware Lab
        |
        v
Immutable run artifacts and conclusion
```

| 组件 | 可以做 | 不可以做 |
| --- | --- | --- |
| Codex 主代理 | 拆分任务、协调 subagent、汇总结果、引用证据 | 用自然语言宣告无证据的 PASS |
| Codex subagent | 代码探索、审查、计划建议、日志分析、报告摘要 | 自己批准高风险动作、绕过门禁、扩展权限 |
| Linux 控制面 | 固定 revision、生成计划、审批、调度、证据索引、门禁结论 | 把模型建议直接当作可执行计划 |
| Windows Worker | 执行注册的构建命令、收集日志和产物 | 接受任意 shell、改变 plan、决定最终结论 |
| Hardware Lab | 设备租约、刷写、串口、电源、网络和仪器证据 | 用代码或构建结果代替实机测试 |

测试的事实来源必须是确定性命令结果、断言和证据清单。Codex 用于协作和分析，不是最终门禁决策器。

## 4. 推荐的仓库结合方式

保持 Test Agent 为独立目录，不把它复制进 HomeCore 源码树。HomeCore 只增加项目级 Codex 配置和 Test Agent 项目映射：

```text
homecore/
  AGENTS.md
  .codex/
    config.toml
    agents/
      test-planner.toml
      code-reviewer.toml
      linux-test-runner.toml
      failure-triage.toml
      evidence-auditor.toml
  test-agent.yaml

homecore-test-agent/
  server/
  worker/
  automation/
  projects/homecore/
  artifacts/
```

生产执行时，控制面应针对固定 revision 创建独立的只读快照或临时工作副本。不要让并行 subagent 和 Worker 直接在开发者的脏工作目录中构建或修改文件。

## 5. Codex Subagent 配置

Codex 当前版本支持由用户直接要求并行委派，也支持按照适用的 `AGENTS.md` 和项目级 custom agent 配置进行委派。Codex CLI 可使用 `/agent` 查看和切换 subagent 线程。官方说明见 [OpenAI Docs: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)。

### 5.1 `.codex/config.toml`

```toml
[agents]
enabled = true
max_concurrent_threads_per_session = 4
```

先使用 4 个并发线程。并发数量越高，令牌消耗、日志量和共享环境竞争越明显。

### 5.2 `AGENTS.md`

建议在 HomeCore 根目录加入以下项目规则：

```markdown
# HomeCore Test Workflow

For repository test or review tasks, the primary Codex agent must:

1. Spawn `test_planner` to inspect the requested revision and affected modules.
2. Spawn `code_reviewer` for an independent read-only review.
3. Fix the revision and plan before asking `linux_test_runner` to submit checks.
4. Spawn `failure_triage` only when a case fails or becomes blocked.
5. Spawn `evidence_auditor` before a release conclusion.
6. Wait for all requested subagents and consolidate their results.
7. Cite files, lines, runId, caseId and evidence paths for every finding.
8. Treat deterministic command results and Test Agent gates as authoritative.
9. Never convert a missing required result, BLOCKED or SKIPPED into PASS.
10. Never let multiple subagents edit the same file concurrently.
11. Never expose credentials, unredacted device logs or arbitrary shell access.
```

### 5.3 Custom agent 示例

`.codex/agents/code-reviewer.toml`：

```toml
name = "code_reviewer"
description = "Read-only HomeCore reviewer for correctness, regressions, and missing tests."
sandbox_mode = "read-only"

developer_instructions = """
Do not modify source files.
Review the requested revision and changed files.
Prioritize functional defects, regressions, protocol compatibility,
unsafe command construction, lifecycle behavior, and missing tests.
Return severity, file and line, evidence, failure condition, and a proposed caseId.
Do not decide the final project PASS or FAIL.
"""
```

`.codex/agents/linux-test-runner.toml`：

```toml
name = "linux_test_runner"
description = "Submit allowlisted HomeCore checks to the Test Agent and summarize evidence."
sandbox_mode = "read-only"

developer_instructions = """
Never edit HomeCore source code and never construct arbitrary shell commands.
Submit only registered commandId values through the Test Agent API.
Bind every request to the requested revision and server-issued planHash.
Return runId, case results, evidence references, blocked reasons, and conclusion.
"""
```

其他 agent 遵循同样结构：文件必须定义 `name`、`description` 和 `developer_instructions`。未单独指定模型时继承父代理配置，避免把模型版本硬编码进项目规则。

## 6. 协作者使用流程

### 6.1 只读代码检查

在 HomeCore 仓库中启动 Codex，然后输入：

```text
检查当前 revision。使用 test_planner 和 code_reviewer 并行工作，
等待两个 subagent 完成后，按严重程度汇总问题。
每个问题必须包含文件、行号、触发条件、证据和建议测试用例。
不要修改代码，不要执行硬件动作。
```

### 6.2 工程门禁检查

```text
对当前 HomeCore revision 执行 inspect 门禁。
先让 test_planner 生成影响范围，再让 code_reviewer 做独立审查，
计划固定后由 linux_test_runner 提交允许的测试。
等待全部完成，返回 revision、planHash、runId、用例结果、日志、
证据清单、问题、门禁结论和未覆盖项。
```

### 6.3 失败分析

```text
分析 RUN-<runId>。让 failure_triage 检查失败日志、历史问题和相关代码，
让 evidence_auditor 检查证据是否完整且已脱敏。
不要重跑，不要修改代码；先输出根因假设、证据、置信度和最小重跑建议。
```

### 6.4 修复与复测

修复任务必须与审查任务分开。先固定失败证据，再授权一个实现 agent 修改明确范围的文件；完成后执行聚焦测试和受影响的完整门禁。多个 agent 不得重叠编辑同一文件。

## 7. 一次测试运行的标准流程

```text
1. PRECHECK
   确认 revision、dirty 状态、工具链、Worker 能力、磁盘和配置版本。

2. PLAN
   根据 profile、变更影响、依赖和策略生成不可变计划。

3. APPROVAL
   高风险动作绑定 revision、planHash、actionIds、targetIds 和有效期。

4. EXECUTE
   Linux 或 Windows Worker 只执行 commandId 白名单中的命令。

5. COLLECT
   保存 stdout、stderr、JUnit、构建产物、截图、串口和仪器证据。

6. EVALUATE
   由 gate-evaluator 根据 required 用例和证据计算结论。

7. REPORT
   生成 JSON、Markdown、JUnit、问题列表和追加式审计记录。
```

`COMPLETED` 只表示流程结束，不表示测试通过。最终结论只能是 `PASS | FAIL | BLOCKED | CANCELED`。任何 required 用例为 `BLOCKED` 或 `SKIPPED` 时都不能输出 PASS。

## 8. Subagent 返回格式

每个 subagent 应向主代理返回简洁、可机器读取的结果，而不是整段复制原始日志：

```json
{
  "agent": "code_reviewer",
  "revision": "08c4bc06c2b3",
  "status": "completed",
  "summary": "1 high, 2 medium findings",
  "findings": [
    {
      "severity": "high",
      "file": "path/to/file.c",
      "line": 120,
      "condition": "failure condition",
      "evidence": ["RUN-.../raw/case.stderr.log"],
      "proposedCaseId": "HC-REGRESSION-001"
    }
  ],
  "blockers": [],
  "unverified": []
}
```

模型生成的摘要不能替换原始证据。主代理必须保留 evidence 引用，并清楚标记未验证内容。

## 9. 每轮必须产生的工程文件

```text
artifacts/<runId>/
  plan.json
  manifest.json
  conclusion.json
  report.json
  report.md
  junit.xml
  issues.json
  audit.jsonl
  raw/*.stdout.log
  raw/*.stderr.log
  evidence/**/*
```

`manifest.json` 至少记录 revision、planHash、caseId、命令版本、工具链版本、文件大小和 SHA-256。日志在进入模型或报告前必须先脱敏。

## 10. Test Agent 最小 API

前端和 Codex 调度 agent 都只能提交声明式意图，不能提交 shell 文本：

```text
GET  /api/v1/system/status
GET  /api/v1/projects/homecore/revisions/current
GET  /api/v1/test-modules
POST /api/v1/plans
POST /api/v1/plans/{planHash}/model-proposal
POST /api/v1/approvals
POST /api/v1/runs
GET  /api/v1/runs/{runId}
GET  /api/v1/runs/{runId}/events
GET  /api/v1/runs/{runId}/report
GET  /api/v1/workers
GET  /api/v1/audit-events
```

`POST /plans` 必须由服务器基于 canonical JSON 计算 SHA-256 `planHash`。`POST /runs` 必须重新校验 revision、计划、审批、租约和 fencing token。

## 11. 当前项目验证命令

在 Test Agent 目录执行：

```bash
npm ci
npm run typecheck
npm test
npm run check
```

当前门禁包含 TypeScript strict 检查、前端构建和 16 个 Node 测试。它验证计划依赖、审批升级、no-false-pass 规则以及静态服务器安全边界，但不等于真实 HomeCore 构建或硬件 PASS。

## 12. Demo 服务运维

查看服务状态：

```bash
cd /home/yawaiot/test/homecore/homecore-test-agent
kill -0 "$(cat artifacts/runtime/server.pid)"
curl -I http://127.0.0.1:4174/
```

查看日志：

```bash
cd /home/yawaiot/test/homecore/homecore-test-agent
tail -f artifacts/runtime/server.log
```

停止服务：

```bash
cd /home/yawaiot/test/homecore/homecore-test-agent
kill "$(cat artifacts/runtime/server.pid)"
```

启动服务：

```bash
cd /home/yawaiot/test/homecore/homecore-test-agent
mkdir -p artifacts/runtime
nohup env HOST=0.0.0.0 PORT=4174 node server.mjs \
  > artifacts/runtime/server.log 2>&1 < /dev/null &
echo $! > artifacts/runtime/server.pid
```

当前使用 `nohup`，服务器重启后不会自动恢复。生产部署应增加受控的服务管理、健康检查、日志轮转和最小权限运行账户。

## 13. 安全要求

- 不在仓库、日志、截图、提示词、Project Context 或报告中写入密码、token、私钥和完整环境变量。
- Browser、Codex 和模型只能提交模块、profile、revision、caseId 或注册的 commandId。
- Worker 本地解析 commandId，以参数数组启动进程，不拼接 shell 字符串。
- subagent 默认优先只读；需要修改代码时必须明确文件范围和验收标准。
- Flash、reset、power-cycle、permit join 等动作需要启动确认。
- Remove device、factory reset 和 OTA 断电注入需要重新认证。
- eFuse、Secure Boot key 和其他不可逆动作不进入普通测试计划。
- revision、plan、镜像哈希、动作、目标设备或租约变化后，旧批准立即失效。
- 模型不能批准自己的建议，也不能直接决定 PASS/FAIL。
- 外部日志必须经过路径校验、大小限制、MIME 检查、脱敏和 SHA-256 索引。

## 14. 协作提交要求

每次协作提交或交接至少包含：

1. 目标 revision 和变更范围；
2. 修改文件及修改原因；
3. 实际执行的命令；
4. 用例通过、失败、阻塞和跳过数量；
5. 关键失败堆栈或根因摘要；
6. runId、caseId 和证据路径；
7. 未执行项及原因；
8. 残余风险和下一步；
9. 是否涉及 Worker、设备和高风险审批；
10. 文档、配置、测试目录和版本记录是否同步。

不要只写“测试通过”。没有命令、用例和证据引用的 PASS 不可接受。

## 15. 接入路线

### P0：Linux 最小闭环

- 实现 revision/dirty/toolchain preflight；
- 实现 `POST /plans`、`POST /runs`、运行状态和事件接口；
- 接入允许的 Linux 只读检查；
- 生成不可变 artifacts、JUnit、问题和门禁结论；
- 把前端样例数据替换为真实 API 数据。

### P1：Windows Build Worker

- Worker 以 outbound mTLS 主动连接 Linux；
- 实现工具链探测、command registry、typed args、lease 和 fencing token；
- 接入 Keil ARMCC5、库构建和 ESP-IDF 构建；
- 上传日志、产物、工具链版本和哈希。

### P2：硬件与模型自动化

- 接入设备租约、J-Link、串口、电源、Zigbee、截图和仪器证据；
- 接入 impact-selection、failure-triage、rerun-advice 和 report-summary；
- 模型输出统一做 schema 校验并保存 decision audit；
- 模型只提交 proposal，确定性策略负责接受、拒绝和最终门禁。

## 16. 常见问题

### 页面显示 PASS，是否代表真实工程通过？

不是。当前页面仍包含样例数据。只有真实 runId、固定 revision、完整 manifest 和 required 门禁全部满足时才能确认 PASS。

### subagent 能直接登录 Windows 运行任意命令吗？

不能。正确路径是通过 Linux 控制面提交注册的 commandId，由 Windows Worker 在本地白名单中解析和执行。

### 为什么不让多个 agent 同时修代码？

并行读、测试和日志分析通常有效；并行写同一工作区容易产生冲突和不可归因结果。实现修改应按文件所有权或串行阶段划分。

### 模型建议删除一个 required 用例怎么办？

模型建议只能进入 plan diff。required 注入、依赖、审批和结论由确定性策略控制，模型无权直接删除或绕过。

### Worker 或硬件离线怎么办？

相关 required 用例应记录为 `BLOCKED`，最终结论不能是 PASS。报告中必须说明缺失能力、未获得的证据和建议重试条件。

## 17. 相关文档

- [README](../README.md)：Demo 运行、代码结构和质量命令；
- [Architecture](architecture.md)：控制面、Worker、权限、API 和证据边界；
- [OpenAI Docs: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)：Codex subagent 配置和使用方式。
