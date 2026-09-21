# dsh-tauri-pet：从 SSE 路由到桌面端桌宠窗口

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：L2 与客户端段在 `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts`（§2 的 5 条 L2 + §3 的 4 条客户端已落地并全绿）；**L3 段在 `test/e2e/desktop/02-pet-window.e2e.ts`**（`desktop` 车道，见 §4）
> 宿主：L2 与客户端段复用 `globalSetup` 的共享宿主（默认挂载 `dsh-tauri-pet`，`also` 默认覆盖全部产品可见插件，见 `test/e2e/global-setup.ts:40`），不再自带进程
> 前置：`pnpm build:plugins`；L3 另需 **Windows** + debug 二进制（`pnpm build:debug`）+ `3081` 与 WebDriver 端口空闲
> 编排：`test/e2e/support/dsh-host.ts`；浏览器段见 `test/e2e/support/browser.ts`
> 运行：`pnpm test:e2e:plugin -- --run`；L3 段 `pnpm test:e2e:desktop -- --run test/e2e/desktop/02-pet-window.e2e.ts`
>
> **跨文件例外（子设计 02 §2 决策 1）**：`plugin.test.md` §4 规定「一个编号只允许一个测试文件」。批次 `02` 是该规则的**明确例外**：L2/浏览器段在 `test/e2e/plugins/02-*.e2e.ts`，L3 段在 `test/e2e/desktop/02-pet-window.e2e.ts`。原因是运行归属——这 4 条断言的是 Tauri 原生窗口，而 `plugin` 车道的 CI 作业跑 ubuntu-latest、没有 Tauri；留在插件文件里就等于「写了却永不执行」。两文件 `it()` 合计等于本文件 `[Case ID]` 数。

这是**唯一同时贯穿 L2 与 L3 的插件**：宿主侧只有一条 SSE 路由，客户端却要经 Tauri 桥驱动一个独立窗口。复杂度梯度因此天然清晰：**HTTP 字节** → **客户端挂载** → **独立窗口**。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-pet'` | `packages/dsh-tauri-pet/src/shared/constants.ts:9` |
| SSE 路径 `/api/desktop/dsh-tauri-pet/session/stream` | `packages/dsh-tauri-pet/src/shared/constants.ts:12` |
| 唯一路由 `GET`（`kind: 'exact'`） | `packages/dsh-tauri-pet/src/host/routes/index.ts:6` |
| 接入即 `pushComment('keepalive')` | `packages/dsh-tauri-pet/src/host/routes/session/stream/get.ts:24` |
| 心跳间隔 15s；重连提示 1s 只随首帧数据 | `packages/dsh-tauri-pet/src/shared/constants.ts:18`、`packages/dsh-tauri-pet/src/shared/constants.ts:15`、`packages/dsh-tauri-pet/src/host/routes/session/stream/get.ts:42` |
| 有消费者才挂会话总线（4 条监听） | `packages/dsh-tauri-pet/src/host/service/session-stream.ts:67` |
| 客户端守卫：**仅在 iframe 内生效** | `packages/dsh-tauri-pet/src/client/index.ts:24` |
| 槽位：`settings.section`（id `dsh-tauri-pet-settings`，order 230） | `packages/dsh-tauri-pet/src/client/register/pet-section.ts:11`、`packages/dsh-tauri-pet/src/client/constants/index.ts:4` |
| 槽位：`conversation.input.left`（id `dsh-tauri-pet-prefill`，order 230） | `packages/dsh-tauri-pet/src/client/register/prefill.ts:14`、`packages/dsh-tauri-pet/src/client/constants/index.ts:19` |
| 侧栏 DOM 补丁标记 `data-dsh-tauri-pet-icon`、`aria-pressed` | `packages/dsh-tauri-pet/src/client/constants/index.ts:38`、`packages/dsh-tauri-pet/src/client/register/sidebar-icon.utils.ts:15` |
| 侧栏就绪轮询：500ms × 最多 30 次，外加 MutationObserver 看护 | `packages/dsh-tauri-pet/src/client/constants/index.ts:40`、`packages/dsh-tauri-pet/src/client/constants/index.ts:41`、`packages/dsh-tauri-pet/src/client/register/sidebar-icon.ts:105` |
| Tauri 命令：`get_pet_status` / `set_pet_enabled` / `set_active_pet` / `set_pet_size` / `list_pets` / `import_pet` / `list_preset_pets` | `packages/dsh-tauri-pet/src/client/constants/index.ts:25` |
| 桥实现：postMessage + 15s 超时 | `packages/dsh-tauri/src/client/service/invoke.ts:12`、`packages/dsh-tauri/src/client/service/invoke.ts:44` |
| 桌宠窗口 label `pet`，页面 `pet.html` | `src-tauri/src/desktop/pet.rs:30`、`src-tauri/src/desktop/pet.rs:303` |
| 原生命令注册 | `src-tauri/src/desktop/builder.rs:945`、`src-tauri/src/desktop/builder.rs:952` |
| 尺寸范围 50–200 | `packages/dsh-tauri-pet/src/client/constants/index.ts:45`、`packages/dsh-tauri-pet/src/client/constants/index.ts:46` |

