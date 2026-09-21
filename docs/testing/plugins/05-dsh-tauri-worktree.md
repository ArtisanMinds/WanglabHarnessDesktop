# dsh-tauri-worktree：工作树路由、面板与模式选择

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：L1 `packages/dsh-tauri-worktree/src/**/*.test.ts`（`unit` project，已接线）；L2 `test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts`（7 条已落地并全绿）；客户端与 L3 见各用例标注
> 前置：`pnpm build:plugins`；涉及真实 git 的用例另需临时仓库
> 运行：L2 `pnpm test:e2e:plugin`；L3 见 `00-overview.md` §5.2

本插件是**路由面最宽、副作用最重**的一个：它既注册 5 条宿主路由，又注册 2 个 Agent 工具与 2 条提示词，还维护跨进程清理队列。本文件只覆盖**无需真实 git 仓库**即可判定的路径，真实工作树创建的完整链路留给后续批次。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-worktree'`；分区 order 210 | `packages/dsh-tauri-worktree/src/shared/constants.ts:1`、`packages/dsh-tauri-worktree/src/shared/constants.ts:3` |
| 5 条路径 / 6 条路由声明 | `packages/dsh-tauri-worktree/src/host/routes/index.ts:9` |
| `POST` 创建：400（缺 sessionId / cwd 解析失败 / create 失败） | `packages/dsh-tauri-worktree/src/host/routes/post.ts:12`、`packages/dsh-tauri-worktree/src/host/routes/post.ts:17`、`packages/dsh-tauri-worktree/src/host/routes/post.ts:25` |
| `DELETE` 恒 200，不校验 sessionId | `packages/dsh-tauri-worktree/src/host/routes/delete.ts:8` |
| `GET /bindings` 只列出目录仍存在的绑定 | `packages/dsh-tauri-worktree/src/host/routes/bindings/get.ts:10` |
| `GET /status` 的 `mode === 'missing'` → 404 | `packages/dsh-tauri-worktree/src/host/routes/status/get.ts:11` |
| `GET /status` 的未知 `jobId` 与未知 `sessionId` 同判为本地未绑定会话 | `packages/dsh-tauri-worktree/src/host/routes/status/get.ts:9`、`packages/dsh-tauri-worktree/src/host/service/status.ts:10` |
| `POST /bindings`：400 缺参、404 attach 失败 | `packages/dsh-tauri-worktree/src/host/routes/bindings/post.ts:9`、`packages/dsh-tauri-worktree/src/host/routes/bindings/post.ts:14` |
| `POST /checkouts`：400 失败 | `packages/dsh-tauri-worktree/src/host/routes/checkouts/post.ts:14` |
| Agent 工具 `create_worktree` / `checkout_worktree` | `packages/dsh-tauri-worktree/src/host/tools/create-worktree.ts:24`、`packages/dsh-tauri-worktree/src/host/tools/checkout-worktree.ts:6` |
| 5 分钟兜底 recover | `packages/dsh-tauri-worktree/src/host/apply.ts:14`、`packages/dsh-tauri-worktree/src/host/apply.ts:35` |
| 客户端槽位：`conversation.input.dock`（mode/surface）、`shell.overlay`（dialog） | `packages/dsh-tauri-worktree/src/client/constants/index.ts:5`、`packages/dsh-tauri-worktree/src/client/constants/index.ts:6` |
| DOM 标记：surface / dialog / icon / mode-anchor | `packages/dsh-tauri-worktree/src/client/components/surface.tsx:35`、`packages/dsh-tauri-worktree/src/client/components/dialog.tsx:41`、`packages/dsh-tauri-worktree/src/client/constants/index.ts:40`、`packages/dsh-tauri-worktree/src/client/constants/index.ts:47` |

---

## 2. L2：宿主路由

### [P1] 验证干净环境下绑定清单为空且结构完整

[Case ID] TC-WT-L2-05-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/host/routes/bindings/get.ts:8`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:55`）
[前置条件] scratch `DSH_HOME` 全新；插件已挂载
[测试数据] `GET /api/desktop/dsh-tauri-worktree/bindings`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 200。2. 响应体同时含 `bindings` 与 `jobs` 两个数组字段，且均为空。
[清理] 无

