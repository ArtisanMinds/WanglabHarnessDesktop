# 渐进式测试推进规则

定义桌面端与插件测试逐条补齐的协作流程与进度台账。

> **规范参考**：测试方案详见 [桌面端测试规范](../specs/desktop.test.md) 与 [插件测试规范](../specs/plugin.test.md)。
> **编号口径**：批次号 = 用例文档序号（桌面端 `00`–`11`、插件 `00`–`16`），与两个 `00-overview.md` §3 的清单逐行对应；不另设 `D*` / `B*` / `PP*` 别名。

---

## 1. 核心原则

1. **单批单卡**：每批仅交付**一个可观察结果**（单个用例或其最小必需基础设施），严禁超前开发。
2. **文档同步**：批内先写用例文档，再写对应测试代码，同批交付，禁止跨批漂移。
3. **独立可运行**：每批必须提供明确的运行命令，无法独立运行的批次视为不合格。
4. **审核阻塞**：单批交付后暂停推进，经人工审查与运行验证通过后，方可描述下一批。
5. **显式授权**：下一批需明确说明变更范围、代价与风险，获得同意后方可动手。
6. **零容忍推进**：当前批次失败必须原地修复，禁止带病推进；无法修复则停止并说明原因。
7. **实时记账**：状态变更需实时更新至台账，严禁滞后补记。

---

## 2. 协作流程

```
[① 提案描述] ───► [② 确认授权] ───► [③ 代码实现]
  (变更/代价/命令)     (回复 "ok")         (更新台账为「待验证」)
                                                  │
[⑤ 批次收尾] ◄─── [④ 审查与验证] ◄─────────────────┘
 ├─ 通过 ──► 标记「已验证」 ──► 进入下一个 ①
 └─ 失败 ──► 原地修复 ──► 重试 ④
```

> **注意**：提案描述必须如实评估风险与代价（如构建开销、新增依赖、影响文件及预期耗时）。

---

## 3. 状态定义

| 状态 | 含义 |
| --- | --- |
| `提案中` | 方案已提交，等待授权 |
| `已同意` | 方案已获批，开始实施 |
| `已实现` | 产物已落地，**等待审查与运行验证** |
| `已验证` | 运行验证通过，本批次关闭 |
| `已阻塞` | 存在明确阻塞条件（附详细原因），暂停推进 |

---

## 4. 进度台账

> 状态变化即时更新本节。

### 4.1 桌面端 (`docs/testing/desktop/`)

| 编号 | 业务/功能模块分组 | 状态 | 详细状态说明与核心逻辑收敛 |
| --- | --- | --- | --- |
| 00 | 总览与前置 | 已验证 | 覆盖范围、环境事实、前置校验、数据目录隔离与运行命令；随范围收敛重写。 |
| 01 | 启动冒烟：进入下载装配 → dsh 内核启动 → 页面无报错 | 已实现 | 桌面端唯一保留的 L3 用例（`TC-DSK-L3-01-001`）：独占空缓存启动 → 过预装引导 → 断言运行时与 dsh 本体落盘、`service_url` 可用且 iframe 挂载、帧内 `#root` 渲染出内容、壳层与帧内报错收集器为空。 |

### 4.2 插件 (`docs/testing/plugins/`)