---

## 2. L2：宿主侧（HTTP 字节）

### [P1] 验证 SSE 路由连上后立刻下发就绪帧

[Case ID] TC-PET-L2-02-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-pet/src/host/routes/session/stream/get.ts:24`；`plugin.test.md` §8 批次 3
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:125`）
[前置条件] 插件已构建并挂载进 scratch profile；宿主已就绪
[测试数据] `GET /api/desktop/dsh-tauri-pet/session/stream`，`accept: text/event-stream`
[测试步骤] 1. 发起请求。2. 读状态码与 `content-type`。3. 读响应体前 4 个字符后中止流。
[预期结果] 1. 状态码 200。2. `content-type` 含 `text/event-stream`。3. 前 4 个字符匹配 `^:\s*keepalive`。
[清理] `reader.cancel()` 中止连接

### [P3] [反向] 验证同一路径拒绝未声明的方法

[Case ID] TC-PET-L2-02-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:276`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:137`）
[前置条件] 同 TC-PET-L2-02-001
[测试数据] 同路径 `POST`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与 `allow` 头。
[预期结果] 1. 状态码 405。2. `allow` 包含 `GET`。
[清理] 无

### [P4] 验证长连接期间按 15s 周期持续下发心跳注释帧

[Case ID] TC-PET-L2-02-003
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-pet/src/host/routes/session/stream/get.ts:58`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:147`）
[前置条件] 同 TC-PET-L2-02-001；用例超时预算 ≥ 20s（本用例独立设 40s）
[测试数据] 保持连接 17s
[测试步骤] 1. 建立 SSE 连接。2. 累计读取响应体，直到出现第 2 次 `keepalive` 或超时。
[预期结果] 1. 自发起连接起，第 2 帧 `: keepalive` 落在 15s–17s 窗口内（既不得早于一个心跳周期，也不得晚于 17s）。2. 两帧之间无 `data:` 帧（无会话事件时不应伪造数据）。
[清理] 中止连接

### [P2] 验证连接断开后重连仍能立刻拿到就绪帧

[Case ID] TC-PET-L2-02-004
[层级] L2（真实 dsh 进程）
[类型] 回归
[追踪] `packages/dsh-tauri-pet/src/host/service/session-stream.ts:36`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:165`）
[前置条件] 同 TC-PET-L2-02-001
[测试数据] 连续建立两次连接
[测试步骤] 1. 建立连接 A，读到 `: keepalive` 后立即中止。2. 间隔 200ms 建立连接 B。3. 读共享宿主的日志（`inject('dshHome')` + `dsh-web.log`）。
[预期结果] 1. 连接 B 同样在首个响应块内返回 `: keepalive`（不能等到 15s 心跳）。2. 宿主日志中不出现未捕获异常或 `ERR_STREAM_` 类错误。
[清理] 中止连接 B

### [P4] 验证两个并发消费者各自独立就绪

[Case ID] TC-PET-L2-02-005
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-pet/src/host/config/runtime.ts:8`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:189`）
[前置条件] 同 TC-PET-L2-02-001
[测试数据] 同时发起两次 GET
[测试步骤] 1. 并发建立连接 A、B。2. 分别读取首个响应块。3. 中止 A 后继续读 B，直到 B 出现第 2 帧 `: keepalive`。
[预期结果] 1. 两条连接均返回 200 且各自收到 `: keepalive`。2. 任一连接中止后，另一条仍可继续读取（互不牵连），以 B 在 A 断开后仍收到新帧为证。
[清理] 中止两条连接

---

## 3. L2：客户端（真实浏览器页面）

> 本组由 `test/e2e/support/browser.ts` 驱动：真实 Chromium + 同源嵌入文档（`page.route`
> 提供 `/dsh-e2e-embed.html`，内含指向 `/` 的 iframe），复用 `globalSetup` 换得的会话
> Cookie。插件 client 的 `window.parent === window` 早退因此成为可断言的事实。

### [P4] 验证顶层页面不注册任何桌宠槽位

[Case ID] TC-PET-C-02-001
[层级] L2（真实浏览器页面）
[类型] 边界
[追踪] `packages/dsh-tauri-pet/src/client/index.ts:24`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:223`）
[前置条件] 直接打开 `dsh web` 页面（非 iframe）；插件已挂载
[测试数据] 无
[测试步骤] 1. 打开顶层页面并等待首屏完成。2. 打开设置侧栏，确认设置触发器真实存在。3. 查询 `[data-dsh-tauri-pet-icon]` 与 `#dsh-tauri-pet-settings`。
[预期结果] 1. 设置触发器存在（证明断言不是空转）。2. 桌宠入口与设置分区均不存在（`window.parent === window` 时 client 直接 return）。3. 无应用级错误。
[清理] 关闭页面

