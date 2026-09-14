# HomeCore Test Agent Console

这是 HomeCore 测试 Agent 的独立前端原型。默认页面不是营销首页，而是可以直接编排测试计划的操作控制台。

## 协作入口

- [Codex Subagent 协作手册](docs/codex-subagent-collaboration.md)：项目接入、subagent 配置、测试流程、证据标准、运维和安全边界；
- [系统架构](docs/architecture.md)：Linux 控制面、Windows Worker、Hardware Lab、权限和 API 边界。

当前版本实现：

- Linux 控制平面到远程 Windows build worker 的拓扑；
- 11 个可勾选测试模块，带 `profile`、`impact`、`dependency`、`manual`、`model` 来源；
- 依赖和必选门禁自动锁定；
- `Manual`、`Assist`、`Auto` 三种模型自动化模式；
- 模型建议的可见 plan diff，接受后才进入计划；
- 根据风险升级到启动确认或重新认证，并把批准绑定到 `planHash`；
- 运行记录、Worker/实验室、用例门禁、模型绑定和追加式审计视图；
- 明确标记的前端模拟运行，可演示进度、日志、证据和最终结论；
- ADR-0042 退役仿真资产的显式禁止状态。

## 本地运行

环境要求：Node.js 22+、npm 10.9.4。TypeScript 和图标资源均锁定在 `package-lock.json` 中，首次运行先安装锁定依赖。

```powershell
npm ci
npm run check
npm start
```

默认地址：`http://127.0.0.1:4173`

可用环境变量：

```powershell
$env:PORT = "4174"
$env:HOST = "127.0.0.1"
npm start
```

## 代码结构

```text
homecore-test-agent/
  src/
    domain.ts       共享领域契约
    catalog.ts      模块、Worker、模型、运行与审计样例目录
    planner.ts      确定性选择、依赖、风险、阶段与 planHash
    app.ts          前端状态、视图、审批和演示运行交互
  public/
    index.html      浏览器入口
    styles.css      控制台视觉与响应式布局
  tests/
    planner.test.mjs 计划器和 no-false-pass 负向测试
    server.test.mjs  静态服务、路径边界和安全响应头测试
  scripts/
    build.mjs       TypeScript 编译和静态资源装配
    clean.mjs       清理 dist
  docs/
    architecture.md                  控制面、Worker、安全与后续源文件边界
    codex-subagent-collaboration.md  Codex subagent 项目接入与协作手册
  server.mjs        静态服务器、SPA fallback 和安全响应头
```

## 当前边界

这是可操作的前端和领域层 demo，还没有连接真实 HomeCore 控制面。页面里的运行日志、证据数量、Worker 心跳和历史记录都是明确标记的样例数据，不代表远程仓库或硬件已经通过测试。

真实接入时，浏览器只能提交声明式计划意图，不能提交 shell。Linux 控制面负责确定性计划、审批、队列、结论和证据；Windows Worker 仅接受注册过的 `commandId + typed args + planHash + jobLease/fencingToken`。

Demo 中的 `planHash` 是用于观察计划变化的 FNV-1a 32-bit preview digest，不具备授权安全性。生产控制面必须对 canonical JSON 使用服务端 SHA-256，并以服务端结果绑定审批、租约与执行。

## 质量命令

```text
npm run typecheck  TypeScript strict 检查
npm test           构建后运行 Node 内置测试
npm run build      生成 dist/
npm run check      typecheck + test
```

当前共有 16 个 Node 测试。未把代码/build 的 PASS 描述为硬件 PASS；required 用例为 `BLOCKED` 或 `SKIPPED` 时，确定性结论函数不会返回 PASS。
