# 壳层导航栏

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/02-shell-navigation.e2e.ts`
> 前置：`01-window-boot.md` 通过；`dist/` 已由 `vite build` 产出，Debug 二进制经 `tauri build --debug --no-bundle` 构建（必须带 custom-protocol，否则走 devUrl、页面为空）
> 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/02-shell-navigation.e2e.ts`

导航栏是本应用唯一常驻的壳层控件，同时承担窗口控制与三个下拉菜单。本文件的重点是**条件渲染的正确性**：依赖 iframe 或插件状态的入口在接收方缺席时必须消失或禁用，而不是留一个点了没反应的死按钮。

---

## 1. 事实基线

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
| 菜单展开时 react-aria 铺一层全屏 `data-testid="underlay"`（`position: fixed` + `pointer-events: auto`） | 实测，见 §4 清理口径 |
| 菜单弹层宽度由 HeroUI `.dropdown__popover` 决定（`@media (min-width: 48rem)` 下 `min-width: 220px`），壳层不得钉死 `width` | `src/layout/components/navbar.tsx:383`、`:440`、`:466` |

---

## 2. 菜单结构

### [P1] 验证导航栏根容器与三个菜单按钮存在

[Case ID] TC-DSK-L3-02-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 02；`src/layout/components/navbar.tsx:339-505`
[自动化] 是（`test/e2e/desktop/02-shell-navigation.e2e.ts`）
[前置条件] 应用已启动且导航栏已渲染（壳层常驻，与 harness 是否就绪无关）；平台非 macOS
[测试数据] 选择器 `dsh-navbar-root`、`dsh-navbar-menu-file`、`dsh-navbar-menu-config`、`dsh-navbar-menu-help`
[测试步骤] 1. 读取导航栏根容器。2. 依次读取三个菜单触发器。
[预期结果] 1. 根容器存在且可见。2. 三个菜单触发器均存在且可见。
[清理] `DELETE /session/<id>`

### [P2] 验证「配置」菜单包含四个面板入口

[Case ID] TC-DSK-L3-02-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:82-87`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 期望 id 顺序：`application`、`profiles`、`plugins`、`harness`；文案按设备语言取 `zh-CN`（应用/档案/插件/核心）或 `en-US`（Application/Profiles/Plugins/Harness）
[测试步骤] 1. 点击「配置」。2. 读取菜单项 id 集合与文本集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。3. 文本集合等于当前语言对应的期望值。
[清理] `DELETE /session/<id>`

### [P2] 验证「帮助」菜单包含四个入口

[Case ID] TC-DSK-L3-02-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:467-504`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 期望 id 顺序：`copy-run-logs`、`check-update`、`about`、`documentation`
[测试步骤] 1. 点击「帮助」。2. 读取菜单项 id 集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。
[清理] `DELETE /session/<id>`

### [P2] 验证「文件」菜单包含五个入口

[Case ID] TC-DSK-L3-02-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:385-426`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 期望 id 顺序：`new-window`、`new-chat`、`open-folder`、`close`、`quit`
[测试步骤] 1. 点击「文件」。2. 读取菜单项 id 集合。
[预期结果] 1. 菜单展开。2. id 集合与顺序等于期望值。
[清理] `DELETE /session/<id>`

---

## 3. 依赖状态的条件渲染

### [P2] 验证侧边栏折叠图标随 iframe 回报切换

[Case ID] TC-DSK-L3-02-005
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:41-45`；`src/layout/components/navbar.tsx:351-366`
[自动化] 否（暂缓，见 §8 G-D02-2）
[前置条件] 当前档案已安装 `dsh-tauri`；应用处于 `ready` 且 iframe 已挂载
[测试数据] 桥消息 `dsh://sidebar:collapsed`，`collapsed` 依次取 `false`、`true`
[测试步骤] 1. 由 iframe 侧回报 `collapsed=false`，读取开关的无障碍标签。2. 回报 `collapsed=true`，再次读取。
[预期结果] 1. 标签为「收起侧边栏」语义。2. 标签切换为「展开侧边栏」语义，图标随之变化。
[清理] 复位 `collapsed=false`；`DELETE /session/<id>`

### [P3] [反向] 验证 dsh-tauri 未安装时侧边栏开关不渲染

