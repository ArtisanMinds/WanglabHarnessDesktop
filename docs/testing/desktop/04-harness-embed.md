# 嵌入容器与 Boot 桥

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/04-harness-embed.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/04-harness-embed.e2e.ts`

内嵌 dsh 界面是壳层的核心载荷：iframe 渲染条件、加载状态机、boot 桥消息，以及多窗口隔离与缩放命令桥。

---

## 1. DSH 界面嵌入

壳层通过一个跨源 `iframe` 承载 DSH 界面，两者靠 `postMessage` 桥通信。本文件验证**渲染条件**（何时挂 iframe、何时挂占位）、**加载状态机**（完成 / 失败 / 重试）与**boot 桥**三条主线。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `serviceHealthy` 为真才渲染 iframe，否则渲染 `Loadable` 占位 | `src/layout/components/iframe.tsx:188-191` |
| iframe `key={harness.iframeKey}`（重试即重建节点） | `src/layout/components/iframe.tsx:192-193` |
| `src={harness.iframeSrc}`（boot 时生成一次，带时间戳） | `src/layout/components/iframe.tsx:196`、`src/store/modules/harness/store.ts:96-97` |
| `onLoad` → `markIframeLoaded`，`onError` → `markIframeError` | `src/layout/components/iframe.tsx:199-200` |
| 错误覆盖层条件 `showIframeError = serviceHealthy && iframeError` | `src/store/modules/harness/store.ts:113-115` |
| 覆盖层重试入口 → `harness.refreshIframe` | `src/layout/components/iframe.tsx:205-214`、`src/store/modules/harness/store.ts:245` |
| `sandbox` 与 `allow` 属性清单 | `src/layout/components/iframe.tsx:197-198` |
| CSP `frame-src http://127.0.0.1:*` | `src-tauri/tauri.conf.json:15-16` |
| boot 就绪桥 `dsh://plugin-boot:ready` → `markIframeBootReady` | `src/layout/components/iframe.tsx:103-105`、`src/store/modules/harness/store.ts:268` |
| boot 挂起桥 `dsh://plugin-boot:stalled` → `recoverIframeBoot` | `src/layout/components/iframe.tsx:106-108`、`src/store/modules/harness/store.ts:276` |
| boot 失败桥 `dsh://plugin-boot:failed` → `handleIframeBootFailure` | `src/layout/components/iframe.tsx:109-111`、`src/store/modules/harness/store.ts:311` |
| 启动阶段 → 加载文案键映射 | `src/store/modules/harness/store.ts:47-51` |
| iframe 与宿主的可见性同步 | `src/layout/components/iframe.tsx:71` |

---

### 渲染与加载状态

### [P1] 验证服务就绪后 iframe 渲染且指向服务地址

[Case ID] TC-DSK-L3-04-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 04；`src/layout/components/iframe.tsx:186-203`
[自动化] 待接线（`test/e2e/desktop/04-harness-embed.e2e.ts`）
[前置条件] 应用已进入 `ready`；`serviceHealthy` 为真
[测试数据] 选择器 `dsh-shell-iframe`；期望源 `get_runtime_info().service_url`
[测试步骤] 1. 等待 iframe 节点出现。2. 读取 iframe 的 `src`。3. 读取运行期服务地址。4. 比对两者。
[预期结果] 1. iframe 在超时内出现且可见。2. `src` 为非空绝对地址。3. 服务地址为非空绝对地址。4. 两者协议、主机、端口一致（查询串可不同）。
[清理] `DELETE /session/<id>`

---

### 失败与重试

### [P3] [反向] 验证 iframe 加载失败时显示错误覆盖层与重试入口

[Case ID] TC-DSK-L3-04-002
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/iframe.tsx:205-214`；`src/store/modules/harness/store.ts:113-115`
[自动化] 待接线（同上）
[前置条件] 服务健康但可构造 iframe 加载失败（例如让 iframe 指向不可达地址）
[测试数据] 选择器 `dsh-iframe-error`、`dsh-iframe-error-retry`
[测试步骤] 1. 使 iframe 触发 `error`。2. 读取错误覆盖层可见性。3. 读取覆盖层文案中的服务地址。4. 读取重试入口存在性。
[预期结果] 1. 触发成功。2. 覆盖层可见。3. 文案包含当前服务地址。4. 重试入口存在且可点击。
[清理] 恢复 iframe 地址；`DELETE /session/<id>`

---

### 属性边界

### [P4] 验证 iframe 的 sandbox 与 allow 属性符合约定

[Case ID] TC-DSK-L3-04-003
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/iframe.tsx:197-198`；`src-tauri/tauri.conf.json:15`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-04-001 通过
[测试数据] 必需 sandbox token：`allow-same-origin`、`allow-scripts`、`allow-popups`、`allow-forms`、`allow-modals`、`allow-downloads`、`allow-storage-access-by-user-activation`
[测试步骤] 1. 读取 iframe 的 `sandbox` 属性。2. 读取 `allow` 属性。3. 读取当前页面的 CSP `frame-src` 生效值。
[预期结果] 1. `sandbox` 包含全部必需 token，且不含 `allow-top-navigation`。2. `allow` 非空且包含 `clipboard-read`、`clipboard-write`。3. `frame-src` 允许 `http://127.0.0.1:*`。
[清理] `DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-shell-iframe` | `src/layout/components/iframe.tsx` 的 `iframe` | 已补（`02` 批次） |
| `dsh-shell-iframe-loading` | 未就绪时的 `Loadable` 占位 | 待补 |
| `dsh-iframe-error` | iframe 错误覆盖层 | 待补 |
| `dsh-iframe-error-retry` | 错误覆盖层重试按钮 | 待补 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/iframe.tsx:186-203`` | `TC-DSK-L3-04-001` | 正向 |
| ``src/layout/components/iframe.tsx:205-214`；`src/store/modules/harness/store.ts:113-115`` | `TC-DSK-L3-04-002` | 异常 |
| ``src/layout/components/iframe.tsx:197-198`；`src-tauri/tauri.conf.json:15`` | `TC-DSK-L3-04-003` | 边界 |

