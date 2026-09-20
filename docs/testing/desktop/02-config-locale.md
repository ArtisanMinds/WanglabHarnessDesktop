# 配置管理与多语言主题

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/02-config-locale.e2e.ts`（已接线）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/02-config-locale.e2e.ts`

配置对话框是壳层唯一的模态容器，语言与主题是全局状态，应用设置是落盘配置的入口。

---

## 1. 配置对话框

配置对话框是四个面板（应用 / 档案 / 插件 / 核心）的唯一容器，`02`–`09` 的多数用例都以「对话框已打开在某个面板」为前置。本文件只验证**容器的行为**，各面板的内部行为归各自文件。

本批整批走**真实装配车道**（不置 `disableDownload`）：`TC-DSK-L3-02-013` 要验 iframe，而 iframe 只在 `serviceHealthy` 时渲染，因此整批统一按真实装配启动，`beforeAll` 里过一次预装引导、等 iframe 挂载并关掉 dsh 的引导弹层（见 `test/e2e/support/onboarding.ts`）。整批**共用一个应用实例**（一次 `startDesktopApp()`）。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `ConfigTab` 值域 `application`/`profiles`/`plugins`/`harness` | `src/ui/dialog/config.tsx:20` |
| 打开时定位面板来自 `props.tab`，缺省 `application` | `src/ui/dialog/config.tsx:45` |
| 导航项顺序：应用 / 档案 / 插件 / 核心 | `src/ui/dialog/config.tsx:38-43` |
| 导航项选中态由 `aria-current` 表达（选中 `"true"`，未选中不渲染该属性） | `src/ui/dialog/config.tsx:70` |
| 面板由 `Switch`/`Case` 按 `activeTab` 渲染，四个面板互斥 | `src/ui/dialog/config.tsx:90-103` |
| 对话框尺寸 `w-[800px]`，上限 `calc(100vw-48px)` × `min(720px, calc(100vh-96px))` | `src/ui/dialog/config.tsx:54` |
| 面板滚动容器 `overflow-auto min-h-0` | `src/ui/dialog/config.tsx:89` |
| 关闭触发器 `Modal.CloseTrigger`；`onOpenChange` 走 `disclosure.cancel` | `src/ui/dialog/config.tsx:51`、`:55` |
| 面板标题由各面板自持的 `Panel.Header` 给出（四处均带 `testId`） | `src/ui/config/debug.tsx:184`、`profile.tsx:249`、`plugin.tsx:399`、`core.tsx:300` |
| `Panel.Header` 的 `testId` 只作用于 `title` 为字符串时的标题元素 | `src/components/panel.tsx:22-44` |
| 异常插件角标 = `plugins.filter(p => p.error != null).length` | `src/ui/dialog/config.tsx:36`、`:79-83` |
| 命令式收起钩子 `config.dialog.hidden` | `src/ui/dialog/config.tsx:48`、`src/config/hooks.ts:26` |
| 导航栏「配置」菜单逐项传入 `tab` | `src/layout/components/navbar.tsx:447-458` |
| 不传 `tab` 的调用点只有 macOS 原生菜单 | `src/layout/components/navbar.tsx:263-264`、`:309` |
| 主窗口默认 `inner_size(1280, 840)` 是**物理**像素，CSS 视口随 dpr 变化（dpr=1.75 时实测 732×481） | `src-tauri/src/desktop/builder.rs:485` |

---

### 打开、定位与切换

### [P1] 验证「配置 → 应用」打开对话框并默认定位「应用」面板

[Case ID] TC-DSK-L3-02-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 02；`src/ui/dialog/config.tsx:45`、`:51`
[自动化] 是（`test/e2e/desktop/02-config-locale.e2e.ts`）
[前置条件] 对话框当前未打开
[测试数据] 选择器 `dsh-config-dialog`、`dsh-config-nav-application`、`dsh-config-panel-title`
[测试步骤] 1. 点击导航栏「配置」并选择「应用」。2. 读取对话框可见性。3. 读取「应用」导航项选中态。4. 读取当前面板标题。
[预期结果] 1. 菜单项被点击。2. 对话框存在且可见。3. 「应用」导航项为选中态，其余三项非选中。4. 面板标题为「应用」面板标题且非空。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P2] 验证左侧导航可切换四个面板

[Case ID] TC-DSK-L3-02-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/dialog/config.tsx:38-43`、`:64-86`、`:90-103`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 四个导航项：`application`、`profiles`、`plugins`、`harness`；选中态读 `aria-current`
[测试步骤] 1. 依次点击四个导航项。2. 每次点击后读取选中态与面板标题。
[预期结果] 1. 四次点击均被接受。2. 每次只有被点击项为选中态。3. 面板标题与导航项一一对应。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P2] 验证从导航栏直接定位到指定面板

[Case ID] TC-DSK-L3-02-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:447-458`；`src/ui/dialog/config.tsx:45`
[自动化] 是（同上）
[前置条件] 对话框当前未打开
[测试数据] 目标面板 `profiles`；其余三个面板各执行一次
[测试步骤] 1. 点击导航栏「配置 → 档案」。2. 读取对话框可见性与当前面板标题。3. 对 `plugins`、`harness`、`application` 重复步骤 1–2。
[预期结果] 1. 每次菜单项被点击。2. 每次对话框可见且直接定位到目标面板（不先经过「应用」面板）。
[清理] 关闭对话框；`DELETE /session/<id>`

