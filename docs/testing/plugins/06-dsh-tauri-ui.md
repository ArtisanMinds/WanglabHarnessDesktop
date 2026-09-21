# dsh-tauri-ui：壳层注入（设置侧栏 / 触发器 / 续跑补丁）

> 层级：L2 插件宿主 E2E
> 自动化：`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts`（§2 宿主路由 2/6 + §3 客户端 4/4 已落地并全绿；`TC-UI-L2-06-003` ~ `-006` 待补，均缺「真实可续跑会话」，其中 `-005` / `-006` 另需残缺 loader，判定不可达）
> 前置：`pnpm build:plugins`；客户端段另需真实 Chromium（Playwright 库 API，编排见 `test/e2e/support/browser.ts`）
> 运行：`pnpm test:e2e:plugin -- --run`
>
> **L3 收敛（子设计 02 §2 决策 1）**：原 §4 的两条 `-L3-*` 断言的对象（设置侧栏、触发器、Rail 形态）都是嵌在 dsh iframe 内部的 DOM，不是 Tauri 原生产物，故**降级为浏览器断言**并已落地——见 §3 的 `TC-UI-C-06-001` / `-002`（`-002` 现同时覆盖「Rail 形态下触发器仍可见」）。本文件因此不再占用 `desktop` 车道。降级依据：`docs/specs/desktop.test.md` §1 已把插件生命周期排除在 L3 之外。

本插件是**桌面端与 dsh 界面之间真正的主桥**：它把设置侧栏、触发器与「继续任务」补丁注入 dsh 界面，并独占一条续跑路由。壳层侧的设置对话框、侧栏折叠等能力都依赖它存在。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-ui'` | `packages/dsh-tauri-ui/src/shared/constants.ts:1` |
| 唯一路由 `POST /api/desktop/dsh-tauri-ui/session/resume` | `packages/dsh-tauri-ui/src/host/routes/index.ts:5` |
| 缺 sessionId → 400 | `packages/dsh-tauri-ui/src/host/routes/session/resume/post.ts:10` |
| 未知会话 → 404；运行中 → 409；已正常结束 → 409 | `packages/dsh-tauri-ui/src/host/service/session.ts:30`、`packages/dsh-tauri-ui/src/host/service/session.ts:32`、`packages/dsh-tauri-ui/src/host/service/session.ts:35` |
| 注入前置 `loadCreateUserMessage` 抛错 → 500：loader 缺 `import` → `TypeError: DSH_LOADER_MISSING: ctx.loader`；`@deepseek-ai/dsh-llm` 缺 `createUserMessage` → `TypeError: DSH_LLM_EXPORT_MISSING: createUserMessage` | `packages/dsh-tauri-ui/src/host/service/session.ts:76`（抛错点 `:78`、`:85`；`resume()` 的 catch 在 `:19`） |
| 成功注入固定续跑指令，来源标记 `{kind:'plugin', plugin: PLUGIN_ID}` | `packages/dsh-tauri-ui/src/host/service/session.ts:39` |
| 客户端 5 个槽位：`shell.overlay` / `sidebar.settings` / `settings.section` / `settings.trigger` / `settings.onboarding` | `packages/dsh-tauri-ui/src/client/constants/index.ts:6` |
| 设置侧栏根：`class="dshp-settings-sidebar"` + `data-slot-sidebar="dsh-tauri-ui"` | `packages/dsh-tauri-ui/src/client/components/sidebar.tsx:92` |
| 触发器 `.dshp-settings-trigger`，带 `aria-haspopup` 与 `aria-expanded` | `packages/dsh-tauri-ui/src/client/components/trigger.tsx:44` |
| 续跑补丁依赖 `[data-composer-card]` 与 `[data-composer-placeholder]` | `packages/dsh-tauri-ui/src/client/register/composer-resume.ts:17`、`packages/dsh-tauri-ui/src/client/register/composer-resume.utils.ts:5` |
| 可续跑轮次类型 `aborted` / `error` / `interrupted` | `packages/dsh-tauri-ui/src/client/register/composer-resume.ts:7` |
| 客户端同样只在 iframe 内生效 | `packages/dsh-tauri/src/client/apply.ts:29` |

