# 桌面端测试协议（L3）

> **本文件是桌面端测试的唯一权威来源**：L3 准入原则、平台与前置、隔离、驱动、断言与稳定性、命令、已知坑，全部自包含在本文件内，不依赖任何其它文档。
> 配套文档：[plugin.test.md](./plugin.test.md)（插件 L1 / L2 / C 浏览器层）；[testing.md](./testing.md)（测试评审标准：断言是否验到真实契约、假绿与静默失败、隔离与确定性等）。
> **本仓不再维护用例文档**：测试不由「文档条目 ↔ `it()`」驱动，测试文件的 `it()` 标题即契约描述（见 §8）。

---

## 1. 定位与 L3 准入原则

桌面端 L3 车道只回答一个问题：**壳层有没有把 dsh 正确装起来、跑起来、嵌进来**。

**准入原则（强制，可机检）**：只有断言对象是 **Tauri 原生产物**时才允许进 `desktop` 车道——

* 独立 OS 窗口句柄（窗口出现 / 消失）；
* 窗口几何与尺寸夹紧；
* Tauri IPC 往返。

**反之**：业务面板、侧栏、tab、对话框、Rail 形态等**嵌在 dsh iframe 内部的 DOM**，一律用 C 浏览器层断言（Playwright 库 API，见 [plugin.test.md](./plugin.test.md) §3.2），不建 L3。它们不经 Tauri 桥，写成 L3 只会得到一条只在 Windows 上跑、实际断言浏览器 DOM 的用例。配置、语言、档案、插件生命周期、更新等业务行为不属于壳层职责，同样不建 L3。

**判据**：若一条用例的断言语句读的是 dsh 页面内的 DOM / 文本，它就不是 L3。

当前车道用例（共 2 个文件 / 5 条）：

| 文件 | 内容 |
| --- | --- |
| `test/e2e/desktop/boot.e2e.ts` | 启动冒烟：进入下载装配 → dsh 内核启动 → 页面无报错（显式冷装配，断言「必然真的下载并落盘」） |
| `test/e2e/desktop/02-pet-window.e2e.ts` | 桌宠窗口 4 条：独立 OS 窗口出现 / 未启用时不存在 / 侧栏入口切换后创建与销毁 / 尺寸越界拒绝且不改状态 |

> 桌宠窗口用例的文件名沿用了插件域的编号命名，这是历史产物，不是约束：同一插件的 L2/C 用例在 `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts`，L3 用例在 `test/e2e/desktop/02-pet-window.e2e.ts`。理由是运行归属——`plugin` 车道的 CI 作业是 ubuntu-latest，Tauri 与 `build:debug` 是 Windows-only，窗口用例留在插件文件里等于「写了却永不执行」。

## 2. 平台与前置

| 项 | 约定 |
| --- | --- |
| 平台 | **Windows 优先**（WebView2 + 应用内嵌 W3C WebDriver server）；CI 作业 `desktop-e2e` 为 windows-latest 且是 PR 必过门禁 |
| 构建 | `pnpm build:debug` = `build:plugins` → `vite build` → `tauri build --debug --no-bundle`（临时 config 清空 `beforeBuildCommand`） |
| 二进制 | `src-tauri/target/debug/deepseek-harness-desktop.exe`；不存在即 Fail，不在用例里尝试构建 |
| 前端产物 | `dist/` 缺失时应用回退到 `devUrl`、页面为空，所有选择器都找不到 |
| 应用端口 | debug 默认 **3081**（release 3080）；被占用时实现会逐级递增，用例按「默认值 + 实测空闲」判定，不假设恒定 |
| WebDriver 端口 | `TAURI_WEBDRIVER_PORT`，默认 **4445**；应用仅在该变量存在时监听内嵌 server。它是**整机唯一**资源：被别的实例占住时本次应用绑不上，而 wdio 仍会连上对方的 driver，会话静默挂到别人的窗口 |
| 并存策略 | **本机已有其它桌面实例时，用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路并存，不得杀用户进程** |
| 残留实例 | 按可执行文件路径匹配；存在残留即 Fail，不自动强杀 |
| 预建目录 | **必须预先创建 `<home>/AppData/Local` 与 `<home>/AppData/Roaming`**，否则 `tauri-plugin-http` 的 `app_cache_dir()` 解析失败 → `lib.rs` 的 `expect` panic（exit 101，启动即崩溃，易误判为二进制损坏） |
| 运行位置 | 在后台 / 独立终端执行——前台终端会抢走应用窗口焦点，依赖窗口激活的交互断言会假失败 |
| 网络 | 默认允许联网；冷装配必然需要下载 |

