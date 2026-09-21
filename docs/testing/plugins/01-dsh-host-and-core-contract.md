# 编排骨架与共享路由契约（批次 01）：真实 dsh 宿主 + 所有插件路由的唯一收敛点

> 层级：L2 插件宿主 E2E（真实 `dsh web` 进程；无浏览器、无 Tauri）
> 自动化：`test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts`（编排骨架 6 例 + 共享路由契约 6 例，共 12 个 `it()`）
> 前置：`pnpm build:plugins` 已产出 `packages/*/dist`；`DSH_E2E_DSH_BIN` 或桌面端装配目录内存在 `@deepseek-ai/dsh/lib/bin.js`
> 编排：`test/e2e/support/dsh-host.ts`；全局生命周期：`test/e2e/global-setup.ts`
> 运行：`pnpm test:e2e:plugin`（= `vitest --project plugin`）

本批由「编排骨架」与「共享路由契约」两部分合并而成，是全套插件用例的地基：**先证明编排本身可信，再证明所有插件路由共用的那一层契约不失真**。编排不成立时，后面所有「插件路由 404」都无法区分是插件没挂上还是宿主没起来；共享契约跑偏时，所有插件的负向断言都会失真。因此两者先于任何插件单独覆盖。

本批内复杂度梯度：**命中就绪判定** → **挂载校验失败** → **产物缺失失败** → **环境变量边界** → **OPTIONS 预检** → **HEAD 隐含** → **405 + allow** → **跨源 403** → **请求体 413** → **未挂载 404**。

> 分工：本文件只断言**编排行为与共享契约**。插件的业务语义（入参校验、领域错误码）一律落在对应插件文件，不在此重复。

---

## 1. 事实来源

### 1.1 编排骨架（`test/e2e/support/dsh-host.ts`）

| 行为 | 代码位置 |
| --- | --- |
| `startDshHost({ plugin, also, keepHome })` 一行起宿主 | `test/e2e/support/dsh-host.ts:389` |
| scratch 目录：`<tmp>/dsh-e2e-<plugin>-<base36 时间戳>` | `test/e2e/support/dsh-host.ts:396` |
| profile 三件套（`package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml`） | `test/e2e/support/dsh-host.ts:190` |
| 默认 bundle 列表＝`dsh-base` + `dsh-web-app` + 目标包 | `test/e2e/support/dsh-host.ts:399` |
| link 挂载（junction / dir symlink，离线）或 cli 挂载（`dsh plugin add`） | `test/e2e/support/dsh-host.ts:221`、`test/e2e/support/dsh-host.ts:304` |
| 挂载后必须出现在 `dsh.profile.bundles`，否则抛错 | `test/e2e/support/dsh-host.ts:273` |
| 产物预检：`main` 与 `exports["./client"]` 指向的文件必须存在 | `test/e2e/support/dsh-host.ts:164` |
| 核心解析：`DSH_E2E_DSH_BIN` → 仓库依赖树 → 桌面端装配目录，皆无则抛错 | `test/e2e/support/dsh-host.ts:134`、`test/e2e/support/dsh-host.ts:43` |
| 启动命令：`dsh web --host 127.0.0.1 --port 0 --no-open`（不带 `--skip-auth`） | `test/e2e/support/dsh-host.ts:425` |
| 鉴权交换：根路径 token → `redirect:'manual'` 断言 303 + `Set-Cookie`，取 `name=value` | `test/e2e/support/dsh-host.ts:359` |
| 就绪判定：从日志抓 `http://127.0.0.1:<port>...` 首个匹配 | `test/e2e/support/dsh-host.ts:37`、`test/e2e/support/dsh-host.ts:341` |
| 就绪上限 120s | `test/e2e/support/dsh-host.ts:40` |
| 收尾：Windows `taskkill /T /F`；其余 SIGTERM→SIGKILL | `test/e2e/support/dsh-host.ts:321`、`test/e2e/support/dsh-host.ts:442` |
| 地址下传：`project.provide('dshBaseUrl' / 'dshUrl' / 'dshCookie' / 'dshHome' / 'dshMounted')` | `test/e2e/global-setup.ts:38` |
| project 归属：`test/e2e/plugins/**/*.e2e.ts`，`fileParallelism: false`，超时 120s | `vitest.plugin.config.ts:15`、`vitest.plugin.config.ts:18` |

