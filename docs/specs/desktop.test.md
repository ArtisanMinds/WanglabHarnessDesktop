# 桌面端测试规范

> **适用范围**：`deepseek-harness-desktop` 桌面端（`src/` + `src-tauri/`）。
> **核心定位**：桌面端 E2E 的规范与唯一入口。用例本体见 [desktop/01-boot.md](../testing/desktop/01-boot.md)，进度台账与协作流程见 [progressive.md](../testing/progressive.md)，插件侧规范见 [plugin.test.md](./plugin.test.md)。

---

## 1. 核心原则

1. **只验壳层职责**：桌面壳层负责「把 dsh 装起来、跑起来、嵌进来」。桌面端 E2E 只覆盖这一条主链路（进入下载装配 → dsh 内核启动 → 页面无报错）；配置、语言、档案、插件生命周期等业务行为不属于壳层职责，不建 L3 用例。
2. **真实环境**：必须驱动真实 Tauri 窗口/进程，禁止在 E2E 层 Mock 后端命令。
3. **严格归因**：失败需能定位到「用例 - 步骤 - 期望 vs 实际」，禁止依赖重跑掩盖。
4. **文档映射**：文档条目与 `it()` 保持 1:1。
5. **环境隔离**：运行于独立数据目录与端口，严禁污染开发环境。
6. **单一运行器**：全仓统一使用 **Vitest**（`test.projects`）；WebdriverIO 仅作为驱动库引入。

---

## 2. 技术选型

### 2.1 桌面端主线：WebdriverIO + `@wdio/tauri-service`

采用 Tauri v2 官方推荐方案，`driverProvider: 'embedded'` 驱动应用内嵌的 WebDriver server，跨平台统一（Windows WebView2 / macOS WKWebView / Linux WebKitGTK）。

* **运行机制**：WebdriverIO 仅充当驱动库（会话管理与 DOM 操作），由 Vitest（`desktop` project）统一组织执行与断言；不引入 `@wdio/cli` 与 `wdio.conf.ts`。
* **跨域 iframe**：壳层 `tauri://localhost` 与内嵌 dsh `http://127.0.0.1:<port>` 跨域，上游 1.4.0 用 `frame.contentWindow.eval` 模拟帧上下文必然超时；仓库以 `[patch.crates-io]` 指向 `src-tauri/vendor/tauri-plugin-wdio-webdriver`，Windows 走原生 `ICoreWebView2Frame2::ExecuteScript`。帧内断言依赖这份补丁。

| 组件 | 作用 | 必选性 |
| :--- | :--- | :--- |
| `webdriverio` | 驱动库：会话建立、元素查找与脚本执行 | 必需 |
| `@wdio/tauri-service` | 进程管理：发现并拉起应用二进制，绑定 WDIO 会话 | 必需 |
| `tauri-plugin-wdio-webdriver` | Rust 插件：应用内嵌 W3C WebDriver Server | `embedded` 模式必需 |

### 2.2 测试边界

| 测试归属 | 对应方案 |
| --- | --- |
| 纯函数 / 状态机 / 格式化解析 | Vitest 单元测试 |
| 纯 UI 组件渲染与交互 | Vitest + `@tauri-apps/api/mocks` |
| 插件 Host 路由契约 | Vitest 单元测试（`packages/*/src/**/*.test.ts`） |
| **真实窗口 / 进程 / 端口 / 文件落盘 / 装配与内核启动** | **桌面端 E2E（本文规范）** |

---

## 3. 目录与归属约定

### 3.1 测试代码目录

* `test/unit/*`：桌面端单元测试（`unit` project）
* `test/archive/*`：归档历史测试（只读参考，不纳入任何 project）
* `test/e2e/support/*`：E2E 共享工具（宿主编排 `desktop-host.ts`、`dsh-host.ts`、选择器常量等）
* `test/e2e/global-setup.ts`：插件 E2E 的全局生命周期（启动/关闭 dsh 宿主）
* `test/e2e/desktop/*.e2e.ts`：桌面端 E2E（`desktop` project）
* `test/e2e/plugins/*.e2e.ts`：插件真实进程 E2E（`plugin` project）

### 3.2 用例文档目录

* `docs/specs/desktop.test.md`：本规范
* `docs/testing/desktop/00-overview.md`：覆盖范围、环境事实、前置校验、隔离与运行命令
* `docs/testing/desktop/01-boot.md`：桌面端唯一 L3 用例
* `docs/testing/plugins/<序号>-<插件名>.md`：插件用例
* `archive/docs/testing/desktop/*`：已移除用例的历史文档（只读参考）

---

## 4. 用例文档规范

元信息区 + 字段块；用例标题为 `### [Px] 验证…`：

```markdown
# 启动冒烟（01）：进入下载装配 → dsh 内核启动 → 页面无报错

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/boot.e2e.ts`

