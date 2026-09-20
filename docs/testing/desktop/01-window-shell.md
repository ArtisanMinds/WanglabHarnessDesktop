# 主窗口与基础壳层 UI

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/01-window-shell.e2e.ts`（已接线）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/01-window-shell.e2e.ts`

本组是全部用例的地基：窗口能起来、壳层能渲染、导航能操作、窗口按钮与托盘语义正确。任何一条失败都意味着后续用例的失败不可归因。

---

## 1. 窗口启动

本文件是全部用例的地基：窗口能起来、壳层能渲染、前置校验能拦住不该跑的运行。任何一条失败都意味着后续用例的失败不可归因。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 主窗口标题 `Deepseek Harness Desktop` | `src-tauri/src/desktop/builder.rs:484` |
| 主窗口初始尺寸 `1280×840` | `src-tauri/src/desktop/builder.rs:485` |
| 主窗口最小尺寸 `860×620` | `src-tauri/src/desktop/builder.rs:486` |
| 壳层导航栏高度常量 `SHELL_NAV_HEIGHT = 44` | `src-tauri/src/desktop/builder.rs:44` |
| 导航栏根元素 `h-11`（与上者同真值，由 Rust 单测守门） | `src/layout/components/navbar.tsx:347` |
| 壳层根容器 `flex h-screen w-screen` | `src/layout/index.tsx:144` |
| DEV 标记 Chip 仅在 `import.meta.env.DEV` 下渲染 | `src/layout/components/navbar.tsx:512-516` |
| 首次挂载自动启动 harness（StrictMode 去重） | `src/layout/index.tsx:81`、`src/store/modules/harness/store.ts:119-124` |
| 启动阶段枚举 `checking/installing/starting/preinstall/ready/error` | `src/store/modules/harness/types.ts:4` |
| Debug 端口常量 `DSH_DEV_PORT = 3081` | `src-tauri/src/config/constants.rs:53` |
| 端口被占用时逐级递增 | `src-tauri/src/service/workflow/launch.rs:66`、`:84-86` |
| 端口 NOT fixed 的正式声明 | `src-tauri/capabilities/default.json:4` |

---

### 窗口与壳层

### [P1] 验证应用启动后主窗口存在且标题正确

[Case ID] TC-DSK-L3-01-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 01；`src-tauri/src/desktop/builder.rs:484`
[自动化] 是（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] 二进制存在；默认端口实测空闲；无残留桌面实例
[测试数据] 期望标题 `Deepseek Harness Desktop`
[测试步骤] 1. 拉起应用并建立 WDIO 会话。2. 读取窗口句柄集合与当前窗口标题。
[预期结果] 1. 会话建立成功。2. 句柄集合包含 `main`（应用同时会开桌宠窗口 `pet`，句柄集合视其创建时机为 `["main"]` 或 `["main","pet"]`），且当前会话已切到 `main`。3. 标题等于 `Deepseek Harness Desktop`。
[清理] `DELETE /session/<id>`，再按进程树结束应用

### [P1] 验证壳层根节点渲染且页面无未捕获错误

[Case ID] TC-DSK-L3-01-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 01；`src/layout/index.tsx:144`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-01-001 通过
[测试数据] 根节点选择器 `dsh-shell-root`；控制台错误白名单为空
[测试步骤] 1. 注入控制台错误收集器。2. 等待壳层根节点出现。3. 首屏稳定后读取收集器。
[预期结果] 1. 收集器注入成功。2. 根节点在超时内出现且可见。3. 收集器为空（无未捕获错误）。
[清理] `DELETE /session/<id>`

### [P2] 验证壳层导航栏高度为 44px

[Case ID] TC-DSK-L3-01-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/desktop/builder.rs:44`；`src/layout/components/navbar.tsx:347`；issue #524
[自动化] 是（同上）
[前置条件] TC-DSK-L3-01-001 通过
[测试数据] 导航栏根节点 `dsh-navbar-root`；期望高度 `44`
[测试步骤] 1. 等待导航栏根节点出现。2. 读取其边界矩形高度。
[预期结果] 1. 节点出现。2. 高度等于 `44`（与 `SHELL_NAV_HEIGHT` 一致；两处一致性另由 Rust 单测 `shell_nav_height_matches_navbar_height_class` 守门）。
[清理] `DELETE /session/<id>`

---

### 几何约束

### [P2] 验证主窗口初始尺寸按 1280×840 申请

[Case ID] TC-DSK-L3-01-004
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/desktop/builder.rs:485`
[自动化] 是（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] TC-DSK-L3-01-001 通过；无历史窗口几何持久化记录
[测试数据] 期望宽 `1280`、高 `840`
[测试步骤] 1. 清空窗口几何持久化记录。2. 拉起应用。3. 读取窗口内尺寸、`screen` 与 `screen.avail*`（均按 `devicePixelRatio` 还原）。
[预期结果] 1. 清空成功。2. 会话建立成功。3. 宽高各自落在「上限 = `min(申请值, screen)`、下限 = `min(申请值, avail)`」区间内（±2px 取整误差）：上限保证应用未自行放大、也未越出显示器；下限保证屏幕放得下时申请值被完整兑现。下限取工作区是因为任务栏会让可用高度小于屏幕高度，按工作区夹与按屏幕夹均应判为合格。
[清理] 恢复被清空的几何记录；`DELETE /session/<id>`

