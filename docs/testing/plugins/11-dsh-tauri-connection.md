# dsh-tauri-connection：桌面载体鉴权适配

> 层级：L2 插件宿主 E2E（本插件无客户端 UI，无 L3 与 `-C-*` 用例）
> 自动化：`test/e2e/plugins/11-dsh-tauri-connection.e2e.ts`（§2 的 3 条 L2 用例已落地并全绿）
> 前置：`pnpm build:plugins`；用例各自起 scratch 宿主并自行控制子进程环境变量
> 运行：L2 `pnpm test:e2e:plugin`

本插件是全仓**唯一的网络安全边界型插件**：它不动业务路由，只在宿主 `connection` 服务上改写两道鉴权闸门，好让 `tauri.localhost` 下不携带 `SameSite=Strict` Cookie 的内嵌 WebView 能进得来。判据只有一条——子进程环境里的 `DSH_TAURI_EMBEDDED` 是否**恰为** `'1'`。

因此本文件的 L2 用例全部围绕「接管 / 不接管」的对照：注入态证明两道闸门确实被改写（索引放行、401 降级、403 保留），非注入态证明同一进程形态下鉴权**逐字未变**（索引 401、`/api` 401）。三条用例互相对照才有判别力，单看任一条都可能把宿主的默认行为当成插件的功劳。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 载体标记常量 `EMBEDDED_ENV = 'DSH_TAURI_EMBEDDED'` | `packages/dsh-tauri-connection/src/host/service/gate.ts:12` |
| **当且仅当** `process.env.DSH_TAURI_EMBEDDED === '1'` 时接管，否则 `attach()` 返回 noop | `packages/dsh-tauri-connection/src/host/service/gate.ts:24-26` |
| `requestRejection` 被包成「先调原实现；仅当结果为 **401** 时返回 `undefined`（放行）；其余（如 403）原样保留」 | `packages/dsh-tauri-connection/src/host/service/gate.ts:36-39` |
| `authorizeIndex = () => true`（索引**无条件放行**） | `packages/dsh-tauri-connection/src/host/service/gate.ts:40` |
| `attach()` 的返回函数把两者**还原**（detach） | `packages/dsh-tauri-connection/src/host/service/gate.ts:42-45` |
| `connection` 服务缺少任一闸门时不改写并告警 | `packages/dsh-tauri-connection/src/host/service/gate.ts:31-34` |
| `apply` 只做 `setCurrentHostInstance` + 两个 `ctx.effect` | `packages/dsh-tauri-connection/src/host/apply.ts:7-12` |
| 注入口 `inject = ['connection']` | `packages/dsh-tauri-connection/src/index.ts` |
| L1 单测已覆盖「注入态改写 + detach 还原」与「非 1 取值不接管」 | `packages/dsh-tauri-connection/src/host/service/gate.test.ts` |
| 桌面壳注入点与 `gate.ts` 逐字一致 | `src-tauri/src/service/workflow/launch.rs`（envs 注入 `DSH_TAURI_EMBEDDED=1`） |

---

## 2. L2：宿主鉴权闸门

三条用例都必须控制**子进程**环境变量，故各自 `scaffoldDshProfile` + 自行 `spawn dsh web`（挂载 `dsh-tauri-connection`、`dsh-tauri`、`dsh-tauri-pet`），并在 `finally` 中 `await host.stop()`。不使用 `test/e2e/support/dsh-host.ts` 的 `startDshHost`：它在返回宿主前先做根路径 token 交换，而该交换在**注入态**被 `authorizeIndex` 放行成 200（不再返回 303 + Set-Cookie），会把「被测行为」当成启动失败抛出，拿不到宿主句柄（见 G-CONN-1）。

### [P2] 验证未注入 DSH_TAURI_EMBEDDED 时鉴权逐字未变

