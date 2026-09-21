# 核心与服务生命周期

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/05-core-lifecycle.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/05-core-lifecycle.e2e.ts`

dsh 核心版本与服务进程是应用可用性的主干：生命周期控制、核心切换/下载/卸载、错误码矩阵与状态机。

---

## 1. 服务生命周期

DSH 服务是一个由宿主拉起的子进程，壳层通过健康检查与进程退出事件维护它的状态。本文件的重点是**状态不漂移**：界面显示的运行状态必须与服务真实状态一致，且重复触发必须收敛为一次。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 服务状态字段 `serviceRunning` / `serviceHealthy` / `busyAction` | `src/store/modules/harness/store.ts:101-105` |
| `busyAction` 值域 `restart`/`shutdown`/`start`/`openBrowser`/`null` | `src/store/modules/harness/types.ts:7` |
| 重启流程 `restart()`，内部先 `shutdown_harness` | `src/store/modules/harness/store.ts:630`、`:645-648` |
| 重启使用 `SingleFlight` 收敛并发 | `src/store/modules/harness/store.ts:68` |
| 停止流程 `shutdown()`，写 `busyAction = 'shutdown'` | `src/store/modules/harness/store.ts:752-762` |
| 「重启」「停止」仅在 `serviceRunning` 时渲染 | `src/ui/config/debug.tsx:233-255` |
| 三个按钮在 `busyAction !== null` 时禁用 | `src/ui/config/debug.tsx:224`、`:239`、`:249` |
| 连接状态 Chip：`serviceRunning` 决定成功/危险语义 | `src/ui/config/debug.tsx:189-196` |
| 进程退出事件载荷 `{ pid, exitCode }` | `src/store/modules/harness/types.ts:10-13` |
| 退出事件在 `busyAction === 'shutdown'` 时被忽略 | `src/store/modules/harness/runtime.ts:27` |
| 外部打开 `openBrowser()`，写 `busyAction = 'openBrowser'` | `src/store/modules/harness/store.ts:791-794` |
| 运行期信息 `get_runtime_info`（含 `service_url`） | `src/ui/config/debug.tsx:21-30`、`:51-54` |

---

### 正常路径

### [P1] 验证「重启」后服务恢复健康

[Case ID] TC-DSK-L3-05-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/store/modules/harness/store.ts:630`；`src/ui/config/debug.tsx:238`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 配置对话框打开在「应用」面板；服务处于运行中
[测试数据] 选择器 `dsh-config-restart`
[测试步骤] 1. 记录当前服务地址。2. 点击「重启」。3. 等待服务重新健康。4. 读取服务地址与连接状态。
[预期结果] 1. 记录成功。2. 点击被接受。3. 在超时内恢复健康。4. 服务地址与记录值一致；连接状态为运行中。
[清理] `DELETE /session/<id>`

### [P2] 验证「停止」后连接状态变为已停止

[Case ID] TC-DSK-L3-05-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/store/modules/harness/store.ts:752-762`；`src/ui/config/debug.tsx:189-196`
[自动化] 待接线（同上）
[前置条件] 服务处于运行中
[测试数据] 选择器 `dsh-config-shutdown`、`dsh-config-service-status`
[测试步骤] 1. 点击「停止」。2. 等待停止完成。3. 读取连接状态 Chip 的文本与颜色语义。
[预期结果] 1. 点击被接受。2. 停止完成。3. 文本为「已停止」语义，颜色语义为危险（非成功）。
[清理] 重新拉起服务；`DELETE /session/<id>`

---

### 异常与边界

### [P3] [反向] 验证 harness 进程意外退出时前端状态同步

[Case ID] TC-DSK-L3-05-003
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/store/modules/harness/runtime.ts:27`；`src/store/modules/harness/types.ts:10-13`
[自动化] 待接线（同上）
[前置条件] 服务处于运行中；可在应用外部终止 harness 子进程
[测试数据] 触发方式：在应用外部终止 harness 子进程（事件载荷含 `pid` 与 `exitCode`）
[测试步骤] 1. 记录 harness 子进程 pid。2. 在应用外部终止该进程。3. 等待前端收到退出事件。4. 读取连接状态与 iframe 区域。
[预期结果] 1. 记录成功。2. 进程终止。3. 事件被前端接收。4. 连接状态不再显示运行中；iframe 区域回到加载/错误态而非继续显示旧页面。
[清理] 重新拉起服务；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-config-service-status` | 连接状态 Chip | 待补 |
| `dsh-config-service-url` | 服务地址只读输入框 | 待补 |
| `dsh-config-restart` | 「重启」按钮 | 待补 |
| `dsh-config-shutdown` | 「停止」按钮 | 待补 |
| `dsh-config-open-browser` | 「在浏览器打开」按钮 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-05-004` | 验证连续触发重启只执行一次 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/store/modules/harness/store.ts:630`；`src/ui/config/debug.tsx:238`` | `TC-DSK-L3-05-001` | 正向 |
| ``src/store/modules/harness/store.ts:752-762`；`src/ui/config/debug.tsx:189-196`` | `TC-DSK-L3-05-002` | 正向 |
| ``src/store/modules/harness/runtime.ts:27`；`src/store/modules/harness/types.ts:10-13`` | `TC-DSK-L3-05-003` | 异常 |