### [P2] 验证 iframe 内桌宠设置分区正常渲染且无崩溃

[Case ID] TC-PET-C-02-002
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-pet/src/client/register/pet-section.ts:11`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:244`）
[前置条件] 页面被壳层以 iframe 嵌入（`window.parent !== window`）；`slots` 服务可用
[测试数据] 无
[测试步骤] 1. 打开设置侧栏。2. 断言导航里「宠物」项唯一。3. 点开该分区。4. 读分区内容（来源标签、尺寸滑块、错误条）。
[预期结果] 1. 导航项唯一（同 id 不得重复注册）。2. 分区内容渲染出 `.dshp-pet__page`。3. 恰有两个来源标签且首个为激活态。4. 尺寸滑块 `min=50` / `max=200`（与 `constants/index.ts:45-46` 一致）。5. 无 `role="alert"`、无应用级错误。
[清理] 关闭页面

### [P2] 验证侧栏桌宠入口按钮被插入到设置触发器右侧且状态可读

[Case ID] TC-PET-C-02-003
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-pet/src/client/register/sidebar-icon.ts:94`、`packages/dsh-tauri-pet/src/client/register/sidebar-icon.utils.ts:25`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:290`）
[前置条件] 侧栏 `[data-slot="sidebar"]` 与 `.dshp-settings-trigger` 均已存在
[测试数据] 无
[测试步骤] 1. 等待 `[data-dsh-tauri-pet-icon]` 出现。2. 读 `aria-pressed`。3. 读该按钮与触发器、宿主行的几何与计算样式。
[预期结果] 1. 按钮存在且唯一（guard 属性防重复插入）。2. `aria-pressed` 为 `"true"` 或 `"false"` 之一。3. 按钮是触发器的**紧邻后继兄弟**、落在触发器右侧、与之垂直区间重叠且中心落在触发器内。4. 宿主行计算样式为 `display:flex` + `gap:8px` + `nowrap` 且带 `dshp-pet__settings-row`。5. 两者都在侧栏内，无应用级错误。
[清理] 关闭页面

### [P4] 验证侧栏长时间未就绪时停止轮询且不抛错

[Case ID] TC-PET-C-02-004
[层级] L2（真实浏览器页面）
[类型] 边界
[追踪] `packages/dsh-tauri-pet/src/client/register/sidebar-icon.ts:110`
[自动化] 是（`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:342`）
[前置条件] 页面加载后人为移除/阻止侧栏渲染
[测试数据] 无
[测试步骤] 1. 记录兜底轮询参数（500ms × 30 + 首轮）。2. 等待 ≥ 18s（覆盖整个兜底窗口）。3. 读入口数量、是否仍连接、位置是否仍正确，并收集错误。
[预期结果] 1. 入口恰好 1 个（观察器重入不得叠加或移除）。2. 兜底窗口结束后入口仍在 DOM 上且位置正确。3. 无应用级错误。
[核查说明] 宿主侧栏在本环境总是就绪（`scan()` 首轮即命中），所以「侧栏缺席」这一分支无法在 L2 构造；本条改以「有限预算 + 观察器重入稳定性」为断言面，`sidebar-icon.ts:105-111` 的缺席分支仍为**未覆盖**（见 §6 G-PET-6）。
[清理] 关闭页面

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

> **运行归属**：本组 4 条落在 `test/e2e/desktop/02-pet-window.e2e.ts`，由 `desktop` project 匹配
> （`vitest.desktop.config.ts:15` 的 `include: ['test/e2e/desktop/*.e2e.ts']` 已能匹配，**无需改 config**）。
> 断言对象是 Tauri 原生产物：独立 OS 窗口句柄集合、窗口创建/销毁、窗口几何尺寸夹紧。
> 前置 `pnpm build:debug` + Windows；运行 `pnpm test:e2e:desktop -- --run test/e2e/desktop/02-pet-window.e2e.ts`。

