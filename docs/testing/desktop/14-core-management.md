# 核心版本管理

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/14-core-management.e2e.ts`（待建立）
> 前置：`13-application-settings.md` 通过；配置对话框可打开在「核心」面板
> 运行：`vitest --project desktop -- test/e2e/desktop/14-core-management.e2e.ts`（待配置，见 G2）

「核心」面板管理 DSH 引擎来源：`local`（用户 CLI 全局安装）与 `app-<tag>`（预打包发布）。本地核心**低于内置插件基线时不参与「本地优先」**（issue #596），此时桌面端自动改用预打包核心并拒绝激活入口——这是本文件最关键的一条异常路径。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 列表真值来自 `get_cores`，`setting_updated` 一并失效 | `src/ui/config/core.tsx:52-56` |
| 排序：本地核心固定在前，预打包按 SemVer 降序（`tag` 兜底） | `src/ui/config/core.tsx:92-102` |
| 孤儿版本单独分组（`orphaned`） | `src/ui/config/core.tsx:104-106`、`:320-324` |
| 本地核心未检测到时渲染 `local_missing_hint` | `src/ui/config/core.tsx:454-456` |
| 切换核心前弹确认框；高风险版本用 danger 语义 | `src/ui/config/core.tsx:142-162` |
| 切换成功后 toast + **自动重启服务** | `src/ui/config/core.tsx:163-181` |
| 低于基线的本地核心：拒绝激活并给出推荐版本提示 | `src/ui/config/core.tsx:132-141`、`:476-478` |
| 基线判定 `isCoreBelowBaseline` | `src/utils/core-version.ts`；issue #596 |
| 「不兼容」标记 | `src/ui/config/core.tsx:353-358` |
| 下载前弹破坏性更改确认 | `src/ui/config/core.tsx:188-196` |
| 下载对话框（复用 `install-progress` 事件流） | `src/ui/config/core.tsx:196-213` |
| 卸载仅对「已下载且非激活」的 app 版本渲染 | `src/ui/config/core.tsx:416-431` |
| 本地核心更新入口仅在确有新版时渲染 | `src/ui/config/core.tsx:108-114`、`:432-447` |
| 最新可用版本取第一个**非预览版** app 版本 | `src/ui/config/core.tsx:113` |
| 「预览版」标记 | `src/ui/config/core.tsx:347-352` |
| 刷新按钮（含加载指示与禁用） | `src/ui/config/core.tsx:260-275`、`:300-312` |
| 打开核心目录 `open_dir` | `src/ui/config/core.tsx:216-226` |

---

## 2. 列表

### [P1] 验证核心列表展示本地与预打包版本

[Case ID] TC-DSK-L3-14-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/core.tsx:52-56`、`:92-106`、`:318-452`
[自动化] 待接线（`test/e2e/desktop/14-core-management.e2e.ts`）
[前置条件] 应用处于 `ready`
[测试数据] 选择器 `dsh-core-row`、`dsh-core-row-local`、`dsh-core-row-app`
[测试步骤] 1. 打开「核心」面板。2. 读取核心行数量与每行版本文本。3. 读取本地核心行与预打包行的标记与相对顺序。
[预期结果] 1. 面板渲染完成。2. 行数量与 `get_cores` 中 `present` 或可下载的条目一致；版本文本非空。3. 本地核心行带「本地」标记且固定排在首位；预打包行带「app」标记并按版本从高到低排列。
[清理] 关闭对话框；`DELETE /session/<id>`

---

## 3. 切换与更新

### [P2] 验证切换核心需确认且切换后自动重启

[Case ID] TC-DSK-L3-14-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/core.tsx:129-186`
[自动化] 待接线（同上）
[前置条件] 存在至少 2 个已下载且 `present` 的核心，其中 1 个为激活态
[测试数据] 目标核心：任一非激活且已下载的核心
[测试步骤] 1. 记录当前激活核心。2. 点击目标核心的选中框。3. 在确认框中确认。4. 等待重启收敛。5. 读取激活核心与连接状态。
[预期结果] 1. 记录成功。2. 确认框出现。3. 确认被接受，出现切换提示。4. 自动重启完成。5. 激活核心为目标核心；连接状态为运行中。
[清理] 切回原核心并等待重启收敛；关闭对话框；`DELETE /session/<id>`

### [P3] [反向] 验证低于基线的本地核心激活被拒绝

[Case ID] TC-DSK-L3-14-006
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/config/core.tsx:132-141`、`:476-478`；issue #596
[自动化] 待接线（同上）
[前置条件] 存在版本低于推荐基线的本地核心（`isCoreBelowBaseline` 为真）
[测试数据] 选择器 `dsh-core-row-local-unsupported`
[测试步骤] 1. 读取该行的「不兼容」标记。2. 点击该行的选中框。3. 读取提示内容与激活核心。4. 读取持久化的 `active_core`。
[预期结果] 1. 标记存在。2. 点击不触发确认框与切换。3. 出现不兼容提示并给出推荐版本号；激活核心未变化。4. `active_core` 未被改写。
[清理] 关闭对话框；`DELETE /session/<id>`

---

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-core-row` | 单个核心行 | 待补 |
| `dsh-core-row-local` | 「本地」标记 | 待补 |
| `dsh-core-row-app` | 「app」标记 | 待补 |
| `dsh-core-row-preview` | 「预览版」标记 | 待补 |
| `dsh-core-row-local-unsupported` | 「不兼容」标记 | 待补 |
| `dsh-core-download` | 「下载」按钮 | 待补 |
| `dsh-core-download-dialog` | 下载进度对话框 | 待补 |
| `dsh-core-uninstall` | 「卸载」按钮 | 待补 |
| `dsh-core-update-local` | 「更新本地核心」按钮 | 待补 |
| `dsh-core-refresh` | 「刷新」按钮 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-14-002` | 验证预览版带标签且不参与更新提示 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-14-005` | 验证本地核心有新版时显示更新入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-14-008` | 验证仅非激活版本可卸载 | 纯逻辑断言，下沉单元测试层 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/ui/config/core.tsx:52-56`、`:92-106`、`:318-452`` | `TC-DSK-L3-14-001` | 正向 |
| ``src/ui/config/core.tsx:129-186`` | `TC-DSK-L3-14-004` | 正向 |
| ``src/ui/config/core.tsx:132-141`、`:476-478`；issue #596` | `TC-DSK-L3-14-006` | 异常 |

---

## 7. 缺口与假设

- **G-D14-1**：`TC-DSK-L3-14-006` 需要「版本低于推荐基线的本地核心」。当前无法在不改动开发者本机全局 `dsh` 安装的前提下构造该状态。接线时需引入可控的 `recommendedVersion` 覆盖（例如通过 `version-recommend.json` 的测试替身）或隔离的用户级安装目录。
- **G-D14-2**：下载/删除预打包核心（数十 MB 级）的用例不应进无人值守流水线，且必须自带清理。
- **G-D14-3**：核心切换会**自动重启服务**并改变后续用例的前置核心。接线时每条切换用例必须在清理中切回原核心并等待收敛。
- **G-D14-4**：孤儿版本（`orphaned`）分组、预览版下载、高于推荐版本的 danger 确认三条分支**未覆盖**。
- **假设**：`get_cores` 在离线时降级为 git tags / 磁盘扫描（`core.tsx` 注释），因此 `TC-DSK-L3-14-001` 在离线环境下仍可运行。