---

### 关闭与收起

### [P2] 验证关闭触发器关闭对话框

[Case ID] TC-DSK-L3-02-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/dialog/config.tsx:51`、`:55`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 关闭触发器 `dsh-config-dialog-close`
[测试步骤] 1. 点击关闭触发器。2. 等待对话框消失。3. 再次点击导航栏「配置 → 应用」。
[预期结果] 1. 触发器被点击。2. 对话框在超时内不可见。3. 对话框可再次打开，且默认仍定位「应用」（不残留上次面板）。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P3] 验证服务重启前对话框被命令式收起

[Case ID] TC-DSK-L3-02-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/dialog/config.tsx:48`；`src/config/hooks.ts`（`config.dialog.hidden`）
[自动化] 否（暂缓，见「缺口与假设」G-D02-4）
[前置条件] TC-DSK-L3-02-001 通过；服务处于运行中
[测试数据] 触发源：服务重启流程
[测试步骤] 1. 确认对话框可见。2. 在「应用」面板点击「重启」触发服务重启。3. 等待重启流程启动后读取对话框可见性。
[预期结果] 1. 对话框可见。2. 重启被触发。3. 对话框已收起（不可见），无需用户手动关闭。
[清理] 等待服务恢复健康；`DELETE /session/<id>`

---

### 角标与边界

### [P3] 验证存在异常插件时「插件」导航显示角标数量

[Case ID] TC-DSK-L3-02-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/dialog/config.tsx:36`、`:79-83`；issue #399
[自动化] 否（暂缓，见「缺口与假设」G-D02-1）
[前置条件] 已构造至少 1 个带 `error` 字段的插件（可由运行期插件异常上报构造，见 `06`）
[测试数据] 异常插件数量 `N`（N ≥ 1）；选择器 `dsh-config-nav-plugins-badge`
[测试步骤] 1. 确认插件列表中 `error != null` 的条目数为 N。2. 打开配置对话框。3. 读取「插件」导航项的角标文本。4. 读取其余三项的角标存在性。
[预期结果] 1. 确认为 N。2. 对话框打开。3. 角标存在且文本等于 `N`。4. 其余三项不存在角标。
[清理] 清除构造的插件异常；关闭对话框；`DELETE /session/<id>`

### [P4] 验证对话框尺寸不超出视口

[Case ID] TC-DSK-L3-02-007
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/ui/dialog/config.tsx:54`、`:89`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-02-001 通过
[测试数据] 期望上限 = 视口宽 − 48px、视口高 − 96px（按当前视口实测）；窄视口取 720×640（CSS 视口 707×632 @dpr 1.75）
[测试步骤] 1. 读取视口尺寸。2. 等对话框尺寸稳定后读取边界矩形。3. 把窗口缩到窄视口后重复步骤 1–2，并读取面板滚动容器的 `overflow-y`。
[预期结果] 1. 读取成功。2. 宽不超过视口宽减 48px，高不超过视口高减 96px。3. 窄视口下仍满足该上限，页面总高不超过视口（溢出由内部滚动容器接管）。
[清理] 恢复窗口尺寸；关闭对话框；`DELETE /session/<id>`

---

### 选择器契约

常量登记在 `test/e2e/support/selectors.ts`（`CONFIG_*`）；用例内禁止出现字面量选择器。

| `data-testid` | 元素 | 位置 | 状态 |
| --- | --- | --- | --- |
| `dsh-config-dialog` | `Modal.Dialog` 根节点 | `config.tsx:54` | 已补 |
| `dsh-config-dialog-close` | `Modal.CloseTrigger` | `config.tsx:55` | 已补 |
| `dsh-config-nav-application` | 左侧「应用」导航项 | `config.tsx:69` | 已补 |
| `dsh-config-nav-profiles` | 左侧「档案」导航项 | `config.tsx:69` | 已补 |
| `dsh-config-nav-plugins` | 左侧「插件」导航项 | `config.tsx:69` | 已补 |
| `dsh-config-nav-harness` | 左侧「核心」导航项 | `config.tsx:69` | 已补 |
| `dsh-config-nav-plugins-badge` | 「插件」导航项角标 | `config.tsx:80` | 已补 |
| `dsh-config-panel-body` | 右侧面板滚动容器 | `config.tsx:89` | 已补 |
| `dsh-config-panel-title` | 当前面板标题 | `debug.tsx:184`、`profile.tsx:249`、`plugin.tsx:399`、`core.tsx:300` | 已补 |

**选中态不是 `data-testid`**：导航项选中态由 `aria-current` 承载（`config.tsx:70`，选中为 `"true"`、未选中不渲染该属性），选择器常量登记为 `CONFIG_NAV_SELECTED_ATTR`。选中态是属性而非独立元素，用例不得依赖 `bg-background-secondary` 高亮类名。

面板标题取「被渲染的那个面板」自持的 `Panel.Header`：四个面板各带同一 `dsh-config-panel-title`，由 `Switch`/`Case` 保证同时只有一个在 DOM 中，用例据此断言面板落点（顺带守住「互斥渲染」这一事实）。

---