## 3. 隔离

* **根**：重定向 `USERPROFILE`(Windows) / `HOME`(Unix) 到 `<E2E_HOME>/home`，即可同时隔离 dsh 数据目录与应用数据目录（二者都由 home 派生）。不要用 `DSH_HOME` 隔离桌面端：`get_dsh_data_path` 读该环境变量（`src-tauri/src/config/runtime.rs:455`），但 **debug 下恒为 `<home>/.dsh.dev` 且忽略 `DSH_HOME`**（`:471`、`:472`）。
* **app-data**：`app_data_dir()` = `dirs::data_dir()/<identifier>` → Windows 为 `<home>\AppData\Roaming\dsh-tauri`。
* **Store 三方隔离**：应用以 `TAURI_WEBDRIVER_PORT` 是否存在判定「这是 E2E 运行」，据此选用 `.store.test.dat`（生产 `.store.dat`、开发 `.store.dev.dat`）；判定收敛在 `config::setting::store_dat_file_name()`（`src-tauri/src/config/setting.rs`），Rust 单测守门三个文件名互不相同。
* **前置清空**：启动前删除 `<app-data>/.store.test.dat`（`resetTestStore()`），否则会继承上一次运行的窗口几何等状态。
* **WebView2 profile 独占（必须）**：`app_local_data_dir()` 由 `SHGetKnownFolderPath` 解析，重定向 `LOCALAPPDATA` **无效**；必须设置 `DSH_E2E_WEBVIEW_DATA_DIR` 指向 `<home>/webview2`，否则与用户的开发会话共用 `EBWebView-dev`（localStorage 互相污染）。
* **下载缓存**：默认共享 `$DSH_E2E_DOWNLOAD_CACHE_DIR`（缺省 `<os.tmpdir()>/dsh-e2e-download-cache`）；冷装配用 `coldCache: true`（等价 `DSH_E2E_COLD_ASSEMBLY=1`）退回本次运行独占的空目录 `<home>/download-cache`，随 scratch home 一并清除；`startDesktopApp({ downloadCacheDir })` 可复用缓存以加速本地反复跑，但那样不再覆盖「进入下载」。
* **收尾**：主动关闭应用并等待进程平滑退出；`DELETE /session/<id>`；收掉本车道遗留的 dsh 进程；删除 scratch home（被占用时保留并告警）。
* **标识符改名**：app-data 目录名从 `io.github.hairyf.deepseek-harness-desktop` 缩短为 `dsh-tauri`，旧目录由启动期迁移搬入（`src-tauri/src/service/migrate.rs`，Rust 单测覆盖）；迁移**只在 release 执行**，debug / E2E 不得搬动。
* **禁止**：读写用户真实的 `~/.dsh` / `~/.dsh.dev`、`.store.dev.dat` / `.store.dat`；在用例中创建或删除用户的 `web` / `tauri` / `safe` 档案；为清理而杀用户进程。

## 4. 驱动