[Case ID] TC-DSK-L3-02-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/navbar.tsx:173`、`:351`
[自动化] 否（暂缓，见 §8 G-D02-1）
[前置条件] 当前档案未安装 `dsh-tauri`；应用处于 `ready`
[测试数据] 选择器 `dsh-navbar-sidebar-toggle`
[测试步骤] 1. 确认插件列表中不含 `dsh-tauri`。2. 读取侧边栏开关节点。
[预期结果] 1. 列表中确实不含 `dsh-tauri`。2. 开关节点不存在（无死按钮）。
[清理] 恢复插件状态（若测试改动了档案）；`DELETE /session/<id>`

### [P3] [反向] 验证无 iframe 接收方时依赖项禁用

[Case ID] TC-DSK-L3-02-007
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

## 4. 拖拽区、缩放与平台差异

### [P4] 验证拖拽区双击切换最大化（非 macOS）

[Case ID] TC-DSK-L3-02-008
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/navbar.tsx:520-525`；`tauri-2.11.5/src/window/scripts/drag.js:78-105`
[自动化] 是（同上）
[前置条件] 平台为 Windows 或 Linux；窗口当前非最大化
[测试数据] 拖拽区选择器 `dsh-navbar-drag-region`；最大化状态读 `plugin:window|is_maximized`（label `main`）
[测试步骤] 1. 读取最大化状态。2. 在拖拽区派发 `mousedown`（`detail=2`，原生处理器判定双击的依据）。3. 再次读取。4. 再派发 `dblclick`，确认状态不再变化（网页侧不得重复处理）。5. 还原窗口。
[预期结果] 1. 状态为未最大化。2. 双击序列被接受。3. 状态变为已最大化。4. `dblclick` 不产生第二次切换。5. 状态回到未最大化。
[清理] 派发一次 `mousedown(detail=2)` 还原为未最大化；`DELETE /session/<id>`

> **通道限制（G-D02-5）**：embedded WebDriver 的 `doubleClick()` 产生的 `mousedown` 的 `detail` 恒为 0，且完全不派发 `dblclick`——Tauri 原生拖拽区赖以判定双击的 `detail === 2` 永远命中不了。因此步骤 2/4 直接派发原生处理器实际依据的两个事件，而非合成输入；真实鼠标双击本身未在本通道覆盖。

### [P5] 验证 macOS 原生全屏时整条导航栏隐藏

[Case ID] TC-DSK-L3-02-009
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

[Case ID] TC-DSK-L3-02-010
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] 批次 02；`src/layout/components/navbar.tsx:383`、`:440`、`:466`（三个 `Dropdown.Popover`）
[自动化] 是（`test/e2e/desktop/02-shell-navigation.e2e.ts`）
[前置条件] 导航栏已渲染；平台非 macOS
[测试数据] 窗口缩到 720×640（落点 CSS 视口随窗口管理器与 DPI 浮动，实测本机 707px、CI 更窄，用例只要求 < 768px）；依次使用「文件」「配置」「帮助」三个菜单
[测试步骤] 1. 把窗口缩到 720×640。2. 确认 CSS 视口宽度 < 768px。3. 依次打开三个菜单，读取弹层宽度与每个菜单项的 `scrollWidth`/`clientWidth` 及渲染宽度。4. 恢复窗口尺寸。
[预期结果] 1. 窗口缩小成功。2. CSS 视口 < 768px（复现条件成立）。3. 每个菜单项的 `scrollWidth <= clientWidth + 1`（文本未被裁切）且渲染宽度 > 0，弹层宽度 > 0。4. 窗口恢复为 1280×840。
[清理] 恢复窗口尺寸；`DELETE /session/<id>`

> **为什么必须缩窗口**：HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 下才有 `min-width: calc(var(--spacing) * 55)`（220px）。视口 ≥ 768px 时该 min-width 会盖住任何被钉死的 `width`，缺陷被掩盖；只有视口 < 768px 才能暴露。高显示缩放（如 175%）下 1280 物理宽的窗口只有约 732 CSS 像素，用户日常就是这个形态——见 G-D02-7。
>
> **宽度两侧都有约束**：壳层显式声明 `min-w-55`（220px，与 HeroUI 在 ≥48rem 下的默认一致），HeroUI 另给 `max-width: 48svw`——视口极窄时上限先咬住（CI 上实测弹层 199px，文本仍未裁切）。因此用例只断言「文本不被裁切」这一不变量：钉死宽度的回归必然表现为裁切，仍会被捕获。

## 5. 禁用下载时的壳层形态

本批统一以 `startDesktopApp({ disableDownload: true })` 启动（`DSH_E2E_DISABLE_DOWNLOAD=1`）：装配必然停在「找不到 dsh CLI」，但这是被刻意截断的结果。壳层据此渲染**禁用页**而不是启动失败页，布局与失败页同源（同一个 `Loadable`），只换文案与动作。

### [P4] 验证禁用下载时展示禁用页而非启动失败页