---

### 缺口与假设

- **G-D04-1**：`TC-DSK-L3-04-002` 需要「构造 iframe 加载失败」。由于 `iframeSrc` 由 boot 时生成一次（`store.ts:96-97`），当前无公开入口改写它。接线时需为测试提供受控注入点，或改用「让服务在 iframe 加载前停止」的真实前置。后者更符合「E2E 不 Mock 后端」的约束，但会与 `05` 的服务生命周期用例产生耦合。
- **G-D04-2**：`useIframeMessage` 的 origin 校验（`src/hooks/use-iframe-message.ts`）是安全边界，本文件**未覆盖**其拒绝分支。该分支可通过从非同源页面派发 `message` 构造，属高价值补充项。
- **G-D04-3**：iframe 内 DSH 界面的实际内容（首屏、会话列表）不在本套范围；本套只断言宿主侧的容器与状态。
- **假设**：`iframeSrc` 与服务地址同源但查询串不同（带 `?t=<时间戳>`，且不含 token，见 `store/utils.ts:37`）；因此用例以「协议 + 主机 + 端口一致」判定，不做全串相等。

---

## 2. 多窗口与缩放

「文件 → 新建窗口」以同一 `index.html` 再开一个独立 webview；所有窗口共享同一数据目录与同一 DSH 服务实例。缩放有两条入口：壳层快捷键（焦点在导航栏等壳层元素时）与 iframe 内转发的桥消息（跨源 iframe 内的快捷键不会冒泡到壳层）。

---

### 事实基线

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

### 多窗口

### [P1] 验证「文件 → 新建窗口」创建第二个窗口

[Case ID] TC-DSK-L3-04-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:239-247`、`:388-395`；`src-tauri/src/desktop/window.rs:144-149`
[自动化] 待接线（`test/e2e/desktop/04-harness-embed.e2e.ts`）
[前置条件] 应用处于 `ready`；当前仅 1 个窗口；平台非 macOS
[测试数据] 菜单项 id `new-window`；期望标题 `Deepseek Harness Desktop`
[测试步骤] 1. 记录窗口句柄集合。2. 打开「文件」菜单并点击「新建窗口」。3. 等待新窗口出现。4. 读取句柄集合与各窗口标题。
[预期结果] 1. 句柄数为 1。2. 点击被接受。3. 新窗口在超时内出现。4. 句柄数为 2；两个窗口标题均为 `Deepseek Harness Desktop`。
[清理] 关闭第二个窗口；`DELETE /session/<id>`

### [P2] 验证新窗口独立加载自己的 iframe

[Case ID] TC-DSK-L3-04-005
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/desktop/builder.rs:617-626`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-04-004 通过；服务健康
[测试数据] 选择器 `dsh-shell-iframe`
[测试步骤] 1. 在窗口 A 中读取 iframe 的 `src` 与实例标识。2. 切到窗口 B 并读取其 iframe 的 `src` 与实例标识。3. 比较两个 `src` 的协议、主机与端口。
[预期结果] 1. 读取成功。2. 读取成功。3. 两者同源；两个 iframe 各自独立存在（窗口 B 的 iframe 不依赖窗口 A 的渲染，实例标识不同）。
[清理] 关闭第二个窗口；`DELETE /session/<id>`

### [P3] 验证关闭其中一个窗口不影响另一个

[Case ID] TC-DSK-L3-04-006
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

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-shell-iframe` | 当前窗口内的 iframe | 待补 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/navbar.tsx:239-247`、`:388-395`；`src-tauri/src/desktop/window.rs:144-149`` | `TC-DSK-L3-04-004` | 正向 |
| ``src-tauri/src/desktop/builder.rs:617-626`` | `TC-DSK-L3-04-005` | 正向 |
| ``src-tauri/src/lib.rs:51`（`RunEvent::ExitRequested` 语义）` | `TC-DSK-L3-04-006` | 异常 |

---

### 缺口与假设

- **G-D04-4**：`TC-DSK-L3-04-006` 关闭第二个窗口时，若实现把「最后一个窗口关闭」与「应用退出」绑定，则该用例会终止会话。需先确认 `RunEvent::ExitRequested` 的判定条件（`src-tauri/src/lib.rs:51` 附近），再决定清理顺序。
- **G-D04-5**：多窗口共享同一 DSH 服务，因此两窗口并发写同一档案（如同时改设置）时的一致性**未覆盖**，属高价值补充项。
- **G-D04-6**：缩放的实际视觉系数无回读接口（`use-zoom-factor.ts:20-26`），本文件以 `window.innerWidth` 作为代理指标。该代理在极端缩放（`0.5`/`2.0`）下仍应成立，但属近似断言（`00-overview.md` G10）。
- **G-D04-7**：「新聊天」下发新建会话命令属纯消息协议断言（宿主是否发出桥消息），已从 L3 台账裁剪；iframe 内是否真的新建会话取决于 `dsh-tauri` 的接收实现，归 [插件用例集](../plugins/00-overview.md)。
- **假设**：额外窗口与主窗口共享同一前端产物与同一 WebView 数据目录，因此缩放设置与语言设置在窗口间一致。
