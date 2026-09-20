# 预装插件引导

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/08-preinstall-onboarding.e2e.ts`（待建立）
> 前置：`07-harness-lifecycle.md` 通过；可构造首次启动态（预装标记未完成）
> 运行：`vitest --project desktop -- test/e2e/desktop/08-preinstall-onboarding.e2e.ts`（待配置，见 G2）

首次启动（或老版本升级）后，应用先进入预装引导页，由用户确认要安装/卸载哪些推荐插件，再继续启动服务。本文件的重点是**默认勾选的推导**与**失败后的可见反馈**——引导页是用户遇到的第一屏，静默失败会直接卡死首次体验。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `status === 'preinstall'` 时渲染 `PreinstallSetup` | `src/layout/components/webview.tsx:56-57` |
| 进入页面即拉取插件列表（仅挂载一次） | `src/layout/components/setup-preinstall.tsx:157-159` |
| 默认勾选规则 `initialCheckedSet(plugins, isFirstTime)` | `src/layout/components/setup-preinstall.tsx:30-39` |
| 首次引导：已安装 + 推荐/修复/默认勾选；非首次：仅已安装 | `src/layout/components/setup-preinstall.tsx:26-29` |
| 首次交互以默认集合为种子（取消一个不会误伤其余） | `src/layout/components/setup-preinstall.tsx:168-184` |
| 变更推导：选中且未安装 → 安装；已安装且未选中 → 卸载 | `src/layout/components/setup-preinstall.tsx:192-201` |
| `hasChanges` 决定主按钮是「确定」还是「跳过」 | `src/layout/components/setup-preinstall.tsx:207-210`、`:284-313` |
| 已安装但取消勾选 → 「待卸载」标签 | `src/layout/components/setup-preinstall.tsx:75-79`、`:261` |
| 安装中：Spinner + 日志面板 + 取消入口 | `src/layout/components/setup-preinstall.tsx:344-366` |
| 安装失败：错误块 + 日志 + 跳过/重试 | `src/layout/components/setup-preinstall.tsx:317-342` |
| 列表加载失败：错误块 + 重试（区别于空列表） | `src/layout/components/setup-preinstall.tsx:231-250` |
| 空列表：`Empty` | `src/layout/components/setup-preinstall.tsx:252-256` |
| 仓库跳转 `open_preinstall_repo` | `src/layout/components/setup-preinstall.tsx:186-190` |
| 日志面板上限 100 行 | `src/layout/components/setup-preinstall.tsx:130-132` |

---

## 2. 列表与默认勾选

### [P1] 验证首次启动进入预装引导页并列出插件

[Case ID] TC-DSK-L3-08-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:56-57`；`src/layout/components/setup-preinstall.tsx:157-159`
[自动化] 待接线（`test/e2e/desktop/08-preinstall-onboarding.e2e.ts`）
[前置条件] 应用处于 `preinstall` 状态（首次启动）
[测试数据] 选择器 `dsh-preinstall-root`、`dsh-preinstall-row`
[测试步骤] 1. 等待引导页根节点出现。2. 读取插件行数量与每行名称。
[预期结果] 1. 根节点在超时内出现。2. 行数量与后端返回的候选插件数量一致；名称均为非空字符串。
[清理] 结束引导页；`DELETE /session/<id>`

### [P2] 验证首次引导的默认勾选规则

[Case ID] TC-DSK-L3-08-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/setup-preinstall.tsx:30-39`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-08-001 通过；候选中同时存在「已安装」与「未安装且推荐/修复/默认勾选」两类
[测试数据] 期望勾选集合 = `installed ∪ (recommended ∪ fix ∪ defaultChecked)` 中未安装的部分
[测试步骤] 1. 读取每行的勾选态。2. 与期望集合比对。
[预期结果] 1. 读取成功。2. 勾选集合与期望集合完全一致（未安装且非推荐/修复/默认勾选的项不被勾选）。
[清理] 结束引导页；`DELETE /session/<id>`

---

## 3. 安装与失败路径

### [P3] [反向] 验证安装失败展示错误与日志并可重试

[Case ID] TC-DSK-L3-08-007
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/setup-preinstall.tsx:317-342`
[自动化] 待接线（同上）
[前置条件] 构造安装失败（如指向不可达的插件源或断网）
[测试数据] 选择器 `dsh-preinstall-error`、`dsh-preinstall-logs`、`dsh-preinstall-retry`
[测试步骤] 1. 触发安装并等待失败。2. 读取错误区块与日志面板。3. 读取重试按钮的可用性。
[预期结果] 1. 失败在超时内返回。2. 错误区块存在且文案非空；日志面板存在。3. 存在变更时重试按钮可用。
[清理] 恢复网络/源；结束引导页；`DELETE /session/<id>`

---

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-preinstall-root` | 引导页根节点 | 待补 |
| `dsh-preinstall-row` | 单个插件行 | 待补 |
| `dsh-preinstall-row-to-uninstall` | 「待卸载」标签 | 待补 |
| `dsh-preinstall-primary` | 主操作按钮（确定/跳过） | 待补 |
| `dsh-preinstall-secondary` | 次要「跳过」按钮 | 待补 |
| `dsh-preinstall-installing` | 安装中加载指示 | 待补 |
| `dsh-preinstall-logs` | 日志面板 | 待补 |
| `dsh-preinstall-cancel` | 取消安装按钮 | 待补 |
| `dsh-preinstall-error` | 安装失败错误区块 | 待补 |
| `dsh-preinstall-retry` | 安装失败重试按钮 | 待补 |
| `dsh-preinstall-load-error` | 列表加载失败区块 | 待补 |
| `dsh-preinstall-load-retry` | 列表加载失败重试按钮 | 待补 |
| `dsh-preinstall-open-repo` | 仓库跳转按钮 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-08-003` | 验证取消勾选仅影响该项（勾选集合计算） | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-08-005` | 验证已安装项取消勾选后标记为待卸载（状态计算） | 纯逻辑断言，下沉单元测试层 |

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/webview.tsx:56-57`；`src/layout/components/setup-preinstall.tsx:157-159`` | `TC-DSK-L3-08-001` | 正向 |
| ``src/layout/components/setup-preinstall.tsx:30-39`` | `TC-DSK-L3-08-002` | 正向 |
| ``src/layout/components/setup-preinstall.tsx:317-342`` | `TC-DSK-L3-08-007` | 异常 |

---

## 7. 缺口与假设

- **G-D08-1**：需要「首次启动态」。预装完成标记的存储位置与复位方式未在本次调查中确认；接线时必须先确认该标记的读写路径，否则本文件全部用例不可达。
- **G-D08-2**：`TC-DSK-L3-08-007` 会真实执行 `dsh plugin` 安装，**改动用户档案的插件集合**。按 `00-overview.md` G8，测试必须使用独立数据目录并自行清理，否则会污染 `09` 的前置状态。
- **G-D08-3**：非首次打开引导页（`isFirstTime=false`，从插件面板「打开预设」进入）的默认勾选规则与首次不同（只勾已安装项），**未覆盖**。该入口在 `src/ui/config/plugin.tsx:405`。
- **G-D08-4**：日志面板的 100 行上限（`setup-preinstall.tsx:130-132`）未覆盖，属展示层边界。
- **假设**：安装过程的日志经 `preinstall-log` 事件实时回流；本文件只断言「日志面板出现且内容增长」，不断言具体日志文本。
