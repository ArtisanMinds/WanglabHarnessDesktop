# 桌面端 E2E 总览

> 状态：桌面端 E2E 已收敛为**一条启动冒烟用例**（`01-boot.md`）。桌面壳层的职责只有「把 dsh 装起来、跑起来、嵌进来」，其余业务行为（配置、语言、档案、插件生命周期、更新…）不属于壳层职责，其 L3 用例已移除，用例文档随之归档到 `archive/docs/testing/desktop/`。
> 规范：`docs/specs/desktop.test.md`（分层、驱动选型、`data-testid`、隔离与执行命令）。

## 1. 覆盖范围

| 覆盖 | 不覆盖 |
| --- | --- |
| 进入下载装配（真的下载 dsh 本体并落盘；Node 视系统情况复用） | 单个面板/菜单的交互（配置、语言、档案…） |
| dsh 内核启动（服务地址可用、iframe 挂载） | 插件生命周期与预装引导的自身行为 |
| 内嵌 dsh 页面渲染出内容 | 托盘、更新、备份还原、系统集成 |
| 壳层与 dsh 页面无页面报错 | 视觉回归与几何断言 |

用例清单见 `01-boot.md`；推进台账见 `docs/testing/progressive.md` §4.1。

## 2. 自动化产物

| 项 | 值 |
| --- | --- |
| 用例文件 | `test/e2e/desktop/boot.e2e.ts` |
| 编排 | `test/e2e/support/desktop-host.ts`（起应用 + 建 WDIO 会话 + 收尾）、`test/e2e/support/preinstall.ts`（过首次装配引导） |
| 选择器 | `test/e2e/support/selectors.ts`（`dsh-<业务域>-<元素名>`） |
| 运行 | `pnpm test:e2e:desktop -- --run test/e2e/desktop/boot.e2e.ts` |
| Project | `vitest.desktop.config.ts`（`include: test/e2e/desktop/*.e2e.ts`，串行，`testTimeout` 180s） |

## 3. 环境事实

| 项 | 值 | 来源 |
| --- | --- | --- |
| 二进制 | `src-tauri/target/debug/deepseek-harness-desktop.exe`（`pnpm tauri build --debug --no-bundle`） | `desktop-host.ts` `defaultBinaryPath()` |
| 前端产物 | `dist/`（`vite build`）；`frontendDist` 指向它，缺失会让应用走 `devUrl`、页面为空 | `src-tauri/tauri.conf.json` |
| 应用端口 | Debug 默认 `3081`（Release `3080`）；被占用时逐级递增 | `src-tauri/src/config/constants.rs`、`service/workflow/launch.rs` |
| 数据目录 | Debug 恒为 `<home>/.dsh.dev`（Release `<home>/.dsh`） | `src-tauri/src/config/runtime.rs` |
| Store 文件 | 生产 `.store.dat` / 开发 `.store.dev.dat` / E2E `.store.test.dat`（按 `TAURI_WEBDRIVER_PORT` 判定） | `src-tauri/src/config/setting.rs` |
| 窗口 | 标题 `Deepseek Harness Desktop`；初始 `1280×840`，最小 `860×620` | `src-tauri/src/desktop/builder.rs` |
| WebDriver 端口 | `TAURI_WEBDRIVER_PORT`，默认 `4445`；应用内嵌 server 仅在该变量存在时监听 | `src-tauri/src/desktop/builder.rs`、`config/constants.rs` |
| 就绪探针 | `GET /status` → `{ value: { ready: true } }` | 内嵌 WebDriver server |
| 收尾 | `DELETE /session/<id>`，再按进程树结束应用 | `@wdio/tauri-service` |
| dsh 页面挂载点 | `<div id="root">`（`@deepseek-ai/dsh-web-frontend/dist/index.html`） | 运行时包 |
| 失败产物 | `test/e2e/.artifacts/`（Git Ignore） | `docs/specs/desktop.test.md` §8.3 |

装配落盘（本次运行独占的缓存根，默认 `<home>/download-cache`）：

