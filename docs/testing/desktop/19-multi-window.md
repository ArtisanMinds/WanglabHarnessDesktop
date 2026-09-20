# 多窗口与缩放

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/19-multi-window.e2e.ts`（待建立）
> 前置：`12-window-tray.md` 通过
> 运行：`vitest --project desktop -- test/e2e/desktop/19-multi-window.e2e.ts`（待配置，见 G2）

「文件 → 新建窗口」以同一 `index.html` 再开一个独立 webview；所有窗口共享同一数据目录与同一 DSH 服务实例。缩放有两条入口：壳层快捷键（焦点在导航栏等壳层元素时）与 iframe 内转发的桥消息（跨源 iframe 内的快捷键不会冒泡到壳层）。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 「新建窗口」→ `create_app_window`（异步命令） | `src/layout/components/navbar.tsx:239-247`、`:388-395` |
| `create_app_window` → `build_extra_window` | `src-tauri/src/desktop/window.rs:144-149` |
| 额外窗口与主窗口同标题、同尺寸、同最小尺寸 | `src-tauri/src/desktop/builder.rs:617-626` |
| 建窗必须在异步运行时（主线程调用会死锁） | `src-tauri/src/desktop/window.rs:140-143` |
| 主窗口几何保存与服务回收在退出时触发 | `src-tauri/src/lib.rs:51` |
| 壳层缩放快捷键（capture 阶段） | `src/layout/components/iframe.tsx:78`、`:122-128` |
| 快捷键映射：`+`/`=` 增大、`-`/`_` 减小、`0` 重置 | `src/utils/zoom.ts:16-27` |
| iframe 内缩放桥 `dsh://zoom-shortcut` | `src/layout/components/iframe.tsx:112-115`、`:171-175` |
| 桥消息动作值域 `increase`/`decrease`/`reset` | `src/utils/zoom.ts:29-41` |
| 缩放步长 `0.1`，上下限 `0.5`/`2.0` | `src/utils/zoom.ts:62-68` |
| 缩放应用到 WebView（`Webview.setZoom`） | `src/hooks/use-zoom-factor.ts:143-150` |
| 导航命令：`dsh://session:new`、`dsh://workspace:add` | `src/layout/components/webview.tsx:71-72` |
| 命令经 `useIframePost` 发出 | `src/layout/components/webview.tsx:33` |

---

## 2. 多窗口

### [P1] 验证「文件 → 新建窗口」创建第二个窗口

[Case ID] TC-DSK-L3-19-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:239-247`、`:388-395`；`src-tauri/src/desktop/window.rs:144-149`
[自动化] 待接线（`test/e2e/desktop/19-multi-window.e2e.ts`）
[前置条件] 应用处于 `ready`；当前仅 1 个窗口；平台非 macOS
[测试数据] 菜单项 id `new-window`；期望标题 `Deepseek Harness Desktop`
[测试步骤] 1. 记录窗口句柄集合。2. 打开「文件」菜单并点击「新建窗口」。3. 等待新窗口出现。4. 读取句柄集合与各窗口标题。
[预期结果] 1. 句柄数为 1。2. 点击被接受。3. 新窗口在超时内出现。4. 句柄数为 2；两个窗口标题均为 `Deepseek Harness Desktop`。
[清理] 关闭第二个窗口；`DELETE /session/<id>`

### [P2] 验证新窗口独立加载自己的 iframe

[Case ID] TC-DSK-L3-19-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/desktop/builder.rs:617-626`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-19-001 通过；服务健康
[测试数据] 选择器 `dsh-shell-iframe`
[测试步骤] 1. 在窗口 A 中读取 iframe 的 `src` 与实例标识。2. 切到窗口 B 并读取其 iframe 的 `src` 与实例标识。3. 比较两个 `src` 的协议、主机与端口。
[预期结果] 1. 读取成功。2. 读取成功。3. 两者同源；两个 iframe 各自独立存在（窗口 B 的 iframe 不依赖窗口 A 的渲染，实例标识不同）。
[清理] 关闭第二个窗口；`DELETE /session/<id>`

### [P3] 验证关闭其中一个窗口不影响另一个

[Case ID] TC-DSK-L3-19-004
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/lib.rs:51`（`RunEvent::ExitRequested` 语义）
[自动化] 待接线（同上）
[前置条件] 存在 2 个窗口；服务健康
[测试数据] 无
[测试步骤] 1. 完整关闭窗口 B。2. 等待窗口句柄集合变化。3. 读取句柄数、窗口 A 的 iframe 状态与服务状态。
[预期结果] 1. 关闭被接受。2. 句柄集合变化。3. 句柄数为 1；窗口 A 的 iframe 仍存在且未报错；服务仍在运行。
[清理] `DELETE /session/<id>`

---

## 3. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-shell-iframe` | 当前窗口内的 iframe | 待补 |

---

## 4. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/navbar.tsx:239-247`、`:388-395`；`src-tauri/src/desktop/window.rs:144-149`` | `TC-DSK-L3-19-001` | 正向 |
| ``src-tauri/src/desktop/builder.rs:617-626`` | `TC-DSK-L3-19-002` | 正向 |
| ``src-tauri/src/lib.rs:51`（`RunEvent::ExitRequested` 语义）` | `TC-DSK-L3-19-004` | 异常 |

---

## 5. 缺口与假设

- **G-D19-1**：`TC-DSK-L3-19-004` 关闭第二个窗口时，若实现把「最后一个窗口关闭」与「应用退出」绑定，则该用例会终止会话。需先确认 `RunEvent::ExitRequested` 的判定条件（`src-tauri/src/lib.rs:51` 附近），再决定清理顺序。
- **G-D19-2**：多窗口共享同一 DSH 服务，因此两窗口并发写同一档案（如同时改设置）时的一致性**未覆盖**，属高价值补充项。
- **G-D19-3**：缩放的实际视觉系数无回读接口（`use-zoom-factor.ts:20-26`），本文件以 `window.innerWidth` 作为代理指标。该代理在极端缩放（`0.5`/`2.0`）下仍应成立，但属近似断言（`00-overview.md` G10）。
- **G-D19-4**：「新聊天」下发新建会话命令属纯消息协议断言（宿主是否发出桥消息），已从 L3 台账裁剪；iframe 内是否真的新建会话取决于 `dsh-tauri` 的接收实现，归 [插件用例集](../plugins/00-overview.md)。
- **假设**：额外窗口与主窗口共享同一前端产物与同一 WebView 数据目录，因此缩放设置与语言设置在窗口间一致。
