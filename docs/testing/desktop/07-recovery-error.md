# 异常恢复与全屏错误页

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/07-recovery-error.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/07-recovery-error.e2e.ts`

启动失败与插件崩溃是两条独立的恢复路径，壳层都用全屏页承载。

---

## 1. 插件异常修复

插件异常分两种呈现：**启动崩溃**走全屏恢复页（替换错误页内容），**运行期异常**走醒目对话框（不阻断使用）。本文件验证两者的区分、原因映射、以及三条恢复动作。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `status === 'error' && recovery.required` → `Recovery fullScreen`，否则 `Setup` | `src/layout/components/webview.tsx:50-55` |
| `status === 'ready'` 时渲染运行期 `Recovery` 对话框 | `src/layout/index.tsx:149-152` |
| 全屏页根容器与半透明面板 | `src/ui/plugin/recovery.tsx:86-99` |
| 运行期对话框根容器（遮罩 + 实心面板） | `src/ui/plugin/recovery.tsx:86-99` |
| 失败原因 → i18n key 映射（8 类 + `unknown`） | `src/ui/plugin/recovery.tsx:13-22` |
| 单/多插件标题与按钮文案分支 | `src/ui/plugin/recovery.tsx:71-81` |
| 问题插件 id 列表 + 「问题插件」标记 | `src/ui/plugin/recovery.tsx:114-123` |
| 原始错误区块（空时显示 `—`） | `src/ui/plugin/recovery.tsx:131-136` |
| 快照检测：仅对有快照的 id 显示「从快照还原」 | `src/ui/plugin/recovery.tsx:45-64`、`:141-152` |
| 卸载动作 `recoverAndRedetect` | `src/ui/plugin/recovery.tsx:153-162` |
| 还原动作 `restoreAndRedetect` | `src/ui/plugin/recovery.tsx:145` |
| 「重启」「安全模式」「暂不处理」 | `src/ui/plugin/recovery.tsx:163-174` |
| 恢复耗尽提示 | `src/ui/plugin/recovery.tsx:125-127` |
| 安全模式动作 | `src/store/modules/harness/store.ts:669` |
| 快照查询 `get_plugin_backup` | `src/ui/plugin/recovery.tsx:51` |
| 开发期预览快捷键（仅 DEV） | `src/layout/index.tsx:50-78` |

---

### 呈现与信息

### [P1] 验证启动崩溃时渲染全屏恢复页

[Case ID] TC-DSK-L3-07-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:50-55`；`src/ui/plugin/recovery.tsx:86-99`
[自动化] 待接线（`test/e2e/desktop/07-recovery-error.e2e.ts`）
[前置条件] 构造使服务启动失败且 `recovery.required` 为真的插件（如 UI 槽位冲突）
[测试数据] 选择器 `dsh-recovery-root`、`dsh-recovery-fullscreen`
[测试步骤] 1. 拉起应用并等待进入 `error`。2. 读取恢复页根节点与其全屏标记。3. 读取 `Setup` 错误内容是否存在。
[预期结果] 1. 进入 `error` 状态。2. 根节点存在；全屏标记为真。3. `Setup` 错误内容不存在（被替换而非叠加）。
[清理] 移除问题插件；`DELETE /session/<id>`

---

### 恢复动作

### [P2] 验证「卸除此插件并继续检测」后重新检测

[Case ID] TC-DSK-L3-07-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/plugin/recovery.tsx:153-162`；`src/store/modules/recovery/store.ts`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-07-001 通过
[测试数据] 选择器 `dsh-recovery-remove`
[测试步骤] 1. 点击「卸除此插件并继续检测」。2. 读取按钮进行中文案。3. 等待收敛。4. 读取恢复页可见性与问题插件列表。
[预期结果] 1. 点击被接受。2. 文案切换为「正在卸载」语义。3. 收敛完成。4. 恢复页消失或刷新为新的问题插件集合（不再显示已卸载插件）。
[清理] `DELETE /session/<id>`

### [P3] 验证仅对有快照的插件提供「从快照还原」

[Case ID] TC-DSK-L3-07-003
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/plugin/recovery.tsx:45-64`、`:141-152`；issue #303
[自动化] 待接线（同上）
[前置条件] 恢复信息包含 2 个插件，其中恰有 1 个存在快照
[测试数据] 选择器 `dsh-recovery-restore`
[测试步骤] 1. 读取「从快照还原」按钮存在性。2. 点击后读取还原动作的入参集合。
[预期结果] 1. 按钮存在。2. 入参集合仅包含确有快照的那个插件 id（不含无快照插件，避免 `SNAPSHOT_NOT_FOUND` 导致整体失败）。
[清理] 清除插件异常；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-recovery-root` | 恢复界面根节点 | 待补 |
| `dsh-recovery-fullscreen` | 全屏恢复页标记 | 待补 |
| `dsh-recovery-plugin-id` | 问题插件 id 行 | 待补 |
| `dsh-recovery-reason` | 原因标题 | 待补 |
| `dsh-recovery-raw-error` | 原始错误区块 | 待补 |
| `dsh-recovery-restore` | 「从快照还原」按钮 | 待补 |
| `dsh-recovery-remove` | 「卸除此插件并继续检测」按钮 | 待补 |
| `dsh-recovery-restart` | 「重启」按钮 | 待补 |
| `dsh-recovery-safe-mode` | 「安全模式」按钮 | 待补 |
| `dsh-recovery-dismiss` | 「暂不处理」按钮 | 待补 |
| `dsh-recovery-exhausted` | 恢复耗尽提示 | 待补 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/webview.tsx:50-55`；`src/ui/plugin/recovery.tsx:86-99`` | `TC-DSK-L3-07-001` | 正向 |
| ``src/ui/plugin/recovery.tsx:153-162`；`src/store/modules/recovery/store.ts`` | `TC-DSK-L3-07-002` | 正向 |
| ``src/ui/plugin/recovery.tsx:45-64`、`:141-152`；issue #303` | `TC-DSK-L3-07-003` | 异常 |