### [P3] [反向] 验证无绑定的会话状态回落到 local

[Case ID] TC-WT-L2-05-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/host/routes/status/get.ts:6`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:68`）
[前置条件] 同 TC-WT-L2-05-001，且不存在任何绑定
[测试数据] `GET /status?sessionId=not-bound`
[测试步骤] 1. 发起请求。2. 读状态码与响应体 `mode`。
[预期结果] 1. 状态码 200。2. `mode` 为 `local`（未进入 `missing` 的 404 分支）。
[清理] 无

### [P3] [反向] 验证绑定创建缺 sessionId 返回 400

[Case ID] TC-WT-L2-05-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/host/routes/bindings/post.ts:9`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:77`）
[前置条件] 同 TC-WT-L2-05-001
[测试数据] `POST /bindings`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `缺少 sessionId`。3. `GET /bindings` 仍为空。
[清理] 无

### [P3] [反向] 验证创建请求缺 sessionId 返回 400

[Case ID] TC-WT-L2-05-004
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/host/routes/post.ts:12`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:90`）
[前置条件] 同 TC-WT-L2-05-001
[测试数据] `POST /api/desktop/dsh-tauri-worktree`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体含 `error` 字段且不包含 `worktreePath`。3. 回读 `GET /bindings` 仍为空——缺 `sessionId` 在解析工作目录之前就返回，不存在可定位的「预期目录」，故以清单回读作为「无副作用」的外部证据。
[清理] 无

### [P4] 验证删除请求缺参不报 4xx 而是幂等失败体

[Case ID] TC-WT-L2-05-005
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-worktree/src/host/routes/delete.ts:12`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:107`）
[前置条件] 同 TC-WT-L2-05-001
[测试数据] `DELETE /api/desktop/dsh-tauri-worktree`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 200（**不是** 400——该路由不校验 `sessionId`）。2. 响应体恰为 `{ ok: false, error: '未找到绑定的工作树' }`。3. 重复同一请求仍为 200 且响应体逐字相同（幂等）。4. `GET /bindings` 仍为空。

### [P3] [反向] 验证切换分支缺绑定返回 400

[Case ID] TC-WT-L2-05-006
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/host/routes/checkouts/post.ts:14`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:130`）
[前置条件] 同 TC-WT-L2-05-001
[测试数据] `POST /checkouts`，body `{ "sessionId": "not-bound", "branch": "main" }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体恰为 `{ error: '未找到绑定的工作树' }`（**无** `ok` 字段，与 `DELETE` 的成功/失败体形状不同）。3. 无 git 命令副作用，`GET /bindings` 仍为空。
[清理] 无

### [P3] [反向] 验证未知 jobId 的状态查询回落到 local

[Case ID] TC-WT-L2-05-007
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/host/routes/status/get.ts:9`
[自动化] 是（`test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts:144`）
[前置条件] 同 TC-WT-L2-05-001，且不存在任何绑定与清理任务
[测试数据] `GET /status?jobId=`（空串）与 `GET /status?jobId=missing`（未知 id）
[测试步骤] 1. 逐一发起请求。2. 读状态码与响应体。3. 回读 `GET /bindings`。
[预期结果] 1. 两种查询均返回 200（**不落 `mode === 'missing'` 的 404 分支**）。2. 响应体均为 `{ mode: 'local', projectPath: '', isGit: null }`（`cleaner.lookup` 未命中 → `status.resolve` 继续走本地分支；无绑定故 `projectPath` 为空串、`isGit` 为 `null`）。3. `GET /bindings` 仍为 `{ bindings: [], jobs: [] }`，查询不产生副作用。
[清理] 无

---

## 3. 客户端

### 3.1 L1：纯函数（`unit` project，已接线）

> 回归背景（`#648`）：非 git 工作区里 `isGit` 的「未知」被当成 `true`，切换框无端出现在输入区；一旦会话进入 `pending` 且工作树创建失败（非 git 仓库必然失败），捕获阶段的发送拦截器会吞掉所有发送事件，会话彻底不可用。

