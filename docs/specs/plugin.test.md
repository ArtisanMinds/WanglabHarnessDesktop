# 插件测试规范（渐进式）

> 配套文档：[desktop.test.md](./desktop.test.md)（桌面端测试总规范）。
> 本规范专注于**内置插件（`packages/*`）的 E2E 测试**。
> 用例文档存放于 `docs/testing/plugins/<序号>-<插件名>.md`；测试代码存放于 `test/e2e/plugins/`。

---

## 1. 宿主分层与测试策略

内置插件由两部分组成，运行于不同宿主：

| 部分 | 运行位置 | 提供宿主 | 生命周期 |
| --- | --- | --- | --- |
| `src/host/**` | `dsh web` 进程（Node） | Cordis 容器 + WebServer | 随 `dsh` 进程 |
| `src/client/**` | WebView 页面 | 前端 Bundle Slot 注册表 | 随页面 |

插件 E2E 包含两个真实宿主层，其价值定位如下：

* **dsh 宿主（默认选型）**：真实 `dsh web` 进程 + 真实浏览器页面。无需 Tauri 与桌面端二进制，具备**启动快、可并行、支持无头模式**的优势，为门禁测试的主要覆盖层。
* **桌面端宿主（补充选型）**：桌面端壳层嵌 dsh iframe。**仅用于依赖 Tauri 桥的插件**（如 `dsh-tauri-pet` 桌宠窗口、`dsh-tauri-worktree` native 能力、`dsh-tauri-ui` 壳层注入），复用 [desktop.test.md](./desktop.test.md) 的 WebdriverIO 通道。

---

## 2. 三层测试模型

| 层级 | 代码位置 | 驱动/运行器 | 断言对象 | 必选场景 |
| --- | --- | --- | --- | --- |
| **L1 单元测试** | `packages/<name>/src/**/*.test.ts` | Vitest (`unit` project) | 纯函数、路由 Handler、注册表契约 | 无条件必选 |
| **L2 插件宿主 E2E** | `test/e2e/plugins/*.e2e.ts` | Vitest (`plugin` project) + Playwright API | 真实 `dsh web` 进程：路由响应、客户端挂载点、崩溃防护 | 每个产品可见插件 |
| **L3 桌面端宿主 E2E** | `test/e2e/desktop/*.e2e.ts` | Vitest (`desktop` project) + WebdriverIO | 桌面端壳层 + 内嵌 dsh iframe | 仅依赖 Tauri 桥的插件 |

> **分工原则**：L1 允许 Mock 宿主；L2/L3 下游全真，仅允许 Mock 外部服务（网络、模型、时钟）。

---

## 3. 技术选型与运行机制

### 3.1 统一单运行器（Vitest Projects）

全仓**统一使用 Vitest 作为唯一测试运行器**，通过 `test.projects` 实现分层隔离：

* **命令隔离**：使用 `vitest --project unit` 或 `--project plugin` 指定层级；`pnpm test` 运行全部。
* **独立配置**：通过 `vitest.unit.config.ts` 与 `vitest.plugin.config.ts` (`defineProject`) 维护各自配置。
* **全局报告**：由根目录 `vitest.config.ts` 统一管理报告与覆盖率（Project 级不支持配置 Reporters）。
* **生命周期**：利用 Project 的 `globalSetup` 完成真实宿主的单次启停，通过 `project.provide()` 注入服务地址。
* **浏览器驱动**：L2 当前落地的用例只断言 HTTP 响应字节（宿主路由是否注册、方法是否被拒），**不启动浏览器**。需要断言客户端渲染（Bundle Slot 挂载、DOM 节点）时再引入 Playwright 库 API (`chromium.launch()`)，不引入 Playwright Test Runner。

### 3.2 驱动搭配