[Case ID] TC-CONN-L2-11-001
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-connection/src/host/service/gate.ts:24-26`
[自动化] 是（`test/e2e/plugins/11-dsh-tauri-connection.e2e.ts:172`）
[前置条件] scratch 宿主已挂载本插件；子进程环境变量中**不存在** `DSH_TAURI_EMBEDDED`
[测试数据] 不带 Cookie 请求 `GET /`、`GET /?token=<一次性 token>`（`redirect: 'manual'`）、`GET /api/desktop/dsh-tauri-pet/session/stream`、`GET /api/desktop/dsh-tauri-unmounted-probe/ping`
[测试步骤] 1. `GET /`，读状态码。2. `GET /?token=…`，读状态码与 `set-cookie`。3. 请求已挂载插件的 `/api` 路径，读状态码与 `error` 文案。4. 请求**未挂载**的同形状路径，读状态码。
[预期结果] 1. `GET /` → **401**。2. token 交换 → **303** 且 `set-cookie` 非空（默认浏览器会话通道未受影响）。3. `/api` → **401**，`error` 恰为 `unauthorized`。4. 未挂载路径同样 **401**（证明拒绝发生在路由之前，而非由路由缺失产生 404）。
[清理] `await host.stop()`（`taskkill /T /F`，删除 scratch 目录）

### [P1] 验证注入 DSH_TAURI_EMBEDDED=1 时两道闸门被改写

[Case ID] TC-CONN-L2-11-002
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-connection/src/host/service/gate.ts:36-40`
[自动化] 是（`test/e2e/plugins/11-dsh-tauri-connection.e2e.ts:205`）
[前置条件] `startDshHost` 之前的父进程 `process.env.DSH_TAURI_EMBEDDED = '1'`（`test/e2e/support/dsh-host.ts:454-459` 的 `spawn` 以 `env: { ...process.env, DSH_HOME: home }` 继承并透传给子进程）
[测试数据] 同 TC-CONN-L2-11-001 的四条请求，另加一条带 `origin: http://evil.example` 的请求
[测试步骤] 1. 不带 Cookie `GET /`，读状态码与响应体长度。2. 再次 `GET /?token=…`，观察是否仍返回 303。3. 请求未挂载的 `/api` 路径，读状态码。4. 请求已挂载插件的 `/api` 路径，读状态码。5. 带跨源 `origin` 请求未挂载路径，读状态码。
[预期结果] 1. `GET /` → **200** 且响应体非空（`authorizeIndex` 被改写为 `() => true` 的端到端证据；默认行为是 401）。2. token 交换**不再是 303**（索引放行后不再需要下发会话 Cookie，是同一闸门的另一证据面）。3. 未挂载路径 → **404**（原实现的 401 **已被降级为放行**，请求落到路由层；404 与 401 的语义区分即本条的判据）。4. 已挂载 `/api` → **非 401** 且 `< 500`。5. 跨源请求 → **403** 原样保留（只降级 401，Host/Origin 围栏不受影响）。
[清理] 还原父进程环境变量并 `await host.stop()`

### [P3] 验证载体标记严格判等，取 '0' 时仍不接管

