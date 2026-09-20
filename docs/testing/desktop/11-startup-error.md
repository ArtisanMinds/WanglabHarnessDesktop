# 启动失败与恢复

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/11-startup-error.e2e.ts`（待建立）
> 前置：`07-harness-lifecycle.md` 通过；可构造各类非插件类启动失败
> 运行：`vitest --project desktop -- test/e2e/desktop/11-startup-error.e2e.ts`（待配置，见 G2）

本文件的错误页指 `recovery.required == false` 的 `Setup` 错误态；插件异常导致的全屏恢复页归 `10`。启动失败有三种**互斥**的针对性提示（补丁层语法错误、补丁层悬空条目、插件路由冲突），必须按失败特征二选一或三选一呈现，不能同时出现。

---

## 1. 事实基线

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

## 2. 错误页呈现

### [P1] 验证启动失败展示错误页与错误信息

[Case ID] TC-DSK-L3-11-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/webview.tsx:50-54`；`src/layout/components/setup.tsx:58-62`、`:82`
[自动化] 待接线（`test/e2e/desktop/11-startup-error.e2e.ts`）
[前置条件] 构造服务启动失败且不触发插件恢复（如核心不可用）
[测试数据] 选择器 `dsh-setup-error`、`dsh-setup-error-message`
[测试步骤] 1. 拉起应用并等待进入 `error`。2. 读取错误页标题与错误信息节点。
[预期结果] 1. 进入 `error` 状态。2. 标题为错误语义；错误信息节点存在且非空。
[清理] 移除失败原因；`DELETE /session/<id>`

---

## 3. 针对性提示（三类互斥）

### [P3] 验证补丁层语法错误时展示隔离入口

[Case ID] TC-DSK-L3-11-004
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

## 4. 恢复动作

### [P2] 验证「重试」重新启动服务

[Case ID] TC-DSK-L3-11-007
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

## 5. 选择器契约（待补）

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

## 6. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-11-005` | 验证悬空 insert 时展示移除悬空条目入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-006` | 验证插件路由冲突时展示针对性提示 | 纯逻辑断言，下沉单元测试层 |

---

## 7. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/webview.tsx:50-54`；`src/layout/components/setup.tsx:58-62`、`:82`` | `TC-DSK-L3-11-001` | 正向 |
| ``src/layout/components/setup.tsx:73`、`:99-108`；issue #525` | `TC-DSK-L3-11-004` | 异常 |
| ``src/layout/components/setup.tsx:91-98`` | `TC-DSK-L3-11-007` | 正向 |

---

## 8. 缺口与假设

- **G-D11-1**：TC-DSK-L3-11-004/083 需要改坏用户真实档案下的 `cordis.patch.yml`。按 `00-overview.md` G8，测试必须使用独立数据目录并在清理时还原（含 `quarantine` 产生的 `.broken-<Timestamp>` 与 `strip` 产生的 `.bak-<Timestamp>` 文件）。
- **G-D11-2**：三类针对性提示互斥的**判定逻辑**由 `utils.ts` 实现，本文件只断言「同时只出现一类」。若需覆盖判定本身，属单元测试职责。
- **G-D11-3**：Linux inotify 上限提示（`inotifyLimitHint`）**未覆盖**，需 Linux 环境并调低 `fs.inotify.max_user_watches`。
- **G-D11-4**：`Setup` 错误页在 `recovery.required == true` 时被全屏恢复页替换（`webview.tsx:52-54`）。两者同时为真时的优先级**未覆盖**，属 `10` 与 `11` 的交界。
- **假设**：`errorLogs` 由启动失败时从服务日志中读取（`store.ts` 的 `attachStartupDiagnostics`）；日志行内容随失败原因变化，本文件只断言「非空且来自真实日志」。