[Case ID] TC-DSK-L3-02-011
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] 批次 02；`src/layout/components/setup.tsx`（`disabled` 分支）、`src-tauri/src/config/runtime.rs:596`（`RuntimeInfo::auto_download_disabled`）
[自动化] 是（`test/e2e/desktop/02-shell-navigation.e2e.ts`）
[前置条件] 以 `DSH_E2E_DISABLE_DOWNLOAD=1` 启动（本批固定形态）
[测试数据] 选择器 `dsh-setup-disabled` / `dsh-setup-error`；期望标题按语言取「下载已被环境禁用」或 `Downloads disabled by environment`；说明文案须含 `DSH_E2E_DISABLE_DOWNLOAD=1`
[测试步骤] 1. 等待禁用页出现。2. 读取页面文本。3. 检查失败页节点是否存在。
[预期结果] 1. 禁用页在超时内出现且可见。2. 文本含当前语言的标题与 `DSH_E2E_DISABLE_DOWNLOAD=1`。3. 失败页节点不存在。
[清理] `DELETE /session/<id>`

> **口径**：`disableDownload` 只截断网络下载，装配与失败路径照旧执行（`desktop.test.md` §6.1）；壳层只是不再把「找不到 dsh CLI」呈现为故障。因此本批其余用例（菜单结构、禁用项、拖拽区）仍按真实观测结果断言。
>
> **缓存必须空**：共享下载缓存里若已有一份可用的 Node/dsh/pnpm，`runtime_ready()` 会为真，装配流程随之分叉（不再停在「找不到 dsh CLI」），禁用页就不会出现。因此 `startDesktopApp({ disableDownload: true })` 未显式指定缓存时，脚手架改用本次运行独占的空缓存目录，收尾随 scratch home 一起删除——禁用页与「无 iframe 接收方」两类断言都不再依赖上一次运行的遗留。

## 6. 选择器契约

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

**菜单操作已抽出**：展开 / 收起 / 读取菜单的公共逻辑（含下面的清理口径）收敛在 `test/e2e/support/navbar-menu.ts`，由 `02` 与 `03` 共用。

**菜单清理口径**：菜单展开时 react-aria 会铺一层全屏 `data-testid="underlay"`（`position: fixed` + `pointer-events: auto`）接管外部点击，触发器和导航栏都被它遮住——再点一次触发器既不可靠（先被外部点击关掉、又被自身 press 打开），也过不了 WebdriverIO 的「被遮挡即不可点击」判定。收起一律用 `Escape`，且必须先等到 `document.activeElement` 的 `role` 为 `menu`（焦点未就位时按键会被丢掉，实测竞态）。

---

## 7. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `CONFIG_TABS` 四项 | `TC-DSK-L3-02-002` | 正向 | 定位结果归 `03` |
| 「帮助」「文件」菜单项集合 | `TC-DSK-L3-02-003`、`TC-DSK-L3-02-004` | 正向 | 各菜单项动作分散在 `12`/`13`/`16` |
| `tauriEnabled` 条件渲染 | `TC-DSK-L3-02-006` | 异常 | 插件增删即时生效依赖 `dsh-plugins-updated` 事件；暂缓（G-D02-1） |
| iframe 桥回报折叠状态 | `TC-DSK-L3-02-005` | 正向 | 暂缓（G-D02-2） |
| iframe 回调缺席时的禁用 | `TC-DSK-L3-02-007` | 异常 | 已接线；同批修复了 `webview.tsx` 无条件下发回调的问题 |
| 拖拽区（双击 / 触摸） | `TC-DSK-L3-02-008` | 边界 | 双击已接线（合成事件口径，G-D02-5）；触摸与笔输入的 `startDragging` 分支（`:190-199`）需真实触摸设备，**未覆盖** |
| 菜单弹层宽度与文本裁切 | `TC-DSK-L3-02-010` | 边界 | 只在 CSS 视口 < 768px 时暴露，用例自带缩窗口步骤（G-D02-7） |
| 禁用下载时的壳层形态 | `TC-DSK-L3-02-011` | 边界 | `DSH_E2E_DISABLE_DOWNLOAD=1` 下替代失败页；真实失败页（`dsh-setup-error`）由 `11` 批次覆盖 |
| macOS 原生全屏与原生菜单 | `TC-DSK-L3-02-009` | 低频 | 原生菜单 9 个动作（`:304-336`）逐项未覆盖，**已知盲区** |

---

## 8. 缺口与假设

