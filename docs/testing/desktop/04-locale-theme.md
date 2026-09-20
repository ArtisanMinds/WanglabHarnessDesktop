# 语言与主题

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/04-locale-theme.e2e.ts`
> 前置：`03-config-dialog.md` 通过；配置对话框可打开在「应用」面板
> 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/04-locale-theme.e2e.ts`

语言与主题是壳层的两个全局状态。语言的写入有三条通路（`localStorage`、setting store、后端 `set_language`），主题的真值来自后端 `get_dsh_theme` 并由系统偏好折算。本文件验证**即时生效**与**跨重启持久化**两条主线。

本批以 `disableDownload: true` 启动：语言与主题都是壳层状态，不依赖装配完成，无需 `ready`。

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
| `system` 时按 `usePreferredDark` 折算；最终写入 `document.documentElement.dataset.theme` | `src/hooks/use-theme-adaptive.ts:8-13` |
| 根节点 `data-theme` 的真值是 `dshStyle.colorScheme \|\| 折算后的偏好`（DSH 侧可覆盖） | `src/hooks/use-theme-adaptive.ts:7`、`:9` |
| `get_dsh_theme` 读 `<dsh data>/settings.yaml` 的 `ui-theme.preference`，缺失/解析失败回退 `DEFAULT_THEME`（`Dark`） | `src-tauri/src/config/theme.rs:18`、`:23-32` |
| 主题自适应在壳层根组件挂载 | `src/layout/index.tsx:48` |
| iframe 只在 `serviceHealthy` 时渲染，重建只由 `harness.iframeKey` 驱动 | `src/layout/components/iframe.tsx:189`、`:193`、`:196` |
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
[追踪] `src/hooks/use-theme-adaptive.ts:6-13`
[自动化] 是（同上）
[前置条件] 壳层已挂载
[测试数据] 观察点 `document.documentElement.dataset.theme`；期望值域 `dark` / `light`
[测试步骤] 1. 经 `__TAURI_INTERNALS__.invoke('get_dsh_theme')` 读取偏好。2. 读取 `matchMedia('(prefers-color-scheme: dark)')`。3. 等根节点 `data-theme` 等于折算结果。
[预期结果] 1. 偏好属于 `dark` / `light` / `system`。2. 读取成功。3. `data-theme` 等于「`system` 时按系统偏好折算、否则取偏好本身」，且取值属于 `dark` / `light`。
[清理] `DELETE /session/<id>`

> 本批 scratch home 内没有 `settings.yaml`，`get_dsh_theme` 必然回退 `Dark`，因此这一步是确定性的。

### [P3] [反向] 验证语言切换不重建 iframe

