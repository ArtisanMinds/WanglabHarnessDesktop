# 插件测试协议

> **本文件是插件侧测试的唯一权威来源**：分层与归属、目录、运行命令、宿主编排与鉴权、驱动选型、选择器口径、错误语义、隔离红线、已知坑与缺口，全部自包含在本文件内，不依赖任何其它文档。
> 配套文档：[desktop.test.md](./desktop.test.md)（桌面端 L3 车道）。
> **本仓不再维护用例文档**：测试不由「文档条目 ↔ `it()`」驱动，测试文件的 `it()` 标题即契约描述（见 §10）。

---

## 1. 定位与分层

内置插件由两部分组成：`src/host/**` 跑在 `dsh web` 进程内（Cordis 容器 + WebServer，随 dsh 进程生灭），`src/client/**` 跑在 WebView 页面内（前端 Bundle Slot 注册表，随页面加载）。

| 层级 | 代码位置 | 运行方式 | 被测对象 |
| --- | --- | --- | --- |
| **L1 单元** | `packages/*/src/**/*.test.ts`、`test/**/*.test.ts` | Vitest `unit` project | 纯函数、路由 Handler、注册表契约；允许在 `resolve.alias` 层做依赖替身 |
| **L2 插件宿主** | `test/e2e/plugins/*.e2e.ts` | Vitest `plugin` project（`environment: 'node'`） | 真实 `dsh web` 进程的 HTTP 字节：路由响应、状态码、错误体、挂载校验、崩溃防护 |
| **C 浏览器层** | 同上（`plugin` project 内） | Playwright **库 API**（`chromium.launch()`） | 真实 Chromium 里的客户端挂载与 DOM 行为 |
| **L3 桌面端** | `test/e2e/desktop/*.e2e.ts` | Vitest `desktop` project + WebdriverIO | 真实 Tauri 窗口（独立 OS 窗口句柄、窗口几何、Tauri IPC 往返） |

* **全仓唯一运行器是 Vitest**，通过根 `test.projects` 分层；Playwright 与 WebdriverIO 只作为**驱动库**被用例调用，不引入各自的 Runner。
* **C 浏览器层留在 `plugin` project 内**：不新增 project——新 project 必须自带 `globalSetup`，会多起一个 `dsh web` 进程；留在同一 project 即可复用同一个共享宿主、Cookie 与就绪状态。
* **L3 准入原则（强制）**：断言对象只有是 **Tauri 原生产物**才允许放 L3——独立 OS 窗口句柄（窗口出现 / 消失）、窗口几何与尺寸夹紧、Tauri IPC 往返。业务面板、侧栏、tab、对话框、Rail 形态等 **dsh iframe 内部的 DOM** 一律用 C 浏览器层断言：它们不经 Tauri 桥，写成 L3 只会得到一条只在 Windows 上跑、实际断言浏览器 DOM 的用例。原则与判据见 [desktop.test.md](./desktop.test.md) §1。
* 壳层职责只有「把 dsh 装起来、跑起来、嵌进来」：配置、语言、档案、插件生命周期、更新等业务行为不属于壳层职责，不建 L3。

## 2. 目录与归属

```text
packages/<name>/src/**/*.test.ts   # L1 单元（与源码同目录）
test/**/*.test.ts                  # L1（跨包/编排级单测）
test/e2e/
  global-setup.ts                  # plugin project 的 globalSetup：起共享宿主并 project.provide 地址/Cookie/Home
  support/
    dsh-host.ts                    # 共享环境脚手架：scratch DSH_HOME、profile、挂载、启动、鉴权交换、回收
    browser.ts                     # C 浏览器层编排：Chromium、同源嵌入 frame、Cookie 注入、报错收集、锚点常量
    onboarding.ts                  # 帧内阻塞式引导弹层的可重入闸
    selectors.ts                   # 选择器常量（壳层 data-testid 等）
    preinstall.ts                  # 首次装配 / 预装引导（桌面车道复用）
  plugins/*.e2e.ts                 # L2 + C（plugin project 匹配）
  desktop/*.e2e.ts                 # L3（desktop project 匹配）
docs/specs/plugin.test.md          # 本文件（唯一的规范性载体）
vitest.plugin.config.ts            # plugin project 配置
```