* **L2（真实 dsh 进程 + HTTP 断言）**：无需浏览器即可覆盖宿主路由与注册契约，启动快、可并行；需要客户端渲染证据时再叠加 Chromium 驱动。
* **L3（WebdriverIO + `@wdio/tauri-service`）**：唯一支持驱动真实 WebView 的方案，专用于桌面端集成。
* **纯 Node (`node:test` / Vitest)**：仅用于**无 UI 插件**的 HTTP 路由覆盖。

---

## 4. 目录结构与命名规范

```text
packages/<name>/
├── src/**/*.test.ts          # L1 单元测试（保持原位）
└── test/support/             # 插件专属 Fixture / Stub
test/e2e/
├── global-setup.ts           # plugin project 的 globalSetup（启动 dsh web 并传递地址与 Cookie）
├── support/
│   ├── dsh-host.ts           # 共享环境脚手架（Scratch DSH_HOME、挂载、启动、鉴权交换、清理）
│   └── desktop-host.ts       # L3 桌面端宿主编排
├── plugins/<序号>-<主题>.e2e.ts # L2 插件宿主 E2E（由 plugin project 匹配）
└── desktop/*.e2e.ts          # L3 桌面端宿主 E2E（由 desktop project 匹配）
test/archive/*                # 历史用例归档（只读参考，不被任何 project 匹配）
vitest.config.ts              # 根配置：包含 Projects 清单与全局别名
vitest.unit.config.ts         # unit project 配置
vitest.plugin.config.ts       # plugin project 配置（插件 L2）
vitest.desktop.config.ts      # desktop project 配置（桌面端 L3）
docs/testing/plugins/<序号>-<主题>.md   # 插件测试文档
```

* **命名约定**：L2/L3 文件必须使用 `*.e2e.ts`，与 L1 的 `*.test.ts` / `*.spec.ts` 严格区分。
* **文件名对应**：`test/e2e/plugins/<序号>-<主题>.e2e.ts` 与 `docs/testing/plugins/<序号>-<主题>.md` **同名同序号一一对应**。一个编号只允许一个测试文件；同一批次内的 L2 / 客户端 / L3 用例用 `describe` 分区，不拆成多个文件。总览类文档（`00-overview.md`）不承载用例，故无对应测试文件。
* **用例编号**：`TC-<业务域>-<层级>-<文件序号>-<序号>`，如 `TC-PET-L2-03-001`。业务域取该文件的主域前缀、文件序号取 `docs/testing/plugins/<序号>-*.md` 的序号、序号在「文件 + 层级」内从 `001` 起连续（层级取 `L2` / `L3` / `C`）。序号**不跨文件连续**：新增用例只影响本文件，不会波及后续文件。
* **匹配策略**：`unit` 匹配 `*.{test,spec}.*`（自动排他 `.e2e.ts`）；`plugin` 显式指定 `test/e2e/plugins/**/*.e2e.ts`，`desktop` 指定 `test/e2e/desktop/*.e2e.ts`。
* **映射关系**：文档中的每条用例条目必须与代码中的 `it()` 一一对应。

---

## 5. L2 执行流程

执行 L2 测试前，必须先完成构建（`pnpm build:plugins`），E2E 测试仅针对构建产物运行。

```
1. 构建产物      ──> 执行 pnpm build:plugins（禁止直接测试 TS 源码）
2. 解析核心      ──> DSH_E2E_DSH_BIN → 仓库依赖 → 桌面端装配目录；三者皆无则直接失败
3. 创建隔离环境  ──> 创建独立根 DSH_E2E_HOME=<tmp>/dsh-e2e-<suite>-<timestamp>；L2 的 DSH_HOME=<DSH_E2E_HOME>/dsh
4. 初始化 Profile──> 构建 <DSH_HOME>/profiles/web/{package.json, cordis.patch.yml, pnpm-workspace.yaml}
5. 挂载插件      ──> [link 模式] 自建软链接至 profile/node_modules + 配置 dsh.profile.bundles
                     [cli 模式]  执行 dsh plugin --profile web add link:<repo>/packages/<name>
6. 校验挂载      ──> 确认 dsh.profile.bundles 包含目标插件（未找到则立即报错抛出）
7. 启动服务      ──> 执行 dsh web --host 127.0.0.1 --port 0 --no-open
8. 交换会话      ──> 对日志里的 `http://127.0.0.1:<port>/?token=<...>` 发 redirect:'manual'
                     请求，断言 303 且响应带 Set-Cookie，取出 `name=value` 作为会话凭据
