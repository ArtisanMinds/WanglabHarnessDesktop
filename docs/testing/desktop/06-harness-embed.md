# DSH 界面嵌入

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/06-harness-embed.e2e.ts`（待建立）
> 前置：`01-window-boot.md` 通过；DSH 服务可正常启动
> 运行：`vitest --project desktop -- test/e2e/desktop/06-harness-embed.e2e.ts`（待配置，见 G2）

壳层通过一个跨源 `iframe` 承载 DSH 界面，两者靠 `postMessage` 桥通信。本文件验证**渲染条件**（何时挂 iframe、何时挂占位）、**加载状态机**（完成 / 失败 / 重试）与**boot 桥**三条主线。

---

## 1. 事实基线

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

## 2. 渲染与加载状态

### [P1] 验证服务就绪后 iframe 渲染且指向服务地址

[Case ID] TC-DSK-L3-06-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 批次 06；`src/layout/components/iframe.tsx:186-203`
[自动化] 待接线（`test/e2e/desktop/06-harness-embed.e2e.ts`）
[前置条件] 应用已进入 `ready`；`serviceHealthy` 为真
[测试数据] 选择器 `dsh-shell-iframe`；期望源 `get_runtime_info().service_url`
[测试步骤] 1. 等待 iframe 节点出现。2. 读取 iframe 的 `src`。3. 读取运行期服务地址。4. 比对两者。
[预期结果] 1. iframe 在超时内出现且可见。2. `src` 为非空绝对地址。3. 服务地址为非空绝对地址。4. 两者协议、主机、端口一致（查询串可不同）。
[清理] `DELETE /session/<id>`

---

## 3. 失败与重试

### [P3] [反向] 验证 iframe 加载失败时显示错误覆盖层与重试入口

[Case ID] TC-DSK-L3-06-005
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

## 4. 属性边界

### [P4] 验证 iframe 的 sandbox 与 allow 属性符合约定

[Case ID] TC-DSK-L3-06-007
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/iframe.tsx:197-198`；`src-tauri/tauri.conf.json:15`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-06-001 通过
[测试数据] 必需 sandbox token：`allow-same-origin`、`allow-scripts`、`allow-popups`、`allow-forms`、`allow-modals`、`allow-downloads`、`allow-storage-access-by-user-activation`
[测试步骤] 1. 读取 iframe 的 `sandbox` 属性。2. 读取 `allow` 属性。3. 读取当前页面的 CSP `frame-src` 生效值。
[预期结果] 1. `sandbox` 包含全部必需 token，且不含 `allow-top-navigation`。2. `allow` 非空且包含 `clipboard-read`、`clipboard-write`。3. `frame-src` 允许 `http://127.0.0.1:*`。
[清理] `DELETE /session/<id>`

---

## 5. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-shell-iframe` | `src/layout/components/iframe.tsx` 的 `iframe` | 已补（`04` 批次） |
| `dsh-shell-iframe-loading` | 未就绪时的 `Loadable` 占位 | 待补 |
| `dsh-iframe-error` | iframe 错误覆盖层 | 待补 |
| `dsh-iframe-error-retry` | 错误覆盖层重试按钮 | 待补 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/iframe.tsx:186-203`` | `TC-DSK-L3-06-001` | 正向 |
| ``src/layout/components/iframe.tsx:205-214`；`src/store/modules/harness/store.ts:113-115`` | `TC-DSK-L3-06-005` | 异常 |
| ``src/layout/components/iframe.tsx:197-198`；`src-tauri/tauri.conf.json:15`` | `TC-DSK-L3-06-007` | 边界 |

---

## 7. 缺口与假设

- **G-D06-1**：TC-DSK-L3-06-005/044 需要「构造 iframe 加载失败」。由于 `iframeSrc` 由 boot 时生成一次（`store.ts:96-97`），当前无公开入口改写它。接线时需为测试提供受控注入点，或改用「让服务在 iframe 加载前停止」的真实前置。后者更符合「E2E 不 Mock 后端」的约束，但会与 `07` 的服务生命周期用例产生耦合。
- **G-D06-2**：`useIframeMessage` 的 origin 校验（`src/hooks/use-iframe-message.ts`）是安全边界，本文件**未覆盖**其拒绝分支。该分支可通过从非同源页面派发 `message` 构造，属高价值补充项。
- **G-D06-3**：iframe 内 DSH 界面的实际内容（首屏、会话列表）不在本套范围；本套只断言宿主侧的容器与状态。
- **假设**：`iframeSrc` 与服务地址同源但查询串不同（带 `?t=<时间戳>`，且不含 token，见 `store/utils.ts:37`）；因此用例以「协议 + 主机 + 端口一致」判定，不做全串相等。