* **文件名即契约**：`*.e2e.ts` 是 E2E（L2 / C / L3），`*.test.ts` 是 L1，严格区分、不混放。
* **没有「用例文档」这一层**：不存在 `docs/testing/**`，不要求文档与测试文件同名同序号，不存在 `TC-*` 编号与 `[Case ID]` 字段（见 §10）。
* **匹配策略**：`plugin` 只收 `test/e2e/plugins/**/*.e2e.ts`；`desktop` 只收 `test/e2e/desktop/*.e2e.ts`；`unit` 收 `packages/**/*.{test,spec}.*`、`test/**`、`src/**/*.test.ts`（自动排他 `.e2e.ts`）。`test/archive/**` 不被任何 project 匹配。
* **归属判定**：一条用例要驱动真实 `dsh web` 进程或真实 Chromium → `plugin`；只断言纯函数 / Handler → `unit`；断言 Tauri 原生产物 → `desktop`。
* 单个插件不必把全部层级塞进一个文件：同插件可同时有 `test/e2e/plugins/<主题>.e2e.ts`（L2 + C）与 `test/e2e/desktop/<主题>.e2e.ts`（L3），两个文件各自独立命名，不再有「一个编号只允许一个文件」的约束。桌宠即此形态：L2/C 在 `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts`，Tauri 原生窗口 4 条在 `test/e2e/desktop/02-pet-window.e2e.ts`（`plugin` 车道的 CI 作业是 ubuntu-latest，Tauri 与 `build:debug` 是 Windows-only，窗口用例留在插件文件里等于「写了却永不执行」）。

## 3. 运行方式

### 3.1 命令

```bash
node node_modules/vitest/vitest.mjs run --project plugin                                            # 整条 plugin 车道
node node_modules/vitest/vitest.mjs run --project plugin test/e2e/plugins/02-dsh-tauri-pet.e2e.ts   # 单文件（位置参数）
```

* **不要用 `pnpm run <script>`**：本仓的 pnpm 依赖校验与 `.bin` shim 会失败（解析到的 vitest 可能不是期望版本或直接报错）。绕开脚本直接跑 `node node_modules/vitest/vitest.mjs run ...` 是唯一可靠写法。
* **必须带 `run`**：不带 `run` 的 vitest 在非 CI 的交互式终端进入 watch 模式并挂住，CI 里也不会退出。`package.json` 的 `test` / `test:unit` / `test:e2e:*` 脚本本身不带 `run`，走脚本时必须以 `-- --run` 补上。
* **单文件过滤用位置参数**：`vitest run --project plugin <file>`。写成 `vitest --project plugin -- <file>` 时 `--` 之后的内容不会被当作过滤条件，整条车道会全部跑一遍。
* L2/C 只对**构建产物**运行：先 `pnpm build:plugins`（`packages/dsh-tauri-bundle` / `packages/dsh-tauri-tsdown` 是构建工具、无产物，被显式排除）。产物缺失时编排直接失败并提示命令，不静默跳过。
* `vitest.plugin.config.ts` 设 `environment: 'node'`、`fileParallelism: false`：单实例共享宿主必须串行。
* 前置不满足（产物缺失、dsh 解析不到、端口/进程残留）一律 Fail，不提供 skip 开关。

### 3.2 驱动选型与定位口径

* **Playwright 库 API**：`import { chromium } from 'playwright'`，在 `plugin` project 内以 `environment: 'node'` 运行，复用 `globalSetup` 起的真实宿主与已换取的 Cookie；共享编排在 `test/e2e/support/browser.ts`。浏览器归用例自己控制，页面就是被测对象。
* **不引入 Playwright Test Runner**（`@playwright/test` / `playwright.config.ts`）：本仓只有一个运行器，报告、超时、生命周期统一由 Vitest 管理。
* **不用 Vitest browser mode**（`@vitest/browser` / `@vitest/browser-playwright`）：它的 provider 会把浏览器**导航到 Vitest 自己的 origin**，被测应用文档因此被卸载——看不到 dsh 页面，也无法在帧内断言。
* **选择器按「元素归属」分流**：插件包 `packages/*` 注入的元素用 `data-dsh-*`；壳层 `src/` 提供的元素用 `data-testid="dsh-<业务域>-<元素名>"`；dsh 内部结构属上游产物，只能用稳定结构性锚点（`data-slot` / `role` / `dsh`·`dshp` 前缀类）。完整口径与禁止项见 §6。