### [P1] 验证…

[Case ID] TC-DSK-L3-01-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] 关键实现位置
[自动化] 已接线（`test/e2e/desktop/boot.e2e.ts`）
[前置条件] …
[测试数据] …
[测试步骤] 1. … 2. …
[预期结果] 1. … 2. …
[清理] …
```

* **编号**：`TC-DSK-L3-<文件序号>-<用例序号>`；文件序号取 `docs/testing/desktop/<序号>-*.md`，用例序号在文件内从 `001` 起连续、不跨文件连续。
* **优先级**：`P1`（核心正向）、`P2`（基本正向）、`P3`（核心异常）、`P4`（边界）、`P5`（低频）。
* **断言**：步骤与预期结果编号严格对应；单用例仅变更单一变量。

---

## 5. 选择器规范 (`data-testid`)

E2E **必须**使用 `data-testid` 定位，严禁依赖 CSS 类名、DOM 层级或文本内容。

* **命名格式**：`dsh-<业务域>-<元素名>`（全小写连字符，如 `dsh-shell-iframe`）。
* **维护原则**：字面量直接写入业务组件；跨用例复用的选择器常量统一收录于 `test/e2e/support/selectors.ts`；新增用例必须同步补全元素 `data-testid`。
* **例外**：内嵌 dsh 页面属上游产物，其内部结构不受本仓库约束；帧内断言可用稳定的结构性锚点（如挂载点 `#root`），并在用例文档的缺口小节登记。

---

## 6. 环境隔离与规则

| 维度 | 规范约定 |
| --- | --- |
| **端口策略** | Debug 构建默认 `3081`（Release `3080`）。测试前断言默认端口空闲。 |
| **WebDriver 端口** | 默认 `4445`（`@wdio/tauri-service` embedded provider 默认值，应用侧由 `TAURI_WEBDRIVER_PORT` 门控）。它是**整机唯一**资源：被别的实例占住时本次应用绑不上，而 wdio 仍会连上对方的 driver，会话会**静默挂到别人的窗口**上。测试前必须断言空闲；本机已有实例时用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路，不要杀用户进程。 |
| **窗口定位** | 应用会同时开主窗口（webview `main`）与桌宠窗口（`pet`），会话落在哪个取决于创建时机；编排必须在建会话后显式 `switchToWindow('main')`。 |
| **数据目录** | 重定向 home 根即可同时隔离 dsh 数据与应用数据；Store 另用 `.store.test.dat` 作第二道防线。**严禁读写用户真实的 `~/.dsh`、`~/.dsh.dev` 与 `.store.dev.dat` / `.store.dat`。** 详见 §6.1。 |
| **前置校验** | 测试前检查端口与进程；存在残留直接 Fail，**不自动强杀用户进程**。 |
| **测试收尾** | 单个 Spec 结束必须主动关闭应用并等待进程平滑退出；scratch 目录被 WebView2 子进程占住而删不掉时，只做少量快速重试后留给下一次运行的车道清理（`purgeStaleHomes`，按 mtime 过滤以避开并发会话），不得为清理把用例拖红。 |
| **运行网络** | 默认允许联网：桌面端冒烟使用独占空下载缓存，必然走一次真实下载；断网时按预期失败，不静默降级。 |

### 6.1 隔离机制（强制）

两类落盘位置**同源于 home 根**，重定向 `USERPROFILE`(Windows)/`HOME`(Unix) 到 `$E2E_HOME/home` 即可一并隔离：

| 落盘位置 | 解析方式 |
| --- | --- |
| dsh 数据目录 `~/.dsh.dev` | `get_dsh_data_path` 读 `USERPROFILE`/`HOME`（`src-tauri/src/config/runtime.rs:455`、`:457`） |
| 应用数据目录（Store / 日志 / 依赖） | `app_data_dir()` = `dirs::data_dir()/<identifier>`；Windows 上由 home 派生 `<home>\AppData\Roaming` |

实测确认：home 重定向后 Store 落在 `$E2E_HOME/home/AppData/Roaming/io.github.hairyf.deepseek-harness-desktop/`，用户真实的 `.store.dev.dat` / `.store.dat` / `~/.dsh.dev` 时间戳均不变。

**启动前提**：`<home>/AppData/Local` 与 `<home>/AppData/Roaming` 必须**预先存在**。`tauri-plugin-http` 的 setup 调用 `app_cache_dir()`，解析不到即 `UnknownPath`，应用于 `lib.rs` 的 `expect` 处 panic（exit 101）。缺这两个目录时表现为「应用启动即崩溃」，容易被误判为二进制损坏。