### 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `props.tab` 定位语义 | `TC-DSK-L3-02-001`、`TC-DSK-L3-02-003` | 正向 | 未传入 `tab` 时的缺省行为无 UI 入口（G-D02-5） |
| 四面板切换 | TC-DSK-L3-02-002 | 正向 | 各面板内容归 `02`/`03`/`06`/`05` |
| 关闭路径 | TC-DSK-L3-02-004 | 正向 | 点击遮罩关闭、Esc 关闭未单独覆盖（同一 `disclosure.cancel` 通路，G-D02-2） |
| `config.dialog.hidden` 命令式收起 | TC-DSK-L3-02-005 | 异常 | 暂缓；「重启」触发源需服务运行中，「退出」触发源未覆盖 |
| 异常角标 | TC-DSK-L3-02-006 | 异常 | 暂缓；依赖 `06` 的异常构造能力 |
| 尺寸上限 | TC-DSK-L3-02-007 | 边界 | 只验几何上限与溢出归属；内容超出容器高度时的滚动可用性未覆盖（G-D02-3） |

---

### 缺口与假设

- **G-D02-1**：TC-DSK-L3-02-006 依赖「带 `error` 字段的插件」这一夹具。当前唯一可用的构造路径是让 iframe 上报 `dsh://plugin-error`（`src/layout/components/iframe.tsx:94`），需要 iframe 环境可用；本批不具备该夹具，用例**暂缓**。
- **G-D02-2**：关闭路径有多条（关闭触发器、遮罩点击、Esc、`onOpenChange`），本文件只覆盖关闭触发器。其余三条走同一 `disclosure.cancel` 通路，按「等价候选合并」不重复建用例；若后续发现行为分叉，再拆。
- **G-D02-3**：对话框内部滚动的**可用性**未覆盖（需构造内容高度超过 `min(720px, calc(100vh-96px))` 的面板状态）。TC-DSK-L3-02-007 只验到「窄视口下溢出归属内部滚动容器」（`overflow-y: auto` 且页面未被撑高），未验「内容确实溢出时能滚到末尾」。
- **G-D02-4**：TC-DSK-L3-02-005 的「重启」按钮仅在 `serviceRunning` 时渲染，用例需全装配就绪的车道（含联网下载 Node / dsh / pnpm），代价与批次 02 的容器范围不匹配，用例**暂缓**。
- **G-D02-5**：`props.tab` 的缺省值 `application`（`config.tsx:45`）在非 macOS 平台无 UI 入口——唯一不传 `tab` 的调用点是 macOS 原生菜单 `desktop-config`（`navbar.tsx:309`），而本套件整体 `describe.skipIf(darwin)`。该缺省分支只由「配置 → 应用」这条等价路径间接覆盖。
- **实现侧变更**：「应用」面板原本是四个面板中唯一没有标题的（其余三个各自渲染 `Panel.Header`），本批为满足 `dsh-config-panel-title` 契约给它补上了 `Panel.Header`（`src/ui/config/debug.tsx:184`），并让 `Panel.Header.description` 变为可选。这是本批唯一的可见 UI 变更。
- **G-D02-6**：HeroUI 的 `modal__container` 带**入场缩放动画**（`matrix3d(scale)`，起手约 1.03 再收到 1）。动画未结束时 `getBoundingClientRect()` 会把对话框整体读大最多 ~3%——实测 CSS 宽度恰好等于上限 684px 时被读成 705.6px，从而把「恰好顶到 `max-w`」误判为溢出。几何类断言必须先等尺寸稳定（`waitForDialogSettled()`：两次采样差 < 0.5px）。`02`–`09` 凡涉及对话框几何的断言都需同样处理。
- **G-D02-7**：CI（windows-2025 runner）上配置对话框偶发在打开后 ~100–200ms 被收起，`document.querySelector('dsh-config-dialog')` 连续 10s 返回 `null`（`Number.NaN` 经 WebDriver 序列化成 `null`），已取到的 `dsh-config-nav-*` 句柄变成游离节点（`checkVisibility` 返回 `false`、`getComputedStyle().display === ''`）。本地（dpr 1.75）无法复现。已知的两处用例侧诱因已缓解：① `closeDialog()` 原先只等 `isDisplayed()` 为假就返回，此时 overlastic 的退场窗口（`duration = 300`）尚未走完、`vanish()` 未执行，紧接着重开会与上一个实例的卸载竞争——现在改为等节点**从 DOM 卸载**并额外排空 400ms；② `waitForClickable()` 只认首次取到的句柄，节点被替换后必然轮询到超时——导航项点击改为每轮重新定位。`openConfigTab()` 另对「打开后立刻被收起」保留一次重试（仓库「少量重试」约定）。失败信息现在带现场快照（`pageMark`/`navbar`/`disabledPage`/`url`），用于下一轮区分「弹层被收起」与「webview 被重载」。
- **假设**：`Modal` 的 `onOpenChange` 在 Esc 与遮罩点击时都会触发 `cancel`；该假设来自 HeroUI Modal 的通用行为，未在源码中逐行确认。

---

## 2. 语言与主题

语言与主题是壳层的两个全局状态。语言的写入有三条通路（`localStorage`、setting store、后端 `set_language`），主题的真值来自后端 `get_dsh_theme` 并由系统偏好折算。本文件验证**即时生效**与**跨重启持久化**两条主线。