9. 执行测试      ──> 运行 vitest --project plugin，用例经 inject() 取地址与 Cookie
10. 资源回收     ──> 触发 Teardown：终止 dsh 进程树，清空临时目录

```

> **鉴权说明**：上游只接受「根路径 `GET /?token=<...>` 换 Cookie」这一条通道——`/` 之外的请求带 query token 或 Authorization 头都不认。交换成功返回 303 + `Set-Cookie`（host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`、无 `Secure`），此后 `/api` 与插件自有路由都必须带回该 Cookie，否则 401。
> 桌面端内嵌 WebView 走的是另一条路（`dsh-tauri-connection` 插件在 `DSH_TAURI_EMBEDDED=1` 时覆写 connection 的两道鉴权闸门，见 [connection.proposal.md](./connection.proposal.md)），**L2 不复用该通道**：npm 上的核心没有这个插件，且绕过鉴权会让「未鉴权」与「路由丢失」在测试里不可区分。
>
> **核心解析**：`DSH_E2E_DSH_BIN` → 仓库依赖树 → 桌面端装配目录，依次尝试。仓库刻意**不**把 `@deepseek-ai/dsh` 装进依赖树——它会与本仓 catalog 的 `@deepseek-ai/dsh-*` 形成双树，profile 组合时取到不匹配的实例。三者皆无时**直接抛错**，不提供「跳过」开关：一旦可跳过，CI 会在什么都没断言的情况下报绿。
>
> **参数说明**：
> * `--profile`：`dsh web` 内置为 `--profile web` 别名，无需显式传参。
> * `fileParallelism`：`plugin` project 设置为 `false`，确保单实例下串行断言的稳定性。
> 
> 

---

## 6. 断言准则

### 必须断言项（底线要求）

1. **可见产物挂载**：
* **自渲染 DOM 插件**：根节点必须绑定 `data-dsh-<plugin>` 属性，断言其 `attached` / `visible`。
* **槽位/补丁注入插件**：断言对应宿主槽位产物（如设置分区标题、侧栏入口）正常呈现。


2. **零崩溃保证**：校验 `pageerror` 为空、插件错误条（`fail()` / `RenderBoundary`）为空、带插件前缀的 `console.error` 为空。
3. **路由真实响应**：直接向插件自有 HTTP 路由发起请求，断言状态码与响应体格式。

### 禁止项

* 严禁使用 CSS 类名、非稳定文案或 DOM 层级作为选择器（必须使用 `data-dsh-*`）。
* 严禁将“无报错”直接等同于“测试通过”，必须存在正向的产物断言。
* 严禁依赖上一次运行遗留的状态（每次运行必须是干净的 Scratch 环境）。

---

## 7. 依赖 Mock & Stub 规范

1. **优先使用真包**：环境支持安装时，优先使用真实依赖。
2. **Playwright 层不替身**：L2 运行于真实前端 Bundle 中，天然包含宿主依赖，无需 Stub。
3. **仅限 L1 单元测试替身**：在 Vitest 中通过 `resolve.alias` 将重量级包重定向至 `test/support/<pkg>-stub.ts`。Stub 必须与原包保持接口契约一致，并在文件头声明维护注释。

---

## 8. 渐进式推进路线

批次号 = `docs/testing/plugins/` 下的文档序号，完整清单见该目录 `00-overview.md` §3。