> **为什么不直接断言等于 `1280×840`**：屏幕放不下时窗口会被系统夹小。CI 的虚拟显示器小于该尺寸（实测宽被夹到 `1024`），等比断言在 CI 上必然失败。上下界断言在两种环境下都成立，且仍能捕获「窗口开小了」与「窗口开大了」两类回归；失败信息带上 `inner` / `dpr` / `screen` / `avail` 实测值以便定位。

### [P2] 验证窗口最小尺寸约束为 860×620

[Case ID] TC-DSK-L3-01-005
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/desktop/builder.rs:486`
[自动化] 否（手工）——embedded driver 的 `SetWindowRect` 绕过 tao 的最小尺寸约束（见 G-D01-4）
[前置条件] TC-DSK-L3-01-001 通过
[测试数据] 手工拖拽窗口左下角至小于 `860×620`
[测试步骤] 1. 手动拖拽窗口边缘缩小。2. 读取实际内尺寸。
[预期结果] 1. 拖拽被限制。2. 实际宽不小于 `860`，高不小于 `620`。
[清理] 恢复窗口尺寸；`DELETE /session/<id>`

### [P4] 验证生产构建不显示开发环境标记

[Case ID] TC-DSK-L3-01-006
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/navbar.tsx:512-516`
[自动化] 是
[前置条件] 运行的是 `vite build` 产物（本通道恒成立）
[测试数据] 标记节点 `dsh-navbar-dev-chip`
[测试步骤] 1. 拉起应用。2. 查询标记节点是否存在。
[预期结果] 1. 会话建立成功。2. 标记节点不存在（`import.meta.env.DEV` 为 false）。
[清理] `DELETE /session/<id>`

> 正向（dev 构建下标记可见）需 `tauri dev` 前端通道，本套件不可覆盖，见 G-D01-5。

---

### 启动前置校验

### [P3] [反向] 验证二进制缺失时启动失败并给出可判定错误

[Case ID] TC-DSK-L3-01-007
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `docs/specs/desktop.test.md` §1「严格归因」
[自动化] 是（同上）
[前置条件] 故意使用不存在的二进制路径
[测试数据] 路径 `src-tauri/target/debug/__missing__.exe`
[测试步骤] 1. 以不存在的路径请求启动。2. 捕获启动结果。
[预期结果] 1. 启动被拒绝。2. 抛出可判定错误且错误信息包含该路径。3. 不出现「会话已建立」。
[清理] 无

### [P3] [反向] 验证默认端口被占用时前置校验直接失败且不强杀进程

[Case ID] TC-DSK-L3-01-008
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `docs/specs/desktop.test.md` §6「前置校验」；`src-tauri/src/service/workflow/launch.rs:66`
[自动化] 是（同上）
[前置条件] 测试自行占用默认端口（模拟残留实例）
[测试数据] 占用端口 `3081`；占用者进程 PID
[测试步骤] 1. 占用 `3081`。2. 执行前置校验。3. 断言校验结果。4. 断言占用者进程仍存活。
[预期结果] 1. 占用成功。2. 校验返回失败并指明端口被占用。3. 失败信息可判定。4. 占用者进程未被终止（不自动强杀用户进程）。
[清理] 释放测试自身持有的端口占用

---