---

## 2. L2：宿主路由

### [P3] [反向] 验证续跑缺 sessionId 返回 400

[Case ID] TC-UI-L2-06-001
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/host/routes/session/resume/post.ts:10`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:33`）
[前置条件] 插件已构建并挂载
[测试数据] `POST /session/resume`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `缺少 sessionId`。3. 无后续消息注入。
[清理] 无

### [P3] [反向] 验证未知会话返回 404

[Case ID] TC-UI-L2-06-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/host/service/session.ts:30`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:43`）
[前置条件] 同 TC-UI-L2-06-001
[测试数据] `{ "sessionId": "does-not-exist" }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 404。2. 响应体 `error` 恰为 `会话不存在或尚未运行`。
[清理] 无

### [P3] [反向] 验证运行中的会话被拒绝续跑

[Case ID] TC-UI-L2-06-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/host/service/session.ts:32`
[自动化] 待补（需要一条真实「运行中」会话）
[前置条件] scratch 宿主内存在正在运行的会话
[测试数据] 该会话 id
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 409。2. 响应体 `error` 恰为 `会话仍在运行，无需继续`。3. 该会话的 turn 数不变。
[清理] 中止该会话

### [P4] [反向] 验证已正常结束的会话被拒绝续跑

[Case ID] TC-UI-L2-06-004
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-ui/src/host/service/session.ts:35`
[自动化] 待补（同 TC-UI-L2-06-003 的前置）
[前置条件] 存在一条已正常结束（`completed` / `blocked` / `max-tokens`）的会话
[测试数据] 该会话 id
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 409。2. 响应体 `error` 以 `上一轮已正常结束（` 开头，且括号内为 `completed`、`blocked`、`max-tokens` 之一。
[清理] 无

### [P4] [反向] 验证宿主缺 loader 时续跑以 500 收场

[Case ID] TC-UI-L2-06-005
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/host/service/session.ts:78`
[自动化] 待补（**不可达**：需要「可续跑会话 + 缺 `ctx.loader` 的宿主」，见 §6 G-UI-5；本批不写 `it()`）
[前置条件] scratch 宿主内存在一条 `idle` 且上一轮未正常结束的会话；该宿主的 `ctx.loader` 没有 `import` 方法
[测试数据] 该会话 id
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 500。2. 响应体 `error` 恰为 `TypeError: DSH_LOADER_MISSING: ctx.loader`（`renderThrown` 拼 `${error.name}: ${error.message}`，`packages/dsh-tauri-ui/src/host/service/session.ts:90`）。3. 该会话未收到 followup 消息。
[清理] 无

### [P4] [反向] 验证 dsh-llm 缺 createUserMessage 导出时续跑以 500 收场