本模块与「配置对话框」共用同一个应用实例与同一条**真实装配车道**（不置 `disableDownload`）。语言与主题本身是壳层状态，本不依赖装配完成；本批统一走真实车道只是为了 `TC-DSK-L3-02-013` 的 iframe 前置（见「缺口与假设」G-D02-12）。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 语言持久化 key `deepseek-harness-desktop-language` | `src/i18n/index.detector.ts:7` |
| 探测优先级：localStorage → setting store → 浏览器语言（`zh*` → `zh-CN`，否则 `en-US`） | `src/i18n/index.detector.ts:12-32` |
| 切换语言写入 localStorage + store + `set_language`（后端写入失败只告警） | `src/i18n/index.detector.ts:34-40` |
| i18n 使用扁平 dot-notation key（`keySeparator`/`nsSeparator` 均为 `false`） | `src/i18n/index.ts:19-20` |
| 语言下拉：`Select.Trigger` + 两个 `ListBox.Item`（`id` 为 `zh-CN`/`en-US`），`selectedKey={i18n.language}` | `src/ui/config/debug.tsx:357-375` |
| 触发器文本 = 所选选项的渲染文本（`Select.Value`），即「中文」/「English」 | `src/ui/config/debug.tsx:364-367` |
| 主题偏好来源 `get_dsh_theme`（`dark`/`light`/`system`） | `src/hooks/use-theme-adaptive.ts:6` |
| 显式偏好优先，`system` 与「偏好尚未取到」都按 `usePreferredDark` 折算后写入 `document.documentElement.dataset.theme` | `src/hooks/use-theme-adaptive.ts:8-12` |
| 根节点 `data-theme` 的真值是 `dshStyle.colorScheme \|\| 折算后的偏好`（DSH 侧可覆盖） | `src/hooks/use-theme-adaptive.ts:7`、`:11` |
| `get_dsh_theme` 读 `<dsh data>/settings.yaml` 的 `ui-theme.preference`，缺失/解析失败回退 `DEFAULT_THEME`＝`System`（跟随系统） | `src-tauri/src/config/theme.rs:18-23`、`:27-37` |
| 主题自适应在壳层根组件挂载 | `src/layout/index.tsx:48` |
| iframe 只在 `serviceHealthy` 时渲染，重建只由 `harness.iframeKey` 驱动 | `src/layout/components/iframe.tsx:188-196` |
| 首次装配的「安装推荐插件」引导：`preinstall_done` 为假或 preset 指纹变更时出现，装完/跳过后才拉起服务 | `src-tauri/src/service/plugin/preset.rs:532-545`、`src/layout/components/setup-preinstall.tsx:284-314` |
| 导航栏装饰层镜像 dsh 遮罩的样式；遮罩铺满时该层**就该**盖住导航栏，**不加** `pointer-events-none`——dsh 有模态期间壳层按设计不可点 | `src/layout/components/navbar.tsx:536-541`、`packages/dsh-tauri/src/client/register/style.utils.ts:11-23` |
| E2E 帧上下文走 WebView2 原生 `ICoreWebView2Frame2::ExecuteScript`（跨域可用），而非上游的 `contentWindow.eval` 模拟 | `src-tauri/vendor/tauri-plugin-wdio-webdriver/src/platform/windows.rs`、`src-tauri/vendor/tauri-plugin-wdio-webdriver/PATCH.md` |
| WebView2 profile 目录 = `app_local_data_dir()/EBWebView[-dev]`，E2E 经 `DSH_E2E_WEBVIEW_DATA_DIR` 覆盖到 scratch home | `src-tauri/src/desktop/builder.rs:78-95`、`src-tauri/src/config/constants.rs:131` |
| E2E 编排：`DSH_E2E_WEBVIEW_DATA_DIR`、`homeDir`（复用隔离根）、`resetStore`、`stop({ keepHome })` | `test/e2e/support/desktop-host.ts:96-98`、`:113`、`:143`、`:164`、`:206` |

---

### 语言切换

### [P1] 验证语言切换为 English 后壳层文案即时变更

[Case ID] TC-DSK-L3-02-008
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 02；`src/ui/config/debug.tsx:357-375`；`src/i18n/index.detector.ts:34-40`
[自动化] 是（`test/e2e/desktop/02-config-locale.e2e.ts`）
[前置条件] 配置对话框已打开在「应用」面板；当前语言为 `zh-CN`
[测试数据] 目标语言 `en-US`；观察点 `dsh-navbar-menu-config` 的 `aria-label`（与可见文本同源，均为 `app.config`）
[测试步骤] 1. 读取观察点标签。2. 在语言下拉中选择 `en-US`。3. 等同一标签变为英文文案。4. 读取语言下拉当前值与 `localStorage`。
[预期结果] 1. 标签为「配置」。2. 选择被接受。3. 标签变为「Config」（不刷新页面即生效）。4. 下拉文本为「English」，`localStorage` 为 `en-US`。
[清理] 切回 `zh-CN`；关闭对话框；`DELETE /session/<id>`

### [P2] 验证语言选择在重启后保持

