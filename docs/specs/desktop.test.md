# 桌面端测试规范

> **适用范围**：`deepseek-harness-desktop` 桌面端（`src/` + `src-tauri/`）与内置插件（`packages/*`）。
> **核心定位**：测试唯一入口规范。进度台账与协作流程见 [progressive.md](../testing/progressive.md)。

---

## 1. 核心原则

1. **渐进迭代**：单次仅合入单个稳定用例，禁止批量引入未验证用例。
2. **真实环境**：必须驱动真实 Tauri 窗口/进程，禁止在 E2E 层 Mock 后端命令。
3. **严格归因**：失败日志需精准定位定位至「用例 - 步骤 - 期望 vs 实际」，禁止依赖重跑掩盖。
4. **单元映射**：文档条目与测试用例 (`it()`) 必须保持 1:1 映射。
5. **环境隔离**：运行于独立数据目录与端口，严禁污染开发环境。
6. **单一运行器**：全仓统一使用 **Vitest** (`test.projects`)；WebdriverIO / Playwright 仅作为驱动库引入。

---

## 2. 技术选型

### 2.1 桌面端主线：WebdriverIO + `@wdio/tauri-service`
采用 Tauri v2 官方推荐方案，使用 `driverProvider: 'embedded'` 驱动内嵌 WebDriver 服务，实现跨平台（Windows WebView2 / macOS WKWebView / Linux WebKitGTK）统一测试。

* **运行机制**：WebdriverIO 仅充当驱动库（负责会话管理与 DOM 操作），由 Vitest (`desktop` project) 统一组织执行与断言。不引入 `@wdio/cli` 及 `wdio.conf.ts`。

| 组件 | 作用 | 必选性 |
| :--- | :--- | :--- |
| `webdriverio` | 驱动库：提供会话建立、元素查找与脚本执行 | 必需 |
| `@wdio/tauri-service` | 进程管理：发现并拉起应用二进制，绑定 WDIO 会话 | 必需 |
| `tauri-plugin-wdio-webdriver` | Rust 插件：应用内嵌 W3C WebDriver Server | `embedded` 模式必需 |
| `tauri-plugin-wdio` | Rust 插件：提供 `browser.tauri.execute()`、IPC Mock 及日志回流 | 按需 |

```rust
// src-tauri/src/lib.rs (仅在需要时注册)
tauri::Builder::default()
    .plugin(tauri_plugin_wdio_webdriver::init())

```

### 2.2 辅助层与测试边界

* **Browser Mode（快速层）**：将前端托管于 Vite Dev Server 并拦截 `invoke()`，专用于高频 UI/交互逻辑回归。**涉及进程、端口、文件落盘、系统托盘的断言必须走真实层**。

| 测试归属 | 对应方案 |
| --- | --- |
| 纯函数 / 状态机 / 格式化解析 | Vitest 单元测试 |
| 纯 UI 组件渲染与交互 | Browser Mode 或 Vitest + `@tauri-apps/api/mocks` |
| 插件 Host 路由契约 | Vitest 单元测试 (`packages/*/src/**/*.test.ts`) |
| **真实窗口 / 进程 / 端口 / 文件落盘 / 插件集成** | **桌面端/插件 E2E（本文规范）** |

---

## 3. 目录与归属约定

### 3.1 测试代码目录

* `test/unit/*`：桌面端单元测试 (`unit` project)
* `test/archive/*`：归档历史测试（仅作只读参考，不纳入任何 project）
* `test/e2e/support/*`：E2E 共享工具（宿主编排 `dsh-host.ts`、`desktop-host.ts`、选择器常量等）
* `test/e2e/global-setup.ts`：E2E 全局生命周期管理（启动/关闭宿主进程）
* `test/e2e/desktop/*.e2e.ts`：桌面端 E2E 用例 (`desktop` project)
* `test/e2e/plugins/*.e2e.ts`：插件真实进程 E2E 用例 (`plugin` project)
* `packages/<name>/src/**/*.test.ts`：插件源码同级单元测试（保持原位）

### 3.2 用例文档目录