### 1.2 共享路由契约（`packages/dsh-tauri/src/host/routes/index.ts`）

| 行为 | 代码位置 |
| --- | --- |
| 连接门拒绝：401 `unauthorized` / 403 `forbidden` | `packages/dsh-tauri/src/host/routes/index.ts:263` |
| `OPTIONS` 未声明时返回 204 且带 `allow` | `packages/dsh-tauri/src/host/routes/index.ts:270` |
| 方法不在允许集 → 405，body `{ error: '仅支持 <allow> 请求' }` + `allow` 头 | `packages/dsh-tauri/src/host/routes/index.ts:275` |
| 声明 `GET` 即隐含允许 `HEAD` | `packages/dsh-tauri/src/host/routes/index.ts:255` |
| 变更方法必须来自回环地址，否则 403 | `packages/dsh-tauri/src/host/routes/index.ts:279` |
| 变更方法带异源 `Origin` → 403 `cross-origin-request` | `packages/dsh-tauri/src/host/routes/index.ts:286` |
| 请求体上限 1 MiB → 413 | `packages/dsh-tauri/src/host/routes/index.ts:128`、`packages/dsh-tauri/src/host/config/constants.ts:13` |
| 每个 `(kind, path)` 只注册一次，支持 GET 即允许 HEAD | `packages/dsh-tauri/src/host/routes/index.ts:248`、`packages/dsh-tauri/src/host/routes/index.ts:254` |

**代表路由**（用例中固定使用，避免依赖具体插件文件）：

- 只声明 GET 的路径：`/api/desktop/dsh-tauri-pet/session/stream`（`packages/dsh-tauri-pet/src/host/routes/index.ts:6`）
- 只声明 POST 的路径：`/api/desktop/dsh-tauri-rightclick/open/url`（`packages/dsh-tauri-rightclick/src/host/routes/index.ts:6`）

---

## 2. 用例

### 2.1 编排骨架（`TC-HOST-L2-01-*`）

#### [P1] 验证在隔离 scratch 目录下能挂载目标插件并拉起真实 dsh web

[Case ID] TC-HOST-L2-01-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `docs/specs/plugin.test.md` §8 批次 1；`test/e2e/support/dsh-host.ts:389`
[自动化] 是（`01-dsh-host-and-core-contract.e2e.ts` → `describe('编排骨架')`）
[前置条件] `pnpm build:plugins` 已执行（`dsh-tauri` 的 `dist` 与 `dist/client.cjs` 都在）；系统临时目录可写；dsh 核心可解析（`DSH_E2E_DSH_BIN`、仓库依赖树或桌面端装配目录任一命中）
[测试数据] `startDshHost({ plugin: 'dsh-tauri' })`；`DSH_E2E_MOUNT` 不设置（走默认 `link`）
[测试步骤] 1. 调用 `startDshHost({ plugin: 'dsh-tauri' })`。2. 读返回的 `url` / `baseUrl` / `cookie` / `home` / `mounted`。3. 带 `cookie` 对 `baseUrl` 发起 `GET /`。4. 读 `home/dsh-web.log` 末尾内容。
[预期结果] 1. `startDshHost` 在 120s 内 resolve，不抛错。2. `baseUrl` 形如 `http://127.0.0.1:<非 0 端口>`；`cookie` 非空；`mounted` 精确包含 `dsh-tauri`；`home` 路径包含 `dsh-e2e-dsh-tauri-`。3. `GET /` 返回 2xx 且响应体非空。4. 日志内出现与 `url` 一致的就绪行，且未出现 `ERR_MODULE_NOT_FOUND`。
[清理] 用例结束（含失败）必须调用 `stop()`；断言 `home` 目录已被删除

#### [P2] 验证宿主启动后目标插件的 bundle 已登记进 profile