- **G-D02-1（阻塞）**：`dsh-tauri` 是随包分发的内置插件，每次启动由 `ensure_internal_plugins` 物化进当前档案（`src-tauri/src/service/plugin/internal/`），隔离 home 下**无法构造「未安装」档案**；`dsh-tauri` 还落在安全模式保留集里（`src-tauri/src/service/plugin/safe.rs`），卸载命令也走不通。TC-DSK-L3-02-006 需等 `08`/`09` 批次的插件安装/卸载夹具。
- **G-D02-2（阻塞）**：TC-DSK-L3-02-005 需要 iframe 已挂载并主动回报桥消息。iframe 挂载的前置是 `serviceHealthy`，即磁盘上已装好 Node + dsh 核心（`runtime_ready()` 为真）；`disableDownload` 下不可达，放开下载则要付出一次真实装配。该用例归 `06`（iframe 加载与 boot 桥）的 iframe 车道，届时可一并覆盖。若届时 `dsh-tauri` 客户端未装配，则改用注入脚本直接派发 `message` 事件，并注明这是对桥的模拟而非真实插件行为。
- **G-D02-3**：macOS 原生菜单（`macos-menu-action`）共 9 个动作，本套只覆盖「导航栏在全屏时隐藏」这一条平台差异，原生菜单本身**未覆盖**。
- **G-D02-4（已修复）**：`webview.tsx` 原先无条件下发 `onToggleSidebar`/`onNewChat`/`onOpenFolder`，导致 `navbar.tsx` 的 `isDisabled={onNewChat == null}`（`:396`）与 `onToggleSidebar != null`（`:351`）永不成立——预装/错误/加载态下「新聊天」「打开文件夹」是死按钮，与 `navbar.tsx:61-62` 声明的取舍相反。本批改为仅在 iframe 挂载（`serviceHealthy`）时下发回调，TC-DSK-L3-02-007 据此接线。
- **G-D02-5（已修复）**：`navbar.tsx` 原先在拖拽区同时挂了 `onDoubleClick`（网页侧 `toggleMaximize`）与 Tauri 原生的 `data-tauri-drag-region` 双击处理（`drag.js` 的 `internal_toggle_maximize`，其权限 `allow-internal-toggle-maximize` 由 `core:window:default` 授予）。真实双击会同时命中两侧，**两次切换互相抵消**——双击标题栏区域看不出任何变化。本批移除网页侧重复处理，只保留原生一侧；TC-DSK-L3-02-008 的步骤 4 即该修复的回归守卫。
- **G-D02-6（通道限制）**：embedded WebDriver 的 `doubleClick()` 不产生 `detail === 2` 的 `mousedown`，也不派发 `dblclick`（实测 `detail` 恒为 0、事件表里只有两次 `mousedown`）。真实鼠标双击在本通道无法合成，TC-DSK-L3-02-008 因此改用派发原生处理器依据的事件（同 G-D01-4 的处置口径）。
- **G-D02-7（已修复）**：三个 `Dropdown.Popover` 原先带 `w-5!`（`width: 1.25rem !important`），而 HeroUI 的 `.dropdown__popover` 只在 `@media (min-width: 48rem)` 里给 `min-width: 220px`。于是**视口 ≥ 768px 时 min-width 盖住 20px、菜单看着正常；视口 < 768px 时没有 min-width，菜单被压成 20px 宽的竖条**，所有菜单项文字被裁切（实测 175% 显示缩放、1280 物理宽窗口下 CSS 视口仅 732px，必然命中）。已改为壳层显式声明 `min-w-55`（220px，与 HeroUI 在 ≥48rem 下的默认一致），菜单宽度不再由视口决定；TC-DSK-L3-02-010 即该修复的回归守卫。
- **G-D02-8（已修复）**：`DSH_E2E_DISABLE_DOWNLOAD=1` 下装配必然失败在「找不到 dsh CLI」，壳层原先把它渲染成启动失败页，E2E 看起来像启动崩溃。现由 `RuntimeInfo::auto_download_disabled` 下传该开关，`setup.tsx` 据此渲染「下载已被环境禁用」页（同一个 `Loadable`，布局与失败页一致，只换文案与动作）。TC-DSK-L3-02-011 守门。
- **假设**：未标注平台的用例默认在 Windows（WebView2）执行；macOS 上「文件」「配置」「帮助」整组不渲染（`navbar.tsx:368`），`02` 批次全部用例以 `describe.skipIf(darwin)` 跳过，需改断言原生菜单。
- **本批运行形态**：以 `startDesktopApp({ disableDownload: true })` 启动，隔离 home 下应用停在「无 iframe 接收方」的状态——**渲染的是「下载已被环境禁用」页（G-D02-8），不是启动失败页**，导航栏照常渲染。TC-DSK-L3-02-001～004 只断言菜单结构，与该状态无关；其文档前置条件已相应改为「导航栏已渲染」。