[Case ID] TC-DSK-L3-02-009
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/i18n/index.detector.ts:14`、`:34-40`；`test/e2e/support/desktop-host.ts:96-98`
[自动化] 是（同上）
[前置条件] 应用可重启（`stop({ keepHome: true })` 后复用同一隔离根）
[测试数据] 观察点 `dsh-navbar-menu-config` 的 `aria-label` 与 `localStorage` 的 `deepseek-harness-desktop-language`
[测试步骤] 1. 切到 `en-US` 并关闭对话框。2. 结束进程但保留隔离根。3. 用同一隔离根重新拉起应用（`resetStore: false`）。4. 等待壳层渲染完成后读取观察点与 `localStorage`。
[预期结果] 1. 切换成功。2. 进程退出。3. 启动成功。4. 标签为「Config」且 `localStorage` 仍为 `en-US`（语言未被重置为系统语言）。
[清理] 切回 `zh-CN`；`DELETE /session/<id>`

> WebView2 profile 位于隔离根内（`DSH_E2E_WEBVIEW_DATA_DIR`），因此「重启」保留的是同一个前端 profile，localStorage 才有意义。

### [P2] 验证切换语言后菜单与提示文案同步为同一语言

[Case ID] TC-DSK-L3-02-010
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/i18n/index.ts:19`；`src/layout/components/navbar.tsx`（三个菜单触发器）
[自动化] 是（同上）
[前置条件] 语言可切换
[测试数据] 观察点：`dsh-navbar-menu-file`、`dsh-navbar-menu-config`、`dsh-navbar-menu-help` 的 `aria-label`
[测试步骤] 1. 切到 `en-US`。2. 读取三个菜单触发器标签。
[预期结果] 1. 切换成功。2. 三者分别为 `File` / `Config` / `Help`，无任一项残留中文。
[清理] 切回 `zh-CN`；关闭对话框；`DELETE /session/<id>`

> 三个键分别是 `menu.file`、`app.config`、`app.help`——「配置」与「帮助」的文案键**不在 `menu.*` 命名空间**下。

### [P4] 验证两种语言下壳层关键文案均非空

[Case ID] TC-DSK-L3-02-011
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `docs/specs/agents.desktop.md` §3.1「i18n 规范」
[自动化] 是（同上）
[前置条件] 配置对话框已打开在「应用」面板
[测试数据] 观察点：三个菜单触发器的可见文本 + 配置对话框四个导航项的可见文本（共 7 个）
[测试步骤] 1. 在 `zh-CN` 下读取全部观察点文本。2. 切换到 `en-US` 后再次读取。3. 逐项断言非空且不匹配原始 key 形态（`/^[a-z]\w*(\.\w+)+$/`）。4. 断言两套文案至少有一处不同。
[预期结果] 1. 读取成功。2. 读取成功。3. 全部观察点文本均非空，且不出现形如 `menu.file` 的原始 i18n key。4. 语言确实发生了变更（避免「切换是空转」也判绿）。
[清理] 切回 `zh-CN`；关闭对话框；`DELETE /session/<id>`

> 两份语言包的 key 集合当前完全一致（各 349 条），但**全量 key 覆盖属单元测试职责**，本用例只抽查 7 个观察点。

---

### 主题

### [P2] 验证主题偏好被折算并应用到根节点

[Case ID] TC-DSK-L3-02-012
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/hooks/use-theme-adaptive.ts:6-12`
[自动化] 是（同上）
[前置条件] 壳层已挂载；**未设置过主题**（scratch home 内没有 `settings.yaml`）
[测试数据] 观察点 `document.documentElement.dataset.theme`；期望值域 `dark` / `light`
[测试步骤] 1. 经 `__TAURI_INTERNALS__.invoke('get_dsh_theme')` 读取偏好。2. 断言未设置过主题时偏好为 `system`。3. 读取 `matchMedia('(prefers-color-scheme: dark)')`。4. 等根节点 `data-theme` 等于折算结果。
[预期结果] 1. 偏好属于 `dark` / `light` / `system`。2. **首次进入必须回退 `system`（跟随系统），不是固定深色**。3. 读取成功。4. `data-theme` 等于「`system` 时按系统偏好折算、否则取偏好本身」，且取值属于 `dark` / `light`。
[清理] `DELETE /session/<id>`

> 本批 scratch home 内没有 `settings.yaml`，`get_dsh_theme` 必然回退 `DEFAULT_THEME`＝`System`；因此这一步同时守住了「首次进入跟随系统」这条行为（此前该常量是 `Dark`，浅色系统上首次进入即深色）。

### [P3] [反向] 验证语言切换不重建 iframe

[Case ID] TC-DSK-L3-02-013
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/iframe.tsx:188-196`
[自动化] 是（`test/e2e/desktop/02-config-locale.e2e.ts`，**真实装配车道**：`startDesktopApp()` 不置 `disableDownload`）
[前置条件] 应用完成首次装配（依赖已就绪、预装引导已跳过）且 iframe 已挂载
[测试数据] 观察点：iframe 元素的 `src` 与实例标识（DOM 节点引用 + 其 `contentWindow`）
[测试步骤] 1. 记录 iframe 的 `src` 与实例标识。2. 切换语言并等待壳层文案变更。3. 关闭对话框。4. 再次记录同一观察点并比对。
[预期结果] 1. 记录成功。2. 切换成功。3. 关闭成功。4. `src` 与实例标识均未变化（语言切换不触发 iframe 重载，不丢失会话状态）。
[清理] 切回 `zh-CN`；`DELETE /session/<id>`

> 只比对 `src` 不足以发现重建（重建后 `src` 通常相同），因此实例标识取「DOM 节点引用 + `contentWindow`」：`key={harness.iframeKey}` 驱动重建，重建即换节点。用例自身的 `it()` 超时放宽到 15 分钟（首次装配要下载/安装运行时）。

---

### 选择器契约