[Case ID] TC-DSK-L3-04-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/iframe.tsx:189`、`:193`、`:196`
[自动化] 否（暂缓，见 §6 G-D04-5）
[前置条件] iframe 已加载完成（`harness.serviceHealthy` 为真）
[测试数据] 观察点：iframe 元素的 `src` 与实例标识
[测试步骤] 1. 记录 iframe 的 `src` 与实例标识。2. 切换语言。3. 等待壳层重渲染完成。4. 再次记录同一观察点。
[预期结果] 1. 记录成功。2. 切换成功。3. 重渲染完成。4. `src` 与实例标识均未变化（语言切换不触发 iframe 重载，不丢失会话状态）。
[清理] 切回 `zh-CN`；`DELETE /session/<id>`

---

## 4. 选择器契约

常量登记在 `test/e2e/support/selectors.ts`（`CONFIG_LANGUAGE_*`、`LANGUAGE_STORAGE_KEY`）；用例内禁止出现字面量选择器。

| `data-testid` | 元素 | 位置 | 状态 |
| --- | --- | --- | --- |
| `dsh-config-language-select` | 「应用」面板语言下拉的 `Select.Trigger`（文本即当前值） | `debug.tsx:364` | 已补 |
| `dsh-config-language-option-zh` | 语言下拉的 `zh-CN` 选项 | `debug.tsx:370` | 已补 |
| `dsh-config-language-option-en` | 语言下拉的 `en-US` 选项 | `debug.tsx:371` | 已补 |
| `dsh-shell-iframe` | `src/layout/components/iframe.tsx` 的 `iframe` | — | 待补（TC-006 暂缓，接线时一并补） |

**选项必须带 `data-testid`**：规范 §5 禁止文本定位，而下拉选项没有稳定的可读属性（`id`/`data-key` 属 DOM 属性，不在 `data-testid` 口径内）。

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| 语言即时生效 | TC-DSK-L3-04-001、003 | 正向 | 只断言壳层文案；iframe 内 DSH 界面语言未覆盖 |
| 语言持久化三通路 | TC-DSK-L3-04-002 | 边界 | `localStorage` 与后端 `set_language` 未分别断言，只验证最终可观察结果（G-D04-2） |
| i18n key 完整性 | TC-DSK-L3-04-004 | 边界 | 只抽查 7 个观察点，全量 key 覆盖属单元测试职责 |
| 主题折算与应用 | TC-DSK-L3-04-005 | 正向 | 视觉回归（配色是否正确）**未覆盖**（G-D04-1）；`system` 分支未构造（G-D04-3） |
| iframe 不因语言重载 | TC-DSK-L3-04-006 | 异常 | 暂缓（G-D04-5） |

---

## 6. 缺口与假设

- **G-D04-1**：主题只断言 `document.documentElement.dataset.theme`，**不覆盖视觉回归**（同一 `data-theme` 下的配色是否正确）。若需覆盖，应引入截图基线，属 `visual-regression-testing` 范畴。
- **G-D04-2**：语言切换会同时写 `localStorage`、setting store 与后端 `set_language`。本文件只验证「重启后仍生效」这一端到端结果，未分别验证三条通路各自成功；若需定位「重启后语言丢失」的根因，需补三条通路的分项断言。
- **G-D04-3**：`system` 主题分支需要真实切换操作系统主题（Windows 应用主题设置），当前不构造该环境，**未覆盖**；用例只在读到 `system` 时按 `usePreferredDark` 折算，不主动制造该取值。
- **G-D04-4**：`data-theme` 的真值是 `dshStyle.colorScheme || 折算后的偏好`，而 `colorScheme` **只有 iframe（DSH 侧）会写**（`iframe.tsx` 的 `setDshStyle`）。因此 TC-DSK-L3-04-005 的「两者一致」只在无 iframe 时严格成立；装配完成的车道上 DSH 可以覆盖 `data-theme`，那时需要改断言口径（读 `dshStyle` 而非偏好）。
- **G-D04-5**：TC-DSK-L3-04-006 的 iframe 只在 `harness.serviceHealthy` 时渲染，`disableDownload` 车道根本没有 iframe；走全装配需联网下载 Node/dsh/pnpm（`%TEMP%/dsh-e2e-download-cache` 实测为空），与批次 04 的壳层范围不匹配，用例**暂缓**。同一阻塞也压着 `TC-DSK-L3-03-005`。
- **G-D04-6**：WebView2 profile 现在落在 scratch home 内（`DSH_E2E_WEBVIEW_DATA_DIR`，见 §1），因此每个隔离根从 ~3.5MB 涨到 ~15MB。`stop()` 的 `rmSync` 偶发被**输入法进程**占用失败（如 `home/AppData/LocalLow/SogouPY/...`，因为 `USERPROFILE` 被重定向，输入法把日志写进了隔离根），此时只记录「scratch 未删除」并交给 `purgeStaleHomes()`（30 分钟 TTL）回收——这是既有行为，不是本批引入的。
- **实现侧变更**：为满足选择器契约，`debug.tsx` 的语言下拉补了 3 个 `data-testid`（`Select.Trigger` 1 个 + 两个选项）；`builder.rs` 的 WebView2 目录增加 E2E 专用覆盖（仅在 `is_e2e_run()` 下生效），使 E2E 写入的 localStorage 不再污染开发会话的 `EBWebView-dev`。无可见 UI 变更。
- **假设**：执行机系统语言为中文或缺省语言已由 `localStorage` 决定；用例显式把语言归一到 `zh-CN` 再开始断言，不依赖执行机语言。