### [P1] 验证启用桌宠后出现独立的桌宠窗口

[Case ID] TC-PET-L3-02-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/desktop/pet.rs:29`、`src-tauri/src/bridge/pet.rs:164`
[自动化] 是（`test/e2e/desktop/02-pet-window.e2e.ts:139`）
[前置条件] debug 二进制与 `dist/` 就绪；`3081` 与 WebDriver 端口空闲；宿主 harness 已就绪
[测试数据] 经桥命令 `set_pet_enabled({enabled:true})`
[测试步骤] 1. 读 `getWindowHandles()` 基线。2. 帧内调用 `set_pet_enabled(true)`。3. 轮询窗口句柄集合。4. 读 `get_pet_status()`。
[预期结果] 1. 基线恰为 `['main']`。2. 触发后集合恰为 `['main','pet']`。3. `get_pet_status()` 返回 `enabled:true` 且 `visible:true`。
[清理] 下一条用例的复位前置把 `enabled` 写回 false 并等待窗口集合回到 `['main']`

### [P3] [反向] 验证未启用桌宠时不存在桌宠窗口

[Case ID] TC-PET-L3-02-002
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/bridge/pet.rs:54`
[自动化] 是（`test/e2e/desktop/02-pet-window.e2e.ts:154`）
[前置条件] 干净数据目录（首个会话，`enabled` 默认关闭）
[测试数据] 无
[测试步骤] 1. 复位到 `enabled=false` 并等窗口集合收敛。2. 读 `get_pet_status()`。3. 读窗口句柄集合。
[预期结果] 1. `enabled` 为 false 且 `visible` 为 false。2. 窗口集合恰为 `['main']`。
[清理] 无

### [P2] 验证侧栏入口按钮切换后窗口随之创建与销毁

[Case ID] TC-PET-L3-02-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-pet/src/client/register/sidebar-icon.ts:48`
[自动化] 是（`test/e2e/desktop/02-pet-window.e2e.ts:164`）
[前置条件] 同上；内置 DSH 界面已加载完侧栏
[测试数据] 点击 `[data-dsh-tauri-pet-icon]` 两次
[测试步骤] 1. 复位后读按钮 `aria-pressed`。2. 点击按钮并轮询 `aria-pressed` 与窗口集合。3. 再次点击并轮询回退。
[预期结果] 1. 首次点击后 `aria-pressed="true"` 且窗口集合包含 `pet`。2. 二次点击后 `aria-pressed="false"` 且窗口集合回到 `['main']`。3. 全程无应用级错误。
[清理] 复位前置把 `enabled` 写回 false

### [P4] 验证桌宠尺寸边界被夹紧到 50–200

[Case ID] TC-PET-L3-02-004
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/desktop/pet.rs:48`、`src-tauri/src/desktop/pet.rs:49`
[自动化] 是（`test/e2e/desktop/02-pet-window.e2e.ts:198`）
[前置条件] 桌宠已启用
[测试数据] 依次提交 `0`、`50`、`200`、`999`
[测试步骤] 1. 逐值调用 `set_pet_size({size})`。2. 每次读 `get_pet_status().pet_size`。3. 收尾恢复 100。
[预期结果] 1. 越界值被夹紧到 50 或 200。2. 合法值原样回读。3. 收尾恢复到 100。
[清理] 恢复默认尺寸 `100` 并复位 `enabled=false`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `plugin.test.md` §8 批次 3（SSE 首帧） | TC-PET-L2-02-001、TC-PET-L2-02-002 | 正向 / 异常 | 已落地 |
| `get.ts:58` 心跳 | TC-PET-L2-02-003 | 边界 | 单例耗时 ≈15s（一个心跳周期），不进冒烟子集 |
| `session-stream.ts:36` 消费者注销 | TC-PET-L2-02-004、TC-PET-L2-02-005 | 回归 / 边界 | 注销本身只能经重连间接观察 |
| `client/index.ts:24` iframe 守卫 | TC-PET-C-02-001 | 边界 | 已落地（浏览器层） |
| `pet-section.ts:11` / `sidebar-icon.ts:94` | TC-PET-C-02-002、TC-PET-C-02-003 | 正向 | 已落地（浏览器层） |
| `sidebar-icon.ts:110` 轮询兜底 | TC-PET-C-02-004 | 边界 | 已落地，但「侧栏缺席」分支不可构造，见 G-PET-6 |
| `plugin.test.md` §8 批次 4+（桌面端窗口） | TC-PET-L3-02-001、TC-PET-L3-02-002、TC-PET-L3-02-003 | 正向 / 异常 | 已落地于 `desktop` 车道 |
| `pet.rs:48-49` 尺寸范围 | TC-PET-L3-02-004 | 边界 | 已落地于 `desktop` 车道 |

