# dsh-tauri-turnrewind：回合变更记录的两个端点

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：`test/e2e/plugins/09-dsh-tauri-turnrewind.e2e.ts`（§2 的 3 条 L2 用例已落地并全绿）；客户端与 L3 见各用例标注
> 前置：`pnpm build:plugins`
> 运行：L2 `pnpm test:e2e:plugin`；L3 见 `00-overview.md` §5.2

本插件只读：两个 GET 端点把账本里的逐回合变更记录回传给客户端卡片，宿主不写用户工作区（撤销能力已移除，文件恢复由 `dsh-rewind` 负责）。判定依赖**会话与工作区上下文**，而 scratch 宿主当前不造会话。因此本文件的 L2 用例刻意只覆盖**在无会话条件下即可判定**的分支：入参校验、会话缺失、方法矩阵。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-turnrewind'` | `packages/dsh-tauri-turnrewind/src/shared/constants.ts:10` |
| 2 条路由：`GET /summary`、`GET /live` | `packages/dsh-tauri-turnrewind/src/host/routes/index.ts:17` |
| 缺 `sessionId` → 400 `缺少 sessionId`（两处） | `packages/dsh-tauri-turnrewind/src/host/routes/live/get.ts:17`、`packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:24` |
| 会话不存在 → 404 `会话不存在或尚未就绪` | `packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:28` |
| summary 上限：200 个文件 / 20 条跳过路径 | `packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:15`、`packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:17` |
| 资格原因码 `GIT_REQUIRED` / `GIT_UNAVAILABLE` / `UNSAFE_WORKSPACE` | `packages/dsh-tauri-turnrewind/src/shared/constants.ts:16`、`packages/dsh-tauri-turnrewind/src/shared/constants.ts:22`、`packages/dsh-tauri-turnrewind/src/host/config/constants.ts:57` |
| 客户端槽位：`conversation.input.dock`（running chip）、`conversation.chat.turnTail`（回合卡片） | `packages/dsh-tauri-turnrewind/src/client/constants/index.ts:15`、`packages/dsh-tauri-turnrewind/src/client/register/turn-tail.ts:25` |
| DOM 标记：`data-turnrewind-card` / `data-turnrewind-running` / `data-status` / `data-skipped` | `packages/dsh-tauri-turnrewind/src/client/components/turn-changes-card.tsx:133`、`packages/dsh-tauri-turnrewind/src/client/components/running-changes-chip.tsx:38`、`packages/dsh-tauri-turnrewind/src/client/components/turn-changes-card.tsx:109`、`packages/dsh-tauri-turnrewind/src/client/components/turn-changes-card.tsx:205` |
| live 轮询 1200ms | `packages/dsh-tauri-turnrewind/src/client/constants/index.ts:21` |

---

## 2. L2：宿主路由

### [P3] [反向] 验证两个端点缺 sessionId 均返回 400

[Case ID] TC-REW-L2-09-001
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-turnrewind/src/host/routes/live/get.ts:17`、`packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:24`
[自动化] 是（`test/e2e/plugins/09-dsh-tauri-turnrewind.e2e.ts:55`）
[前置条件] 插件已构建并挂载
[测试数据] `GET /summary`、`GET /live`（均不带查询串）
[测试步骤] 1. 逐一发起请求。2. 每次读状态码与 `error` 文案。
[预期结果] 1. 两次均返回 400。2. 两次 `error` 均恰为 `缺少 sessionId`。3. 未发生任何文件系统改动。
[清理] 无

### [P3] [反向] 验证未知会话的摘要返回 404

[Case ID] TC-REW-L2-09-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:28`
[自动化] 是（`test/e2e/plugins/09-dsh-tauri-turnrewind.e2e.ts:71`）
[前置条件] 同 TC-REW-L2-09-001
[测试数据] `GET /summary?sessionId=does-not-exist`
[测试步骤] 1. 发起请求。2. 读状态码与 `error` 文案。
[预期结果] 1. 返回 404。2. `error` 恰为 `会话不存在或尚未就绪`。
[清理] 无

### [P4] 验证两条路径的方法集合（只有 GET）

[Case ID] TC-REW-L2-09-003
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-turnrewind/src/host/routes/index.ts:17`
[自动化] 是（`test/e2e/plugins/09-dsh-tauri-turnrewind.e2e.ts:83`）
[前置条件] 同 TC-REW-L2-09-001
[测试数据] 对 `/summary`、`/live` 各发一次 `OPTIONS`，再各发一次 `POST`
[测试步骤] 1. 逐一 `OPTIONS`，读 `allow` 头。2. 逐一 `POST`，读状态码与 `allow` 头。
[预期结果] 1. 两条 `OPTIONS` 均 204，`allow` 含 `GET`、`HEAD`、`OPTIONS`。2. 两条 `POST` 均 405，`allow` 不含 `POST`。
[清理] 无

---

## 3. L2：客户端（真实浏览器页面，未接线）

### [P2] 验证回合结束后出现只读变更卡片

[Case ID] TC-REW-C-09-001
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-turnrewind/src/client/components/turn-changes-card.tsx:133`
[自动化] 未接线（`00-overview.md` G2）
[前置条件] iframe 内 dsh 界面已加载；工作区为 git 仓库顶层；至少完成一个回合
[测试数据] 无
[测试步骤] 1. 等待回合结束。2. 查询 `[data-turnrewind-card]`。3. 读其值与 `data-status` 明细。
[预期结果] 1. 卡片存在且 `data-turnrewind-card` 等于该回合序号。2. 卡片内文件行均为 `data-status="…"` 之一。3. 卡片内**没有**任何撤销按钮或写操作入口。4. 无 `pageerror`。
[清理] 关闭页面