* `docs/specs/desktop.test.md`：本规范文档
* `docs/testing/desktop/<序号>-<测试项>.md`：桌面端用例（如 `01-window-boot.md`）
* `docs/testing/plugins/<序号>-<插件名>.md`：插件用例（如 `03-dsh-tauri-pet.md`）

---

## 4. 用例文档规范

每个文档需包含元信息区，并按 `##` 划分具体用例：

```markdown
# 窗口启动

> 层级：E2E（真实）
> 自动化：`test/e2e/desktop/01-window-boot.e2e.ts`
> 前置：桌面端 Debug 二进制已构建；3081 端口空闲；无 Dev 实例运行

## [P1] 验证应用启动后主窗口存在且标题正确
[层级] E2E（真实）
[自动化] 是
[前置条件] 二进制存在；端口 3081 空闲
[测试步骤] 1. 启动应用。 2. 读取当前窗口句柄与标题。
[预期结果] 1. 会话建立成功。 2. 存在唯一窗口，标题为 `Deepseek Harness Desktop`。

```

* **规范约束**：
* **编号**：`TC-DSK-L3-<文件序号>-<用例序号>`，如 `TC-DSK-L3-02-003`。文件序号取用例文档序号（`docs/testing/desktop/<序号>-*.md`），用例序号在文件内从 `001` 起连续，**不跨文件连续**——新增用例只影响本文件，不会波及后续文件。
* **优先级**：`P1`（核心正向）、`P2`（基本正向）、`P3`（核心异常）、`P4`（边界）、`P5`（低频）。
* **命名**：标题以「验证」开头，反向用例标注 `[反向]`。手工用例标记 `[自动化] 否（手工）`，严禁编写为 `it()`。
* **断言**：步骤与预期结果须编号严格对应；单用例仅变更单一变量。



---

## 5. 选择器规范 (`data-testid`)

E2E 测试**必须**使用 `data-testid` 进行元素定位，严禁依赖 CSS 类名、DOM 层级或文本内容。

* **命名格式**：`dsh-<业务域>-<元素名>`（全小写连字符，如 `dsh-navbar-root`）。
* **维护原则**：字面量直接写入业务组件；跨用例复用的选择器常量统一收录于 `test/e2e/support/selectors.ts`。新增用例必须同步补全元素 `data-testid`。

---

## 6. 环境隔离与规则

| 维度 | 规范约定 |
| --- | --- |
| **端口策略** | Debug 构建默认使用 `3081`（Release 为 `3080`）。测试运行前断言默认端口空闲。 |
| **WebDriver 端口** | 应用内嵌 WebDriver server 固定占 `4445`（`@wdio/tauri-service` embedded provider 默认值，应用侧由 `TAURI_WEBDRIVER_PORT` 门控）。它是**整机唯一**资源：被别的实例（另一个 worktree 的 E2E、或 `cargo build` 出来的 devUrl 实例）占住时，本次应用绑不上而 wdio 仍会连上对方的 driver，会话会**静默挂到别人的窗口**上。测试前必须一并断言空闲。 |
| **窗口定位** | 应用会同时开主窗口（webview `main`）与桌宠窗口（`pet`），会话落在哪个取决于创建时机；编排必须在建会话后显式 `switchToWindow('main')`，不得依赖默认窗口。 |
| **数据目录** | 重定向 home 根即可同时隔离 dsh 数据与应用数据；Store 另用 `.store.test.dat` 作第二道防线。**严禁读写用户真实的 `~/.dsh`、`~/.dsh.dev` 与 `.store.dev.dat` / `.store.dat`。** 详见 §6.1。 |
| **前置校验** | 测试前检查端口与进程；存在残留直接 Fail，**不自动强杀用户进程**。 |
| **测试收尾** | 单个 Spec 结束必须主动关闭应用并等待进程平滑退出；异常残留由测试脚本自行清理。 |
| **运行网络** | 默认允许联网。断网测试需在用例 `[前置条件]` 中单独标注并构造环境。 |

### 6.1 隔离机制（强制）

两类落盘位置**同源于 home 根**，重定向 `USERPROFILE`(Windows)/`HOME`(Unix) 到 `$E2E_HOME/home` 即可一并隔离：

