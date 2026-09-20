# 语言与主题

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/04-locale-theme.e2e.ts`
> 前置：`03-config-dialog.md` 通过；配置对话框可打开在「应用」面板
> 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/04-locale-theme.e2e.ts`

语言与主题是壳层的两个全局状态。语言的写入有三条通路（`localStorage`、setting store、后端 `set_language`），主题的真值来自后端 `get_dsh_theme` 并由系统偏好折算。本文件验证**即时生效**与**跨重启持久化**两条主线。

本批 `001`–`005` 以 `disableDownload: true` 启动：语言与主题都是壳层状态，不依赖装配完成，无需 `ready`。`006` 要验 iframe，必须走**真实装配车道**（`startDesktopApp()` 不置 `disableDownload`，见 §6 G-D04-5）。

---

## 1. 事实基线

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

## 2. 语言切换

### [P1] 验证语言切换为 English 后壳层文案即时变更

[Case ID] TC-DSK-L3-04-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 04；`src/ui/config/debug.tsx:357-375`；`src/i18n/index.detector.ts:34-40`
[自动化] 是（`test/e2e/desktop/04-locale-theme.e2e.ts`）
[前置条件] 配置对话框已打开在「应用」面板；当前语言为 `zh-CN`
[测试数据] 目标语言 `en-US`；观察点 `dsh-navbar-menu-config` 的 `aria-label`（与可见文本同源，均为 `app.config`）
[测试步骤] 1. 读取观察点标签。2. 在语言下拉中选择 `en-US`。3. 等同一标签变为英文文案。4. 读取语言下拉当前值与 `localStorage`。
[预期结果] 1. 标签为「配置」。2. 选择被接受。3. 标签变为「Config」（不刷新页面即生效）。4. 下拉文本为「English」，`localStorage` 为 `en-US`。
[清理] 切回 `zh-CN`；关闭对话框；`DELETE /session/<id>`

### [P2] 验证语言选择在重启后保持

[Case ID] TC-DSK-L3-04-002
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

[Case ID] TC-DSK-L3-04-003
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

[Case ID] TC-DSK-L3-04-004
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

## 3. 主题

### [P2] 验证主题偏好被折算并应用到根节点

[Case ID] TC-DSK-L3-04-005
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