[Case ID] TC-HOST-L2-01-002
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `test/e2e/support/dsh-host.ts:399`、`test/e2e/support/dsh-host.ts:221`
[自动化] 是（同上文件 → `describe('编排骨架')`）
[前置条件] 同 TC-HOST-L2-01-001；未设置 `DSH_E2E_KEEP_HOME`
[测试数据] `startDshHost({ plugin: 'dsh-tauri', also: ['dsh-tauri-pet'] })`（制造「目标包 + 附加包」两段挂载）
[测试步骤] 1. 用上述参数启动宿主。2. 读 `home/profiles/web/package.json`。3. 取 `dsh.profile.bundles` 与 `dependencies`。4. 解引用 `home/profiles/web/node_modules/<name>` 链接。
[预期结果] 1. 启动成功。2. `bundles` 同时包含 `dsh-tauri-pet` 与 `dsh-tauri`，且无重复项。3. `dependencies` 中两者的值均以 `link:` 开头并指向仓库 `packages/<name>`。4. 两条链接的 realpath 都落在仓库包目录上（规格写对 ≠ 挂得上）。
[清理] 同 TC-HOST-L2-01-001

#### [P3] [反向] 验证挂载未登记进 bundles 时立刻失败，而不是带着半成品起服务

[Case ID] TC-HOST-L2-01-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `test/e2e/support/dsh-host.ts:273`
[自动化] 是（同上文件 → `describe('编排骨架')`）
[前置条件] 手工构造一份只登记了 `dsh-tauri-pet` 的 profile `package.json`；直接调用编排导出的校验分支 `assertMountRegistered`
[测试数据] `bundles` 故意缺 `dsh-tauri`
[测试步骤] 1. 以被篡改的 profile 触发挂载校验（一次只请求已登记的包，一次同时请求已登记与未登记的包）。2. 捕获抛出的错误文本。
[预期结果] 1. 请求已登记的包不抛错（正向对照，避免断言变成恒真）。2. 请求含未登记的包时抛错，且错误文本恰为 `挂载未注册到 dsh.profile.bundles：dsh-tauri`——只列出缺失的那个。
[清理] 删除夹具 profile 目录
[未覆盖] 「失败后 scratch 目录被清理」在此分支不可达：link 模式下 bundles 由 `addBundle` 自己写入，该分支恒不触发，故造不出「挂载失败后清理」的场景；而 `assertBuilt` 的失败发生在 `home` 创建之前，本就不涉及清理。清理契约由 TC-HOST-L2-01-001 与 TC-HOST-L2-01-005 覆盖。

#### [P3] [反向] 验证产物缺失时报出可操作的构建指引

[Case ID] TC-HOST-L2-01-004
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `test/e2e/support/dsh-host.ts:164`
[自动化] 是（同上文件 → `describe('编排骨架')`）
[前置条件] `packages/dsh-tauri-tsdown` 保持源码即产物（无 `main`、无 `dist`，且被 `build:plugins` 的 `--filter !dsh-tauri-tsdown` 显式排除）
[测试数据] `startDshHost({ plugin: 'dsh-tauri-tsdown' })`
[测试步骤] 1. 对其调用 `startDshHost`。2. 捕获错误文本。3. 对比调用前后临时目录中 `dsh-e2e-dsh-tauri-tsdown-*` 的集合。
[预期结果] 1. 抛错，文本同时含「尚未构建」与 `pnpm build:plugins` 指引。2. 不进入 `dsh web` 启动阶段：临时目录中不出现该 plugin 的 scratch 目录（即无日志文件产生）。
[清理] 无（不移动、不改写任何产物）

#### [P4] 验证环境变量边界：`DSH_E2E_KEEP_HOME` 控制 scratch 去留

[Case ID] TC-HOST-L2-01-005
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `test/e2e/support/dsh-host.ts:389`、`test/e2e/support/dsh-host.ts:442`
[自动化] 是（同上文件 → `describe('编排骨架')`）
[前置条件] 可重复启动宿主两次（串行，`fileParallelism` 已为 false）
[测试数据] 第一轮 `startDshHost({ plugin: 'dsh-tauri-pet' })`；第二轮同参数加 `keepHome: true`（即 globalSetup 在 `DSH_E2E_KEEP_HOME=1` 时传入的取值）
[测试步骤] 1. 第一轮启动后 `stop()`，检查 `home` 是否存在。2. 第二轮启动后 `stop()`，检查 `home` 与 `dsh-web.log`。3. 手工删除第二轮目录。
[预期结果] 1. 第一轮 `home` 目录不存在（已清理）。2. 第二轮 `home` 目录仍存在，且 `dsh-web.log` 可读。3. 删除成功，无残留锁文件。
[清理] 删除第二轮 scratch 目录

#### [P2] 验证 `DSH_E2E_MOUNT=cli` 走真实 CLI 挂载路径