| 路径 | 内容 |
| --- | --- |
| `<cache>/runtime/node.exe` | Node 运行时；**仅当系统无可用 Node 时**才会下载（`search_node_binary` 先找系统安装，本机与 CI 常直接复用） |
| `<cache>/dependencies/dsh/` | dsh 本体（`package.json` + `node_modules`） |
| `<cache>/dependencies/pnpm/` | 捆绑 pnpm |
| `<cache>/logs/dsh-web.dev.log` | dsh web 服务日志（启动后写入服务地址） |

## 4. 前置校验（fail，不自动强杀用户进程）

| 校验 | 期望行为 |
| --- | --- |
| 二进制存在 | 不存在即 Fail，不尝试构建 |
| 应用端口空闲 | 按「默认 3081 + 实测空闲」判定；被占用即 Fail |
| WebDriver 端口空闲 | 被占用即 Fail（多半是另一个桌面实例；会话会静默挂到对方窗口上） |
| 无残留桌面实例 | 按**可执行文件路径**匹配；存在残留即 Fail |
| 收尾 | 结束会话、收掉本车道遗留的 dsh 进程、删除 scratch home（被占用时保留并告警） |

## 5. 数据目录隔离

只重定向 home 根即可一并隔离 dsh 数据、应用数据与 WebView2 profile：

| 落盘位置 | 隔离方式 |
| --- | --- |
| dsh 数据（`~/.dsh.dev`） | `USERPROFILE`(Windows)/`HOME`(Unix) → `<home>/home` |
| 应用 app-data（`<home>/home/AppData/Roaming/dsh-tauri`） | 同上派生 |
| WebView2 profile | `DSH_E2E_WEBVIEW_DATA_DIR` → `<home>/webview2`（`app_local_data_dir()` 走 `SHGetKnownFolderPath`，重定向 `LOCALAPPDATA` 无效） |
| 下载缓存 | `DSH_DOWNLOAD_CACHE_DIR` → `<home>/download-cache`（默认每次运行独占空目录） |
| Store | 启动前删除 `<app-data>/.store.test.dat`（`resetTestStore()`） |

两条硬约束：

1. 必须先建好 `<home>/home/AppData/Local` 与 `AppData/Roaming`，否则插件宿主初始化 panic（退出码 101）。
2. **不要指望 `DSH_HOME`**：debug 构建恒用 `<home>/.dsh.dev`，`DSH_HOME` 被忽略（`src-tauri/src/config/runtime.rs`）。

> **标识符改名**：app-data 目录名随 `identifier` 从长标识符缩短为 `dsh-tauri`，旧目录由启动期迁移搬入（`src-tauri/src/service/migrate.rs`，Rust 单测覆盖）。迁移**只在 release 构建执行**：debug/E2E 与生产共用 app-data 根目录（生产 `.store.dat` 就在其中），开发与测试运行不得搬动它。

> **本机运行注意**：本机已有桌面实例占着 WebDriver 4445 时，用 `TAURI_WEBDRIVER_PORT=<空闲端口>` 另开一路即可，无需结束用户实例；另外请在后台/独立终端执行——前台终端会抢走应用窗口焦点，依赖窗口激活的交互断言会假失败。

## 6. CI

`.github/workflows/ci.yml` 的 `desktop-e2e`（windows-latest）：恢复插件构建缓存 → `pnpm install --frozen-lockfile` → 必要时 `pnpm build:plugins` → `pnpm exec vite build` → `pnpm tauri build --debug --no-bundle --config <清空 beforeBuildCommand>` → `pnpm run test:e2e:desktop -- --run`。runner 的 `%TEMP%` 每次全新，因此 CI 上必然走一次真实下载。

## 7. 维护约定

1. 一条用例 = 一个 `it()`；用例编号 `TC-DSK-L3-<文件序号>-<序号>`，文件内从 `001` 起连续。
2. 新选择器一律先登记到 `test/e2e/support/selectors.ts`，用例只认 `data-testid`。
3. 范围变化同步更新本文件、`01-boot.md` 与 `docs/testing/progressive.md` §4.1。
4. 被移除的用例文档移入 `archive/docs/testing/desktop/`，不再在 `docs/testing/` 维护。