---

### 缺口与假设

- **G-D07-1**：开发期预览快捷键（`Ctrl+Shift+1/2`，`src/layout/index.tsx:50-78`）可在 DEV 构建下注入受控的恢复态。**接线时应优先使用该入口**构造 `slot_conflict` 与 `duplicate_loader_entry` 两类原因，避免依赖真实损坏插件；但需注意它仅在 `import.meta.env.DEV` 下生效。
- **G-D07-2**：8 类失败原因只覆盖 1 类。其余原因的构造需要真实制造对应故障（路由重复、bundle 解析失败、槽位冲突等），成本高，登记为已知盲区。
- **G-D07-3**：`restoreAndRedetect` 的**成功路径**未覆盖（还原会停服务并需要重启）。仅覆盖「入参按快照存在性过滤」这一关键正确性点（issue #303 的修复目标）。
- **假设**：`recovery.required` 与 `recovery.info` 同时为真时组件才渲染（`src/ui/plugin/recovery.tsx:66-68`）；部分为真时返回 `null`，本套未单独覆盖该分支。

---

## 2. 启动失败与恢复

本文件的错误页指 `recovery.required == false` 的 `Setup` 错误态；插件异常导致的全屏恢复页归「插件异常修复」模块。启动失败有三种**互斥**的针对性提示（补丁层语法错误、补丁层悬空条目、插件路由冲突），必须按失败特征二选一或三选一呈现，不能同时出现。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `status === 'error'` 且非恢复态 → `Setup` | `src/layout/components/webview.tsx:50-55` |
| 错误页标题与副标题（错误态副标题为空） | `src/layout/components/setup.tsx:58-62` |
| 错误日志：`error && errorLogs.length > 0 ? errorLogs : undefined` | `src/layout/components/setup.tsx:63-66` |
| 针对性提示互斥优先级：`patchLayerHint \|\| pluginConflictHint \|\| inotifyLimitHint` | `src/layout/components/setup.tsx:67-69` |
| 补丁层两类问题的判定：`containsPatchEntryUnresolved(errorMsg)` | `src/layout/components/setup.tsx:72-73`、`src/store/modules/harness/index.ts` |
| 「重试」→ `store.harness.boot()` | `src/layout/components/setup.tsx:91-98` |
| 「隔离补丁层」→ `quarantineBrokenPatchLayers()` | `src/layout/components/setup.tsx:99-108`、`src/store/modules/harness/store.ts:697` |
| 「移除悬空条目」→ `stripUnresolvedPatchEntries()` | `src/layout/components/setup.tsx:109-118`、`src/store/modules/harness/store.ts:728` |
| 「复制日志」→ `read_run_logs` + 剪贴板 | `src/layout/components/setup.tsx:25-40`、`:119-125` |
| 「安全模式」→ `enterSafeMode()` | `src/layout/components/setup.tsx:126-134`、`src/store/modules/harness/store.ts:669` |
| 安全模式提示文案 | `src/layout/components/setup.tsx:136-138` |
| 补丁层隔离失败返回 `PATCH_LAYER_QUARANTINE_FAILED` | `docs/specs/agents.desktop.md` §6 issue #525 |
| 悬空条目报 `PATCH_LAYER_ENTRY_UNRESOLVED`（文件/行号/包名） | `docs/specs/agents.desktop.md` §6；`src-tauri/src/service/plugin/patch_entries.rs` |
| Linux inotify 上限（ENOSPC）提示 | `src/store/modules/harness/types.ts:63` |

---

### 错误页呈现