### [P2] 验证回合运行中显示 running chip

[Case ID] TC-REW-C-09-002
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-turnrewind/src/client/components/running-changes-chip.tsx:38`
[自动化] 未接线（G2）
[前置条件] 同 TC-REW-C-09-001，但回合仍在进行
[测试数据] 无
[测试步骤] 1. 在回合进行中查询 `[data-turnrewind-running]`。2. 回合结束后再次查询。
[预期结果] 1. 进行中存在该标记且值等于当前回合。2. 回合结束后标记消失。
[清理] 关闭页面

### [P3] [反向] 验证非 git 工作区时卡片保持沉默

[Case ID] TC-REW-C-09-003
[层级] L2（真实浏览器页面，未接线）
[类型] 异常
[追踪] `packages/dsh-tauri-turnrewind/src/client/utils/format.ts:99`
[自动化] 未接线（G2）
[前置条件] 会话工作区不是 git 仓库顶层
[测试数据] 无
[测试步骤] 1. 完成一个回合。2. 查询 `[data-turnrewind-card]`。
[预期结果] 1. `[data-turnrewind-card]` 不存在（`GIT_REQUIRED` 与无原因都整张卡片不渲染）。2. `pageerror` 为空。
[清理] 关闭页面

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P2] 验证桌面端回合卡片可见且只读

[Case ID] TC-REW-L3-09-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-turnrewind/src/client/register/turn-tail.ts:25`
[自动化] 待接线（L3 通道尚未接入；`desktop` project 已配置，但本插件用例仍需真实 Tauri 窗口与回合数据）
[前置条件] 应用就绪；工作区为 git 仓库顶层；已产生一个带文件改动的回合
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话并切到 iframe。2. 查询 `[data-turnrewind-card]`。3. 读卡片内的文件计数与 `GET /summary` 返回比对。
[预期结果] 1. 卡片存在且文件计数与 `GET /summary` 返回一致。2. 卡片内不存在撤销按钮。3. 回合结束后工作区文件与卡片展示前逐字节一致（本插件全程只读）。
[清理] `DELETE /session/<id>`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| 两处缺参校验 | TC-REW-L2-09-001 | 异常 | — |
| 会话缺失判定 | TC-REW-L2-09-002 | 异常 | — |
| 方法矩阵 | TC-REW-L2-09-003 | 边界 | `allow` 实测在 `OPTIONS`/`POST` 两种响应上均恰为 `GET / HEAD / OPTIONS` 三元集合 |
| 卡片与运行态 | TC-REW-C-09-001、TC-REW-C-09-002、TC-REW-L3-09-001 | 正向 | 需要真实 git 仓库与回合数据 |
| 非 git 降级 | TC-REW-C-09-003 | 异常 | 需要非 git 工作区 |
| `GET /live` 读数 | — | — | **未覆盖**：无会话时语义未确认，见 G-REW-1 |

---

## 6. 缺口与假设

- **实测（L2 全绿）**：§2 的 3 条用例实测行为与预期**逐条一致**，无预期修正。补充实证：`allow` 在 `OPTIONS`（204）与 `POST`（405）两种响应上均**恰为** `GET / HEAD / OPTIONS` 三元集合，故按集合等值断言，而不是只断言「含」或「不含」；`TC-REW-L2-09-001` 另以插件数据目录 `$DSH_HOME/dsh-tauri-turnrewind` 的递归清单在两次拒绝前后一致，证明缺参校验确实在 `ledger` / `snapshot` 之前返回，**零落盘副作用**。
- **G-REW-1**：`GET /live` 只读内存缓存（`packages/dsh-tauri-turnrewind/src/host/service/capture.ts:207`），对未知 `sessionId` 是否返回 200 `active:false` 还是 404，源码未体现；确认前不写用例，避免编造预期。
- **G-REW-2**：`turn-tail` 复用官方 id `@deepseek-ai/dsh-client-ui-deliverables`（`packages/dsh-tauri-turnrewind/src/client/register/turn-tail.ts:28`）。若官方插件同时装载，需先确认两者不争抢同一行。
- **G-REW-3**：容量治理回收 refs 后，账本行以 `TURNREWIND_EXPIRED` 呈现（`packages/dsh-tauri-turnrewind/src/host/service/turns.utils.ts`）——需要真实账本构造，当前 scratch 宿主无法制造前置。
- **G-REW-4（已修复）**：`packages/dsh-tauri-turnrewind/src/host/routes/summary/get.ts:2`、`live/get.ts:2` 的头部注释曾把端点写成 `/api/desktop/dsh-tauri-turnrewind/session/summary`、`.../session/live`，实际注册路径是 `/summary`、`/live`（`packages/dsh-tauri-turnrewind/src/host/routes/index.ts:18-19`），客户端（`packages/dsh-tauri-turnrewind/src/client/apis/index.ts:15`、`:20`）亦按同一路径调用。行为无差异，两条过期注释已改正；用例以实测路径为准。
- **假设**：用例断言的 `data-turnrewind-*` 属性属于插件自有前缀，不受宿主类名变化影响。