### 选择器契约

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-shell-root` | `src/layout/index.tsx` 最外层容器 | 已补 |
| `dsh-navbar-root` | `src/layout/components/navbar.tsx` 根容器 | 已补 |
| `dsh-navbar-dev-chip` | 导航栏 DEV 标记 Chip | 已补 |

> 仅 `01` 批次声明的选择器已补齐；`01` 及后续批次所需选择器在各自批次落地时同步补，不提前铺设。

---

### 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `builder.rs` 主窗口构建（标题/尺寸/最小尺寸） | 001、004、005 | 正向 / 边界 | 几何持久化恢复归本组的「窗口控制与托盘」模块 |
| `desktop.test.md` §1 严格归因 | 002、007 | 正向 / 异常 | 控制台错误的「可接受警告」白名单需在接线时定义 |
| issue #524（栏高一致性） | 003 | 正向 | Rust 单测已守门，本用例是真实渲染下的同一断言 |
| `desktop.test.md` §6 前置校验 | 008 | 异常 | 校验由测试编排实现，不属应用行为 |
| DEV 标记 | 006 | 边界 | — |

---

### 缺口与假设

- **G-D01-1**：窗口内尺寸断言受 DPI 缩放影响，`1280×840` 与 `860×620` 为逻辑像素；WebDriver 读回的 CSS 像素需乘 `devicePixelRatio` 还原（实测 150% 下 inner 为 `854×560`，×1.5 = 1281）。
- **G-D01-2**：TC-DSK-L3-01-002 的「无未捕获错误」需要一份可接受警告白名单（如 WebView2 的无关警告），当前未定义，接线时必须先确定，否则用例会因环境噪声假失败。
- **G-D01-3**：TC-DSK-L3-01-008 校验的是**测试编排**的前置行为，不是应用行为；放在本文件的理由是它与启动路径同批推进。若后续拆出独立的编排骨架文件（对应插件套件的 `plugins/01-dsh-host-and-core-contract.md`），应随之迁移。
- **G-D01-4**：TC-DSK-L3-01-005 在本通道**不可自动断言**。embedded driver 的 `SetWindowRect` 直接落 `SetWindowPos`，绕过 tao 的最小尺寸约束——请求 `400×300` 会真的变成 `400×300`（实测）。该用例改标手工，自动覆盖需原生 API 或真实拖拽注入。
- **G-D01-5**：TC-DSK-L3-01-006 只能验反向。本通道前端由 `vite build` 产出，`import.meta.env.DEV` 恒为 false，DEV 标记本就不该出现；正向（dev 构建可见）需 `tauri dev` 或 browser mode 通道。
- **假设**：默认端口为 `3081`，但按 `capabilities/default.json:4` 与 `launch.rs:66`，端口可配置且会递增；本文件的前置校验按「实测空闲」执行，不断言端口恒定。

---

## 2. 壳层导航栏

导航栏是本应用唯一常驻的壳层控件，同时承担窗口控制与三个下拉菜单。本文件的重点是**条件渲染的正确性**：依赖 iframe 或插件状态的入口在接收方缺席时必须消失或禁用，而不是留一个点了没反应的死按钮。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 导航栏根元素与 44px 高度 | `src/layout/components/navbar.tsx:339-350` |
| 「文件」菜单项 id：`new-window`/`new-chat`/`open-folder`/`close`/`quit` | `src/layout/components/navbar.tsx:385-426` |
| 「配置」菜单项来自 `CONFIG_TABS`（`application`/`profiles`/`plugins`/`harness`） | `src/layout/components/navbar.tsx:82-87`、`:443-451` |
| 「帮助」菜单项 id：`copy-run-logs`/`check-update`/`about`/`documentation` | `src/layout/components/navbar.tsx:467-504` |
| 侧边栏开关仅在 `onToggleSidebar != null && tauriEnabled` 时渲染 | `src/layout/components/navbar.tsx:351` |
| `tauriEnabled` 判定：插件列表含 `dsh-tauri` | `src/layout/components/navbar.tsx:70`、`:173` |
| 「新聊天」「打开文件夹」在回调缺席时 `isDisabled` | `src/layout/components/navbar.tsx:396`、`:405` |
| 三个 iframe 桥回调仅在 iframe 挂载（`serviceHealthy`）时下发 | `src/layout/components/webview.tsx:65-78` |
| 折叠状态来自 iframe 桥消息 `dsh://sidebar:collapsed` | `src/layout/components/webview.tsx:41-45` |
| 侧边栏切换向 iframe 发 `dsh://sidebar:toggle` | `src/layout/components/webview.tsx:69` |
| 拖拽区带 `data-tauri-drag-region`，双击最大化由 Tauri 原生 drag.js 处理 | `src/layout/components/navbar.tsx:520-525`、`tauri-2.11.5/src/window/scripts/drag.js:103` |
| macOS 原生全屏时整条导航栏 `hidden` | `src/layout/components/navbar.tsx:97-143`、`:343` |
| macOS 上「文件」「配置」「帮助」不渲染（由原生菜单承载） | `src/layout/components/navbar.tsx:368`、`:544` |
| macOS 原生菜单事件 `macos-menu-action` 复用壳层操作 | `src/layout/components/navbar.tsx:304-336` |
| 菜单项 id 落在 DOM 的 `data-key`（react-aria `useSelectableItem`） | `react-aria/dist/private/selection/useSelectableItem.mjs:193` |
| 菜单展开时 react-aria 铺一层全屏 `data-testid="underlay"`（`position: fixed` + `pointer-events: auto`） | 实测，见「拖拽区、缩放与平台差异」的清理口径 |
| 菜单弹层宽度由 HeroUI `.dropdown__popover` 决定（`@media (min-width: 48rem)` 下 `min-width: 220px`），壳层不得钉死 `width` | `src/layout/components/navbar.tsx:383`、`:440`、`:466` |

---

### 菜单结构

### [P1] 验证导航栏根容器与三个菜单按钮存在

[Case ID] TC-DSK-L3-01-009
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 01；`src/layout/components/navbar.tsx:339-505`
[自动化] 是（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] 应用已启动且导航栏已渲染（壳层常驻，与 harness 是否就绪无关）；平台非 macOS
[测试数据] 选择器 `dsh-navbar-root`、`dsh-navbar-menu-file`、`dsh-navbar-menu-config`、`dsh-navbar-menu-help`
[测试步骤] 1. 读取导航栏根容器。2. 依次读取三个菜单触发器。
[预期结果] 1. 根容器存在且可见。2. 三个菜单触发器均存在且可见。
[清理] `DELETE /session/<id>`

### [P2] 验证「配置」菜单包含四个面板入口