[Case ID] TC-HOST-L2-01-006
[层级] L2（真实 dsh 进程）
[类型] 回归
[追踪] `test/e2e/support/dsh-host.ts:304`、`docs/specs/plugin.test.md` §5
[自动化] 是（同上文件 → `describe('编排骨架')`）
[前置条件] `pnpm` 在 PATH 上（`dsh plugin add` 是 pnpm 的薄转发，`link:` 规格不解析被链接包自身的 `catalog:` 依赖，故无需 registry 元数据）；`DSH_E2E_PNPM_STORE_DIR` 可选指向本地 store
[测试数据] 进程内设 `DSH_E2E_MOUNT=cli`；`startDshHost({ plugin: 'dsh-tauri' })`；结束后恢复该环境变量
[测试步骤] 1. 以 cli 模式启动宿主。2. 读 `home/profiles/web/package.json`。3. 对 `baseUrl` 发起 `GET /`。
[预期结果] 1. 启动成功（允许明显长于 link 模式）。2. `dependencies` 由 `dsh plugin add` 写入，值为 `link:` 规格并指向仓库 `packages/dsh-tauri`（不是自建链接）。3. `GET /` 返回 2xx。
[清理] 同 TC-HOST-L2-01-001

### 2.2 共享路由契约（`TC-CORE-L2-01-*`）

#### [P1] 验证 OPTIONS 预检在只声明 GET 的路径上返回 204 并公布 allow

[Case ID] TC-CORE-L2-01-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:270`
[自动化] 是（`01-dsh-host-and-core-contract.e2e.ts` → `describe('共享路由契约')`）
[前置条件] 该段在 `beforeAll` 自带宿主：`startDshHost({ plugin: 'dsh-tauri-pet', also: ['dsh-tauri-rightclick'] })`（GET 代表路由 + POST 代表路由）；`DSH_E2E_MOUNT=link`；本段所有请求均须带该宿主换回的会话 Cookie，否则 `/api` 一律 401，断言会把鉴权失败误读成路由契约失败
[测试数据] 对 `GET_ONLY_PATH` 发 `OPTIONS`
[测试步骤] 1. 对代表路由发起 `OPTIONS`（不带 body）。2. 读状态码与 `allow` 头。
[预期结果] 1. 状态码 204，响应体长度为 0。2. `allow` 头存在，按集合比较恰为 `{GET, HEAD, OPTIONS}`（`OPTIONS` 是默认预检，`HEAD` 由 GET 隐含）。
[清理] 无

#### [P2] 验证只声明 GET 的路径接受 HEAD 而不被判 405

[Case ID] TC-CORE-L2-01-002
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:255`
[自动化] 是（同上文件 → `describe('共享路由契约')`）
[前置条件] 同 TC-CORE-L2-01-001
[测试数据] 同一代表路由
[测试步骤] 1. 对代表路由发起 `HEAD`。2. 读状态码。
[预期结果] 1. 状态码 200——既不是 405（GET 隐含 HEAD 的规则生效），也说明确实命中了真实 handler。2. SSE 长连接不会阻塞 HEAD：用例在读完响应头后立即 `abort()`，不等待 body。
[清理] `abort()` 中止连接

#### [P3] [反向] 验证未声明的方法返回 405 且给出可用的 allow

