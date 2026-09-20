# 服务生命周期

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/07-harness-lifecycle.e2e.ts`（待建立）
> 前置：`06-harness-embed.md` 通过；应用处于 `ready`
> 运行：`vitest --project desktop -- test/e2e/desktop/07-harness-lifecycle.e2e.ts`（待配置，见 G2）

DSH 服务是一个由宿主拉起的子进程，壳层通过健康检查与进程退出事件维护它的状态。本文件的重点是**状态不漂移**：界面显示的运行状态必须与服务真实状态一致，且重复触发必须收敛为一次。

---

## 1. 事实基线

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

## 2. 正常路径

### [P1] 验证「重启」后服务恢复健康

[Case ID] TC-DSK-L3-07-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/store/modules/harness/store.ts:630`；`src/ui/config/debug.tsx:238`
[自动化] 待接线（`test/e2e/desktop/07-harness-lifecycle.e2e.ts`）
[前置条件] 配置对话框打开在「应用」面板；服务处于运行中
[测试数据] 选择器 `dsh-config-restart`
[测试步骤] 1. 记录当前服务地址。2. 点击「重启」。3. 等待服务重新健康。4. 读取服务地址与连接状态。
[预期结果] 1. 记录成功。2. 点击被接受。3. 在超时内恢复健康。4. 服务地址与记录值一致；连接状态为运行中。
[清理] `DELETE /session/<id>`

### [P2] 验证「停止」后连接状态变为已停止

[Case ID] TC-DSK-L3-07-003
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

## 3. 异常与边界

### [P3] [反向] 验证 harness 进程意外退出时前端状态同步

[Case ID] TC-DSK-L3-07-005
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

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-config-service-status` | 连接状态 Chip | 待补 |
| `dsh-config-service-url` | 服务地址只读输入框 | 待补 |
| `dsh-config-restart` | 「重启」按钮 | 待补 |
| `dsh-config-shutdown` | 「停止」按钮 | 待补 |
| `dsh-config-open-browser` | 「在浏览器打开」按钮 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-07-007` | 验证连续触发重启只执行一次 | 纯逻辑断言，下沉单元测试层 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/store/modules/harness/store.ts:630`；`src/ui/config/debug.tsx:238`` | `TC-DSK-L3-07-001` | 正向 |
| ``src/store/modules/harness/store.ts:752-762`；`src/ui/config/debug.tsx:189-196`` | `TC-DSK-L3-07-003` | 正向 |
| ``src/store/modules/harness/runtime.ts:27`；`src/store/modules/harness/types.ts:10-13`` | `TC-DSK-L3-07-005` | 异常 |

---

## 7. 缺口与假设

- **G-D07-1**：`TC-DSK-L3-07-007`（现属单元测试层）需要统计后端 `launch_harness` 的调用次数。当前无计数出口，需在测试编排层计数（例如通过服务日志行数）或增加只读诊断命令。
- **G-D07-2**：「在浏览器打开」只验证命令成功返回，**不验证系统浏览器实际打开**（属系统表面，见 `00-overview.md` G9）。人工确认项。
- **G-D07-3**：停止状态下 UI 不提供「启动」入口（`debug.tsx:233-255` 只在 `serviceRunning` 时渲染两个按钮）。这是当前设计，不是缺陷；但意味着「停止 → 手动启动」只能靠重启或插件操作触发，本套未覆盖该路径。
- **假设**：`restart()` 在失败时会进入应用错误态（`fail()`），由 `11` 覆盖错误页呈现；本文件不重复断言错误页细节。