### 3.3 稳定性要求

* 同一批用例**连续运行 5 次无 Flake**才算通过；偶发失败按缺陷处理，不带病合并。
* 失败信息必须能定位到「用例 - 步骤 - 期望 vs 实际」，不靠重跑掩盖。
* 每次运行必须从干净的 scratch 环境起步，不依赖上一次运行的残留状态。

## 4. 编排与鉴权

共享编排在 `test/e2e/support/dsh-host.ts`（导出 `REPO_ROOT`、`assertMountRegistered`、`scaffoldDshProfile`、`startDshHost`）。`test/e2e/global-setup.ts` 起**一个**共享宿主，把地址 / Cookie / Home 经 `project.provide()` 下传给用例（`inject('dshBaseUrl' | 'dshUrl' | 'dshCookie' | 'dshHome' | 'dshMounted')`）；`globalSetup` 在 worker 之外执行，这是唯一的传递途径。用例能复用共享宿主就绝不另起进程。

1. **构建产物**：`pnpm build:plugins` 已产出 `packages/*/dist`。
2. **解析 dsh 入口**（顺序固定，三者皆无则**直接抛错**）：
   `DSH_E2E_DSH_BIN` → 仓库依赖树 → 桌面端装配目录。
   * 仓库刻意**不**把 `@deepseek-ai/dsh` 装进依赖树：它会与本仓 catalog 的 `@deepseek-ai/dsh-*` 形成双树，profile 组合时取到不匹配的实例。
   * 装配目录为 `%APPDATA%/<identifier>/dependencies/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`，**标识符查两代**：新的 `dsh-tauri` 优先，旧的 `io.github.hairyf.deepseek-harness-desktop` 回退（app-data 改名迁移对 debug/E2E 刻意跳过，改名后的机器上旧目录常是唯一一份已装配的 dsh）。
   * 不提供「跳过」开关：一旦可跳过，CI 会在什么都没断言的情况下报绿。
3. **scratch `DSH_HOME`**：每次运行独占 `DSH_E2E_HOME=<tmp>/dsh-e2e-<suite>-<timestamp>`，L2 的 `DSH_HOME` 一律指向 `<DSH_E2E_HOME>/dsh`；落在该根之外的 profile 视为编排缺陷。
4. **profile 三件套脚手架**：构造 `<DSH_HOME>/profiles/web/{package.json, cordis.patch.yml, pnpm-workspace.yaml}`。
5. **挂载插件**（两种模式）：
   * `link`（默认）：自建软链接至 profile 的 `node_modules`，并写 `dsh.profile.bundles`。
   * `cli`：执行 `dsh plugin --profile web add link:<repo>/packages/<name>`（`dsh plugin add` 是 pnpm 薄转发；`link:` 规格不解析被链接包自身的 `catalog:` 依赖，故不依赖 registry）。