---

### 缺口与假设

- **G-D05-1**：`TC-DSK-L3-05-004`（现属单元测试层）需要统计后端 `launch_harness` 的调用次数。当前无计数出口，需在测试编排层计数（例如通过服务日志行数）或增加只读诊断命令。
- **G-D05-2**：「在浏览器打开」只验证命令成功返回，**不验证系统浏览器实际打开**（属系统表面，见 `00-overview.md` G9）。人工确认项。
- **G-D05-3**：停止状态下 UI 不提供「启动」入口（`debug.tsx:233-255` 只在 `serviceRunning` 时渲染两个按钮）。这是当前设计，不是缺陷；但意味着「停止 → 手动启动」只能靠重启或插件操作触发，本套未覆盖该路径。
- **假设**：`restart()` 在失败时会进入应用错误态（`fail()`），由 `07` 覆盖错误页呈现；本文件不重复断言错误页细节。

---

## 2. 核心版本管理

「核心」面板管理 DSH 引擎来源：`local`（用户 CLI 全局安装）与 `app-<tag>`（预打包发布）。本地核心**低于内置插件基线时不参与「本地优先」**（issue #596），此时桌面端自动改用预打包核心并拒绝激活入口——这是本文件最关键的一条异常路径。

---

### 事实基线

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

### 列表

### [P1] 验证核心列表展示本地与预打包版本

[Case ID] TC-DSK-L3-05-005
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/core.tsx:52-56`、`:92-106`、`:318-452`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 应用处于 `ready`
[测试数据] 选择器 `dsh-core-row`、`dsh-core-row-local`、`dsh-core-row-app`
[测试步骤] 1. 打开「核心」面板。2. 读取核心行数量与每行版本文本。3. 读取本地核心行与预打包行的标记与相对顺序。
[预期结果] 1. 面板渲染完成。2. 行数量与 `get_cores` 中 `present` 或可下载的条目一致；版本文本非空。3. 本地核心行带「本地」标记且固定排在首位；预打包行带「app」标记并按版本从高到低排列。
[清理] 关闭对话框；`DELETE /session/<id>`

---

### 切换与更新

### [P2] 验证切换核心需确认且切换后自动重启

[Case ID] TC-DSK-L3-05-007
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

[Case ID] TC-DSK-L3-05-009
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

### 选择器契约（待补）

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

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-05-006` | 验证预览版带标签且不参与更新提示 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-008` | 验证本地核心有新版时显示更新入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-010` | 验证仅非激活版本可卸载 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/ui/config/core.tsx:52-56`、`:92-106`、`:318-452`` | `TC-DSK-L3-05-005` | 正向 |
| ``src/ui/config/core.tsx:129-186`` | `TC-DSK-L3-05-007` | 正向 |
| ``src/ui/config/core.tsx:132-141`、`:476-478`；issue #596` | `TC-DSK-L3-05-009` | 异常 |

---

### 缺口与假设