[Case ID] TC-DSK-L3-01-010
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:82-87`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-01-009 通过
[测试数据] 期望 id 顺序：`application`、`profiles`、`plugins`、`harness`；文案按设备语言取 `zh-CN`（应用/档案/插件/核心）或 `en-US`（Application/Profiles/Plugins/Harness）
[测试步骤] 1. 点击「配置」。2. 读取菜单项 id 集合与文本集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。3. 文本集合等于当前语言对应的期望值。
[清理] `DELETE /session/<id>`

### [P2] 验证「帮助」菜单包含四个入口

[Case ID] TC-DSK-L3-01-011
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:467-504`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-01-009 通过
[测试数据] 期望 id 顺序：`copy-run-logs`、`check-update`、`about`、`documentation`
[测试步骤] 1. 点击「帮助」。2. 读取菜单项 id 集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。
[清理] `DELETE /session/<id>`

### [P2] 验证「文件」菜单包含五个入口

[Case ID] TC-DSK-L3-01-012
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:385-426`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-01-009 通过
[测试数据] 期望 id 顺序：`new-window`、`new-chat`、`open-folder`、`close`、`quit`
[测试步骤] 1. 点击「文件」。2. 读取菜单项 id 集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。
[清理] `DELETE /session/<id>`

---

### 依赖状态的条件渲染

### [P2] 验证侧边栏折叠图标随 iframe 回报切换

[Case ID] TC-DSK-L3-01-013
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:41-45`；`src/layout/components/navbar.tsx:351-366`
[自动化] 否（暂缓，见「缺口与假设」G-D01-7）
[前置条件] 当前档案已安装 `dsh-tauri`；应用处于 `ready` 且 iframe 已挂载
[测试数据] 桥消息 `dsh://sidebar:collapsed`，`collapsed` 依次取 `false`、`true`
[测试步骤] 1. 由 iframe 侧回报 `collapsed=false`，读取开关的无障碍标签。2. 回报 `collapsed=true`，再次读取。
[预期结果] 1. 标签为「收起侧边栏」语义。2. 标签切换为「展开侧边栏」语义，图标随之变化。
[清理] 复位 `collapsed=false`；`DELETE /session/<id>`

### [P3] [反向] 验证 dsh-tauri 未安装时侧边栏开关不渲染

[Case ID] TC-DSK-L3-01-014
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/navbar.tsx:173`、`:351`
[自动化] 否（暂缓，见「缺口与假设」G-D01-6）
[前置条件] 当前档案未安装 `dsh-tauri`；应用处于 `ready`
[测试数据] 选择器 `dsh-navbar-sidebar-toggle`
[测试步骤] 1. 确认插件列表中不含 `dsh-tauri`。2. 读取侧边栏开关节点。
[预期结果] 1. 列表中确实不含 `dsh-tauri`。2. 开关节点不存在（无死按钮）。
[清理] 恢复插件状态（若测试改动了档案）；`DELETE /session/<id>`

### [P3] [反向] 验证无 iframe 接收方时依赖项禁用

[Case ID] TC-DSK-L3-01-015
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/navbar.tsx:396`、`:405`；`src/layout/components/webview.tsx:65-73`
[自动化] 是（同上）
[前置条件] 应用处于无 iframe 接收方的状态（隔离 home + 禁下载下停在预装引导/错误页），导航栏仍渲染
[测试数据] 菜单项 `new-chat`、`open-folder`
[测试步骤] 1. 确认 DOM 中不存在 `iframe`。2. 打开「文件」菜单。3. 读取两项的禁用状态。
[预期结果] 1. 无 iframe（无协议接收方）。2. 菜单展开。3. 两项均为禁用状态。
[清理] `DELETE /session/<id>`

---

### 拖拽区、缩放与平台差异

### [P4] 验证拖拽区双击切换最大化（非 macOS）