[Case ID] TC-CORE-L2-01-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:276`
[自动化] 是（同上文件 → `describe('共享路由契约')`）
[前置条件] 同 TC-CORE-L2-01-001
[测试数据] 对 `GET_ONLY_PATH` 发 `POST`（body `{}`，`content-type: application/json`）
[测试步骤] 1. 发起请求。2. 读状态码、`allow` 头、响应体 JSON。
[预期结果] 1. 状态码 405。2. `allow` 头包含 `GET`。3. 响应体 `error` 字段以 `仅支持 ` 开头且包含 `GET`。
[清理] 无

#### [P3] [反向] 验证异源 Origin 的变更请求被 403 拒绝

[Case ID] TC-CORE-L2-01-004
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:287`（**在 L2 被上游围栏遮蔽，见下**）
[自动化] 是（同上文件 → `describe('共享路由契约')`）
[前置条件] 同 TC-CORE-L2-01-001；代表路由改为只声明 POST 的 `/api/desktop/dsh-tauri-rightclick/open/url`
[测试数据] 请求头 `Origin: http://evil.example`；`content-type: application/json`；body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体 JSON。
[预期结果] 1. 状态码 403。2. 响应体 `error` 恰为 `forbidden`（连接门词汇），**不是** `cross-origin-request`。3. 响应体里不出现 handler 的成功载荷 `{"ok":true}`——拒绝发生在任何插件 handler 之前。
[清理] 无
[已定论 · 期望值修正] 本条原写「`error` 恰为 `cross-origin-request`」，实测不成立：dsh 0.1.5-rc.2 的 `@deepseek-ai/dsh-client-connection` 先做 Host/Origin 围栏（`HostConnectionService.requestRejection` → `isTrustedApiRequest`，Origin 的 host 与请求 Host 不一致即返回 403），编排层的 `createHostHandler` 再把该 403 渲染成 `{ error: 'forbidden' }`。因此 `routes/index.ts:287` 的 `cross-origin-request` 分支在真实宿主里是**不可达的纵深防御**，L2 只能观察到连接门的 403。该分支由 L1 覆盖：`packages/dsh-tauri/src/host/routes/index.test.ts:240`（`it('变更操作拒绝跨源 Origin（CSRF / DNS rebinding），无 Origin 的非浏览器调用方放行')`，`:254` 断言 `cross-origin-request`）。

#### [P4] [反向] 验证超过 1 MiB 的请求体被 413 终止