- **G-D05-4**：`TC-DSK-L3-05-009` 需要「版本低于推荐基线的本地核心」。当前无法在不改动开发者本机全局 `dsh` 安装的前提下构造该状态。接线时需引入可控的 `recommendedVersion` 覆盖（例如通过 `version-recommend.json` 的测试替身）或隔离的用户级安装目录。
- **G-D05-5**：下载/删除预打包核心（数十 MB 级）的用例不应进无人值守流水线，且必须自带清理。
- **G-D05-6**：核心切换会**自动重启服务**并改变后续用例的前置核心。接线时每条切换用例必须在清理中切回原核心并等待收敛。
- **G-D05-7**：孤儿版本（`orphaned`）分组、预览版下载、高于推荐版本的 danger 确认三条分支**未覆盖**。
- **假设**：`get_cores` 在离线时降级为 git tags / 磁盘扫描（`core.tsx` 注释），因此 `TC-DSK-L3-05-005` 在离线环境下仍可运行。

---

## 3. 核心版本管理：错误码与回滚矩阵

本文件把 `version.rs` 与 `local.rs` 的错误码逐条映射为可观察结果，重点在**切换失败必须回滚**：目录互换第二步失败时激活位要还原，而不是留下半切换的核心。列表渲染与入口可见性归「核心版本管理」模块。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 全部 `CORE_*` 错误码定义 | `src-tauri/src/service/core/version.rs:339`、`:354`、`:360`、`:371`、`:380`、`:390`、`:409`、`:455`、`:463`、`:474`、`:512`、`:514`、`:530`、`:531`、`:542`、`:552`、`:560`、`:564`、`:574` |
| 本地核心三个错误码与输出尾部（末 12 行非空） | `src-tauri/src/service/core/local.rs:274`、`:322`、`:339`（尾部逻辑 `:324`） |
| 转换锁 15 秒超时 `CORE_TRANSITION_TIMEOUT` | `src-tauri/src/service/workflow/process.rs:127`、`:135` |
| `CORE_LOCAL_UNSUPPORTED` 亦作为降级告警日志 | `src-tauri/src/service/core/source.rs:107` |
| 切换前停服与孤儿进程清扫 | `src-tauri/src/service/core/version.rs:330`、`:421` |
| 整个切换持有转换锁（与 launch 共用） | `src-tauri/src/service/core/version.rs:347`、`:404`；`src-tauri/src/service/workflow/process.rs:116` |
| `switch_app_version` 备份、互换与回滚 | `src-tauri/src/service/core/version.rs:443` |
| 下载幂等：`dest.exists()` 直接返回版本行 | `src-tauri/src/service/core/version.rs:500`、`:594` |
| 卸载守卫与删除失败 | `src-tauri/src/service/core/version.rs:550` |
| `local_core_uses_pnpm` 布局判定 | `src-tauri/src/service/core/local.rs:247` |
| 更新命令、Windows `CREATE_NO_WINDOW` 与版本回读 | `src-tauri/src/service/core/local.rs:281`、`:314`、`:342` |
| 核心行字段（camelCase）与 `get_cores` 命令 | `src-tauri/src/service/core/source.rs:43`；`src-tauri/src/bridge/core.rs:12` |
| issue #596：低于基线的本地核心被拒并回退预打包，`active_core` 不改写 | `src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107` |
| 核心面板的标记、下载/卸载/更新入口条件 | `src/ui/config/core.tsx:92`、`:113`、`:416`、`:432` |

---

### 切换与回滚

### [P1] 验证成功切换后目录互换与来源标记同步

[Case ID] TC-DSK-L3-05-013
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/core/version.rs:443`、`:404`、`:421`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 已下载 tag 为 `dsh-<v2>` 的槽位；当前激活核心为另一版本
[测试数据] 目标 tag `dsh-<v2>`
[测试步骤] 1. 记录切换前 `dependencies/dsh` 对应的版本与 `dependencies/dsh-<v1>` 的存在性。2. 切换到 `app-dsh-<v2>`。3. 读取 `get_cores` 中 `active` 为真的行与磁盘槽位。
[预期结果] 1. 记录成功。2. 切换返回成功。3. `dependencies/dsh` 内容为 `v2`；原激活版本落在 `dsh-<v1>` 槽位；`active` 行 `source` 为 `app`、`tag` 为 `dsh-<v2>`。
[清理] 切回原核心；按需卸载新增槽位

### [P3] [反向] 验证备份清理失败即中止，不动激活位

[Case ID] TC-DSK-L3-05-015
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/core/version.rs:455`、`:443`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 当前激活版本有 tag 记录；同名残留备份槽位存在且无法删除
[测试数据] 备份槽位名 = 当前激活版本记录的 tag；制造不可删条件：占用备份目录句柄或改权限
[测试步骤] 1. 记录激活核心版本与激活目录内容。2. 制造备份槽位不可删条件。3. 切换到另一已下载 tag。4. 读取错误与激活目录内容。
[预期结果] 1. 记录成功。2. 条件已就绪。3. 返回 `CORE_SWITCH_FAILED: cannot clean old backup`，在重命名激活目录之前中止。4. 激活目录与记录值逐项一致，未被改名或破坏。
[清理] 解除占用或恢复权限；删除残留备份槽位