### [P1] 验证启动失败展示错误页与错误信息

[Case ID] TC-DSK-L3-07-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:50-54`；`src/layout/components/setup.tsx:58-62`、`:82`
[自动化] 待接线（`test/e2e/desktop/07-recovery-error.e2e.ts`）
[前置条件] 构造服务启动失败且不触发插件恢复（如核心不可用）
[测试数据] 选择器 `dsh-setup-error`、`dsh-setup-error-message`
[测试步骤] 1. 拉起应用并等待进入 `error`。2. 读取错误页标题与错误信息节点。
[预期结果] 1. 进入 `error` 状态。2. 标题为错误语义；错误信息节点存在且非空。
[清理] 移除失败原因；`DELETE /session/<id>`

---

### 针对性提示（三类互斥）

### [P3] 验证补丁层语法错误时展示隔离入口

[Case ID] TC-DSK-L3-07-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/setup.tsx:73`、`:99-108`；issue #525
[自动化] 待接线（同上）
[前置条件] 构造 `cordis.patch.yml` YAML 语法错误
[测试数据] 选择器 `dsh-setup-patch-hint`、`dsh-setup-quarantine-patch`、`dsh-setup-strip-patch-entries`
[测试步骤] 1. 拉起应用并等待进入 `error`。2. 读取针对性提示节点。3. 读取「隔离补丁层」入口存在性。4. 读取「移除悬空条目」入口存在性。
[预期结果] 1. 进入 `error`。2. 提示存在且包含文件与行列号信息。3. 隔离入口存在。4. 悬空条目入口不存在（两类问题互斥）。
[清理] 还原 `cordis.patch.yml`；`DELETE /session/<id>`

---

### 恢复动作

### [P2] 验证「重试」重新启动服务

[Case ID] TC-DSK-L3-07-008
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/setup.tsx:91-98`
[自动化] 待接线（同上）
[前置条件] 已进入 `error`，且失败原因已被移除
[测试数据] 选择器 `dsh-setup-retry`
[测试步骤] 1. 移除失败原因。2. 点击「重试」。3. 等待服务健康。
[预期结果] 1. 移除成功。2. 点击被接受，页面进入安装/启动态。3. 在超时内恢复健康并渲染 iframe。
[清理] `DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-setup-error` | 错误页根容器 | 待补 |
| `dsh-setup-error-message` | 错误信息文本 | 待补 |
| `dsh-setup-error-logs` | 错误日志面板 | 待补 |
| `dsh-setup-patch-hint` | 补丁层针对性提示 | 待补 |
| `dsh-setup-plugin-conflict-hint` | 插件冲突针对性提示 | 待补 |
| `dsh-setup-quarantine-patch` | 「隔离补丁层」按钮 | 待补 |
| `dsh-setup-strip-patch-entries` | 「移除悬空条目」按钮 | 待补 |
| `dsh-setup-retry` | 「重试」按钮 | 待补 |
| `dsh-setup-copy-logs` | 「复制日志」按钮 | 待补 |
| `dsh-setup-safe-mode` | 「安全模式」按钮 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-07-006` | 验证悬空 insert 时展示移除悬空条目入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-07-007` | 验证插件路由冲突时展示针对性提示 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/webview.tsx:50-54`；`src/layout/components/setup.tsx:58-62`、`:82`` | `TC-DSK-L3-07-004` | 正向 |
| ``src/layout/components/setup.tsx:73`、`:99-108`；issue #525` | `TC-DSK-L3-07-005` | 异常 |
| ``src/layout/components/setup.tsx:91-98`` | `TC-DSK-L3-07-008` | 正向 |

---

### 缺口与假设

- **G-D07-4**：`TC-DSK-L3-07-005` 需要改坏用户真实档案下的 `cordis.patch.yml`。按 `00-overview.md` G8，测试必须使用独立数据目录并在清理时还原（含 `quarantine` 产生的 `.broken-<Timestamp>` 与 `strip` 产生的 `.bak-<Timestamp>` 文件）。
- **G-D07-5**：三类针对性提示互斥的**判定逻辑**由 `utils.ts` 实现，本文件只断言「同时只出现一类」。若需覆盖判定本身，属单元测试职责。
- **G-D07-6**：Linux inotify 上限提示（`inotifyLimitHint`）**未覆盖**，需 Linux 环境并调低 `fs.inotify.max_user_watches`。
- **G-D07-7**：`Setup` 错误页在 `recovery.required == true` 时被全屏恢复页替换（`webview.tsx:52-54`）。两者同时为真时的优先级**未覆盖**，属 `07` 与 `07` 的交界。
- **假设**：`errorLogs` 由启动失败时从服务日志中读取（`store.ts` 的 `attachStartupDiagnostics`）；日志行内容随失败原因变化，本文件只断言「非空且来自真实日志」。