[Case ID] TC-CORE-L2-01-005
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri/src/host/routes/index.ts:128`、`packages/dsh-tauri/src/host/config/constants.ts:13`
[自动化] 是（同上文件 → `describe('共享路由契约')`）
[前置条件] 同 TC-CORE-L2-01-001；使用只声明 POST 的代表路由
[测试数据] body 为 `1 MiB + 1 字节` 的 JSON（`{"pad":"<填充>"}`）
[测试步骤] 1. 发起 `POST`，`content-type: application/json`。2. 读状态码与响应体。
[预期结果] 1. 状态码 413。2. 响应体含上限字节数 `1048576`（与 `MAX_REQUEST_BODY_BYTES` 对齐）。3. 若连接被中断，用例把它转成带说明的断言失败，而不是抛出未处理异常。
[清理] 无

#### [P2] [反向] 验证未挂载插件的路径返回 404，用于区分「没挂载」与「没鉴权」

[Case ID] TC-CORE-L2-01-006
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `docs/specs/plugin.test.md` §5 鉴权说明（Cookie 交换下 401 与 404 的区分）
[自动化] 是（同上文件 → `describe('共享路由契约')`）
[前置条件] 该段宿主**未**挂载 `dsh-tauri-turnrewind`；请求带会话 Cookie
[测试数据] `GET /api/desktop/dsh-tauri-turnrewind/summary?sessionId=x`
[测试步骤] 1. 发起请求。2. 读状态码。
[预期结果] 1. 状态码 404（既不是 401 也不是 200）。2. 该结果与「挂载后同路径返回 200/4xx 业务码」形成对照，证明失败来自路由缺失而非鉴权围栏。
[清理] 无

---

## 3. 本批追踪矩阵

### 3.1 编排骨架

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `docs/specs/plugin.test.md` §8 批次 1（骨架挂载 + 随机端口） | TC-HOST-L2-01-001、TC-HOST-L2-01-002 | 正向 | 未覆盖「随机端口是否真的每次不同」 |
| `docs/specs/plugin.test.md` §5 步骤 5（挂载校验） | TC-HOST-L2-01-003 | 异常 | 该分支在 link 模式下恒不触发，故直接调用导出的 `assertMountRegistered`；「失败后 scratch 清理」随之不可达，改由 001/005 覆盖 |
| `docs/specs/plugin.test.md` §5 步骤 1（构建产物） | TC-HOST-L2-01-004 | 异常 | 以「源码即产物」的 `dsh-tauri-tsdown` 触发，不移动、不改写任何产物 |
| `docs/specs/plugin.test.md` §9（`DSH_E2E_KEEP_HOME`） | TC-HOST-L2-01-005 | 边界 | 依赖可重复启动宿主（串行） |
| `docs/specs/plugin.test.md` §5 挂载模式 `link`/`cli` | TC-HOST-L2-01-006 | 回归 | `dsh plugin add` 是 pnpm 薄转发；`link:` 规格不解析被链接包自身的 `catalog:` 依赖，故不依赖 registry |

### 3.2 共享路由契约

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `dsh-tauri` 路由契约：OPTIONS 204 | TC-CORE-L2-01-001 | 正向 | `allow` 按集合比较，不吃成员顺序 |
| 路由契约：GET 隐含 HEAD | TC-CORE-L2-01-002 | 正向 | SSE 路由会挂起连接，读完响应头即 `abort()` |
| 路由契约：405 + allow | TC-CORE-L2-01-003 | 异常 | 与各插件文件中的 405 断言**不重复**：此处只验共享层 |
| 路由契约：跨源 403 | TC-CORE-L2-01-004 | 异常 | L2 只能观察到上游 Host/Origin 围栏的 `forbidden`；路由层 `cross-origin-request` 分支被遮蔽，改由 L1 `packages/dsh-tauri/src/host/routes/index.test.ts:240` 覆盖 |
| 路由契约：413 bodyLimit | TC-CORE-L2-01-005 | 边界 | — |
| `plugin.test.md` §5 鉴权说明：带 Cookie 后 404 与 401 可区分 | TC-CORE-L2-01-006 | 异常 | — |

---

## 4. 缺口与假设

### 4.1 编排骨架

- **已定论**：`dsh-tauri` 可作为 bundle 独立挂载（实测通过，TC-HOST-L2-01-001 无需退化为 `dsh-tauri-pet`）。
- **已定论**：`assertBuilt` 无需注入即可测——`packages/dsh-tauri-tsdown` 与 `packages/dsh-tauri-bundle` 都是「源码即产物」（无 `main`、无 `dist`）且被 `build-plugins.ts:542`、`build-plugins.ts:544` 的 `--filter !` 显式排除，是稳定且不污染仓库的「未构建」夹具。已改用 `dsh-tauri-tsdown`。
- **已定论**：bundles 校验分支在 link 模式下不可达（bundles 由 `addBundle` 自己写入），已抽成导出的 `assertMountRegistered`（`test/e2e/support/dsh-host.ts:273`）供直接调用。代价是该用例不再能顺带断言「失败后 scratch 目录被清理」——那一段由 001/005 的清理断言覆盖。
- **缺口**：本文件不覆盖「端口冲突」「宿主提前退出」分支（`test/e2e/support/dsh-host.ts:341` 已有错误路径），留待骨架跑稳后补。
- **未纳入范围**：浏览器渲染、Tauri 窗口、插件业务语义——分别属于 02 起的各插件文件与桌面端宿主层。

### 4.2 共享路由契约

- **不可覆盖**：非回环地址发起的变更请求 403（`routes/index.ts:279`）需要非本机来源，本套用例不做；由 L1 `packages/dsh-tauri/src/host/routes/index.test.ts:219` 覆盖。
- **已定论（遮蔽）**：路由层的跨源 403（`routes/index.ts:287`，`cross-origin-request`）在真实宿主里不可达——上游 `@deepseek-ai/dsh-client-connection` 的 Host/Origin 围栏（`HostConnectionService.requestRejection` → `isTrustedApiRequest`）先拒绝，编排层把它渲染成 `{ error: 'forbidden' }`。L2 断言按可观察事实写（403 + `forbidden` + 无 handler 载荷），路由层词汇留给 L1。
- **已定论**：不带会话 Cookie 时 `/api` 与插件路由返回 401（上游 `authorizeIndex` 在根路径之外不做 token 交换）。因此本批一律显式携带 Cookie；L2 不再依赖桌面端的载体放行——那是 `dsh-tauri-connection` 插件在 `DSH_TAURI_EMBEDDED=1` 时提供的运行时覆写，npm 上的核心没有这个插件。
- **已定论**：`allow` 头的成员顺序实测为 `SUPPORTED_METHODS` 过滤后的 join 顺序（`GET, HEAD, OPTIONS`）；断言仍按集合比较，避免把实现顺序固化成契约。
- **已定论（分段宿主）**：共享路由契约段自带宿主（`beforeAll` 起一次，`dsh-tauri-pet` + `dsh-tauri-rightclick`）而不复用 `globalSetup`，因为它需要的挂载集与默认 lane 不同；这样本文件不依赖任何外部环境变量即可独立运行。