---

### 下载、卸载与来源回退

### [P3] [反向] 验证低于基线的本地核心被拒且不改写 active_core

[Case ID] TC-DSK-L3-05-020
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 已安装低于内置插件基线的本地 CLI 核心；记录 store 中 `active_core` 原值
[测试数据] 低于 `recommended` 基线的本地 dsh 版本
[测试步骤] 1. 调用切换到 `local`。2. 读取返回错误文本。3. 读取 store 中的 `active_core`。4. 调用 `get_cores` 读取本地行与激活行。
[预期结果] 1. 返回 `CORE_LOCAL_UNSUPPORTED`。2. 消息给出本地版本与基线版本，并提示 `npm install -g @deepseek-ai/dsh@latest` 或保留内置版本。3. `active_core` 与记录值逐字一致，未被改写。4. 激活行为预打包核心；本地行仍被列出，不作为激活来源。
[清理] 卸载或升级本地核心；重启服务

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-05-011` | 验证非法 id 与不可用目标的错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-012` | 验证下载幂等：已存在槽位不再联网 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-014` | 验证目录互换失败时回滚到原激活版本 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-016` | 验证切换前先停服并清扫孤儿进程 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-017` | 验证转换锁超时返回专用错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-018` | 验证下载链路的分阶段错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-019` | 验证卸载守卫与删除失败 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-021` | 验证更新本地核心的可观察结果 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-022` | 验证按全局布局选择 pnpm 或 npm 更新 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-023` | 验证核心行字段与标记语义 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-024` | 验证切换后激活核心消失的错误码 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/service/core/version.rs:443`、`:404`、`:421`` | `TC-DSK-L3-05-013` | 正向 |
| ``src-tauri/src/service/core/version.rs:455`、`:443`` | `TC-DSK-L3-05-015` | 异常 |
| ``src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107`` | `TC-DSK-L3-05-020` | 异常 |

---

### 缺口与假设

- **G-D05-8**：`CORE_APP_NOT_FOUND: bundled core is not installed`（`version.rs:371`）需要移除或改名随包核心二进制才能触发，本文件未为它安排 Case。
- **G-D05-9**：回滚类用例（211、212、216）需要制造重命名或删除失败。Windows 上的可靠手段是占用目录句柄；权限手段需管理员。接线时优先用句柄占用。
- **G-D05-10**：TC-DSK-L3-05-017 需要人为持有转换锁超过 15 秒，当前无外部注入点，需测试编排层配合或增加诊断命令。
- **G-D05-11**：`TC-DSK-L3-05-013` 的早退分支「当前激活 tag 与目标 tag 相同 → 只改来源标记」（`version.rs:413`）未单独覆盖；同版本 local → app 的来源改写属该分支。
- **G-D05-12**：卸载前停服失败只记警告不阻断（`version.rs:568`），意味着删除可能在被占用目录上退化；该降级路径未验证。
- **G-D05-13**：`CORE_LOCAL_UNSUPPORTED` 在 `source.rs:107` 同时以一次性降级警告日志出现（仅告警一次）。日志侧断言当前无出口，217 只断言命令返回值与 `active_core`。
- **假设**：核心切换的成功路径不负责重启服务，重启由前端触发；本文件在切换类用例中只断言目录与设置，不重复断言服务恢复（归本文件的「服务生命周期」与「核心版本管理」模块）。

---

## 4. 服务状态机、健康检查与进程韧性

后端用五态枚举描述服务，判定权在「是否持有进程」与「端口是否可探活」两个条件上，前端事件只是它的投影。本文件验证状态不漂移、后端 5 秒轮询与前端 1 秒起退避这两套时间常数不被混淆、以及进程意外退出后的复位路径。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 状态枚举变体顺序 `Initial/Installing/Starting/Running/Stopped`；静态初值为 `Initial` | `src-tauri/src/service/workflow/status.rs:5`、`:18` |
| 安装依赖进入 **Installing**（真实安装或 Git-only 补丁路径） | `src-tauri/src/bridge/lifecycle.rs:122` |
| 安装失败经 `reset_install_status` 复位为 **Stopped** | `src-tauri/src/bridge/lifecycle.rs:46`、`:234`、`:247` |
| 启动时已持有进程 → **Running**；否则 **Starting** 后拉起 | `src-tauri/src/service/workflow/launch.rs:187`、`:199`、`:201` |
| 停止 → **Stopped**；`restart` = stop（→Stopped）+ start（→Starting） | `src-tauri/src/service/workflow/process.rs:477`、`:478`；`src-tauri/src/service/workflow/launch.rs:209` |
| 健康 tick 命中 → **Running** | `src-tauri/src/task/tick_check_dsh_process/mod.rs:21` |
| tick 兜底：无被持有进程但状态仍为 Running → **Stopped** | `src-tauri/src/task/tick_check_dsh_process/mod.rs:31` |
| 查询命令 `get_dsh_status()` 返回 `Status`；注册于构建器 | `src-tauri/src/bridge/lifecycle.rs:413`；`src-tauri/src/desktop/builder.rs:878` |
| 事件 `dsh-status-updated` 载荷为序列化 `Status`（单位枚举 → 字符串） | `src-tauri/src/service/workflow/status.rs:5` |
| `emit_status` 是唯一发射点（`app_handle.emit`，错误忽略），共 9 处调用 | `src-tauri/src/bridge/lifecycle.rs:48`、`:123`、`:235`；`src-tauri/src/service/workflow/launch.rs:190`、`:201`；`src-tauri/src/service/workflow/process.rs:184`、`:478`；`src-tauri/src/task/tick_check_dsh_process/mod.rs:23`、`:31` |
| 事件 `harness-process-exited` 载荷 `HarnessProcessExitedPayload{pid, exitCode}`（camelCase） | `src-tauri/src/service/workflow/process.rs:17`、`:185` |
| 后端周期轮询为 **5 秒**（非 1 秒），每轮 `tick_check_dsh_process::trigger` + `check_and_emit_theme` + `plugin::watch::check_and_emit`；注释「1s 偏激进，降为 5s」 | `src-tauri/src/service/scheduler/mod.rs:5`、`:16` |
| 调度器启动点 | `src-tauri/src/desktop/builder.rs:130` |
| 「1 秒」只存在于前端：`HEALTH_PROBE_INITIAL_INTERVAL = 1000`、`HEALTH_PROBE_MAX_INTERVAL = 5000`（×1.5 递增封顶）、单次探测 8 秒超时 | `src/store/modules/harness/constants.ts:11`；`src/store/modules/harness/utils.ts:44`、`:132` |
| 探测经 `proxy_health_check` 打 `get_dsh_service_url(port)` + `/` 并要求 HTTP 200 | `src-tauri/src/service/workflow/utils.rs:129` |
| tick 就绪为双重条件 `has_owned_process() && is_dsh_running(port)`，仅在状态非 Running 时置位 | `src-tauri/src/task/tick_check_dsh_process/mod.rs:11`、`:16` |
| `is_dsh_running(port)` 用 2 秒超时回环客户端并要求 `/` 返回 200 | `src-tauri/src/service/workflow/utils.rs:130` |
| 健康检查信号：`HARNESS_NOT_OWNED` / `HARNESS_NOT_READY` / `healthy - {ready}/{total} client modules ready`；就绪要求 `total > 0 && ready == total` | `src-tauri/src/service/workflow/health.rs:47`、`:60`、`:90`、`:55` |
| 意外退出检测：spawn 成功后专用监视线程盯最终进程（Windows `WaitForSingleObject(handle, INFINITE)` + `GetExitCodeProcess`；Unix `child.wait()`）→ `on_owned_process_exit`（PID 匹配才清、幂等、置 Stopped 并发事件）；5 秒 tick 为兜底 | `src-tauri/src/service/workflow/launch.rs:721`、`:835`；`src-tauri/src/service/workflow/process.rs:29`、`:46`、`:71`、`:102`、`:143`、`:161` |
| 被持有进程存为 `Mutex<Option<OwnedProcess>>`（PID + Windows HANDLE）；`has_owned_process()` 读它；`LAUNCH_GUARD: AtomicBool` 由 `LaunchGuard::drop` 复位 | `src-tauri/src/service/workflow/process.rs:46`、`:29` |
| 启动去重：已持有进程 → `Ok(())` 记「Owned Harness process is already running, skipping launch」；`LAUNCH_GUARD.compare_exchange` 失败 → `Ok(())` 记「Harness launch already in progress, skipping」；仅持守卫路径清扫孤儿 | `src-tauri/src/service/workflow/launch.rs:283`、`:287`、`:294` |
| 启动前校验二进制：`NODE_NOT_FOUND: Node.js not installed` / `HARNESS_NOT_FOUND: Harness not installed` | `src-tauri/src/service/workflow/launch.rs:268`、`:273` |
| `terminate_stale_harness_processes` 定义于 process.rs；Windows 用 PowerShell `Get-CimInstance Win32_Process`（`node.exe` + dsh 入口 + `--profile` + `--port`，排除 `plugin`）→ `kill_pid_tree`；Unix 用 `ps -ww -axo pid=,command=` 参数边界匹配；清理后 sleep 800ms；**debug 构建为 no-op** | `src-tauri/src/service/workflow/process.rs:357` |
| 陈旧进程清扫的 5 个调用点：① 启动 `sweep_orphan_harness` ② spawn 前 ③ 停止后 ④⑤ 两处核心切换 | `src-tauri/src/service/workflow/sweep.rs:34`；`src-tauri/src/desktop/builder.rs:102`；`src-tauri/src/service/workflow/launch.rs:304`；`src-tauri/src/service/workflow/install.rs:40`；`src-tauri/src/service/core/version.rs:336`、`:437` |
| Windows 服务进程不用 `CREATE_NO_WINDOW`，走 `spawn_with_hidden_console_owned`（`CREATE_NEW_CONSOLE \| CREATE_UNICODE_ENVIRONMENT` + `STARTF_USESHOWWINDOW`/`SW_HIDE`，分配隐藏控制台） | `src-tauri/src/service/workflow/win_spawn.rs:144`、`:147`、`:162`；`src-tauri/src/service/workflow/launch.rs:625` |
| 前端可观测字段 `status` / `serviceRunning` / `serviceHealthy` / `busyAction` / `startupPhase` | `src/store/modules/harness/store.ts:84`、`:101` |
| 「应用」面板连接状态 Chip 与忙碌时禁用的重启/停止按钮 | `src/ui/config/debug.tsx:189`、`:224`、`:233` |

---

### 状态机与事件

### [P1] 验证安装依赖期间状态为 Installing

[Case ID] TC-DSK-L3-05-025
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/lifecycle.rs:122`、`:123`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 运行时依赖缺失（Node/dsh 未就绪），或可走 Git-only 补丁路径
[测试数据] 命令 `install_dependencies`、`get_dsh_status`；事件 `dsh-status-updated`
[测试步骤] 1. 调用 `install_dependencies`。2. 在安装进行中读取 `get_dsh_status`。3. 读取 `dsh-status-updated` 的最新载荷。
[预期结果] 1. 命令被接受并进入安装。2. 返回值为 `Installing`。3. 载荷为字符串 `"Installing"`（单位枚举整体序列化，非对象）。
[清理] 等待安装收敛；`DELETE /session/<id>`