常量登记在 `test/e2e/support/selectors.ts`（`CONFIG_LANGUAGE_*`、`LANGUAGE_STORAGE_KEY`）；用例内禁止出现字面量选择器。

| `data-testid` | 元素 | 位置 | 状态 |
| --- | --- | --- | --- |
| `dsh-config-language-select` | 「应用」面板语言下拉的 `Select.Trigger`（文本即当前值） | `debug.tsx:364` | 已补 |
| `dsh-config-language-option-zh` | 语言下拉的 `zh-CN` 选项 | `debug.tsx:370` | 已补 |
| `dsh-config-language-option-en` | 语言下拉的 `en-US` 选项 | `debug.tsx:371` | 已补 |
| `dsh-shell-iframe` | `src/layout/components/iframe.tsx` 的 `iframe` | `iframe.tsx:195` | 已补 |
| `dsh-setup-preinstall-skip` | 首次装配「安装推荐插件」引导的跳过按钮（三处互斥渲染） | `setup-preinstall.tsx:286`、`:292`、`:328` | 已补（本批接线需要，流程自身的用例归 `06`） |

**选项必须带 `data-testid`**：规范 §5 禁止文本定位，而下拉选项没有稳定的可读属性（`id`/`data-key` 属 DOM 属性，不在 `data-testid` 口径内）。

---

### 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| 语言即时生效 | `TC-DSK-L3-02-008`、`TC-DSK-L3-02-010` | 正向 | 只断言壳层文案；iframe 内 DSH 界面语言未覆盖 |
| 语言持久化三通路 | TC-DSK-L3-02-009 | 边界 | `localStorage` 与后端 `set_language` 未分别断言，只验证最终可观察结果（G-D02-9） |
| i18n key 完整性 | TC-DSK-L3-02-011 | 边界 | 只抽查 7 个观察点，全量 key 覆盖属单元测试职责 |
| 主题折算与应用 | TC-DSK-L3-02-012 | 正向 | 视觉回归（配色是否正确）**未覆盖**（G-D02-8）；「首次进入跟随系统」由该用例直接守住 |
| iframe 不因语言重载 | TC-DSK-L3-02-013 | 异常 | 走真实装配车道；引导流程与装配自身归 `06`/`11`（G-D02-12） |

---

### 缺口与假设

- **G-D02-8**：主题只断言 `document.documentElement.dataset.theme`，**不覆盖视觉回归**（同一 `data-theme` 下的配色是否正确）。若需覆盖，应引入截图基线，属 `visual-regression-testing` 范畴。
- **G-D02-9**：语言切换会同时写 `localStorage`、setting store 与后端 `set_language`。本文件只验证「重启后仍生效」这一端到端结果，未分别验证三条通路各自成功；若需定位「重启后语言丢失」的根因，需补三条通路的分项断言。
- **G-D02-10**：真实切换操作系统主题（Windows 应用主题设置）仍**未覆盖**——用例只在折算方向上断言（读 `matchMedia` 再比对 `data-theme`），不主动改系统外观。
- **G-D02-11**：`data-theme` 的真值是 `dshStyle.colorScheme || 折算后的偏好`，而 `colorScheme` **只有 iframe（DSH 侧）会写**（`iframe.tsx` 的 `setDshStyle`）。本批已整批转入装配完成的车道（有 iframe），因此该断言存在被 DSH 侧覆盖的风险：若 DSH 上报了 `colorScheme`，`data-theme` 会优先取它。当前 DSH 首次进入不上报该值，断言严格成立；一旦该断言在装配车道上漂移，应改为读 `dshStyle` 而非折算偏好。
- **G-D02-12**：TC-DSK-L3-02-013 走真实装配车道（`startDesktopApp()` 不置 `disableDownload`），因此带来三项前置，均由编排侧处理：
  1. **运行时**：`DSH_DOWNLOAD_CACHE_DIR`（默认 `%TEMP%/dsh-e2e-download-cache`）为空时会联网下载 Node/dsh/pnpm/Git（~250MB）；本地预热后彻底离线。CI 每次全新 runner，需首次下载。
  2. **预装引导**：harness 每次启动都删 `.store.test.dat`，因此 `preinstall_pending()` 恒为真，必须由 `test/e2e/support/preinstall.ts` 跳过引导，服务才会被拉起。
  3. **残留进程**：dsh 是应用独立拉起的进程，应用被强杀时不会被带走，会一直占着 debug 端口；`desktop-host.ts` 的 `killOrphanHarness()` 在 `stop()` 里按「命令行含本次下载缓存目录」清理。