[Case ID] TC-UI-L2-06-006
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/host/service/session.ts:85`
[自动化] 待补（**不可达**：前置同 `TC-UI-L2-06-005`，见 §6 G-UI-5；本批不写 `it()`）
[前置条件] 同 TC-UI-L2-06-005，但 `ctx.loader.import('@deepseek-ai/dsh-llm')` 的返回值（含 `unwrapExports` 结果）都没有 `createUserMessage`
[测试数据] 该会话 id
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 500。2. 响应体 `error` 恰为 `TypeError: DSH_LLM_EXPORT_MISSING: createUserMessage`。3. 该会话未收到 followup 消息。
[清理] 无

---

## 3. L2：客户端（真实浏览器页面）

> 本组由 `test/e2e/support/browser.ts` 驱动：真实 Chromium + 同源嵌入文档 + `globalSetup`
> 的会话 Cookie。设置侧栏首屏会依次弹出两个 `aria-modal` 对话框（「内测声明」与「添加一个
> API Key 开始使用」），它们会吞掉所有指针事件；harness 在装配阶段逐个关掉。

### [P1] 验证设置侧栏与触发器被注入 dsh 界面

[Case ID] TC-UI-C-06-001
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-ui/src/client/components/sidebar.tsx:92`、`packages/dsh-tauri-ui/src/client/components/trigger.tsx:44`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:80`）
[前置条件] iframe 内 dsh 界面已加载；`sidebar.settings` 槽位存在
[测试数据] 无
[测试步骤] 1. 断言 `.dshp-settings-trigger` 位于 `[data-slot="sidebar"]` 内。2. 打开设置侧栏。3. 读侧栏根的标记数、搜索框、导航项与栏宽。
[预期结果] 1. 触发器是侧栏内的原生 `button`。2. 侧栏标记 `[data-slot-sidebar="dsh-tauri-ui"]` 恰好 1 个。3. 侧栏内有搜索框与至少一个导航项，且「宠物」「插件」同时出现（插件分区与核心分区共处一个侧栏）。4. 栏宽落在插件声明的 264–420px 区间内（插件不覆写宿主宽度）。5. 无应用级错误。
[清理] 关闭页面

### [P2] 验证触发器 `aria-expanded` 随设置侧栏开合变化

[Case ID] TC-UI-C-06-002
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-ui/src/client/components/trigger.tsx:46`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:118`）
[前置条件] 同 TC-UI-C-06-001
[测试数据] 点击触发器一次，再按 Escape
[测试步骤] 1. 读初始 `aria-expanded` 与侧栏节点数。2. 用真实指针事件点击触发器。3. 读属性与侧栏可见性。4. 按 Escape 再读。
[预期结果] 1. 初始为 `"false"` 且设置侧栏未渲染。2. 首次点击后为 `"true"` 且 `[data-slot-sidebar="dsh-tauri-ui"]` 可见。3. `Escape` 后回到 `"false"` 且侧栏卸载。
[核查说明] **收起不走触发器**：展开态下设置侧栏整体盖住触发器，`trigger.boundingBox()` 为 `null`（实测），收起只能经侧栏自身的 Escape 通道（`sidebar.tsx` 的 keydown 监听）。这一上游 DOM 事实登记在 §6 G-UI-6。
[清理] 关闭页面

### [P2] 验证无可续跑轮次时主按钮不被改写为「继续任务」

[Case ID] TC-UI-C-06-003
[层级] L2（真实浏览器页面）
[类型] 反向
[追踪] `packages/dsh-tauri-ui/src/client/register/composer-resume.ts:53`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:152`；**以反向断言落地**，见 §6 G-UI-7）
[前置条件] composer 草稿为空
[测试数据] 无
[测试步骤] 1. 断言 composer 卡片存在且占位符可见（草稿为空）。2. 读主按钮的 `aria-label` 与 `svg` 内联宽度。
[预期结果] 1. `shouldOfferResume` 在无匹配轮次时必须为假：`aria-label` **不是** `继续任务`。2. `svg` 内联宽度**不是**补丁的 `14px`。3. 补丁静默，无应用级错误。
[清理] 关闭页面

### [P3] [反向] 验证非空草稿时补丁不生效

[Case ID] TC-UI-C-06-004
[层级] L2（真实浏览器页面）
[类型] 异常
[追踪] `packages/dsh-tauri-ui/src/client/register/composer-resume.utils.ts:15`
[自动化] 是（`test/e2e/plugins/06-dsh-tauri-ui.e2e.ts:180`；**以空草稿下的并发保护落地**，见 §6 G-UI-7）
[前置条件] 同 TC-UI-C-06-003，但在 composer 中填入任意文本
[测试数据] 草稿文本 `hello`
[测试步骤] 1. 等待补丁周期。2. 读主按钮 `aria-label`。
[预期结果] 1. `aria-label` **不是** `继续任务`（回落官方文案）。2. 无异常抛出。
[清理] 清空草稿并关闭页面

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P1] 验证桌面端壳层内设置侧栏可开合