| 批次 | 用例 / 基础设施 | 对应文档 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 00 | 总览、前置与追踪矩阵 | `00-overview.md` | 已验证 | 不承载用例本体；已按当前实现刷新事实表、缺口（G1/G4 消解、新增 G10 跨源遮蔽）与文件命名规则（测试文件与用例文档同名同序号） |
| 01 | 编排骨架与共享路由契约 | `01-dsh-host-and-core-contract.md` | 已验证 | `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts` 12 例全绿（编排骨架 6 + 共享路由契约 6）；编排新增导出 `assertMountRegistered` / `scaffoldDshProfile`；**共享宿主默认挂载全部产品可见插件**，`02`–`09` 的 L2 段复用同一进程（一次全车道 3 次起宿主），控制台每次起宿主只留 3 行；跨源 403 期望值按实测修正（上游围栏 `forbidden`，路由层 `cross-origin-request` 在 L2 不可达，由 L1 覆盖）；「未挂载插件 → 404」探针改用仓库内不存在的插件 id（原用 `dsh-tauri-turnrewind`，该包已被 `09` 挂载） |
| 02 | `dsh-tauri-pet`（SSE → 客户端 → 桌面端窗口） | `02-dsh-tauri-pet.md` | 已验证 | `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts` L2 段 5 例全绿（首帧就绪 / 未声明方法 405 / 15s 周期心跳 / 断线重连 / 并发消费者）；实测第 2 帧心跳 15.01–15.02s、重连首个响应块即就绪；`test()` 别名与 `it()` 标题口径统一到文档；客户端段与 L3 段待接线 |
| 03 | `dsh-tauri-rightclick` | `03-dsh-tauri-rightclick.md` | 已验证 | `test/e2e/plugins/03-dsh-tauri-rightclick.e2e.ts` L2 段 4 例全绿（415 `unsupported-media-type` / `invalid-url` ×4 / `invalid-path` ×3 / `not-a-directory`）；正向 200 会真的拉起本机浏览器，改为手工执行（G-RC-4） |
| 04 | `dsh-tauri-session` | `04-dsh-tauri-session.md` | 已验证 | `test/e2e/plugins/04-dsh-tauri-session.e2e.ts` L2 段 7 例全绿（归档清单形状、缺参 400、DELETE 也按 JSON 读体、空集合清空现状、workspace 缺 ids、open/path 领域错误、5 条注册行的 `allow` 矩阵）；G-SESS-4 记录「空集合清空落到宿主未处理异常载荷 `{status:500,unhandled:true,message:'HTTPError'}`」为疑似缺陷（文档原写「500 且含 `缺少 sessionIds`」，领域文案实际不下发客户端） |
| 05 | `dsh-tauri-worktree` | `05-dsh-tauri-worktree.md` | 已验证 | `test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts` L2 段 6 例全绿（bindings 形状、未绑定回落 `local`、两处缺参 400、删除幂等失败体 200、checkouts 未绑定 400）；`-006` 实测失败体只有 `{error}` 无 `ok`，文档预期按实测收紧；G-WT-4 固化为疑似缺陷、G-WT-5 记录「未创建目录」以回读 `GET /bindings` 为空替代 |
| 06 | `dsh-tauri-ui` | `06-dsh-tauri-ui.md` | 已验证 | `test/e2e/plugins/06-dsh-tauri-ui.e2e.ts` L2 段 2 例全绿（缺 `sessionId` 400 `缺少 sessionId`、未知会话 404 `会话不存在或尚未运行`，实测与预期逐字一致）；运行中 / 已结束两条需真实会话，保持待补（G9 / G-UI-4） |
| 07 | `dsh-tauri-panel-extension` | `07-dsh-tauri-panel-extension.md` | 已验证 | `test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts` L2 段 9 例全绿（skills 形状、skill 404、mcp 清单、`mcp` 两处缺参 400、`open/dir` 未知 target、`roots` 非法 kind、`host/restart` 403 ×2）；G-EXT-4 记录 skills 发现**不受 scratch `DSH_HOME` 隔离**（读到运行机真实用户技能目录，属 E2E 隔离性缺口而非产品缺陷，故计数与内容不作断言）；G-EXT-5 记录无 `Origin` 时连接门放行、403 由插件自身给出 |
| 08 | `dsh-tauri-panel-scheduler` | `08-dsh-tauri-panel-scheduler.md` | 已验证 | `test/e2e/plugins/08-dsh-tauri-panel-scheduler.e2e.ts` L2 段 7 例全绿（空清单、创建 + `crons/tasks` 账本一致性 + 自清理、三类缺参 400、删除两类文案、`run` 未知任务、history 两类文案、`options` 形状）；`-003` 预期按实测收紧为逐字文案；真实执行（`run_now`）需模型与网络，不在本批 |
| 09 | `dsh-tauri-turnrewind` | `09-dsh-tauri-turnrewind.md` | 已验证 | `test/e2e/plugins/09-dsh-tauri-turnrewind.e2e.ts` L2 段 3 例全绿（两端点缺参 400 且零落盘、未知会话摘要 404、两条路径 `allow` 恰为 `GET/HEAD/OPTIONS`）；`/live` 对未知会话的语义按 G-REW-1 仍不写用例；G-REW-4 的两条过期源码注释（`summary/get.ts:2`、`live/get.ts:2` 写作 `.../session/summary`）已修正 |
| 10 | `dsh-tauri-model-config` | `10-dsh-tauri-model-config.md` | 提案中 | - |

合计 `01`–`10` 共 **108** 条用例；其中 `01`–`09` 的 **L2 段 55 条已接线并全绿**（`pnpm test:e2e:plugin` → 9 files / 55 tests），客户端段（`-C-*`，仓库未装 playwright，`00-overview.md` G2）与 L3 段（需真实 Tauri 窗口，L3 通道尚未接入）仍待接线，`10` 整批待办。L2 运行前需先跑一次 `pnpm build:plugins`。

---

## 5. 变更历史

变更历史已迁出为独立文件：[history.md](./history.md)（各批次的实现、加固、范围收敛与文档迁移记录）。