### [P1] 验证启动经 Starting 收敛为 Running 且重复启动直接 Running

[Case ID] TC-DSK-L3-05-026
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/launch.rs:187`、`:190`、`:199`、`:201`；`src-tauri/src/task/tick_check_dsh_process/mod.rs:21`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 运行时依赖已就绪；当前无被持有的服务进程
[测试数据] 命令 `start_harness`、`get_dsh_status`；事件 `dsh-status-updated`
[测试步骤] 1. 触发 `start_harness`。2. 读取 `dsh-status-updated` 的事件序列。3. 等待健康 tick 命中后读取 `get_dsh_status`。4. 在持有进程期间再次触发 `start_harness`。
[预期结果] 1. 命令被接受。2. 序列中出现 `"Starting"` 且在 `"Running"` 之前。3. 返回值为 `Running`（`has_owned_process() && is_dsh_running(port)` 同时为真）。4. 状态直接为 `Running`，不经过 `Starting`，也不产生第二个进程。
[清理] 停止服务；`DELETE /session/<id>`

---

### 进程韧性

### [P3] [反向] 验证持有进程意外退出后状态复位并发事件

[Case ID] TC-DSK-L3-05-033
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/workflow/process.rs:183`、`:185`；`src-tauri/src/service/workflow/launch.rs:721`
[自动化] 待接线（`test/e2e/desktop/05-core-lifecycle.e2e.ts`）
[前置条件] 服务处于 `Running`；可在应用外部终止该服务进程
[测试数据] 事件 `harness-process-exited`、`dsh-status-updated`；命令 `get_dsh_status`
[测试步骤] 1. 记录被持有进程的 pid 并订阅两个事件。2. 在应用外部终止该进程。3. 读取 `harness-process-exited` 的载荷与次数。4. 读取 `get_dsh_status`。
[预期结果] 1. 记录与订阅成功。2. 进程终止。3. 载荷为 `{ pid, exitCode }` 且 `pid` 与记录值一致；事件恰好一次（监视线程与 tick 兜底幂等）。4. 返回值为 `Stopped`。
[清理] 重新拉起服务；`DELETE /session/<id>`

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-05-027` | 验证安装失败后状态复位为 Stopped | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-028` | 验证重启收敛为 Stopped 后重新 Starting | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-029` | 验证状态事件载荷为状态字符串且与查询结果一致 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-030` | 验证健康检查以客户端模块就绪判定 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-031` | 验证无持有进程或启动进行中的健康检查信号 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-032` | 验证前端探测退避与单次超时 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-034` | 验证后端 5 秒 tick 兜底与双重就绪条件 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-035` | 验证启动去重守卫使并发启动收敛为一次 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-05-036` | 验证陈旧进程清扫的调用点与 debug 空操作 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/bridge/lifecycle.rs:122`、`:123`` | `TC-DSK-L3-05-025` | 正向 |
| ``src-tauri/src/service/workflow/launch.rs:187`、`:190`、`:199`、`:201`；`src-tauri/src/task/tick_check_dsh_process/mod.rs:21`` | `TC-DSK-L3-05-026` | 正向 |
| ``src-tauri/src/service/workflow/process.rs:183`、`:185`；`src-tauri/src/service/workflow/launch.rs:721`` | `TC-DSK-L3-05-033` | 异常 |

---

### 缺口与假设

- **G-D05-14**：「无被持有进程但状态仍为 Running」的回退分支（`tick_check_dsh_process/mod.rs:31`）需要一个「仅伪造状态而不持有进程」的注入手段。当前无只读诊断入口，TC-DSK-L3-05-034 只能通过「端口被非 Harness 服务占用」间接覆盖双重条件的另一半。
- **G-D05-15**：`terminate_stale_harness_processes` 在 debug 构建下是 no-op（`process.rs:357`）。TC-DSK-L3-05-036 的「被结束」分支只能在 release 构建下验证；L3 测试若跑在 debug 构建，步骤 4 应标记为跳过而非判失败。
- **G-D05-16**：5 秒 tick 是后端兜底（`scheduler/mod.rs:16`），1 秒起退避到 5 秒是前端探测（`constants.ts:11`）。两者周期数值接近但来源不同，接线时不得据前端探测间隔断言后端 tick 周期。
- **G-D05-17**：`emit_status` 的 9 个调用点中，本文件只覆盖重启（`launch.rs:190`、`:201`；`process.rs:478`）、停止（`lifecycle.rs:235`）、意外退出（`process.rs:184`）与 tick（`tick_check_dsh_process/mod.rs:23`、`:31`）路径；安装失败分支（`lifecycle.rs:48`、`:123`）需与 TC-DSK-L3-05-027 共用前置。
- **G-D05-18**：意外退出监视线程（`launch.rs:721`、`:835`）与 5 秒 tick 兜底存在竞态，两者都经 `on_owned_process_exit`（`process.rs:161`，PID 匹配才清、幂等）。TC-DSK-L3-05-033 断言「事件恰好一次」需要能统计事件次数。
- **G-D05-19**：Windows 隐藏控制台分配（`win_spawn.rs:144`、`:147`、`:162`）的效果是「服务进程的孙进程不再各弹一个窗口」，属系统窗口表面，无法在窗口内断言；人工确认项。
- **假设**：单位枚举 `Status` 序列化为字符串，因此所有事件载荷断言按字符串比较，不按对象字段比较。