6. **校验挂载**：`assertMountRegistered(profileDir, packages)` 确认 `dsh.profile.bundles` 含目标插件，未命中立即抛错。该分支在 `link` 模式下恒不触发（bundles 由编排自己写入），因此用例**直接调用这个导出函数**来覆盖它，而不是靠某个模式走到。
7. **启动**：`dsh web --host 127.0.0.1 --port 0 --no-open`（`web` 是内置 profile 别名，无需显式 `--profile`）；从日志里取就绪地址。
8. **交换会话（唯一的鉴权通道）**：上游只认「根路径 `GET /?token=<...>` 换 Cookie」——`/` 之外的请求带 query token 或 `Authorization` 头都不认。请求带 `redirect: 'manual'`，断言 **303 + `Set-Cookie`**，取其 `name=value` 段作为会话凭据（host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`、无 `Secure`）；此后 `/api/**` 与插件自有路由都必须带回该 Cookie，否则 401。
   桌面端内嵌 WebView 走的是另一条路（`dsh-tauri-connection` 插件在 `DSH_TAURI_EMBEDDED=1` 时覆写 connection 的两道鉴权闸门），**L2 不复用该通道**：npm 上的核心没有这个插件，且绕过鉴权会让「未鉴权」与「路由丢失」在测试里不可区分。
9. **下传**：地址、Cookie、scratch Home 经 `project.provide()` 交给用例；C 浏览器层在 `newContext` 阶段 `addCookies` 注入该 Cookie。
10. **回收**：触发 teardown——终止 dsh 进程树、清空临时目录（`DSH_E2E_KEEP_HOME=1` 时保留现场）。
11. **日志**：控制台每次起宿主只留 3 行；`dsh web` 完整输出进 `<home>/dsh-web.log`。

关键环境变量：

| 环境变量 | 作用 | 默认值 / 回退策略 |
| --- | --- | --- |
| `DSH_E2E_HOME` | 本次运行独占的隔离根，全部测试数据必须落在其下 | `<tmp>/dsh-e2e-<suite>-<timestamp>` |
| `DSH_E2E_DSH_BIN` | `dsh` 入口路径（`lib/bin.js`） | 仓库依赖树 → 桌面端装配目录（新旧标识符） |
| `DSH_E2E_NODE_BIN` | 执行 `dsh` 的 Node 二进制 | `process.execPath` |
| `DSH_E2E_PLUGIN` | 共享宿主挂载的目标插件 | `dsh-tauri-pet` |
| `DSH_E2E_ALSO` | 附加挂载的插件（逗号分隔） | 未设置 |
| `DSH_E2E_MOUNT` | 挂载模式 `link` \| `cli` | `link` |
| `DSH_E2E_KEEP_HOME` | 置 `1` 时保留隔离根以便调试 | 未设置（自动清理） |
| `DSH_E2E_DOWNLOAD_CACHE_DIR` | 桌面端装配下载缓存目录（见 §9 #6） | `<os.tmpdir()>/dsh-e2e-download-cache` |
| `DSH_E2E_COLD_ASSEMBLY` | 置 `1` 时退化为冷装配（不复用缓存） | 未设置 |

## 5. 驱动与编排细节

* **同源嵌入宿主**：插件 client 入口有 `window.parent === window` 早退（`packages/dsh-tauri/src/client/apply.ts:29`、`packages/dsh-tauri-pet/src/client/index.ts:24`），因此每条 C 用例都要把真实 dsh 页面装进 iframe。做法是用 `page.route` 提供专用路径 `EMBEDDED_DOCUMENT_PATH`（`/dsh-e2e-embed.html`，见 `test/e2e/support/browser.ts`）返回只含该 iframe 的极小文档：父页与被测页同源，于是既能进帧断言，也能直接读 frame 的 `document`。顶层页面那一条反例（client 早退）本身也是有效证据。
* **可重入弹窗闸（每次交互前必须过闸）**：dsh 首次进入会先后弹两个弹层，二者都走 `OnboardingModal`——「内测声明」（`WelcomeNotice`，正文只有「继续」）与「添加一个 API Key 开始使用」（取消项是编辑器底部的「稍后配置」）。`OnboardingModal` 把帧内 `#root` 设为 `inert`，且把 `Modal.onClose` 写成空实现（`ignoreImplicitDismiss`），**点遮罩 / 按 Esc 都关不掉**，只有点各自的正向按钮才 `complete()`；关闭状态还是「按帧内页面加载判定」的插槽状态、**不落盘**，iframe 一旦重建就复发。因此闸必须是**可重入的**（关一个 → 再看还有没有，直到连续两次为空），不能在 `beforeAll` 里关一次就算完；每一次交互前都要重新过闸。不关掉的话，所有真实指针点击都会被 `#root[inert]` 吞掉（表现为「点了没反应」）。闸的判定用结构与类名后缀（`div[role="dialog"][aria-modal="true"]`、`div[class*="_editorActions"] > button`），不用文案——文案随语言变化，且本协议禁止 E2E 依赖文本。
* **帧尺寸**：`APP_FRAME_VIEWPORT` = 1400×900；更小会把设置侧栏折成 Rail 形态，影响几何类断言。
* **每帧页面加载后重新过闸**，跨用例不得复用「弹层已关」的假设。

## 6. 选择器口径（按元素归属分流）

| 元素归属 | 锚点 | 说明 |
| --- | --- | --- |
| 插件包 `packages/*` 注入的元素 | `data-dsh-*`（如 `[data-dsh-tauri-pet-icon]`） | 插件自己渲染的挂载点。其中一部分是**行为钩子而非测试钩子**（如 `packages/dsh-tauri-ui/src/client/register/obstructions.ts:88` 的 `attributeFilter` 按它过滤 DOM 变更），**不得为测试改名或增删** |
| 壳层 `src/**` | `data-testid="dsh-<业务域>-<元素名>"` | 全小写连字符，如 `dsh-shell-iframe`、`dsh-setup-preinstall-skip`；常量集中登记在 `test/e2e/support/selectors.ts` |
| dsh 上游内部结构（设置面板、侧栏、tab、对话框、Rail 形态） | 稳定结构性锚点：`data-slot` / `role` / `dsh`·`dshp` 前缀类 | dsh 属上游产物，其内部 DOM 不受本仓约束；这类断言归 **C 浏览器层**，用到的上游锚点必须在用例内注释其来源，缺稳定锚点的场景登记为缺口 |
| 帧内阻塞弹层 | 结构 + 类名后缀 | 见 §5；不得改用文案 |

**禁止**：依赖非稳定文案、任意 CSS 类名、DOM 层级作为选择器；把「无报错」当成唯一正向证据（必须有可见产物断言）。

**已知例外（必须登记）**：`div[class*="_editorActions"] > button`（引导弹层「稍后配置」按钮）——该槽位没有 `data-*` 锚点，且按钮文案随语言变化，只能按容器类名后缀定位。使用上游类名或结构性锚点作为选择器时，必须在本节登记为已知例外并写明理由。

## 7. 错误语义

1. **不得静默跳过**：前置不满足一律直接 Fail；不提供 skip 开关，也不用 `skipIf` 掩盖环境问题。
2. **不得为求绿放宽断言**：断言以实测可观察事实为准；发现断言与实现不符时改断言或改实现，不允许删断言、改期望来掩盖。
3. **不得写恒真 / 自比断言**：`expect(x).toBe(x)`、只断言「存在元素」而不验契约、把「无报错」当作唯一正向证据，一律视为假绿。
4. **需要真实模型 / 公网 / 系统副作用的用例不写自动化假绿**：会真的拉起系统程序（文件管理器、默认浏览器等）或依赖公网与模型的场景保持手工执行，或在用例中显式标注且不作为 CI 门禁；能通过自种数据（缓存、配置文件）与外网解耦的必须先解耦再自动化。
5. **错误采集**：C 浏览器层收集 `pageerror` 与 `console.error`，用 `IGNORED_APP_ERRORS` 过滤。忽略清单必须**窄且逐条给理由**：当前四条 `NODE_NOT_ANSWERED` / `invoke ` / `__TAURI` / `Failed to fetch` 的理由是同一个环境事实——用例跑在纯浏览器里没有 Tauri 宿主，所有 Tauri 桥调用必然失败，属预期噪声；过滤后仍出现的错误才是真问题。新增白名单条目必须逐条写理由，不得放宽为「不收集」。
6. 失败必须能定位到具体步骤；L2 的完整 dsh 输出在 `<home>/dsh-web.log`。

## 8. 隔离红线

* **禁止**读写用户真实的 `~/.dsh` / `~/.dsh.dev`，**禁止**改写真实的 `.store.dev.dat` / `.store.dat`。
* L2 全部落盘必须在 `DSH_E2E_HOME` 之下；L3 的隔离根是重定向后的 home（见 [desktop.test.md](./desktop.test.md) §3）。
* **不得真的拉起系统程序**（文件管理器、默认浏览器等），除非用例显式声明该副作用并标注为手工用例；对外部打开的断言只验请求侧证据。
* **不得杀用户进程**：端口或进程残留直接 Fail，不自动强杀。
* **清理义务**：scratch 目录由 teardown 删除（`DSH_E2E_KEEP_HOME=1` 才保留）；被占用删不掉时做少量快速重试后留给下一次运行的清理，不得把用例拖红。

## 9. 已知缺口与坑（实测结论）

| # | 结论 | 影响 / 处置 |
| --- | --- | --- |
| 1 | **会话播种不可达** | `/api/**` 下没有任何可用的「创建会话」路由（探测 15 个候选路径全 404），共享宿主也没有造会话的 helper。依赖真实会话的浏览器断言只能**待补**，不得用假数据伪造。补齐方向：在 `test/e2e/support/dsh-host.ts` 加「经 Typert / 桥接口建一条 scratch 会话」的 helper。 |
| 2 | **侧栏入口两态与后端带外失同步** | 入口按钮的 `aria-pressed` 只来自客户端 store（`packages/dsh-tauri-pet/src/client/register/sidebar-icon.ts:38` 的 `iconActive()`），而 Rust 侧 `pet://status` 只 `emit_to(PET_WINDOW_LABEL)`，iframe 侧没有带外订阅，`loadPetStatus()` 只在注册时拉一次。从带外改写状态后窗口按预期创建 / 销毁，但入口态停在旧值，紧接着的点击可能只是幂等写。依赖入口态的用例必须把「点击前入口处于期望态」写成**显式前置断言**（不一致时直接报「入口 store 与后端失同步」），并在用例内走同一条 UI 点击路径做清理以保持同源。 |
| 3 | **壳层 `execute` 里 invoke 的拒绝被驱动回成 HTTP 500** | `src-tauri/vendor/tauri-plugin-wdio-webdriver/src/server/response.rs` 把拒绝回成 `500 + error: "javascript error"`，而 `webdriver@9.31.9` 的 `RETRYABLE_STATUS_CODES` 含 500 且不排除该错误名 → `Retrying 1/10…9/10` 指数退避，**单次被拒的 invoke 要约 46–56s** 才把错误交给用例（实测 13:47:11.5→13:47:57.6、14:00:04.2→14:00:50.2）。页面内 `catch` 拦不住。要立即拿到错误，需在断言期间把**会话选项** `connectionRetryCount` 置 0、`finally` 还原；断言内容不变。 |
| 4 | **跨源 403 在真实宿主被上游围栏遮蔽** | 路由层的 `cross-origin-request` 分支（`packages/dsh-tauri/src/host/routes/index.ts:287`）在 L2 不可达（上游 Host/Origin 围栏先拒），只能在 **L1** 覆盖（`packages/dsh-tauri/src/host/routes/index.test.ts:240`）；L2 按可观察事实断言 `forbidden`。 |
| 5 | **`dsh-tauri-model-config` 的预设端点依赖公网上游** | 离线且无缓存时退化为 502（单文件跑可能 200、全车道跑 502，随网络漂移）。用例必须**自种 24h TTL 缓存**（`$DSH_HOME/dsh-tauri-model-config/model-presets.json`，`{source, fetchedAt, presets}`）后再断言响应契约，与外网解耦；不得把「环境恰好联网」当前置。 |
| 6 | **桌面端下载缓存默认共享** | 默认 `$DSH_E2E_DOWNLOAD_CACHE_DIR`（缺省 `<os.tmpdir()>/dsh-e2e-download-cache`），Node 与 dsh 核心不重下；需要观察真实下载的用例显式 `coldCache: true`（等价 `DSH_E2E_COLD_ASSEMBLY=1`）退回本次运行独占的空目录。 |
| 7 | 其它已定论事实 | `link` 模式下挂载校验分支不可达（直接调 `assertMountRegistered` 覆盖）；配置 / 语言 / 档案等宿主级状态在 scratch 运行间**不保证**保持初始态，用例必须自建前置（删除或写入），不得假定初始态。 |

## 10. 不再以「用例文档条目 ↔ `it()`」驱动测试

* 本仓**已废弃旧的用例文档体系**：`docs/testing/**` 与测试体系整改的 Spec 均已删除。测试不再需要文档编号映射、`[Case ID]` 字段、`[自动化]` 标记、批次台账与变更历史台账。
* **测试文件的 `it()` 标题即契约描述**：标题要写清「验证什么对象、在什么条件下、期望什么可观察结果」，一条 `it()` 对应一条契约。
* 新增或修改行为时直接改测试代码，并在 PR 说明里写清契约变化；不需要同步任何用例文档。
* 本文件与 [desktop.test.md](./desktop.test.md) 是**唯一的规范载体**：约定、口径、命令、环境变量、已知坑都写在这两份里，不再分层到别处。
