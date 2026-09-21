# 启动冒烟（01）：进入下载装配 → dsh 内核启动 → 页面无报错

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/boot.e2e.ts`（已接线）
> 前置：见 `00-overview.md` §3–§5；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`pnpm test:e2e:desktop -- --run test/e2e/desktop/boot.e2e.ts`
> 车道：真实装配（本次运行独占空下载缓存 → 必然走一次真实下载与落盘）

---

## [P1] 验证进入下载装配后 dsh 内核启动、页面渲染且无报错

[Case ID] TC-DSK-L3-01-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `test/e2e/support/desktop-host.ts`（装配与隔离）；`src/layout/components/iframe.tsx`（`serviceHealthy` 才挂 iframe）；`src/layout/components/setup.tsx`（装配失败页）
[自动化] 已接线（`test/e2e/desktop/boot.e2e.ts`）
[前置条件] 应用处于启动态；本机无残留桌面实例；`TAURI_WEBDRIVER_PORT` 指向空闲端口（默认 4445）
[测试数据] 独占下载缓存根 `<home>/download-cache`（空目录）；帧内挂载点选择器 `#root`
[测试步骤] 1. 以独占空缓存启动应用并建立会话，立即在壳层装报错收集器。2. 过掉「安装推荐插件」引导，等 iframe 挂载。3. 读下载缓存根，确认 dsh 本体已落盘。4. 经 `get_runtime_info` 读 `node_version` 与 `service_url`，并读 iframe 的 `src`。5. 进帧，断言 `#root` 渲染出子节点，等待异步加载收敛后取页面文本与帧内报错快照。6. 退回顶层读壳层报错快照。
[预期结果] 1. 应用启动且会话建立成功。2. 引导可被跳过，iframe 在装配完成后挂载。3. `<cache>/dependencies/dsh` 存在——证明本次真的走完下载与装配，而不是复用上一次的缓存（Node 可能直接复用系统安装，`<cache>/runtime` 因此不保证存在）。4. `node_version` 非空且 `service_url` 形如 `http://127.0.0.1:<port>`，iframe 的 `src` 指向该地址，壳层根节点存在且**没有**落到装配失败页。5. `#root` 渲染出内容，其文本非空（不是白屏）。6. 帧内与壳层的报错收集器均为空（无 `error` / `unhandledrejection` / `console.error`）。
[清理] 结束会话、收掉遗留 dsh 进程、删除 scratch home（含本次下载缓存）；`DELETE /session/<id>`

### 缺口与假设

- **G-D01-1**：帧内报错收集器只能在「已经进入帧」之后安装，因此 dsh 页面的**加载期**报错不在覆盖范围内（壳层与帧跨域，帧内没有 `window.__TAURI__`，上游的 `captureFrontendLogs` 只能收到壳层）。该窗口由「iframe 已挂载 + `#root` 渲染出内容 + 壳层未落失败页」间接兜底。
- **G-D01-2**：壳层收集器从会话建立后开始装，应用最早几毫秒的报错不可观测。
- **G-D01-3**：只断言页面渲染出内容，不断言具体文案与结构——dsh 页面属上游产物，其 DOM 不在本仓库约束内。
- **G-D01-4**：`console.error` 一并计入报错。若将来出现可容忍的固定噪音（例如某条 IPC 失败降级），必须在此登记白名单并写明理由，不得直接放宽为「不收集」。
- **G-D01-5**：装配耗时可分钟级（首次联网下载 Node + dsh），用例与 `beforeAll` 均按 900s 放宽；本地反复跑可用 `startDesktopApp({ downloadCacheDir })` 复用一份已下好的缓存，但那样就不再覆盖「进入下载」。
- **G-D01-6**：预装引导只做「跳过」，引导自身的分支（有变更 / 无变更 / 安装失败）不在本用例范围。
- **假设**：运行环境可联网（独占空缓存意味着必然需要下载）；无网络时本用例按预期失败，而不是静默降级。