**WebView2 profile 独占**：`app_local_data_dir()` 由 `SHGetKnownFolderPath` 解析，重定向 `LOCALAPPDATA` 无效；不覆盖 `DSH_E2E_WEBVIEW_DATA_DIR` 就会与用户开发会话共用 `EBWebView-dev`（localStorage 互相污染）。

**Store 三方隔离**：应用以 `TAURI_WEBDRIVER_PORT` 是否存在判定 E2E 运行（与 `tauri-plugin-wdio-webdriver` 的门控同源），据此选用 `.store.test.dat`；生产 `.store.dat`、开发 `.store.dev.dat`。判定收敛在 `config::setting::store_dat_file_name()`（`src-tauri/src/config/setting.rs`），由 Rust 单测守门三方文件名互不相同。home 重定向已足以隔离，独立 Store 是第二道防线。

**前置清空**：脚手架必须在启动前删除 `<app-data>/.store.test.dat`（`resetTestStore()`），保证几何、端口等状态从默认值起步。

**依赖下载**：应用启动即拉起 dsh 核心装配。`DSH_DOWNLOAD_CACHE_DIR` 覆盖下载基目录，脚手架默认给**本次运行独占的空目录**（`<home>/download-cache`，随 scratch home 删除）——dsh 本体因此必然真的下载并落盘，断言才有意义（Node 会先找系统安装，命中即不下载）。本地反复跑想省一次联网时，用 `startDesktopApp({ downloadCacheDir })` 复用一份稳定缓存，但那样就不再覆盖「进入下载」。

**为什么不能只设 `DSH_HOME`**：`get_dsh_data_path` 在 debug 构建下恒返回 `<home>/.dsh.dev` 并**忽略** `DSH_HOME`（`src-tauri/src/config/runtime.rs:471`、`:472`）。

**禁止事项**：不得设置 `DSH_HOME` 来「隔离」桌面端；不得在用例中创建或删除 `web`、`tauri`、`safe` 档案；不得删除用户真实的 `.store.dev.dat` / `.store.dat`。

---

## 7. 推进路线图

桌面端已收敛为单条启动冒烟（`desktop/01-boot.md`），不再分批推进；范围若扩大，仍按「单条推进、验证无 Flake 后方可进入下一条」的规则执行，批次号 = `docs/testing/desktop/` 下的文档序号。

### 插件侧路线图

批次号 = `docs/testing/plugins/` 下的文档序号，清单见该目录 `00-overview.md`。

* **1**：编排骨架与共享路由契约——脚手架挂载并拉起 `dsh web` 随机端口，并守住 OPTIONS/405/403/413 共享契约
* **2**：`dsh-tauri-pet` SSE 路由连上并收到首帧，随后客户端挂载与 L3 窗口
* **3+**：`03`–`10` 先 Host 后 Client 逐条推进
* **准入标准**：独立运行 ≥ 5 次无 Flake、失败时能精确定位步骤、文档与 `it()` 严格对应、不依赖上一次运行遗留状态。

---

## 8. 执行与 CI 集成

### 8.1 本地命令

```bash
pnpm test                 # 全量测试（unit + e2e）
pnpm test:unit            # 仅单元测试
pnpm test:e2e:plugin      # 仅插件 E2E（需先 pnpm build:plugins）
pnpm test:e2e:desktop     # 仅桌面端 L3 E2E（需先 pnpm build:debug）
pnpm build:debug          # 产出 dist/ 与内嵌前端的 debug 二进制（桌面端 L3 前置）
vitest --project unit -- <file>   # 运行指定单文件
```

`build:debug` 与 CI 的 `desktop-e2e` 作业同口径：`build:plugins` → `vite build` → `tauri build --debug --no-bundle`（临时 config 清空 `beforeBuildCommand`，避免重复触发 `pnpm build`）。缺 `dist/` 时应用走 `devUrl`、页面为空，选择器全部找不到。

### 8.2 Vitest Project 配置

| Project | 配置文件 | 匹配范围 | 说明 |
| --- | --- | --- | --- |
| `unit` | `vitest.unit.config.ts` | `packages/**/*.{test,spec}.*`、`test/**`、`src/**/*.test.ts` | 排除 `test/archive/**` |
| `plugin` | `vitest.plugin.config.ts` | `test/e2e/plugins/**/*.e2e.ts` | `globalSetup` 拉起真实 DSH；`fileParallelism: false` |
| `desktop` | `vitest.desktop.config.ts` | `test/e2e/desktop/*.e2e.ts` | 驱动真实 Tauri 桌面窗口；串行执行 |

### 8.3 CI 与产物管理

* **CI 作业**：`desktop-e2e`（windows-latest）跑全部 `test/e2e/desktop/*.e2e.ts`，是 PR 必过门禁。
* **失败产物**：测试失败时自动保存应用 `stdout`/`stderr` 及 WDIO 截图至 `test/e2e/.artifacts/`（Git Ignore）。