* **`@wdio/tauri-service` 的 `driverProvider: 'embedded'`**：驱动应用内嵌的 WebDriver server，跨平台统一（Windows WebView2 / macOS WKWebView / Linux WebKitGTK）。
* **standalone 用法，不引入 WDIO runner**：WebdriverIO 只当**驱动库**（会话管理、DOM 操作、`execute`）使用；会话在用例内 standalone 建立，由 Vitest 的 `desktop` project（`environment: 'node'`）统一组织执行、超时与断言。**不引入 `@wdio/cli` 与 `wdio.conf.ts`**——本仓只有一个运行器。
* 组件：`webdriverio` + `@wdio/tauri-service` + Rust 侧 `tauri-plugin-wdio-webdriver`。
* **跨域 iframe 补丁**：壳层 `tauri://localhost` 与内嵌 dsh `http://127.0.0.1:<port>` 跨域；上游 1.4.0 用 `frame.contentWindow.eval` 模拟帧上下文必然超时，仓库以 `[patch.crates-io]` 指向 `src-tauri/vendor/tauri-plugin-wdio-webdriver`，Windows 走原生 `ICoreWebView2Frame2::ExecuteScript`。帧内断言依赖这份补丁。
* **窗口定位**：应用会同时开主窗口（webview `main`）与桌宠窗口（`pet`），会话落在哪个取决于创建时机；编排必须在建会话后显式 `switchToWindow('main')`。
* **`browser.execute` 的序列化限制**：只序列化函数体，模块级常量在页面上下文里不存在，必须作为参数传入。
* **就绪探针**：`GET /status` → `{ value: { ready: true } }`。
* **会话回收**：`DELETE /session/<id>`，随后终止进程树。
* **Project 配置**：`vitest.desktop.config.ts`，`include: test/e2e/desktop/*.e2e.ts`，`environment: 'node'`，串行（`fileParallelism: false`），`testTimeout` 180s（装配类用例按 900s 放宽）。首次装配可能需要分钟级联网下载，`beforeAll` 相应放宽。

## 5. 断言与稳定性

* **只验真实 Tauri 产物**：窗口句柄（出现 / 消失）、窗口几何与尺寸夹紧、Tauri IPC 往返。禁止在 E2E 层 Mock 后端命令。
* **真实环境**：必须驱动真实 Tauri 窗口 / 进程，不写进程内替身。
* **严格归因**：失败需定位到「用例 - 步骤 - 期望 vs 实际」，禁止靠重跑掩盖。
* **稳定性**：连续运行 ≥5 次无 Flake 才算通过。
* **选择器口径**：
  * 壳层 `src/**` → `data-testid="dsh-<业务域>-<元素名>"`（常量集中登记在 `test/e2e/support/selectors.ts`，如 `dsh-setup-preinstall-skip`）。
  * 插件包 `packages/*` 注入的元素 → `data-dsh-*`（部分属性是行为钩子，**不得为测试改名**）。
  * dsh 上游内部结构 → 只能用稳定结构性锚点（`data-slot` / `role` / `dsh`·`dshp` 前缀类）。
  * **禁止**依赖文案、任意 CSS 类名、DOM 层级。若不得已使用上游类名，必须登记为已知例外并写明理由（登记位置：[plugin.test.md](./plugin.test.md) §6）。
* **帧内挂载点**：`#root`（由 `@deepseek-ai/dsh-web-frontend/dist/index.html` 提供）。
* **帧内报错收集的盲区**：错误收集器只能在进入 frame 之后安装，**加载期报错不可观测**；由「iframe 已挂载 + `#root` 渲染出内容 + 壳层未落到失败页」间接兜底。
* **错误采集**：收集 `pageerror` 与 `console.error`；忽略清单必须**窄且逐条给理由**（例如「纯浏览器无 Tauri 宿主」导致的桥调用噪声），不得放宽为「不收集」。
* **不得静默跳过**、**不得为求绿放宽断言**、**不得写恒真 / 自比断言**；需要真实模型 / 网络 / 系统副作用的用例保持手工执行或明确标注，不写自动化假绿。
* **`skipIf` 平台口径必须一致**：同一平台条件（Windows-only）在整个桌面试套件内用同一判据写法，禁止一处按 `process.platform`、另一处按环境变量——否则 CI 与本地行为不同，用例会在非 Windows 上静默变绿。

## 6. 命令与 CI

```bash
pnpm build:debug                                                                     # 前置：构建二进制
node node_modules/vitest/vitest.mjs run --project desktop                            # 整条车道
node node_modules/vitest/vitest.mjs run --project desktop test/e2e/desktop/boot.e2e.ts  # 单文件（位置参数）
```