[Case ID] TC-DSK-L3-04-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/iframe.tsx:188-196`
[自动化] 是（`test/e2e/desktop/04-locale-theme.e2e.ts`，**真实装配车道**：`startDesktopApp()` 不置 `disableDownload`）
[前置条件] 应用完成首次装配（依赖已就绪、预装引导已跳过）且 iframe 已挂载
[测试数据] 观察点：iframe 元素的 `src` 与实例标识（DOM 节点引用 + 其 `contentWindow`）
[测试步骤] 1. 记录 iframe 的 `src` 与实例标识。2. 切换语言并等待壳层文案变更。3. 关闭对话框。4. 再次记录同一观察点并比对。
[预期结果] 1. 记录成功。2. 切换成功。3. 关闭成功。4. `src` 与实例标识均未变化（语言切换不触发 iframe 重载，不丢失会话状态）。
[清理] 切回 `zh-CN`；`DELETE /session/<id>`

> 只比对 `src` 不足以发现重建（重建后 `src` 通常相同），因此实例标识取「DOM 节点引用 + `contentWindow`」：`key={harness.iframeKey}` 驱动重建，重建即换节点。用例自身的 `it()` 超时放宽到 15 分钟（首次装配要下载/安装运行时）。

---

## 4. 选择器契约

常量登记在 `test/e2e/support/selectors.ts`（`CONFIG_LANGUAGE_*`、`LANGUAGE_STORAGE_KEY`）；用例内禁止出现字面量选择器。

| `data-testid` | 元素 | 位置 | 状态 |
| --- | --- | --- | --- |
| `dsh-config-language-select` | 「应用」面板语言下拉的 `Select.Trigger`（文本即当前值） | `debug.tsx:364` | 已补 |
| `dsh-config-language-option-zh` | 语言下拉的 `zh-CN` 选项 | `debug.tsx:370` | 已补 |
| `dsh-config-language-option-en` | 语言下拉的 `en-US` 选项 | `debug.tsx:371` | 已补 |
| `dsh-shell-iframe` | `src/layout/components/iframe.tsx` 的 `iframe` | `iframe.tsx:195` | 已补 |
| `dsh-setup-preinstall-skip` | 首次装配「安装推荐插件」引导的跳过按钮（三处互斥渲染） | `setup-preinstall.tsx:286`、`:292`、`:328` | 已补（本批接线需要，流程自身的用例归 `08`） |

**选项必须带 `data-testid`**：规范 §5 禁止文本定位，而下拉选项没有稳定的可读属性（`id`/`data-key` 属 DOM 属性，不在 `data-testid` 口径内）。

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| 语言即时生效 | TC-DSK-L3-04-001、003 | 正向 | 只断言壳层文案；iframe 内 DSH 界面语言未覆盖 |
| 语言持久化三通路 | TC-DSK-L3-04-002 | 边界 | `localStorage` 与后端 `set_language` 未分别断言，只验证最终可观察结果（G-D04-2） |
| i18n key 完整性 | TC-DSK-L3-04-004 | 边界 | 只抽查 7 个观察点，全量 key 覆盖属单元测试职责 |
| 主题折算与应用 | TC-DSK-L3-04-005 | 正向 | 视觉回归（配色是否正确）**未覆盖**（G-D04-1）；「首次进入跟随系统」由该用例直接守住 |
| iframe 不因语言重载 | TC-DSK-L3-04-006 | 异常 | 走真实装配车道；引导流程与装配自身归 `08`/`20`（G-D04-5） |

---

## 6. 缺口与假设

- **G-D04-1**：主题只断言 `document.documentElement.dataset.theme`，**不覆盖视觉回归**（同一 `data-theme` 下的配色是否正确）。若需覆盖，应引入截图基线，属 `visual-regression-testing` 范畴。
- **G-D04-2**：语言切换会同时写 `localStorage`、setting store 与后端 `set_language`。本文件只验证「重启后仍生效」这一端到端结果，未分别验证三条通路各自成功；若需定位「重启后语言丢失」的根因，需补三条通路的分项断言。
- **G-D04-3**：真实切换操作系统主题（Windows 应用主题设置）仍**未覆盖**——用例只在折算方向上断言（读 `matchMedia` 再比对 `data-theme`），不主动改系统外观。
- **G-D04-4**：`data-theme` 的真值是 `dshStyle.colorScheme || 折算后的偏好`，而 `colorScheme` **只有 iframe（DSH 侧）会写**（`iframe.tsx` 的 `setDshStyle`）。TC-DSK-L3-04-005 跑在 `disableDownload` 车道（无 iframe），因此断言严格成立；装配完成的车道上 DSH 可以覆盖 `data-theme`，那时需要改断言口径（读 `dshStyle` 而非偏好）。
- **G-D04-5**：TC-DSK-L3-04-006 走真实装配车道（`startDesktopApp()` 不置 `disableDownload`），因此带来三项前置，均由编排侧处理：
  1. **运行时**：`DSH_DOWNLOAD_CACHE_DIR`（默认 `%TEMP%/dsh-e2e-download-cache`）为空时会联网下载 Node/dsh/pnpm/Git（~250MB）；本地预热后彻底离线。CI 每次全新 runner，需首次下载。
  2. **预装引导**：harness 每次启动都删 `.store.test.dat`，因此 `preinstall_pending()` 恒为真，必须由 `test/e2e/support/preinstall.ts` 跳过引导，服务才会被拉起。
  3. **残留进程**：dsh 是应用独立拉起的进程，应用被强杀时不会被带走，会一直占着 debug 端口；`desktop-host.ts` 的 `killOrphanHarness()` 在 `stop()` 里按「命令行含本次下载缓存目录」清理。
- **G-D04-6**：WebView2 profile 现在落在 scratch home 内（`DSH_E2E_WEBVIEW_DATA_DIR`，见 §1），因此每个隔离根从 ~3.5MB 涨到 ~15MB。`stop()` 的 `rmSync` 偶发被**输入法进程**占用失败（如 `home/AppData/LocalLow/SogouPY/...`，因为 `USERPROFILE` 被重定向，输入法把日志写进了隔离根），此时只记录「scratch 未删除」并交给 `purgeStaleHomes()`（30 分钟 TTL）回收——这是既有行为，不是本批引入的。
- **G-D04-7**：`TC-DSK-L3-04-006` 的 `afterEach` 要把语言归一到 `zh-CN`，而该车道里首次进入会弹 dsh 自己的 apiKey 引导，遮罩镜像到导航栏后壳层按设计不可点（见 §1）。因此 `ensureLanguage()` 在导航栏不可点且语言已非目标值时**跳过归一**，不判用例失败：语言在本车道只是观察对象，且该车道用独立 scratch home（`localStorage` 随 home 销毁），不会带偏后续用例或开发会话。若将来需要真正断言该模态下的行为，应归批次 `08`/`20`。
- **实现侧变更**（接线过程中发现并修复，均带用例守门）：
  1. `theme.rs` 的 `DEFAULT_THEME` 由 `Dark` 改为 `System`：首次进入（无 `settings.yaml`）与偏好非法时都应跟随系统，固定深色会让浅色系统上「首次进入即深色」；`use-theme-adaptive.ts` 的折算同步覆盖「偏好尚未取到」的窗口。守门用例 `TC-DSK-L3-04-005` + Rust 单测 `config::theme::tests`。
  2. `debug.tsx` 语言下拉补 3 个 `data-testid`；`iframe.tsx` 补 `dsh-shell-iframe`；`setup-preinstall.tsx` 的跳过按钮补 `dsh-setup-preinstall-skip`。
  3. `builder.rs` 的 WebView2 目录增加 E2E 专用覆盖（仅 `is_e2e_run()` 下生效），E2E 写入的 localStorage 不再污染开发会话的 `EBWebView-dev`。
  4. **E2E 基础设施**：上游 `tauri-plugin-wdio-webdriver` 1.4.0 的帧上下文靠 JS 模拟（`frame.contentWindow.eval`），跨域时 `contentDocument` 为 `null`，任何帧内脚本必然超时。壳层 `tauri://localhost` 与内嵌 dsh `http://127.0.0.1:<port>` 正是跨域，因此 `006` 在补丁前无法运行。现以 `[patch.crates-io]` 指向 `src-tauri/vendor/tauri-plugin-wdio-webdriver`，在 Windows 路径改用 `ICoreWebView2Frame2::ExecuteScript`（引擎按帧路由，不受同源策略约束）；`frame_context` 为空（所有非帧用例）时行为完全不变，深层嵌套帧仍回退上游 JS 路径。上游支持后删除 vendor 目录与 `Cargo.toml` 中的 `[patch.crates-io]` 即可（见 `PATCH.md`；上游 issue：<https://github.com/webdriverio/desktop-mobile/issues/665>）。
- **假设**：执行机系统语言为中文或缺省语言已由 `localStorage` 决定；用例显式把语言归一到 `zh-CN` 再开始断言，不依赖执行机语言。