---

## 6. 缺口与假设

- **G-PET-1**：数据帧形状（`data: {"action","payload"}`，`packages/dsh-tauri-pet/src/host/types/index.ts:53`）与首帧 `retry: 1000` 需要真实会话事件才能观察。当前无「触发一次会话事件」的稳定手段，**未覆盖**；建议后续用 scratch profile 直接 POST 一次会话动作后再断言帧形状。
- **G-PET-2**：`window.handles` 是否包含 Tauri 的多 WebView 窗口（`pet`）尚未验证——`wdio-probe.mjs:146` 只在默认状态断言了 `["main"]`。若驱动只暴露主窗口，TC-PET-L3-02-001 需改用原生窗口枚举（Rust 侧）或前端 `get_pet_status().visible`。
- **G-PET-3**：`packages/dsh-tauri-pet/skills/` 在本 checkout 不存在，而 `cordis.patch.yml` 引用了它；技能相关的用户可见产物**不在覆盖范围**，直到该目录真实存在。
- **G-PET-4（已消解）**：`TC-PET-L2-02-001` / `TC-PET-L2-02-002` 的 `it()` 标题曾与本文档条目标题字面不一致，且这两例用的是 `test()` 别名。已统一：标题改回文档口径，别名统一为 `it()`，本文件与其余 e2e 文件写法一致。
- **G-PET-5（实测，非缺口）**：宿主日志**可达**——`inject('dshHome')` 即共享宿主的 scratch 根，其 `dsh-web.log` 就是 `dsh web` 的 stdout+stderr（`test/e2e/support/dsh-host.ts:441`）。`TC-PET-L2-02-004` 已实读该文件并断言；实测整批跑完后该文件仅 83 字节（只有就绪 URL 一行），即连接中止与重连都没有触发任何宿主侧输出。断言不是空转（宿主一旦打印 `ERR_STREAM_` / 未捕获异常必然落在该文件），但证据强度仅限「宿主未打印异常」。
- **实测记录（L2 段，连续 3 次运行全绿）**：第 2 帧心跳 15.01s / 15.02s / 15.02s，命中 15–17s 窗口；重连后**首个响应块**即含就绪帧（`chunks === 1`，整例 ~0.22s）；中止 A 后 B 仍收到第 2 帧心跳（15.02s）。**未发现与本文档预期不符的行为**，故无「预期 → 实测」改写项。
- **G-PET-6（浏览器层，实测缺口）**：`TC-PET-C-02-004` 想要的前置是「侧栏始终不出现」，但 scratch 宿主里侧栏总是就绪，`scan()` 首轮即命中，`sidebar-icon.ts:105-111` 的**缺席分支在 L2 不可达**。观察到的事实是：侧栏就绪后 `MutationObserver` 看护会持续补插，用例据「入口恒为 1 个且位置正确 + 无应用级错误」断言重入稳定性，兜底轮询的预算参数（`PET_ICON_RETRY_MS` 500ms × `PET_ICON_RETRY_MAX` 30）由用例读取常量值核对。真正的「侧栏缺席 → 停止轮询」建议在 L1（jsdom）覆盖。
- **G-PET-7（浏览器层，环境事实）**：`aria-pressed` 在纯浏览器里恒为 `"false"`——状态真值来自 `get_pet_status`，而浏览器没有 Tauri 桥，`loadPetStatus()` 必然超时（控制台留下 `NODE_NOT_ANSWERED`，属预期噪声，已在 `browser.ts` 的 `IGNORED_APP_ERRORS` 里过滤）。因此本文件只断言该属性「显式表达两态」，**不断言**它与真实 `enabled` 的一致；后者由 L3 段（`desktop` 车道，有真实桥）覆盖。
- **G-PET-8（浏览器层，上游 DOM 事实）**：设置分区的注册 id（`dsh-tauri-pet-settings`）**不出现在 DOM 里**——`SettingsSidebar` 只渲染 `label`（`packages/dsh-tauri-ui/src/client/components/sidebar.tsx:113-127`），`id` 只活在 `store.sections` 快照与导航项的 key 上。因此 `TC-PET-C-02-002` 改用「导航项 `宠物` 唯一 + 点开后 `.dshp-pet__page` 内容侧锚点」这一对可观察事实，而不是 `[id=...]`。
- **假设**：`sidebar-icon.utils.ts:25` 的 `aria-pressed` 与 store 中 `status.enabled` 同步（`sidebar-icon.ts:71` 订阅保证）。
