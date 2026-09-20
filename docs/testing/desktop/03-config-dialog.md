# 配置对话框

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/03-config-dialog.e2e.ts`
> 前置：`02-shell-navigation.md` 通过；`dist/` 与 Debug 二进制就绪（见 `test/e2e/support/desktop-host.ts`）
> 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/03-config-dialog.e2e.ts`

配置对话框是四个面板（应用 / 档案 / 插件 / 核心）的唯一容器，`04`–`16` 的多数用例都以「对话框已打开在某个面板」为前置。本文件只验证**容器的行为**，各面板的内部行为归各自文件。

本批以 `disableDownload: true` 启动：容器结构、导航项与四个面板标题都不依赖装配完成，无需 `ready`。

---

## 1. 事实基线

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

## 2. 打开、定位与切换

### [P1] 验证「配置 → 应用」打开对话框并默认定位「应用」面板

[Case ID] TC-DSK-L3-03-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 03；`src/ui/dialog/config.tsx:45`、`:51`
[自动化] 是（`test/e2e/desktop/03-config-dialog.e2e.ts`）
[前置条件] 对话框当前未打开
[测试数据] 选择器 `dsh-config-dialog`、`dsh-config-nav-application`、`dsh-config-panel-title`
[测试步骤] 1. 点击导航栏「配置」并选择「应用」。2. 读取对话框可见性。3. 读取「应用」导航项选中态。4. 读取当前面板标题。
[预期结果] 1. 菜单项被点击。2. 对话框存在且可见。3. 「应用」导航项为选中态，其余三项非选中。4. 面板标题为「应用」面板标题且非空。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P2] 验证左侧导航可切换四个面板

[Case ID] TC-DSK-L3-03-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/dialog/config.tsx:38-43`、`:64-86`、`:90-103`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-03-001 通过
[测试数据] 四个导航项：`application`、`profiles`、`plugins`、`harness`；选中态读 `aria-current`
[测试步骤] 1. 依次点击四个导航项。2. 每次点击后读取选中态与面板标题。
[预期结果] 1. 四次点击均被接受。2. 每次只有被点击项为选中态。3. 面板标题与导航项一一对应。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P2] 验证从导航栏直接定位到指定面板

[Case ID] TC-DSK-L3-03-003
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

## 3. 关闭与收起

### [P2] 验证关闭触发器关闭对话框

[Case ID] TC-DSK-L3-03-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/dialog/config.tsx:51`、`:55`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-03-001 通过
[测试数据] 关闭触发器 `dsh-config-dialog-close`
[测试步骤] 1. 点击关闭触发器。2. 等待对话框消失。3. 再次点击导航栏「配置 → 应用」。
[预期结果] 1. 触发器被点击。2. 对话框在超时内不可见。3. 对话框可再次打开，且默认仍定位「应用」（不残留上次面板）。
[清理] 关闭对话框；`DELETE /session/<id>`

### [P3] 验证服务重启前对话框被命令式收起

[Case ID] TC-DSK-L3-03-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/dialog/config.tsx:48`；`src/config/hooks.ts`（`config.dialog.hidden`）
[自动化] 否（暂缓，见 §7 G-D03-4）
[前置条件] TC-DSK-L3-03-001 通过；服务处于运行中
[测试数据] 触发源：服务重启流程
[测试步骤] 1. 确认对话框可见。2. 在「应用」面板点击「重启」触发服务重启。3. 等待重启流程启动后读取对话框可见性。
[预期结果] 1. 对话框可见。2. 重启被触发。3. 对话框已收起（不可见），无需用户手动关闭。
[清理] 等待服务恢复健康；`DELETE /session/<id>`

---

## 4. 角标与边界

### [P3] 验证存在异常插件时「插件」导航显示角标数量

[Case ID] TC-DSK-L3-03-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/dialog/config.tsx:36`、`:79-83`；issue #399
[自动化] 否（暂缓，见 §7 G-D03-1）
[前置条件] 已构造至少 1 个带 `error` 字段的插件（可由运行期插件异常上报构造，见 `09`）
[测试数据] 异常插件数量 `N`（N ≥ 1）；选择器 `dsh-config-nav-plugins-badge`
[测试步骤] 1. 确认插件列表中 `error != null` 的条目数为 N。2. 打开配置对话框。3. 读取「插件」导航项的角标文本。4. 读取其余三项的角标存在性。
[预期结果] 1. 确认为 N。2. 对话框打开。3. 角标存在且文本等于 `N`。4. 其余三项不存在角标。
[清理] 清除构造的插件异常；关闭对话框；`DELETE /session/<id>`

### [P4] 验证对话框尺寸不超出视口