#### [P1] [回归] 未校准或非 git 的会话不渲染工作树模式选择框

[Case ID] TC-WT-U-05-001
[层级] L1（`unit` project 纯函数）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.utils.ts:8`、`packages/dsh-tauri-worktree/src/client/store/modules/worktree.utils.ts:5`、`packages/dsh-tauri-worktree/src/client/store/modules/worktree.types.ts:5`
[自动化] 是（`packages/dsh-tauri-worktree/src/client/components/mode-select.utils.test.ts`）
[前置条件] 无（纯函数）
[测试数据] `isGit` 取 `null`（未知）/ `false`；`mode` 取 `local` / `pending`
[测试步骤] 1. 读 `EMPTY_SESSION_STATE.isGit`。2. 对未知与非 git 状态调用 `showsModeSelect`。
[预期结果] 1. 默认值为 `null`，不再预置 `true`。2. 两种状态一律返回 `false`，处于 `pending` 时同样返回 `false`。
[清理] 无

#### [P1] [回归] 仅确认为 git 且未处于工作树模式的会话渲染控件

[Case ID] TC-WT-U-05-002
[层级] L1（`unit` project 纯函数）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.utils.ts:8`
[自动化] 是（`packages/dsh-tauri-worktree/src/client/components/mode-select.utils.test.ts`）
[前置条件] 无（纯函数）
[测试数据] `isGit: true`；`mode` 取 `local` / `pending` / `worktree`
[测试步骤] 1. 对三种 `mode` 调用 `showsModeSelect`。
[预期结果] 1. `local` / `pending` 返回 `true`。2. `worktree` 返回 `false`。
[清理] 无

#### [P1] [回归] 控件隐藏时绝不拦截发送事件

[Case ID] TC-WT-U-05-003
[层级] L1（`unit` project 纯函数）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.utils.ts:13`、`packages/dsh-tauri-worktree/src/client/components/mode-select.tsx:89`
[自动化] 是（`packages/dsh-tauri-worktree/src/client/components/mode-select.utils.test.ts`）
[前置条件] 无（纯函数）
[测试数据] `mode: 'pending'`；`isGit` 取 `null` / `false`
[测试步骤] 1. 对每个 `isGit` 同时调用 `showsModeSelect` 与 `interceptsSubmit`。
[预期结果] 1. 两者同为 `false`：渲染条件与拦截条件绑定，控件消失后不残留吞事件的拦截器。
[清理] 无

#### [P1] [回归] 仅已校准的 git 会话处于待建工作树时拦截发送

[Case ID] TC-WT-U-05-004
[层级] L1（`unit` project 纯函数）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.utils.ts:13`
[自动化] 是（`packages/dsh-tauri-worktree/src/client/components/mode-select.utils.test.ts`）
[前置条件] 无（纯函数）
[测试数据] `isGit: true`；`mode` 取 `pending` / `local` / `worktree`
[测试步骤] 1. 对三种 `mode` 调用 `interceptsSubmit`。
[预期结果] 1. 仅 `pending` 返回 `true`；`local` / `worktree` 不拦截。
[清理] 无

### 3.2 L2：真实浏览器页面（未接线）

#### [P2] 验证输入区出现工作树模式锚点

[Case ID] TC-WT-C-05-001
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.tsx:72`
[自动化] 未接线（`00-overview.md` G2）
[前置条件] iframe 内 dsh 界面已加载且存在活动会话
[测试数据] 无
[测试步骤] 1. 等待输入区渲染。2. 查询 `[data-dsh-tauri-worktree-mode-anchor]`。3. 收集 `pageerror`。
[预期结果] 1. 锚点存在且其值等于当前 sessionId。2. 锚点父级位于 `conversation.input.dock` 内。3. `pageerror` 为空。
[清理] 关闭页面

#### [P2] 验证会话行出现工作树图标且不重复插入

[Case ID] TC-WT-C-05-002
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/register/session-icons.ts:44`
[自动化] 未接线（G2）
[前置条件] 侧栏存在至少一条会话行
[测试数据] 无
[测试步骤] 1. 等待会话行渲染。2. 查询 `[data-dsh-worktree-icon]`。3. 触发一次 React 重渲染后再查询。
[预期结果] 1. 图标存在。2. 单个会话行内图标数量恒为 1（重渲染后不叠加）。
[清理] 关闭页面