- **G-D02-13**：WebView2 profile 现在落在 scratch home 内（`DSH_E2E_WEBVIEW_DATA_DIR`，见「事实基线」），因此每个隔离根从 ~3.5MB 涨到 ~15MB。`stop()` 的 `rmSync` 偶发被**输入法进程**占用失败（如 `home/AppData/LocalLow/SogouPY/...`，因为 `USERPROFILE` 被重定向，输入法把日志写进了隔离根），此时只记录「scratch 未删除」并交给 `purgeStaleHomes()`（30 分钟 TTL）回收——这是既有行为，不是本批引入的。
- **G-D02-14**：`TC-DSK-L3-02-013` 的 `afterEach` 要把语言归一到 `zh-CN`，而该车道里首次进入会弹 dsh 自己的 apiKey 引导，遮罩镜像到导航栏后壳层按设计不可点（见「事实基线」）。因此 `ensureLanguage()` 在导航栏不可点且语言已非目标值时**跳过归一**，不判用例失败：语言在本车道只是观察对象，且该车道用独立 scratch home（`localStorage` 随 home 销毁），不会带偏后续用例或开发会话。若将来需要真正断言该模态下的行为，应归批次 `06`/`11`。
- **G-D02-15**：首次进入 dsh 会**先后**弹出「内测声明」（`WelcomeNotice`，headless 且 `onClose` 为空实现，只能点唯一的「继续」按钮）与「添加一个 API Key 开始使用」（`DeepSeekOnboardingDialog`，可点遮罩关闭）。二者都把帧内 `_mask_` 遮罩镜像到壳层导航栏（`getOverlayMarkedStyle()`），导航栏随之不可点，整批用例都会被卡住。`beforeAll` 由 `test/e2e/support/onboarding.ts` 的 `dismissDshOnboarding()` 进入跨域帧内关掉它们（依赖 vendor 驱动补丁的 `switchFrame`）。该编排只负责「让壳层可点」，弹层自身的行为断言归批次 `06`/`11`。
- **实现侧变更**（接线过程中发现并修复，均带用例守门）：
  1. `theme.rs` 的 `DEFAULT_THEME` 由 `Dark` 改为 `System`：首次进入（无 `settings.yaml`）与偏好非法时都应跟随系统，固定深色会让浅色系统上「首次进入即深色」；`use-theme-adaptive.ts` 的折算同步覆盖「偏好尚未取到」的窗口。守门用例 `TC-DSK-L3-02-012` + Rust 单测 `config::theme::tests`。
  2. `debug.tsx` 语言下拉补 3 个 `data-testid`；`iframe.tsx` 补 `dsh-shell-iframe`；`setup-preinstall.tsx` 的跳过按钮补 `dsh-setup-preinstall-skip`。
  3. `builder.rs` 的 WebView2 目录增加 E2E 专用覆盖（仅 `is_e2e_run()` 下生效），E2E 写入的 localStorage 不再污染开发会话的 `EBWebView-dev`。
  4. **E2E 基础设施**：上游 `tauri-plugin-wdio-webdriver` 1.4.0 的帧上下文靠 JS 模拟（`frame.contentWindow.eval`），跨域时 `contentDocument` 为 `null`，任何帧内脚本必然超时。壳层 `tauri://localhost` 与内嵌 dsh `http://127.0.0.1:<port>` 正是跨域，因此 `TC-DSK-L3-02-013` 在补丁前无法运行。现以 `[patch.crates-io]` 指向 `src-tauri/vendor/tauri-plugin-wdio-webdriver`，在 Windows 路径改用 `ICoreWebView2Frame2::ExecuteScript`（引擎按帧路由，不受同源策略约束）；`frame_context` 为空（所有非帧用例）时行为完全不变，深层嵌套帧仍回退上游 JS 路径。上游支持后删除 vendor 目录与 `Cargo.toml` 中的 `[patch.crates-io]` 即可（见 `PATCH.md`；上游 issue：<https://github.com/webdriverio/desktop-mobile/issues/665>）。
- **假设**：执行机系统语言为中文或缺省语言已由 `localStorage` 决定；用例显式把语言归一到 `zh-CN` 再开始断言，不依赖执行机语言。

---

## 3. 应用设置

「应用」面板是设置真值的写入口。设置由前端与 Rust **共享同一份 `.store.dat`**，因此本文件的断言以「运行期回读」为准，不直接读文件。写操作分两类：走 `update_app_config`（端口、关闭行为）与走独立命令（开机自启、CLI link）。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 运行期信息 `get_runtime_info`（`service_url`/`data_dir`/`log_path` 等） | `src/ui/config/debug.tsx:21-30`、`:51-54` |
| 端口合法域 `1..=65535` 且必须为整数 | `src/ui/config/debug.tsx:143-146` |
| 保存端口成功后 toast 提供「重启」入口，10s 超时 | `src/ui/config/debug.tsx:149-160` |
| 端口非法 → `PORT_INVALID` → 专用失败提示 | `src/ui/config/debug.tsx:162-170` |
| 缩放下拉 16 档 `0.5..2.0` 步长 `0.1` | `src/ui/config/debug.tsx:19` |
| 缩放真值直接写 `store.setting.zoom_factor` | `src/ui/config/debug.tsx:126-128` |
| 缩放归一化与上下限 | `src/utils/zoom.ts:62-84` |
| 缩放应用到 WebView（`Webview.setZoom`） | `src/layout/components/iframe.tsx:75`；`src/hooks/use-zoom-factor.ts:143-150` |
| 语言下拉 | `src/ui/config/debug.tsx:355-372` |
| 开机自启 `get_launch_on_login` / `set_launch_on_login` | `src/ui/config/components/launch-on-login.tsx:10-23` |
| 关闭行为 `close_action`（写入走 `update_app_config`） | `src/ui/config/components/close-action.tsx:24-33` |
| CLI link 开关 + `get_cli_link_status` | `src/ui/config/debug.tsx:64-67`、`:110-120` |
| CLI link 提示：`bin_dir` / `user_dsh_preserved` 分支 | `src/ui/config/debug.tsx:313-329` |
| 日志面板轮询间隔 2000ms | `src/ui/config/debug.tsx:69-73` |
| 清空日志 `clear_service_logs` | `src/ui/config/debug.tsx:98-108` |
| 复制服务地址 `copy_service_url` | `src/ui/config/debug.tsx:130-139` |
| 打开数据目录 `reveal_data_dir` | `src/ui/config/debug.tsx:173-179` |
| `setting_updated` 事件触发运行期信息重拉 | `src/ui/config/debug.tsx:57-59` |
| 端口避让后回落 `manual_port` | `src-tauri/src/service/workflow/launch.rs:316-321`；issue #91 |