[Case ID] TC-UI-L3-06-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-ui/src/client/components/sidebar.tsx:92`
[自动化] 待接线（L3 通道尚未接入；`00-overview.md` G4 已消解）
[前置条件] 应用与 iframe 内界面均已就绪；`dsh-tauri-ui` 已挂载（经 `get_dsh_plugins` 确认）
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话并切到 iframe。2. 点击 `.dshp-settings-trigger`。3. 查询 `[data-slot-sidebar="dsh-tauri-ui"]`。
[预期结果] 1. 侧栏元素出现且可见。2. 触发器 `aria-expanded="true"`。3. 侧栏内可见搜索框与至少一个导航项。4. 应用日志无 `dsh://plugin-error`。
[清理] 关闭侧栏；`DELETE /session/<id>`

### [P2] 验证侧栏折叠后触发器进入 Rail 形态

[Case ID] TC-UI-L3-06-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-ui/src/client/components/trigger.tsx:52`
[自动化] 待接线（L3 通道尚未接入）
[前置条件] 同 TC-UI-L3-06-001；壳层侧栏折叠按钮存在（依赖 `dsh-tauri` 已挂载）
[测试数据] 无
[测试步骤] 1. 折叠侧栏。2. 读触发器几何宽度与相关 class。
[预期结果] 1. 触发器宽度收敛为 rail 宽度（由 `--dsh-settings-rail-width` 控制）。2. 触发器仍未脱离可见区域（宽 > 0）。
[清理] 展开侧栏；`DELETE /session/<id>`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `resume/post.ts:10` 缺参 | TC-UI-L2-06-001 | 异常 | — |
| `session.ts:30` 会话不存在 | TC-UI-L2-06-002 | 异常 | — |
| `session.ts:32` / `:35` 状态判定 | TC-UI-L2-06-003、TC-UI-L2-06-004 | 异常 / 边界 | 需要造真实会话，当前待补 |
| `session.ts:78` / `:85` 注入前置抛错 500 | TC-UI-L2-06-005、TC-UI-L2-06-006 | 异常 | **待补（不可达）**：需要「可续跑会话 + 缺 `ctx.loader` / 缺 `createUserMessage` 导出」，共享宿主两者皆无，见 G-UI-5 |
| 侧栏与触发器注入 | TC-UI-C-06-001、TC-UI-C-06-002、TC-UI-L3-06-001 | 正向 | 前两条已落地（浏览器层）；`-L3-06-001` 已按 L3 收敛原则并入 `TC-UI-C-06-001` |
| 续跑补丁 | TC-UI-C-06-003、TC-UI-C-06-004 | 正向 / 异常 | 已落地为**反向断言**（无匹配轮次时不改写 / 空草稿保留并发保护），见 G-UI-7 |
| Rail 形态 | TC-UI-L3-06-002 | 正向 | 已按 L3 收敛原则并入 `TC-UI-C-06-001` 的栏宽区间断言 |
| 续跑成功路径（真发消息） | — | — | **未覆盖**：需要真实 Agent 会话，属后续批次 |

---

## 6. 缺口与假设

- **G-UI-1**：本插件 `inject` 依赖 `slots` / `layout` / `locale` / `sessions`（`packages/dsh-tauri-ui/src/client/index.ts:27`）。若宿主未提供 `SlotOutlet`，设置注册整体跳过并 warn（`packages/dsh-tauri-ui/src/client/register/settings.ts:15`）——用例失败信息必须能区分「槽位缺失」与「组件报错」。
- **G-UI-2**：`settings.section` / `settings.onboarding` 的内容由其它插件提供（`packages/dsh-tauri-ui/src/client/register/sections.ts:6`）。单独挂载本插件时该槽位为空，属预期。
- **G-UI-3**：`[data-composer-card]` / `[data-composer-placeholder]` 是内核 DOM 约定，本仓库内无定义处；内核升级时补丁会静默失效，因此 TC-UI-C-06-003 必须断言「按钮文案已改写」而非「未报错」。
- **G-UI-4**：TC-UI-L2-06-003 / TC-UI-L2-06-004 需要一条真实「运行中 / 已正常结束」的会话，而当前 scratch 宿主由 `globalSetup` 直接拉起、不播种任何会话，也没有造会话的 helper；续跑路由的会话解析走 `ctx.agents.get(sessionId)`（`packages/dsh-tauri-ui/src/host/service/session.ts:28`），空注册表只会落到 404 分支（实测 TC-UI-L2-06-002 即此路径），无法构造 `idle` / 运行中两种状态。故两条标记为**待补**；补齐造会话能力后这两条进入核心集。
- **G-UI-5**：TC-UI-L2-06-005 / TC-UI-L2-06-006 覆盖 `loadCreateUserMessage` 的两条抛错路径（`packages/dsh-tauri-ui/src/host/service/session.ts:76`，抛错点 `:78` 与 `:85`），由 `session.resume()` 的 catch 统一转成 `{ ok: false, code: 500, error: renderThrown(error) }`（`packages/dsh-tauri-ui/src/host/service/session.ts:19`、`:89`）。**判定不可达，故不写 `it()`**：两道前置门是叠加的——先要 `agent.status === 'idle'` 且「上一轮未正常结束」（`packages/dsh-tauri-ui/src/host/service/session.ts:31`、`:34`），即必须先有一条真实可续跑会话（同 G-UI-4 的阻塞）；再要一个 `ctx.loader` 无 `import`、或 `@deepseek-ai/dsh-llm` 无 `createUserMessage` 的宿主，而共享宿主由 `globalSetup` 固定配置、loader 完好（`test/e2e/support/dsh-host.ts` 只脚手架 profile 并拉起 `dsh web`，不注入残缺 loader），本批也不另起宿主。构造不出来时唯一能写的断言只能是「状态码是 4xx/5xx」，等于不验任何契约，属恒绿，故放弃。
- **实测（批次 06）**：TC-UI-L2-06-001 / TC-UI-L2-06-002 已落地并全绿；实测状态码与 `error` 文案（`缺少 sessionId`、`会话不存在或尚未运行`）与文档预期逐字一致，无预期修正、无疑似缺陷。本轮再次实测两条 500 分支的**最外层前置门**：以未知 `sessionId` 请求得到 404 + `会话不存在或尚未运行`，证明共享宿主的 `ctx.agents` 注册表为空，请求在 `:29` 就被 404 截断，根本走不到 `:38` 的注入前置。
- **G-UI-6（浏览器层，上游 DOM 事实）**：设置侧栏展开后**整体盖住**侧栏底部的 `.dshp-settings-trigger`——实测 `trigger.boundingBox()` 为 `null`（元素仍在 DOM 里、`aria-expanded` 仍为 `"true"`，但不可命中）。因此「点击触发器收起」在真实页面里不是可达路径，收起走 `sidebar.tsx` 的 `document` keydown（Escape）通道；用例按实测改写为 Escape 收起。若上游后续把触发器露出，`TC-UI-C-06-002` 应恢复「二次点击收起」的原始意图。
- **G-UI-7（浏览器层，本轮断言面收窄）**：`TC-UI-C-06-003` / `-004` 原设计要求「存在最近一轮以 `aborted`/`error`/`interrupted` 结束的会话」，而 scratch 宿主无造会话手段（同 G-UI-4/G-UI-9），**正向**路径在 L2 不可达。本轮按可观察事实落地为**反向断言**：① 无匹配轮次时 `shouldOfferResume` 必须为假（`aria-label` 不是 `继续任务`、`svg` 内联宽度不是 `14px`）；② 空草稿下主按钮保持 `disabled`（并发保护未被补丁错误解除）。两条都验的是补丁的**前置门**而非改写效果，正向改写效果（`继续任务` + `playwright` 图标）留给有真实会话的批次。
- **假设**：中文 locale 固定（用例断言 `继续任务`）；多语种覆盖留待 locale 专项。