#### [P2] 验证工作树对话框在触发后挂载到壳层 overlay

[Case ID] TC-WT-C-05-003
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/components/dialog.tsx:41`
[自动化] 未接线（G2）
[前置条件] 存在可操作的工作树入口
[测试数据] 无
[测试步骤] 1. 触发对话框。2. 查询 `[data-dsh-worktree-dialog="1"]`。3. 关闭对话框后再查询。
[预期结果] 1. 打开后标记存在且唯一。2. 关闭后标记消失。
[清理] 关闭页面

#### [P1] [回归] 工作树创建失败后会话回落到本地模式且仍能看到错误

[Case ID] TC-WT-C-05-004
[层级] L2（真实浏览器页面，未接线）
[类型] 异常
[追踪] `packages/dsh-tauri-worktree/src/client/components/mode-select.tsx:173`、`packages/dsh-tauri-worktree/src/client/components/surface.tsx:17`、`packages/dsh-tauri-worktree/src/client/components/surface.tsx:59`
[自动化] 未接线（`00-overview.md` G2）
[前置条件] 已校准为 git 的会话（`isGit === true`，切换框可见）；宿主 `POST /worktrees` 构造成失败（例如同名工作树已存在）
[测试数据] 在模式菜单中选择「工作树」，随后输入文本并触发发送
[测试步骤] 1. 选择「工作树」，确认 `mode` 变为 `pending`。2. 等待创建失败。3. 读该会话的 `mode` 与错误条。4. 再次输入并发送。5. 点击错误条上的「关闭」。
[预期结果] 1. `mode` 回落到 `local`，不停留在 `pending`。2. 错误条仍然渲染（`phase === 'error'` 时不再被 `mode === 'local'` 屏蔽），并带可点的「关闭」按钮（`packages/dsh-tauri-worktree/src/client/locales/index.ts:14`）。3. 第 4 步的消息能正常发出，未被拦截器吞掉。4. 第 5 步后错误条消失（`phase` 回到 `idle`）——控件不可见时也不会留下关不掉的错误条。
[清理] 关闭页面

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P1] 验证桌面端输入区渲染工作树面板

[Case ID] TC-WT-L3-05-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-worktree/src/client/components/surface.tsx:35`
[自动化] 待接线（L3 通道尚未接入；本条已按 L3 准入原则归入 L2 浏览器断言，`desktop` project 已配置）
[前置条件] 应用就绪；存在活动会话
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话并切到 iframe。2. 查询 `[data-dsh-worktree-surface]`。3. 读其值。
[预期结果] 1. 元素存在且 `data-dsh-worktree-surface` 等于当前 sessionId。2. 元素可见（非 `display:none`）。3. 应用日志无插件错误上报。
[清理] `DELETE /session/<id>`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `bindings/get.ts:8` 清单结构 | TC-WT-L2-05-001 | 正向 | — |
| `status/get.ts` mode 分支 | TC-WT-L2-05-002、TC-WT-L2-05-007 | 异常 | 未知 `jobId`（`?jobId=` / `?jobId=missing`）实测 200 + `{ mode: 'local', projectPath: '', isGit: null }`，不落 404；`mode === 'missing'` 的 404 分支需要真实删除任务，**未覆盖** |
| `bindings/post.ts:9` 缺参 | TC-WT-L2-05-003 | 异常 | — |
| `post.ts:12` 缺参 | TC-WT-L2-05-004 | 异常 | 实测确认 400 + `{ error: '缺少 sessionId' }` 且无 `worktreePath`；`cwd 解析失败` 与 `create 失败` 分支需要真实会话/仓库，**未覆盖** |
| `delete.ts:12` 幂等体 | TC-WT-L2-05-005 | 边界 | 实测确认：缺参为 200 + `{ ok: false, error: '未找到绑定的工作树' }`，重复请求同体；与其它插件「缺参即 400」的风格不一致，**疑似缺陷**（G-WT-4） |
| `checkouts/post.ts:14` | TC-WT-L2-05-006 | 异常 | 实测失败体为 `{ error: '未找到绑定的工作树' }`（无 `ok` 字段）；分支分叉/脏工作区等深层分支需要真实仓库，**未覆盖** |
| 客户端三处挂载 | TC-WT-C-05-001 ～ TC-WT-C-05-003 | 正向 | 依赖浏览器驱动 |
| `surface.tsx:35` 桌面端可见性 | TC-WT-L3-05-001 | 正向 | 依赖 `desktop` project |
| Agent 工具 `create_worktree` / `checkout_worktree` | — | — | **未覆盖**：需真实 Agent 会话，留待后续批次 |