[Case ID] TC-DSK-L3-03-007
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/ui/dialog/config.tsx:54`、`:89`
[自动化] 是（同上）
[前置条件] TC-DSK-L3-03-001 通过
[测试数据] 期望上限 = 视口宽 − 48px、视口高 − 96px（按当前视口实测）；窄视口取 720×640（CSS 视口 707×632 @dpr 1.75）
[测试步骤] 1. 读取视口尺寸。2. 等对话框尺寸稳定后读取边界矩形。3. 把窗口缩到窄视口后重复步骤 1–2，并读取面板滚动容器的 `overflow-y`。
[预期结果] 1. 读取成功。2. 宽不超过视口宽减 48px，高不超过视口高减 96px。3. 窄视口下仍满足该上限，页面总高不超过视口（溢出由内部滚动容器接管）。
[清理] 恢复窗口尺寸；关闭对话框；`DELETE /session/<id>`

---

## 5. 选择器契约

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

## 6. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `props.tab` 定位语义 | TC-DSK-L3-03-001、003 | 正向 | 未传入 `tab` 时的缺省行为无 UI 入口（G-D03-5） |
| 四面板切换 | TC-DSK-L3-03-002 | 正向 | 各面板内容归 `04`/`05`/`09`/`14` |
| 关闭路径 | TC-DSK-L3-03-004 | 正向 | 点击遮罩关闭、Esc 关闭未单独覆盖（同一 `disclosure.cancel` 通路，G-D03-2） |
| `config.dialog.hidden` 命令式收起 | TC-DSK-L3-03-005 | 异常 | 暂缓；「重启」触发源需服务运行中，「退出」触发源未覆盖 |
| 异常角标 | TC-DSK-L3-03-006 | 异常 | 暂缓；依赖 `09` 的异常构造能力 |
| 尺寸上限 | TC-DSK-L3-03-007 | 边界 | 只验几何上限与溢出归属；内容超出容器高度时的滚动可用性未覆盖（G-D03-3） |

---

## 7. 缺口与假设

- **G-D03-1**：TC-DSK-L3-03-006 依赖「带 `error` 字段的插件」这一夹具。当前唯一可用的构造路径是让 iframe 上报 `dsh://plugin-error`（`src/layout/components/iframe.tsx:94`），需要 iframe 环境可用；本批不具备该夹具，用例**暂缓**。
- **G-D03-2**：关闭路径有多条（关闭触发器、遮罩点击、Esc、`onOpenChange`），本文件只覆盖关闭触发器。其余三条走同一 `disclosure.cancel` 通路，按「等价候选合并」不重复建用例；若后续发现行为分叉，再拆。
- **G-D03-3**：对话框内部滚动的**可用性**未覆盖（需构造内容高度超过 `min(720px, calc(100vh-96px))` 的面板状态）。TC-DSK-L3-03-007 只验到「窄视口下溢出归属内部滚动容器」（`overflow-y: auto` 且页面未被撑高），未验「内容确实溢出时能滚到末尾」。
- **G-D03-4**：TC-DSK-L3-03-005 的「重启」按钮仅在 `serviceRunning` 时渲染，用例需全装配就绪的车道（含联网下载 Node / dsh / pnpm），代价与批次 03 的容器范围不匹配，用例**暂缓**。
- **G-D03-5**：`props.tab` 的缺省值 `application`（`config.tsx:45`）在非 macOS 平台无 UI 入口——唯一不传 `tab` 的调用点是 macOS 原生菜单 `desktop-config`（`navbar.tsx:309`），而本套件整体 `describe.skipIf(darwin)`。该缺省分支只由「配置 → 应用」这条等价路径间接覆盖。
- **实现侧变更**：「应用」面板原本是四个面板中唯一没有标题的（其余三个各自渲染 `Panel.Header`），本批为满足 `dsh-config-panel-title` 契约给它补上了 `Panel.Header`（`src/ui/config/debug.tsx:184`），并让 `Panel.Header.description` 变为可选。这是本批唯一的可见 UI 变更。
- **G-D03-6**：HeroUI 的 `modal__container` 带**入场缩放动画**（`matrix3d(scale)`，起手约 1.03 再收到 1）。动画未结束时 `getBoundingClientRect()` 会把对话框整体读大最多 ~3%——实测 CSS 宽度恰好等于上限 684px 时被读成 705.6px，从而把「恰好顶到 `max-w`」误判为溢出。几何类断言必须先等尺寸稳定（`waitForDialogSettled()`：两次采样差 < 0.5px）。`04`–`16` 凡涉及对话框几何的断言都需同样处理。
- **G-D03-7**：CI（windows-2025 runner）上配置对话框偶发在打开后 ~100–200ms 被收起，`document.querySelector('dsh-config-dialog')` 连续 10s 返回 `null`（`Number.NaN` 经 WebDriver 序列化成 `null`），已取到的 `dsh-config-nav-*` 句柄变成游离节点（`checkVisibility` 返回 `false`、`getComputedStyle().display === ''`）。本地（dpr 1.75）无法复现。已知的两处用例侧诱因已缓解：① `closeDialog()` 原先只等 `isDisplayed()` 为假就返回，此时 overlastic 的退场窗口（`duration = 300`）尚未走完、`vanish()` 未执行，紧接着重开会与上一个实例的卸载竞争——现在改为等节点**从 DOM 卸载**并额外排空 400ms；② `waitForClickable()` 只认首次取到的句柄，节点被替换后必然轮询到超时——导航项点击改为每轮重新定位。`openConfigTab()` 另对「打开后立刻被收起」保留一次重试（仓库「少量重试」约定）。失败信息现在带现场快照（`pageMark`/`navbar`/`disabledPage`/`url`），用于下一轮区分「弹层被收起」与「webview 被重载」。
- **假设**：`Modal` 的 `onOpenChange` 在 Esc 与遮罩点击时都会触发 `cancel`；该假设来自 HeroUI Modal 的通用行为，未在源码中逐行确认。