| 批次 | 目标插件 | 测试内容 | 对应层级 | 前置条件 |
| --- | --- | --- | --- | --- |
| **1** | 编排骨架 | 脚手架挂载 `dsh-tauri` 并成功启动 `dsh web` 随机端口 | L2 基础设施 | 无 |
| **2** | `dsh-tauri`（核心桥接） | 共享路由契约：OPTIONS / 405 / 403 / 413 | L2（纯 HTTP） | 1 |
| **3** | `dsh-tauri-pet` | SSE 路由 `/api/desktop/dsh-tauri-pet/session/stream` 建立连接并收到首帧 | L2（纯 HTTP） | 1 |
| **3** | `dsh-tauri-pet` | 页面成功渲染 `data-dsh-tauri-pet` 挂载点且无崩溃报错 | L2（浏览器） | 上一条 |
| **4+** | `04`–`18` | 先 Host 后 Client 逐条补齐；`18` 为跨插件与壳层集成收尾 | L2 → L3 | 逐项确认 |
| **L3** | `dsh-tauri-pet` | 桌面端壳层成功创建桌宠窗口 | **L3** | 桌面端 `01` 批次通道 |

**准入标准**：连续运行 $\ge 5$ 次无 Flake；失败信息精准定位至具体步骤；文档与 `test()` 一一对应；环境完全隔离独立。

---

## 9. 环境变量与运行命令

### 常用命令

```bash
pnpm test                 # 执行所有 Project
pnpm test:unit            # 仅执行 L1 单元测试
pnpm test:e2e:plugin      # 仅执行 L2 插件 E2E 测试（需先执行 pnpm build:plugins）

```

### 关键环境变量

| 环境变量 | 作用描述 | 默认值 / 回退策略 |
| --- | --- | --- |
| `DSH_E2E_HOME` | 本次运行独占的独立根，全部测试数据必须落在其下 | `<tmp>/dsh-e2e-<suite>-<timestamp>` |
| `DSH_E2E_DSH_BIN` | `dsh` 可执行入口路径 (`lib/bin.js`) | 自动解析包路径或回退至桌面端装配目录 |
| `DSH_E2E_NODE_BIN` | 执行 `dsh` 的 Node 二进制路径 | `process.execPath` |
| `DSH_E2E_PLUGIN` | `globalSetup` 指定挂载的目标插件 | `dsh-tauri-pet` |
| `DSH_E2E_MOUNT` | 插件挂载模式 (`link` 或 `cli`) | `link` |
| `DSH_E2E_KEEP_HOME` | 设置为 `1` 时保留独立根以便调试 | 未设置（自动清理） |

### 数据目录约束（强制）

**禁止**读写用户真实的 `~/.dsh`、`~/.dsh.dev`，**禁止**改写用户真实的 `.store.dev.dat` / `.store.dat`。

* **L2**：`DSH_HOME` 一律指向 `<DSH_E2E_HOME>/dsh`；落在 `DSH_E2E_HOME` 之外的 profile 视为编排缺陷。
* **L3**：重定向 `USERPROFILE`(Windows)/`HOME`(Unix) 到 `<DSH_E2E_HOME>/home` 即可同时隔离 dsh 数据目录（`get_dsh_data_path` 读该环境变量，`src-tauri/src/config/runtime.rs:455`；debug 下恒为 `<home>/.dsh.dev` 且忽略 `DSH_HOME`，`:471`）与 app-data 目录（`app_data_dir()` = `dirs::data_dir()/<identifier>`，由 home 派生）。**必须预建 `<home>/AppData/Local` 与 `AppData/Roaming`**，否则 `plugin-http` 初始化失败导致应用 panic。Store 另按 `TAURI_WEBDRIVER_PORT` 选用 `.store.test.dat`（`config::setting::store_dat_file_name()`）作第二道防线。
* **前置清空**：L3 脚手架必须在启动前删除 `<app-data>/.store.test.dat`，否则会继承上一次运行的窗口几何等状态。