---

### 端口

### [P1] 验证保存合法端口写入设置并提示重启

[Case ID] TC-DSK-L3-02-014
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/debug.tsx:141-171`；issue #91
[自动化] 待接线（`test/e2e/desktop/02-config-locale.e2e.ts`）
[前置条件] 服务处于运行中
[测试数据] 端口 `3099`（合法且未占用）
[测试步骤] 1. 在端口输入框填入 `3099`。2. 点击「保存」。3. 读取提示内容与提示中的操作入口。4. 读取已保存的端口值。
[预期结果] 1. 输入成功。2. 保存被接受。3. 出现「端口已修改」提示与「重启后生效」说明，并提供「重启」操作入口。4. 已保存端口为 `3099`。
[清理] 端口改回原值并重启服务；`DELETE /session/<id>`

### [P3] [反向] 验证非法端口被拒绝保存

[Case ID] TC-DSK-L3-02-015
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/config/debug.tsx:143-146`、`:162-170`
[自动化] 待接线（同上）
[前置条件] 服务处于运行中
[测试数据] 非法值：`0`、`65536`、`1.5`、空值
[测试步骤] 1. 依次填入每个非法值并点击「保存」。2. 每次读取提示内容与语义。3. 最后读取端口输入框的已保存值。
[预期结果] 1. 四次提交均被拒绝。2. 每次均出现「端口非法」提示（危险语义），不出现成功提示。3. 已保存端口保持为提交前的值。
[清理] `DELETE /session/<id>`

---

### 显示与行为

### [P2] 验证开机自启开关持久化

[Case ID] TC-DSK-L3-02-017
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/components/launch-on-login.tsx:10-23`
[自动化] 待接线（同上）
[前置条件] 服务处于运行中；当前开机自启为关闭
[测试数据] 目标状态：开启
[测试步骤] 1. 读取开关状态。2. 点击开关。3. 等待请求返回并回读。4. 重启应用后再次读取。
[预期结果] 1. 状态为关闭。2. 点击被接受。3. 回读状态为开启，无错误提示。4. 重启后状态仍为开启。
[清理] 关闭开机自启；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-config-port` | 端口输入框 | 待补 |
| `dsh-config-port-save` | 端口「保存」按钮 | 待补 |
| `dsh-config-zoom` | 缩放下拉 | 待补 |
| `dsh-config-language-select` | 语言下拉 | 待补 |
| `dsh-config-launch-on-login` | 开机自启开关 | 待补 |
| `dsh-config-close-action` | 关闭行为下拉 | 待补 |
| `dsh-config-cli-link` | CLI link 开关 | 待补 |
| `dsh-config-copy-url` | 复制服务地址按钮 | 待补 |
| `dsh-config-logs` | 日志面板 | 待补 |
| `dsh-config-clear-logs` | 清空日志按钮 | 待补 |
| `dsh-config-copy-logs` | 复制日志按钮 | 待补 |
| `dsh-config-reveal-dir` | 打开数据目录按钮 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-02-019` | 验证 CLI link 开关创建与删除 shim | 纯逻辑断言，下沉单元测试层 |

---
| `TC-DSK-L3-02-016` | 验证缩放选择的持久化（写读设置项） | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-02-018` | 验证关闭行为选择的持久化（写读设置项） | 纯逻辑断言，下沉单元测试层 |

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/ui/config/debug.tsx:141-171`；issue #91` | `TC-DSK-L3-02-014` | 正向 |
| ``src/ui/config/debug.tsx:143-146`、`:162-170`` | `TC-DSK-L3-02-015` | 异常 |
| ``src/ui/config/components/launch-on-login.tsx:10-23`` | `TC-DSK-L3-02-017` | 正向 |

---

### 缺口与假设

- **G-D02-15**：TC-DSK-L3-02-017 只验证「开关状态持久化」。开机自启**实际生效**需要真实重新登录操作系统，属手工确认项（`00-overview.md` G9）。
- **G-D02-16**：TC-DSK-L3-02-019 会创建/删除 `%LOCALAPPDATA%\deepseek-harness\bin` 下的 shim 并修改用户 `PATH`（`agents.desktop.md` §5）。接线时必须先记录原始状态并在清理时还原，否则会污染开发者本机环境。
- **G-D02-17**：端口「避让后回落 `manual_port`」（issue #91）是一条独立且易错的行为，需要「占用配置端口 → 重启 → 断言回落到 `manual_port`」三步构造，**未覆盖**。
- **G-D02-18**：macOS 10.15 不支持 `WKWebView.pageZoom`（`use-zoom-factor.ts:79-91`），该平台下缩放只维护数值不实际应用。**未覆盖**，需旧版 macOS。
- **假设**：设置真值由前端与 Rust 共享同一份 `.store.dat`；本文件全部通过运行期回读断言，不直接读写该文件。