---

## 6. 缺口与假设

- **G-WT-1**：`linkDependencies` 默认 `true`（`packages/dsh-tauri-worktree/src/host/service/worktree.ts:47`），真实创建会改仓库依赖目录。本文件刻意不触发创建，避免污染工作区。
- **G-WT-2**：**已实测确认**（原「待确认」已消解）——`GET /status?jobId=<未知>` 会落到本地分支返回 200，与「未知任务应 404」的直觉冲突。两种查询各测一次：`GET /status?jobId=`（空串）与 `GET /status?jobId=missing`，均为 `200` + `{"mode":"local","projectPath":"","isGit":null}`；无 `jobId` 的 `GET /status` 与 `GET /status?sessionId=not-bound` 返回同一载荷。根因在 `packages/dsh-tauri-worktree/src/host/service/status.ts:10`：`cleaner.lookup(sessionId, jobId)` 未命中即返回 `undefined`，`:11` 的 `if (jobId && job && job.sessionId !== sessionId)` 因 `job` 为空而短路，故不会进入 `missing`（`:11` 的 404 只在「job 存在但属于别的 session」时触发，见 `status/get.ts:11`）。已按实测固化 TC-WT-L2-05-007，**未改实现**；「未知 jobId 是否应 404」属产品语义问题，与 G-WT-4 一并留待确认。
- **G-WT-3**：客户端依赖宿主 `aria-label` 文案（访问模式按钮，`packages/dsh-tauri-worktree/src/client/constants/index.ts:46`），语种变化会失配；L3 用例需固定中文 locale。
- **G-WT-4**：`DELETE /api/desktop/dsh-tauri-worktree` 缺参时返回 200 而非 4xx（`packages/dsh-tauri-worktree/src/host/routes/delete.ts:8`），与其它插件（如 `dsh-tauri-session` 的 `DELETE` 缺参即 400）的入参校验风格不一致。**已实测确认**：body `{}` → 200 + `{ ok: false, error: '未找到绑定的工作树' }`，重复请求返回逐字相同的体（幂等）。本次按实测固化 TC-WT-L2-05-005 的期望，**未改实现**；是否应改为 400 仍**疑似缺陷**，留待产品确认。
- **G-WT-5**：TC-WT-L2-05-004 的「未在文件系统创建任何目录」无法直接断言——缺 `sessionId` 在 `sessionContext.resolve` 之前就返回，不存在可定位的「预期目录」。改以回读 `GET /bindings` 为空作为「无副作用」的外部证据；真实目录创建链路由后续「真实 git 仓库」批次覆盖。
- **假设**：`conversation.input.dock` / `shell.overlay` 槽位由宿主提供且已在本仓其它插件中稳定使用。
- **实测基线**：`node node_modules/vitest/vitest.mjs --project plugin --run test/e2e/plugins/03-dsh-tauri-rightclick.e2e.ts test/e2e/plugins/04-dsh-tauri-session.e2e.ts test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts` → **Test Files 3 passed（3）/ Tests 21 passed（21）**，其中本文件 **7 passed / 0 failed**（复用 `globalSetup` 共享宿主，全部产品可见插件已挂载，核心 `0.1.5-rc.2`）。