[Case ID] TC-CONN-L2-11-003
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-connection/src/host/service/gate.ts:24`
[自动化] 是（`test/e2e/plugins/11-dsh-tauri-connection.e2e.ts:249`）
[前置条件] 子进程环境变量 `DSH_TAURI_EMBEDDED = '0'`（真值但非 `'1'`）
[测试数据] 不带 Cookie 请求 `GET /`、`GET /api/desktop/dsh-tauri-pet/session/stream`
[测试步骤] 1. 发起两条请求。2. 读状态码。
[预期结果] 1. `GET /` → **401**。2. `/api` → **401**。即判据是 `=== '1'` 的**严格判等**，而不是「变量存在即接管」，与 TC-CONN-L2-11-002 形成对照。
[清理] 还原父进程环境变量并 `await host.stop()`

---

## 3. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `EMBEDDED_ENV !== '1'` 直接返回 noop | TC-CONN-L2-11-001、TC-CONN-L2-11-003 | 异常、边界 | 两条对照：变量缺失与非 `'1'` 取值均不接管 |
| `requestRejection` 只把 401 降级放行 | TC-CONN-L2-11-002 | 正向 | 以「未挂载路径 404 而非 401」为降级证据；403 原样保留亦在同条断言 |
| `authorizeIndex = () => true` | TC-CONN-L2-11-002 | 正向 | 以「不带 Cookie 的 `GET /` 返回 200」直接证明，非注入态由 001 反证 |
| detach 还原两道闸门 | — | — | **未覆盖（L2 不可达）**：`ctx.effect` 的 disposer 只在宿主卸载插件时执行，E2E 无卸载通道；已由 `packages/dsh-tauri-connection/src/host/service/gate.test.ts` 的 L1 单测覆盖 |
| `connection` 服务缺闸门时的告警分支 | — | — | **未覆盖**：需要桩化宿主 `connection` 服务，属 L1 范畴（`gate.ts:31-34`） |
| 桌面壳 `launch.rs` 的真实注入 | — | — | **未覆盖**：需要真实 Tauri 窗口，属 `desktop` project |

---

## 4. 缺口与假设

- **实测结论（L2 3/3 全绿，预期一致）**：非注入态 `GET /` → 401、`GET /?token=` → 303 + `set-cookie`、`/api/desktop/dsh-tauri-pet/session/stream` → 401 `{"error":"unauthorized"}`、未挂载路径 → 401；注入态 `GET /` → 200 且响应体非空、`GET /?token=` → 非 303、未挂载路径 → 404、`/api/.../pet/session/stream` → 非 401 且 < 500、带 `origin: http://evil.example` → 403；`'0'` 态 `GET /` → 401、`/api` → 401。**无一条与预期不符**，未做预期修正。
- **G-CONN-1（可注入性结论）**：`startDshHost` **支持**向子进程注入额外环境变量——`test/e2e/support/dsh-host.ts:454-459` 的 `spawn(…, { env: { ...process.env, DSH_HOME: home } })` 会继承父 `process.env`，所以调用前设置 `process.env.DSH_TAURI_EMBEDDED = '1'` 即可让真实 `dsh web` 子进程生效。但 `startDshHost` 在返回前调 `exchangeLaunchToken`（`test/e2e/support/dsh-host.ts:367-387`），要求 token 交换恰为 303 + `set-cookie`；注入态下该请求被放行成 200，于是它在**返回宿主之前**抛错（`dsh-host.ts:379-384`）。故本文件不用 `startDshHost`，改为自己完成「脚手架 + spawn + 就绪等待」，仅复用其导出的 `scaffoldDshProfile`（`test/e2e/support/dsh-host.ts:400`），并复用其就绪判据（读 `home/dsh-web.log` 里的 `http://127.0.0.1:<port>…`，`dsh-host.ts:349-364`）。这样三条用例都能真跑，没有把行为断言降级成 L1。
- **环境变量传递链（判别依据）**：`gate.ts:24` 读的是**子进程自身**的 `process.env`，因此注入必须发生在 `spawn` 之前；globalSetup 起的共享宿主是**独立进程**，worker 内改 `process.env` 不影响它（这也正是本批要自带宿主的原因）。
- **`DSH_TAURI_EMBEDDED` 的还原**：三条用例都通过 `withCarrier()` 在 `finally` 中把父进程环境变量还原为原值（可能为 `undefined`），避免污染同 worker 后续用例；非注入态两条显式 `delete`，保证「401」不是上一次泄漏的变量造成的假绿。
- **假设 1**：`/api/desktop/<未知插件 id>/ping` 在鉴权放行后由路由层返回 404（而非 200 或 500）。实测成立；这一形状被用作「401 已降级」的证据，因为 404 与 401 的语义不可混同。
- **假设 2**：`origin: http://evil.example` 触发的是 Host/Origin 围栏的 **403**，与 `requestRejection` 是同一道闸门。实测 403 在注入态下原样保留，与 `gate.ts:38`「只降级 401」一致。
- **G-CONN-2**：本插件无客户端代码（`packages/dsh-tauri-connection/src/` 下只有 `host` 与 `shared`），因此本文件不写 `-C-*` 与 `-L3-*` 用例。
- **G-CONN-3**：`09-dsh-tauri-turnrewind.md` 式的 `[P?]` 优先级采用 P1（安全边界核心）到 P3（边界值），若后续有真实 Tauri 窗口通道，`launch.rs` 注入链应补一条 L3 用例作为端到端收口。