| 落盘位置 | 解析方式 |
| --- | --- |
| dsh 数据目录 `~/.dsh.dev` | `get_dsh_data_path` 读 `USERPROFILE`/`HOME`（`src-tauri/src/config/runtime.rs:455`、`:457`） |
| 应用数据目录（Store / 日志 / 依赖） | `app_data_dir()` = `dirs::data_dir()/<identifier>`（`tauri-2.11.5/src/path/desktop.rs:247`）；Windows 上由 home 派生 `<home>\AppData\Roaming` |

实测确认：home 重定向后 Store 落在 `$E2E_HOME/home/AppData/Roaming/io.github.hairyf.deepseek-harness-desktop/`，用户真实的 `.store.dev.dat` / `.store.dat` / `~/.dsh.dev` 时间戳均不变。

**启动前提**：`<home>/AppData/Local` 与 `<home>/AppData/Roaming` 必须**预先存在**。`tauri-plugin-http` 的 setup 调用 `app_cache_dir()`，解析不到即 `UnknownPath`，应用于 `lib.rs` 的 `expect` 处 panic（exit 101）。缺这两个目录时表现为「应用启动即崩溃」，容易被误判为二进制损坏。

**Store 三方隔离**：应用以 `TAURI_WEBDRIVER_PORT` 是否存在判定 E2E 运行（与 `tauri-plugin-wdio-webdriver` 的门控同源），据此选用 `.store.test.dat`；生产用 `.store.dat`、开发用 `.store.dev.dat`。判定收敛在 `config::setting::store_dat_file_name()`（`src-tauri/src/config/setting.rs`，常量在 `config/constants.rs`），由 Rust 单测守门三方文件名互不相同。home 重定向已足以隔离，独立 Store 是第二道防线：即使有人在未重定向 home 的情况下用 WebDriver 拉起应用，也不会改写开发版状态。

| 简写 | 实际路径 |
| --- | --- |
| `~/.dsh.dev` | `$E2E_HOME/home/.dsh.dev` |
| `~/.dsh` | `$E2E_HOME/home/.dsh` |
| `AppData/` | `$E2E_HOME/home/AppData/Roaming/io.github.hairyf.deepseek-harness-desktop/`（Store 为 `.store.test.dat`） |

**前置清空**：脚手架必须在启动前删除 `<app-data>/.store.test.dat`，保证几何、端口等状态从默认值起步；否则会读到上一次运行留下的窗口几何（`01` 批次 `TC-DSK-L3-01-004` 因此失败过）。

**依赖下载控制**：应用启动时会拉起 dsh 核心装配流程，三条口径分开，互不牵连：

| 口径 | 机制 | 用途 |
| --- | --- | --- |
| 默认不禁用 | 生产语义，`DISABLE_AUTO_DOWNLOAD = false`；仅当 `DSH_E2E_DISABLE_DOWNLOAD=1` 时才禁用 | 绝大多数用例保持真实启动路径 |
| 下载缓存复用 | `DSH_DOWNLOAD_CACHE_DIR` 覆盖下载基目录（`config/runtime.rs:get_base_dir`），跨用例指向同一稳定目录 | 除首次装配外，后续 L3 用例不再重复下载 |
| 可清空下载状态 | 脚手架提供 `resetDownloadCache()`，删除缓存目录后再启动 | 专门验证「首次启动的装配流程」本身 |

* **仅壳层用例必须禁用下载**：只断言壳层（窗口、几何、导航）而不触达 dsh 的批次，一律以 `startDesktopApp({ disableDownload: true })` 启动，避免为无关断言付出下载代价。
* **禁用下载不等于跳过装配**：禁用只截断网络下载，装配与装配失败路径仍在；但壳层不把由此产生的「找不到 dsh CLI」呈现为故障，而是渲染「下载已被环境禁用」页（`dsh-setup-disabled`，布局与失败页同源），其余断言仍按实际观测结果书写。
* 判定收敛在 `config::setting.rs` 的 `auto_download_disabled()`；常量在 `config/constants.rs`，由 Rust 单测守门「默认关闭禁用」与「环境变量可打开禁用」两种取值。