* **不要用 `pnpm run test:e2e:desktop`**：本仓的 pnpm 依赖校验与 `.bin` shim 会失败；脚本本身也不带 `run`（交互式终端会进 watch 挂住）。绕开脚本直接跑 `node node_modules/vitest/vitest.mjs run ...` 是唯一可靠写法。
* **单文件过滤必须用位置参数**；写成 `-- <file>` 不过滤，整条车道会全部跑一遍。
* 本机已有桌面实例占着 4445 时，用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路并存，**不要结束用户进程**。
* 在后台 / 独立终端执行（前台会抢焦点）。
* **CI**（`.github/workflows/ci.yml` 的 `desktop-e2e`，windows-latest，PR 门禁）：恢复插件构建缓存 → `pnpm install --frozen-lockfile` → 必要时 `pnpm build:plugins` → `pnpm exec vite build` → `pnpm tauri build --debug --no-bundle --config <清空 beforeBuildCommand>` → `pnpm run test:e2e:desktop -- --run`。runner 的 `%TEMP%` 每次全新，CI 上必然走一次真实下载。
* **失败产物**：约定失败时保存应用 `stdout` / `stderr` 与 WDIO 截图至 `test/e2e/.artifacts/`（已 Git Ignore）。**注意**：该目录目前只有约定与 `.gitignore`，落盘实现尚未补齐，失败定位暂依赖 `<home>/logs/dsh-web.dev.log` 与驱动报错。

## 7. 已知坑与缺口

| # | 现象 | 处置 |
| --- | --- | --- |
| 1 | **scratch 目录可能因 EPERM 残留** | 应用退出后 WebView2 子进程可能仍占用 scratch home，删除时报 EPERM / EBUSY。只做少量快速重试后留给下一次运行的清理（`purgeStaleHomes()`，按 mtime 过滤以避开并发会话），不得为清理把用例拖红 |
| 2 | **driver 把 invoke 拒绝回成 HTTP 500 并重试** | 壳层 `execute` 里 invoke 的**拒绝**被 vendor 驱动回成 `500 + error: "javascript error"`（`src-tauri/vendor/tauri-plugin-wdio-webdriver/src/server/response.rs`），`webdriver@9.31.9` 的 `RETRYABLE_STATUS_CODES` 含 500 → 指数退避 `Retrying 1/10…9/10`，单次被拒的 invoke 要约 46–56s 才把错误交给用例。要立即拿到错误，需在断言期间把会话选项 `connectionRetryCount` 置 0 并在 `finally` 还原；断言内容不变 |
| 3 | **`skipIf` 平台口径不一致** | 同一平台条件必须用同一判据写法；一条被 `skipIf(process.platform === 'darwin')` 静默变绿的用例等于零覆盖（见 §5） |
| 4 | **端口不是绝对固定** | 应用端口有「被占用即递增」逻辑；前置校验按实测空闲判定，不硬编码断言 3081 |
| 5 | **帧内报错收集的加载期盲区** | 见 §5；用「iframe 已挂载 + `#root` 有内容 + 未落失败页」兜底 |
| 6 | **前台终端抢焦点** | 依赖窗口激活的交互断言会假失败；一律后台 / 独立终端执行 |
| 7 | **缺少 `<home>/AppData/Local` / `AppData/Roaming`** | 应用启动即 panic（exit 101），易误判为二进制损坏；脚手架必须预建 |
| 8 | **`.artifacts/` 尚未实现** | 见 §6；失败定位暂依赖 `<home>/logs/dsh-web.dev.log` 与驱动报错 |
| 9 | **首次装配依赖联网** | 冷装配必须真的下载 Node 与 dsh 核心；离线环境该用例无法通过，属预期而非缺陷 |

## 8. 与插件协议的关系 / 不再以用例文档驱动

* 本文件与 [plugin.test.md](./plugin.test.md) 是**唯一的规范载体**：约定、口径、命令、环境变量、已知坑都写在这两份里，不再分层到别处。
* 旧的用例文档体系（`docs/testing/**`）与测试体系整改的 Spec 均已删除。桌面端不再需要文档编号映射、`TC-*` 编号、`[Case ID]` 字段、批次台账与变更历史台账。
* **测试文件的 `it()` 标题即契约描述**：标题要写清「验证什么对象、在什么条件下、期望什么可观察结果」，一条 `it()` 对应一条契约。新增或修改行为时直接改测试代码即可。
* 分层边界由 §1 的准入原则裁决：断言对象不是 Tauri 原生产物 → 归 [plugin.test.md](./plugin.test.md) 的 C 浏览器层。