[Case ID] TC-DSK-L3-01-016
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/navbar.tsx:520-525`；`tauri-2.11.5/src/window/scripts/drag.js:78-105`
[自动化] 是（同上）
[前置条件] 平台为 Windows 或 Linux；窗口当前非最大化
[测试数据] 拖拽区选择器 `dsh-navbar-drag-region`；最大化状态读 `plugin:window|is_maximized`（label `main`）
[测试步骤] 1. 读取最大化状态。2. 在拖拽区派发 `mousedown`（`detail=2`，原生处理器判定双击的依据）。3. 再次读取。4. 再派发 `dblclick`，确认状态不再变化（网页侧不得重复处理）。5. 还原窗口。
[预期结果] 1. 状态为未最大化。2. 双击序列被接受。3. 状态变为已最大化。4. `dblclick` 不产生第二次切换。5. 状态回到未最大化。
[清理] 派发一次 `mousedown(detail=2)` 还原为未最大化；`DELETE /session/<id>`

> **通道限制（G-D01-10）**：embedded WebDriver 的 `doubleClick()` 产生的 `mousedown` 的 `detail` 恒为 0，且完全不派发 `dblclick`——Tauri 原生拖拽区赖以判定双击的 `detail === 2` 永远命中不了。因此步骤 2/4 直接派发原生处理器实际依据的两个事件，而非合成输入；真实鼠标双击本身未在本通道覆盖。

### [P5] 验证 macOS 原生全屏时整条导航栏隐藏

[Case ID] TC-DSK-L3-01-017
[层级] L3（真实 Tauri 窗口）
[类型] 低频
[追踪] `src/layout/components/navbar.tsx:97-143`、`:343`
[自动化] 否（手工；需操作系统级全屏切换）
[前置条件] 平台为 macOS；窗口处于普通（非全屏）状态
[测试数据] 导航栏根节点 `dsh-navbar-root`
[测试步骤] 1. 确认导航栏可见。2. 通过绿色交通灯进入原生全屏。3. 读取导航栏可见性。4. 退出全屏。
[预期结果] 1. 导航栏可见。2. 进入原生全屏成功。3. 导航栏不可见。4. 退出后导航栏恢复可见。
[清理] 退出原生全屏

---

### [P4] 验证窄视口下菜单项文本不被裁切

[Case ID] TC-DSK-L3-01-018
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] 批次 01；`src/layout/components/navbar.tsx:383`、`:440`、`:466`（三个 `Dropdown.Popover`）
[自动化] 是（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] 导航栏已渲染；平台非 macOS
[测试数据] 窗口缩到 720×640（落点 CSS 视口随窗口管理器与 DPI 浮动，实测本机 707px、CI 更窄，用例只要求 < 768px）；依次使用「文件」「配置」「帮助」三个菜单
[测试步骤] 1. 把窗口缩到 720×640。2. 确认 CSS 视口宽度 < 768px。3. 依次打开三个菜单，读取弹层宽度与每个菜单项的 `scrollWidth`/`clientWidth` 及渲染宽度。4. 恢复窗口尺寸。
[预期结果] 1. 窗口缩小成功。2. CSS 视口 < 768px（复现条件成立）。3. 每个菜单项的 `scrollWidth <= clientWidth + 1`（文本未被裁切）且渲染宽度 > 0，弹层宽度 > 0。4. 窗口恢复为 1280×840。
[清理] 恢复窗口尺寸；`DELETE /session/<id>`

> **为什么必须缩窗口**：HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 下才有 `min-width: calc(var(--spacing) * 55)`（220px）。视口 ≥ 768px 时该 min-width 会盖住任何被钉死的 `width`，缺陷被掩盖；只有视口 < 768px 才能暴露。高显示缩放（如 175%）下 1280 物理宽的窗口只有约 732 CSS 像素，用户日常就是这个形态——见 G-D01-12。
>
> **宽度两侧都有约束**：壳层显式声明 `min-w-55`（220px，与 HeroUI 在 ≥48rem 下的默认一致），HeroUI 另给 `max-width: 48svw`——视口极窄时上限先咬住（CI 上实测弹层 199px，文本仍未裁切）。因此用例只断言「文本不被裁切」这一不变量：钉死宽度的回归必然表现为裁切，仍会被捕获。

### 禁用下载时的壳层形态

本批统一以 `startDesktopApp({ disableDownload: true })` 启动（`DSH_E2E_DISABLE_DOWNLOAD=1`）：装配必然停在「找不到 dsh CLI」，但这是被刻意截断的结果。壳层据此渲染**禁用页**而不是启动失败页，布局与失败页同源（同一个 `Loadable`），只换文案与动作。

### [P4] 验证禁用下载时展示禁用页而非启动失败页

[Case ID] TC-DSK-L3-01-019
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] 批次 01；`src/layout/components/setup.tsx`（`disabled` 分支）、`src-tauri/src/config/runtime.rs:596`（`RuntimeInfo::auto_download_disabled`）
[自动化] 是（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] 以 `DSH_E2E_DISABLE_DOWNLOAD=1` 启动（本批固定形态）
[测试数据] 选择器 `dsh-setup-disabled` / `dsh-setup-error`；期望标题按语言取「下载已被环境禁用」或 `Downloads disabled by environment`；说明文案须含 `DSH_E2E_DISABLE_DOWNLOAD=1`
[测试步骤] 1. 等待禁用页出现。2. 读取页面文本。3. 检查失败页节点是否存在。
[预期结果] 1. 禁用页在超时内出现且可见。2. 文本含当前语言的标题与 `DSH_E2E_DISABLE_DOWNLOAD=1`。3. 失败页节点不存在。
[清理] `DELETE /session/<id>`

> **口径**：`disableDownload` 只截断网络下载，装配与失败路径照旧执行（`desktop.test.md` §6.1）；壳层只是不再把「找不到 dsh CLI」呈现为故障。因此本批其余用例（菜单结构、禁用项、拖拽区）仍按真实观测结果断言。
>
> **缓存必须空**：共享下载缓存里若已有一份可用的 Node/dsh/pnpm，`runtime_ready()` 会为真，装配流程随之分叉（不再停在「找不到 dsh CLI」），禁用页就不会出现。因此 `startDesktopApp({ disableDownload: true })` 未显式指定缓存时，脚手架改用本次运行独占的空缓存目录，收尾随 scratch home 一起删除——禁用页与「无 iframe 接收方」两类断言都不再依赖上一次运行的遗留。

### 选择器契约

| `data-testid` | 元素 | 位置 | 状态 |
| --- | --- | --- | --- |
| `dsh-navbar-menu-file` | 「文件」下拉触发器 | `navbar.tsx:379` | 已补 |
| `dsh-navbar-menu-config` | 「配置」下拉触发器 | `navbar.tsx:436` | 已补 |
| `dsh-navbar-menu-help` | 「帮助」下拉触发器 | `navbar.tsx:462` | 已补 |
| `dsh-navbar-sidebar-toggle` | 侧边栏折叠开关 | `navbar.tsx:358` | 已补 |
| `dsh-navbar-drag-region` | 空白拖拽区 | `navbar.tsx:522` | 已补 |
| `dsh-setup-disabled` | 「下载已被环境禁用」页根节点 | `setup.tsx` → `loadable.tsx` | 已补 |
| `dsh-setup-error` | 装配失败页根节点 | `setup.tsx` → `loadable.tsx` | 已补 |
| `dsh-navbar-menu-popover` | 下拉弹层根节点（三个菜单共用，仅展开时挂载） | `navbar.tsx` 三处 `Dropdown.Popover` | 已补 |
| `dsh-navbar-item-<id>` | 菜单项（`<id>` 取 `Dropdown.Item` 的 `id`，如 `dsh-navbar-item-new-chat`） | `navbar.tsx` 各 `Dropdown.Item` | 已补 |

菜单内容一律按 testid 定位：全部菜单项用前缀选择器 `[data-testid^="dsh-navbar-item-"]` 收集，单个菜单项用 `navbarMenuItem(id)`；**不使用** `[role="menuitem"]` 之类的角色/层级选择器（`desktop.test.md` §5）。菜单项 id 也从 testid 反推，不再读 react-aria 的 `data-key`。

跨用例复用的常量统一收录于 `test/e2e/support/selectors.ts`（`01` 批次的选择器也已改引该模块）。

**菜单操作已抽出**：展开 / 收起 / 读取菜单的公共逻辑（含下面的清理口径）收敛在 `test/e2e/support/navbar-menu.ts`，由 `01` 与 `02` 共用。

**菜单清理口径**：菜单展开时 react-aria 会铺一层全屏 `data-testid="underlay"`（`position: fixed` + `pointer-events: auto`）接管外部点击，触发器和导航栏都被它遮住——再点一次触发器既不可靠（先被外部点击关掉、又被自身 press 打开），也过不了 WebdriverIO 的「被遮挡即不可点击」判定。收起一律用 `Escape`，且必须先等到 `document.activeElement` 的 `role` 为 `menu`（焦点未就位时按键会被丢掉，实测竞态）。

---

### 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `CONFIG_TABS` 四项 | `TC-DSK-L3-01-010` | 正向 | 定位结果归 `02` |
| 「帮助」「文件」菜单项集合 | `TC-DSK-L3-01-011`、`TC-DSK-L3-01-012` | 正向 | 各菜单项动作分散在 `01`/`02`/`09` |
| `tauriEnabled` 条件渲染 | `TC-DSK-L3-01-014` | 异常 | 插件增删即时生效依赖 `dsh-plugins-updated` 事件；暂缓（G-D01-6） |
| iframe 桥回报折叠状态 | `TC-DSK-L3-01-013` | 正向 | 暂缓（G-D01-7） |
| iframe 回调缺席时的禁用 | `TC-DSK-L3-01-015` | 异常 | 已接线；同批修复了 `webview.tsx` 无条件下发回调的问题 |
| 拖拽区（双击 / 触摸） | `TC-DSK-L3-01-016` | 边界 | 双击已接线（合成事件口径，G-D01-10）；触摸与笔输入的 `startDragging` 分支（`:190-199`）需真实触摸设备，**未覆盖** |
| 菜单弹层宽度与文本裁切 | `TC-DSK-L3-01-018` | 边界 | 只在 CSS 视口 < 768px 时暴露，用例自带缩窗口步骤（G-D01-12） |
| 禁用下载时的壳层形态 | `TC-DSK-L3-01-019` | 边界 | `DSH_E2E_DISABLE_DOWNLOAD=1` 下替代失败页；真实失败页（`dsh-setup-error`）由 `07` 批次覆盖 |
| macOS 原生全屏与原生菜单 | `TC-DSK-L3-01-017` | 低频 | 原生菜单 9 个动作（`:304-336`）逐项未覆盖，**已知盲区** |

---

### 缺口与假设

- **G-D01-6（阻塞）**：`dsh-tauri` 是随包分发的内置插件，每次启动由 `ensure_internal_plugins` 物化进当前档案（`src-tauri/src/service/plugin/internal/`），隔离 home 下**无法构造「未安装」档案**；`dsh-tauri` 还落在安全模式保留集里（`src-tauri/src/service/plugin/safe.rs`），卸载命令也走不通。TC-DSK-L3-01-014 需等 `06`/`06` 批次的插件安装/卸载夹具。
- **G-D01-7（阻塞）**：TC-DSK-L3-01-013 需要 iframe 已挂载并主动回报桥消息。iframe 挂载的前置是 `serviceHealthy`，即磁盘上已装好 Node + dsh 核心（`runtime_ready()` 为真）；`disableDownload` 下不可达，放开下载则要付出一次真实装配。该用例归 `04`（iframe 加载与 boot 桥）的 iframe 车道，届时可一并覆盖。若届时 `dsh-tauri` 客户端未装配，则改用注入脚本直接派发 `message` 事件，并注明这是对桥的模拟而非真实插件行为。
- **G-D01-8**：macOS 原生菜单（`macos-menu-action`）共 9 个动作，本套只覆盖「导航栏在全屏时隐藏」这一条平台差异，原生菜单本身**未覆盖**。
- **G-D01-9（已修复）**：`webview.tsx` 原先无条件下发 `onToggleSidebar`/`onNewChat`/`onOpenFolder`，导致 `navbar.tsx` 的 `isDisabled={onNewChat == null}`（`:396`）与 `onToggleSidebar != null`（`:351`）永不成立——预装/错误/加载态下「新聊天」「打开文件夹」是死按钮，与 `navbar.tsx:61-62` 声明的取舍相反。本批改为仅在 iframe 挂载（`serviceHealthy`）时下发回调，TC-DSK-L3-01-015 据此接线。
- **G-D01-10（已修复）**：`navbar.tsx` 原先在拖拽区同时挂了 `onDoubleClick`（网页侧 `toggleMaximize`）与 Tauri 原生的 `data-tauri-drag-region` 双击处理（`drag.js` 的 `internal_toggle_maximize`，其权限 `allow-internal-toggle-maximize` 由 `core:window:default` 授予）。真实双击会同时命中两侧，**两次切换互相抵消**——双击标题栏区域看不出任何变化。本批移除网页侧重复处理，只保留原生一侧；TC-DSK-L3-01-016 的步骤 4 即该修复的回归守卫。
- **G-D01-11（通道限制）**：embedded WebDriver 的 `doubleClick()` 不产生 `detail === 2` 的 `mousedown`，也不派发 `dblclick`（实测 `detail` 恒为 0、事件表里只有两次 `mousedown`）。真实鼠标双击在本通道无法合成，TC-DSK-L3-01-016 因此改用派发原生处理器依据的事件（同 G-D01-4 的处置口径）。
- **G-D01-12（已修复）**：三个 `Dropdown.Popover` 原先带 `w-5!`（`width: 1.25rem !important`），而 HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 里给 `min-width: 220px`。于是**视口 ≥ 768px 时 min-width 盖住 20px、菜单看着正常；视口 < 768px 时没有 min-width，菜单被压成 20px 宽的竖条**，所有菜单项文字被裁切（实测 175% 显示缩放、1280 物理宽窗口下 CSS 视口仅 732px，必然命中）。已改为壳层显式声明 `min-w-55`（220px，与 HeroUI 在 ≥48rem 下的默认一致），菜单宽度不再由视口决定；TC-DSK-L3-01-018 即该修复的回归守卫。
- **G-D01-13（已修复）**：`DSH_E2E_DISABLE_DOWNLOAD=1` 下装配必然失败在「找不到 dsh CLI」，壳层原先把它渲染成启动失败页，E2E 看起来像启动崩溃。现由 `RuntimeInfo::auto_download_disabled` 下传该开关，`setup.tsx` 据此渲染「下载已被环境禁用」页（同一个 `Loadable`，布局与失败页一致，只换文案与动作）。TC-DSK-L3-01-019 守门。
- **假设**：未标注平台的用例默认在 Windows（WebView2）执行；macOS 上「文件」「配置」「帮助」整组不渲染（`navbar.tsx:368`），`01` 批次全部用例以 `describe.skipIf(darwin)` 跳过，需改断言原生菜单。
- **本批运行形态**：以 `startDesktopApp({ disableDownload: true })` 启动，隔离 home 下应用停在「无 iframe 接收方」的状态——**渲染的是「下载已被环境禁用」页（G-D01-13），不是启动失败页**，导航栏照常渲染。`TC-DSK-L3-01-009`～`01-012` 只断言菜单结构，与该状态无关；其文档前置条件已相应改为「导航栏已渲染」。

---

## 3. 窗口控制与托盘

本文件区分两种「关闭」语义：**后台化**（隐藏到托盘，服务保持运行）与**退出**（完整退出，触发服务回收与几何保存）。`close_action` 设置决定右上角关闭按钮走哪一条；托盘菜单与「文件」菜单始终提供显式退出。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 窗口动作分发 `minimize`/`maximize`/`background` | `src/layout/components/navbar.tsx:174-188` |
| 「后台化」= `appWindow.hide()`（隐藏到托盘） | `src/layout/components/navbar.tsx:183-186` |
| 「关闭」菜单项与右上角关闭按钮同语义（隐藏到托盘） | `src/layout/components/navbar.tsx:229-232` |
| 「退出」菜单项 → `quit_app` | `src/layout/components/navbar.tsx:233-235`、`:249-257` |
| `quit_app` → `app_handle.exit(0)` | `src-tauri/src/desktop/window.rs:153-156` |
| 退出触发主窗口几何保存与服务回收 | `src-tauri/src/lib.rs:51`；`src-tauri/src/desktop/window.rs:152` |
| 「新建窗口」→ `create_app_window` | `src-tauri/src/desktop/window.rs:144-149` |
| 托盘菜单项 id：`open`（打开面板）/ `quit`（退出） | `src-tauri/src/desktop/builder.rs:185-186` |
| Linux 托盘单独实现（`tray-icon` + `ksni`） | `src-tauri/src/desktop/linux_tray.rs:42-53` |
| 关闭行为设置 `close_action`（`tray` / `quit`） | `src/ui/config/components/close-action.tsx:24`、`src/utils/close-action.ts` |
| 关闭行为写入走 `update_app_config`（后端归一化后落盘） | `src/ui/config/components/close-action.tsx:25-33` |
| 窗口几何持久化 | `src-tauri/src/config/window_state.rs`；`src-tauri/src/desktop/builder.rs:467` |
| 额外窗口与主窗口同标题、同尺寸 | `src-tauri/src/desktop/builder.rs:617-626` |

---

### 窗口按钮

### [P1] 验证最小化按钮最小化窗口

[Case ID] TC-DSK-L3-01-020
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:545-554`
[自动化] 待接线（`test/e2e/desktop/01-window-shell.e2e.ts`）
[前置条件] 窗口处于正常（非最小化）状态；平台非 macOS
[测试数据] 选择器 `dsh-navbar-window-minimize`
[测试步骤] 1. 点击最小化按钮。2. 等待窗口状态变化。3. 读取窗口最小化状态与进程存活状态。
[预期结果] 1. 点击被接受。2. 状态变化。3. 最小化状态为真；应用进程仍存活。
[清理] 恢复窗口；`DELETE /session/<id>`