**为什么不能只设 `DSH_HOME`**：`get_dsh_data_path` 在 debug 构建下恒返回 `<home>/.dsh.dev` 并**忽略** `DSH_HOME`（`src-tauri/src/config/runtime.rs:471`、`:472`）。

**禁止事项**：不得设置 `DSH_HOME` 来「隔离」桌面端；不得在用例中创建或删除 `web`、`tauri`、`safe` 档案；不得删除用户真实的 `.store.dev.dat` / `.store.dat`。

---

## 7. 推进路线图

必须按批次**单条推进**，验证无 Flake 后方可进入下一批次。批次号 = `docs/testing/desktop/` 下的文档序号，完整清单见该目录 `00-overview.md` §3。

### 桌面端路线图

* **1**：应用启动后主窗口存在且标题正确 (`desktop/01-window-boot.md`)
* **2**：壳层根节点渲染且页面无未捕获错误 (`desktop/01-window-boot.md`)
* **3**：导航栏存在且折叠/展开按钮响应正常 (`desktop/02-shell-navigation.md`)
* **4**：配置对话框的打开与关闭 (`desktop/03-config-dialog.md`)
* **5**：语言切换即时生效 (`desktop/04-locale-theme.md`)
* **6**：档案列表展示与新建操作 (`desktop/05-profile.md`)
* **7**：内置 DSH 界面 Iframe 加载完成 (`desktop/06-harness-embed.md`)
* **8+**：`07`–`29` 按文档序号逐条推进（服务生命周期、装配、隔离、隐私、错误矩阵、状态机、插件生命周期、更新内部、系统集成）

### 插件侧路线图

批次号 = `docs/testing/plugins/` 下的文档序号，清单见该目录 `00-overview.md` §3。

* **1**：编排骨架——脚手架挂载并拉起 `dsh web` 随机端口 (`plugins/01-host-lane-skeleton.md`)
* **2**：共享路由契约（OPTIONS/405/403/413）(`plugins/02-dsh-tauri-core.md`)
* **3**：`dsh-tauri-pet` SSE 路由连上并收到首帧，随后客户端挂载与 L3 窗口 (`plugins/03-dsh-tauri-pet.md`)
* **4+**：`04`–`18` 先 Host 后 Client 逐条推进，`18` 为跨插件与壳层集成收尾
* **准入标准**：独立运行 ≥ 5 次无 Flake、失败时能精确定位步骤、文档与 `it()` 严格对应、不依赖上一次运行遗留状态。

---

## 8. 执行与 CI 集成

### 8.1 本地命令

全仓统一由 Vitest 进行 Project 分层调度：

```bash
pnpm test                 # 执行全量测试 (unit + e2e)
pnpm test:unit            # 仅执行单元测试
pnpm test:e2e:plugin      # 仅执行插件 E2E (需提前运行 pnpm build:plugins)
vitest --project unit -- <file> # 运行指定单文件测试

```

### 8.2 Vitest Project 配置

| Project | 配置文件 | 匹配范围 | 说明 |
| --- | --- | --- | --- |
| `unit` | `vitest.unit.config.ts` | `packages/**/*.{test,spec}.*`<br>

<br>`test/**`<br>

<br>`src/**/*.test.ts` | 排除 `test/archive/**` |
| `plugin` | `vitest.plugin.config.ts` | `test/e2e/plugins/**/*.e2e.ts` | `globalSetup` 拉起真实 DSH；设置 `fileParallelism: false` |
| `desktop` | `vitest.desktop.config.ts` | `test/e2e/desktop/*.e2e.ts` | 驱动真实 Tauri 桌面窗口 |

### 8.3 CI 与产物管理

* **CI 挂载时机**：E2E 用例总数 ≥ 5 且连续两周无 Flake 后，接入发布流水线（不作为 PR 必过门禁）。
* **失败产物**：测试失败时，自动保存应用 `stdout`/`stderr` 及 WDIO 截图至 `test/e2e/.artifacts/`（该目录 Git Ignore）。