### [P2] 验证关闭按钮按关闭行为隐藏到托盘

[Case ID] TC-DSK-L3-01-021
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:567-576`；`src/ui/config/components/close-action.tsx:24`
[自动化] 待接线（同上）
[前置条件] 设置中关闭行为为 `tray`（默认）；平台非 macOS
[测试数据] 选择器 `dsh-navbar-window-background`
[测试步骤] 1. 确认关闭行为为 `tray`。2. 点击后台化按钮。3. 等待窗口隐藏。4. 读取窗口可见性与进程状态。
[预期结果] 1. 确认为 `tray`。2. 点击被接受。3. 窗口隐藏。4. 窗口不可见；应用进程仍存活，服务仍在运行。
[清理] 通过托盘恢复窗口；`DELETE /session/<id>`

---

### 托盘与退出

### [P2] 验证「文件 → 退出」完整退出

[Case ID] TC-DSK-L3-01-022
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:249-257`、`:422-429`
[自动化] 待接线（同上）
[前置条件] 应用运行中；平台非 macOS
[测试数据] 菜单项 id `quit`；退出等待上限为测试侧参数（建议 30s）
[测试步骤] 1. 打开「文件」菜单并点击「退出」。2. 等待应用进程退出。3. 复查应用与 harness 进程。
[预期结果] 1. 点击被接受。2. 进程在等待上限内退出。3. 应用与 harness 进程均不再存在（无孤儿服务）。
[清理] 无

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-navbar-window-minimize` | 最小化按钮 | 待补 |
| `dsh-navbar-window-maximize` | 最大化按钮 | 待补 |
| `dsh-navbar-window-background` | 后台化（关闭）按钮 | 待补 |
| `dsh-config-close-action` | 「关闭按钮行为」下拉 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-01-023` | 验证窗口几何在重启后恢复（落盘与回读） | 纯逻辑断言，下沉单元测试层 |

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/navbar.tsx:545-554`` | `TC-DSK-L3-01-020` | 正向 |
| ``src/layout/components/navbar.tsx:567-576`；`src/ui/config/components/close-action.tsx:24`` | `TC-DSK-L3-01-021` | 正向 |
| ``src/layout/components/navbar.tsx:249-257`、`:422-429`` | `TC-DSK-L3-01-022` | 正向 |

---

### 缺口与假设

- **G-D01-14**：`TC-DSK-L3-01-022`（「文件 → 退出」）会终止应用，**无法在同一个 WDIO 会话内继续后续用例**。接线时该用例必须放在 Spec 末尾，或独立建会话。
- **G-D01-15**：托盘菜单的实际点击无法通过 WebDriver 完成（属系统托盘表面，见 `00-overview.md` G9）。可行路径是程序化触发菜单事件（`MenuEvent`），或由测试编排直接调用与菜单项绑定的同一处理函数。后者会退化为「不测菜单绑定」，须在实现时明确取舍。
- **G-D01-16**：`close_action` 的归一化逻辑（`normalizeCloseAction`）与后端整对象写入（`update_app_config`）之间存在覆盖风险，属单元测试职责（`test/archive/close-action.test.ts` 已有归档版本）。
- **假设**：托盘菜单项 id 为 `open` 与 `quit`（`builder.rs:185-186`），Linux 实现（`linux_tray.rs:48-49`）使用相同 id。
