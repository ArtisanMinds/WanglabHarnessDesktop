# 系统集成与桥接服务

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/10-system-integration.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/10-system-integration.e2e.ts`

通知、下载落盘、剪贴板、CLI shim、系统唤起与运行时诊断。

---

## 1. 通知与下载

三条桥都发生在 **iframe → 宿主**方向：原生通知、下载完成提示、剪贴板图片回退（Linux/WebKitGTK 下 iframe 的 paste 事件拿不到图片，走原生通路）。系统表面的实际呈现无法在页面内断言，因此多数用例止于「桥接层成功返回」。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 通知桥 `dsh://native-notification` → `show_native_notification` | `src/layout/components/iframe.tsx:88-92`、`:130-140` |
| 通知载荷字段 `title`/`body`/`tag`/`sessionId`/`requireInteraction` | `src/layout/components/iframe.tsx:28-46`、`:131-138` |
| 通知权限在页面加载时注册（Windows 走 `on_page_load`） | `src-tauri/src/desktop/window.rs:109-138` |
| 通知点击 → 宿主向 iframe 发 `dsh://focus-session` | `src/layout/components/iframe.tsx:80-84`、`:177-184` |
| 下载接管与重名处理 `unique_download_path` | `src-tauri/src/desktop/window.rs:39-45`；`src-tauri/src/config/utils.rs:29` |
| 下载完成事件 `harness-download-finished` | `src-tauri/src/desktop/window.rs:46-61` |
| 外壳订阅并弹 toast（成功/失败分支） | `src/layout/index.tsx:94-126` |
| 成功且路径非空时提供「在文件夹中显示」 | `src/layout/index.tsx:109-121` |
| 「在文件夹中显示」→ `reveal_in_folder` | `src/layout/index.tsx:116` |
| 新下载完成时关闭上一条同源 toast | `src/layout/index.tsx:97-98`、`:122-124` |
| 剪贴板图片桥 `dsh://clipboard-image:read` → `read_clipboard_image` | `src/layout/components/iframe.tsx:98-101`、`:156-169` |
| 回包 `type: 'dsh://clipboard-image:reply'`（注入脚本按 `type` 匹配） | `src/layout/components/iframe.tsx:160-162`；`src-tauri/src/desktop/paste.rs` |
| 打开外部链接（`window.open` / `target=_blank`） | `src-tauri/src/desktop/window.rs:22-35` |

---

### 通知

### [P1] 验证通知桥转发到原生通知命令

[Case ID] TC-DSK-L3-10-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/iframe.tsx:88-92`、`:130-140`；`src-tauri/src/desktop/window.rs:110-138`
[自动化] 待接线（`test/e2e/desktop/10-system-integration.e2e.ts`）
[前置条件] 应用处于 `ready`；通知权限已在页面加载时注册
[测试数据] 桥消息 `{ type: 'dsh://native-notification', title, body, tag, sessionId, requireInteraction }`
[测试步骤] 1. 由 iframe 侧发出通知桥消息。2. 等待宿主处理。3. 读取控制台错误收集器。
[预期结果] 1. 消息发出成功。2. `show_native_notification` 成功返回。3. 收集器为空（无命令失败错误）。
[清理] 关闭系统通知（若可行）；`DELETE /session/<id>`

### [P4] 验证点击系统通知后 iframe 聚焦对应会话

[Case ID] TC-DSK-L3-10-002
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/components/iframe.tsx:80-84`、`:177-184`；`src-tauri/src/desktop/notification.rs`
[自动化] 否（手工；需点击系统通知）
[前置条件] 已通过通知桥弹出一条带 `sessionId` 的系统通知
[测试数据] 桥消息 `{ type: 'dsh://focus-session', sessionId }`
[测试步骤] 1. 点击系统通知。2. 观察 iframe 内是否切换到该 `sessionId` 对应的会话。
[预期结果] 1. 通知被点击。2. iframe 内切换到对应会话（宿主已发出 `dsh://focus-session`）。
[清理] 关闭通知

---

### 下载

### [P2] 验证下载完成后弹出已保存提示并显示路径

[Case ID] TC-DSK-L3-10-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/index.tsx:94-126`；`src-tauri/src/desktop/window.rs:39-61`
[自动化] 待接线（同上）
[前置条件] 应用处于 `ready`；可从 iframe 内触发一次下载
[测试数据] 选择器 `dsh-toast-download`、`dsh-toast-download-path`、`dsh-toast-download-action`
[测试步骤] 1. 触发一次下载。2. 等待下载完成事件。3. 读取提示节点、路径文本与操作入口。4. 比对路径与磁盘实际文件。
[预期结果] 1. 下载被触发。2. 完成事件到达。3. 出现「已保存」提示；路径文本包含实际落盘绝对路径；存在「在文件夹中显示」入口。4. 该路径上确实存在文件。
[清理] 删除下载的文件；关闭提示；`DELETE /session/<id>`

### [P3] [反向] 验证下载失败时提示失败且无打开文件夹入口

[Case ID] TC-DSK-L3-10-004
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/index.tsx:100-121`
[自动化] 待接线（同上）
[前置条件] 构造下载失败（如不可达的下载地址）
[测试数据] 选择器 `dsh-toast-download`、`dsh-toast-download-action`
[测试步骤] 1. 触发下载并等待失败。2. 读取提示文案。3. 读取操作入口存在性。
[预期结果] 1. 失败返回。2. 提示为「下载失败」语义。3. 操作入口不存在（不提供指向空路径的入口）。
[清理] 关闭提示；`DELETE /session/<id>`

### [P3] 验证重名文件自动追加序号

[Case ID] TC-DSK-L3-10-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/desktop/window.rs:41-44`；`src-tauri/src/config/utils.rs:29`
[自动化] 待接线（同上）
[前置条件] 下载目录中已存在同名文件
[测试数据] 已占用文件名 `e2e-download.txt`
[测试步骤] 1. 在下载目录创建 `e2e-download.txt` 并记录其内容。2. 触发同名下载。3. 等待完成并读取提示中的路径。4. 读取原文件内容。
[预期结果] 1. 创建成功。2. 下载完成。3. 落盘路径不等于 `e2e-download.txt`，而是形如 `e2e-download (1).txt`。4. 原文件内容未被覆盖。
[清理] 删除测试创建的两个文件；关闭提示；`DELETE /session/<id>`

### [P4] 验证「在文件夹中显示」调用系统文件管理器

[Case ID] TC-DSK-L3-10-006
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src/layout/index.tsx:112-119`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-10-003 通过（提示与路径均存在）
[测试数据] 选择器 `dsh-toast-download-action`
[测试步骤] 1. 点击「在文件夹中显示」。2. 读取控制台错误收集器与提示存在性。
[预期结果] 1. 点击被接受。2. 无 `reveal_in_folder` 失败错误。3. 提示被关闭。
[清理] 关闭被拉起的文件管理器窗口；`DELETE /session/<id>`

---

### 剪贴板图片回退

### [P2] 验证剪贴板图片读取请求返回 PNG data URL

[Case ID] TC-DSK-L3-10-007
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/iframe.tsx:98-101`、`:156-169`
[自动化] 待接线（同上）
[前置条件] 系统剪贴板中已放入一张图片
[测试数据] 桥消息 `{ type: 'dsh://clipboard-image:read', id }`
[测试步骤] 1. 由 iframe 侧发出读取请求。2. 等待回包。3. 读取回包内容。
[预期结果] 1. 请求发出成功。2. 回包到达。3. 回包 `type` 为 `dsh://clipboard-image:reply`，`id` 与请求一致，`data_url` 以 `data:image/png` 开头。
[清理] 清空剪贴板；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-toast-download` | 下载完成/失败提示 | 待补 |
| `dsh-toast-download-path` | 提示中的落盘路径 | 待补 |
| `dsh-toast-download-action` | 「在文件夹中显示」按钮 | 待补 |

---

### 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| 通知桥转发 | 135 | 正向 | 系统通知的**实际呈现**未验证（属系统表面） |
| 通知点击回焦 | 136 | 边界 | 需点击系统通知，标为手工 |
| 下载成功提示 | 137、140 | 正向 / 边界 | — |
| 下载失败 | 138 | 异常 | — |
| 重名处理 | 139 | 异常 | `(n)` 序号递增到多位的分支**未覆盖** |
| 剪贴板图片回退 | 141 | 正向 | 剪贴板为空的返回分支（`data_url: null`）**未覆盖** |
| 外部链接接管 | — | — | `on_new_window` 的 http(s) 打开与非 http 拒绝两条分支**未覆盖** |
| 连续下载的 toast 复用 | — | — | 关闭上一条同源 toast（`index.tsx:97-98`）**未覆盖** |

---

### 缺口与假设

- **G-D10-1**：系统通知与文件管理器的实际呈现无法通过 WebDriver 断言（`00-overview.md` G9）。TC-DSK-L3-10-001 只证明桥接层与命令调用成功；**「用户真的看到通知」未被证明**。
- **G-D10-2**：TC-DSK-L3-10-003 需要「从 iframe 内触发下载」。若 iframe 内无稳定的下载入口，接线时需引入一个测试用的下载链接，并注明这是对真实下载路径的替身。
- **G-D10-3**：`on_new_window`（外部链接接管）是安全边界（只放行 http/https），**未覆盖**。该分支可通过 iframe 内 `window.open('javascript:...')` 构造，属高价值补充项。
- **G-D10-4**：剪贴板图片回退主要为 Linux/WebKitGTK 设计（`iframe.tsx:97-98`），在 Windows 上该路径不会被真实触发。接线时需按平台决定是否跳过。
- **假设**：下载默认保存到系统下载目录（`window.rs:39-44` 的 `destination`）；本文件按该目录读取与清理文件。

---

## 2. CLI 集成：shim 与 PATH

CLI 集成的产物是「用户新终端里能直接敲 `dsh`」。它由 shim 文件与 PATH 注册两部分组成，两者都必须幂等、可回滚、且**不覆盖用户自己的同名命令**。Debug 构建刻意只写 pnpm shim、不注册 PATH，以免污染开发机。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `ensure()`：建 DSH_HOME → `write_shims` → **非 debug 才** `register_path` → `get_status`；幂等 | `src-tauri/src/service/cli/core.rs:48` |
| `ensure_shims()`：只写 shim，不注册 PATH（供插件安装内部使用） | `src-tauri/src/service/cli/core.rs:75` |
| 调用点：启动自愈 `cli::ensure`；安装收尾 `sync_cli_link`；插件安装 `cli::ensure_shims` | `src-tauri/src/desktop/builder.rs:147`、`src-tauri/src/bridge/lifecycle.rs:54`、`src-tauri/src/service/plugin/install/mod.rs:190` |
| Windows shim 名 `dsh.cmd`/`dsh.ps1`/`pnpm.cmd`/`pnpm.ps1`；Unix `dsh`/`pnpm` | `src-tauri/src/service/cli/shim/mod.rs:20` |
| bin 目录：Win `%LOCALAPPDATA%\<CLI_ROOT>\bin`；Unix `~/.local/bin`（debug 各用 dev 子名） | `src-tauri/src/service/cli/path/mod.rs:54` |
| 常量 `CLI_ROOT_DIR_NAME="deepseek-harness"`、`CLI_ROOT_DEV_DIR_NAME="deepseek-harness-dev"`、`UNIX_BIN_DIR=".local/bin"` | `src-tauri/src/service/cli/path/mod.rs:41`、`:44`、`src-tauri/src/config/constants.rs:78` |
| **debug 下不写 dsh shim**（`cfg(not(debug_assertions))` 包裹），仍写 pnpm shim；Unix chmod 白名单 debug 仅 pnpm | `src-tauri/src/service/cli/shim/write.rs:132`、`:151` |
| Windows PATH：`HKCU\Environment` 值名 `Path`，读 REG_SZ/REG_EXPAND_SZ 并保留原类型；读失败中止而非当空 PATH | `src-tauri/src/service/cli/path/registry.rs:10`、`:73` |
| 广播 `SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment", SMTO_ABORTIFHUNG, 5000)` | `src-tauri/src/service/cli/path/registry.rs:131` |
| 注册错误串 `PATH_BIN_DIR_NOT_UTF8`、`PATH_REG_READ_FAILED`、`REG_OPEN_FAILED:`、`REG_WRITE_FAILED:` | `src-tauri/src/service/cli/path/mod.rs:150`、`:155`、registry.rs:91、`:124` |
| Unix rc 文件 `[".zshrc",".bashrc"]`；标记 `# >>> deepseek-harness dsh >>>` / `# <<< … >>>`；块内容 `export PATH="$HOME/.local/bin:$PATH"`；只更新自身块并移到文件末尾 | `src-tauri/src/service/cli/path/rc.rs:13`、`:32`、`:88` |
| rc 备份 `<file>.dsh-backup`，临时文件 `.dsh-rc-tmp` + rename 原子替换；失败回滚备份 | `src-tauri/src/service/cli/path/rc.rs:104`、`:31`、`:41` |
| `%`→`%%` 由 `escape_path_cmd` 完成（含单测 `cmd_shim_escapes_percent`） | `src-tauri/src/service/cli/shim/mod.rs:40`、`build.rs:373` |
| `'`→`'\''` 由 `escape_path_sh` 完成 | `src-tauri/src/service/cli/shim/mod.rs:52`、`build.rs:140` |
| ps1 用 `'`→`''`（`escape_path_ps1`），**不是** `'\''` | `src-tauri/src/service/cli/shim/mod.rs:46`、`build.rs:110` |
| shim 内 Node 优先级：`DSH_NODE` → PATH 中兼容 Node（需稳定版正则，预发布被拒）→ 捆绑 `%APP_DIR%\runtime\node.exe` → 报错 exit 1 | `src-tauri/src/service/cli/shim/templates.rs:16`、`:57`、`:97` |
| shim 内 pnpm 优先级：`DSH_PREFER_BUNDLED_PNPM=1` → `DSH_PNPM` → PATH 中跳过自身 shim 的用户 pnpm → 捆绑 `pnpm.cjs` → 报错 exit 1 | `src-tauri/src/service/cli/shim/build.rs:179`、`:267`、`:316` |
| `find_user_pnpm` 跳过自身 bin 目录，并拒绝本应用生成的 shim（≤16KiB 且带头部标记） | `src-tauri/src/service/cli/path/pnpm.rs:96`、`:161` |
| `CliLinkStatus` 字段 `enabled`/`shim_exists`/`path_registered`/`user_dsh_preserved`/`bin_dir`/`shim_path` | `src-tauri/src/service/cli/core.rs:13` |
| `.cmd` 行尾统一为 CRLF（`normalize_cmd_line_endings`，issue #581） | `src-tauri/src/service/cli/shim/build.rs:24`、`:39`、`:167` |
| **debug 不注册/不注销 PATH**（两处提前 return） | `src-tauri/src/service/cli/core.rs:58`、`:86` |
| shim 覆盖策略：悬空符号链接先删；存在且非本应用生成（头部无 `DeepSeek Harness Desktop - `）则跳过保留 | `src-tauri/src/service/cli/shim/write.rs:24`、`:55`、`:70` |
| 设置面板入口 `get_cli_link_status`；开关写 `store.setting.update({ cliLinkEnabled })` | `src/ui/config/debug.tsx:64`、`:110`、`:313` |

---

### 状态与幂等

### [P1] 验证启用命令行集成后状态为已链接

[Case ID] TC-DSK-L3-10-008
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/cli/core.rs:48`、`:29`；`src-tauri/src/bridge/config.rs:91`
[自动化] 待接线（`test/e2e/desktop/10-system-integration.e2e.ts`）
[前置条件] 当前 CLI link 为关闭；可读写 shim 目录与用户 PATH（非 debug 构建验证注册）
[测试数据] 选择器 `dsh-config-cli-link`
[测试步骤] 1. 读取 `get_cli_link_status`。2. 打开开关并等待命令返回。3. 再次读取 `get_cli_link_status` 与磁盘上的 shim。
[预期结果] 1. `enabled=false`、`shim_exists=false`、`path_registered=false`。2. 开关被接受且无错误提示。3. `enabled=true`、`shim_exists=true`、`bin_dir` 与 `shim_path` 为非空绝对路径，且 `shim_path` 指向的文件确实存在。
[清理] 关闭开关并复原 PATH；`DELETE /session/<id>`

---

### 用户命令保护与平台行为

### [P3] [反向] 验证用户自装的同名 dsh 不被覆盖

[Case ID] TC-DSK-L3-10-015
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/cli/shim/write.rs:70`、`:55`；`src-tauri/src/service/cli/core.rs:20`
[自动化] 待接线（同上）
[前置条件] 在 shim 目标路径先放置一个非本应用生成的 `dsh` 文件（头部无 `DeepSeek Harness Desktop - `）
[测试数据] 预置用户自有 `dsh` 文件及其内容指纹
[测试步骤] 1. 启用 CLI link。2. 读取 `get_cli_link_status().user_dsh_preserved`。3. 比对预置文件内容。
[预期结果] 1. 启用成功，无错误。2. `user_dsh_preserved=true`。3. 预置文件**内容未被改写**；UI 显示「已保留用户 dsh」提示而非 bin 目录提示。
[清理] 移除预置文件；关闭开关；`DELETE /session/<id>`

### [P3] [反向] 验证悬空符号链接被清理后写入 shim

[Case ID] TC-DSK-L3-10-016
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/cli/shim/write.rs:24`；`build.rs:24`（issue #581）
[自动化] 待接线（同上）
[前置条件] shim 目标路径存在一个指向不存在目标的符号链接（模拟官方 dsh 安装器残留）
[测试数据] 悬空符号链接 `dsh -> $E2E_HOME/home/.dsh/source/current/bin/dsh`
[测试步骤] 1. 启用 CLI link。2. 读取 shim 路径的链接类型与内容。3. 读取 `shim_exists`。
[预期结果] 1. 启用成功。2. 悬空链接被删除并替换为常规 shim 文件（不再是符号链接）。3. `shim_exists=true`。
[清理] 移除 shim；关闭开关；`DELETE /session/<id>`

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-10-009` | 验证重复启用保持幂等 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-010` | 验证关闭命令行集成后 shim 与 PATH 被清理 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-011` | 验证 Windows shim 的路径转义与行尾符合约定 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-012` | 验证 Unix shim 的单引号转义 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-013` | 验证 shim 内 Node 解析优先级 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-014` | 验证 shim 内 pnpm 解析优先级且拒绝自身 shim | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-017` | 验证 debug 构建不注册 PATH 且不写 dsh shim | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-018` | 验证 Windows PATH 写回保留原注册表类型 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-019` | 验证读取 PATH 失败时中止而非视作空 PATH | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/service/cli/core.rs:48`、`:29`；`src-tauri/src/bridge/config.rs:91`` | `TC-DSK-L3-10-008` | 正向 |
| ``src-tauri/src/service/cli/shim/write.rs:70`、`:55`；`src-tauri/src/service/cli/core.rs:20`` | `TC-DSK-L3-10-015` | 异常 |
| ``src-tauri/src/service/cli/shim/write.rs:24`；`build.rs:24`（issue #581）` | `TC-DSK-L3-10-016` | 异常 |

---

### 缺口与假设

- **G-D10-5**：`TC-DSK-L3-10-017`/`TC-DSK-L3-10-018` 会**真实改写用户注册表 PATH**。按 `00-overview.md` G8，接线时必须先记录原始类型与文本，并在清理中逐字还原，否则会污染开发者本机环境。
- **G-D10-6**：Unix rc 注入路径（`.zshrc`/`.bashrc`，含 `<file>.dsh-backup` 备份与 rename 失败回滚）**未覆盖**，需 macOS/Linux 环境；相应地 `BACKUP_RC_FAILED` / `WRITE_RC_FAILED` / `RENAME_RC_FAILED` / `READ_RC_FAILED` / `RC_HOME_RESOLVE_FAILED` 五个错误串均未断言。
- **G-D10-7**：Debug 构建刻意不写 dsh shim、不注册 PATH（`TC-DSK-L3-10-016`）。这意味着 L3 用例在 Debug 二进制下**无法完整验证 shim 生成**；若要覆盖 dsh shim 内容，需要 Release 构建，而 `desktop.test.md` §6 的端口/数据目录隔离约定（Debug 3081 + `.dsh.dev`）正是为 Debug 二进制设计，两者冲突。本条登记为已知结构性缺口，接线时需先确定是否引入 Release lane。
- **G-D10-8**：`TC-DSK-L3-10-010` 的 `%` 转义只断言 shim **文本**正确，未在「路径真含 `%`」的机器上实际执行 shim。运行期生效需专门环境。
- **假设**：CLI 集成的真值以 `get_cli_link_status` 的六个字段为准，不直接断言注册表内部结构（除 `TC-DSK-L3-10-017`/`TC-DSK-L3-10-018` 这两条明确针对注册表类型的用例）。

---

## 3. 系统集成、路径守卫、跨平台与 Windows 极简模式

壳层与操作系统的接触面由 `bridge/system_os.rs` 收口：唤起浏览器与文件管理器、读写日志、代理健康检查、透传前端日志。本文件的重点是**这些接触面同时是安全边界**——来自可被第三方插件注入脚本操纵的 iframe 的路径参数必须被白名单限制，越界即拒绝；其次是 Windows 极简模式的落盘修复与平台门控。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 命令集 `proxy_health_check` / `get_runtime_info` / `open_in_browser` / `copy_service_url` / `reveal_in_folder` / `open_dir` / `reveal_data_dir` | `src-tauri/src/bridge/system_os.rs:15`、`:22`、`:31`、`:45`、`:52`、`:64`、`:74` |
| 命令集 `log_frontend` / `read_service_logs` / `clear_service_logs` / `read_run_logs` / `open_external_url` | `src-tauri/src/bridge/system_os.rs:101`、`:122`、`:142`、`:164`、`:239` |
| `reveal_in_folder` 越界拒绝 `REVEAL_PATH_REJECTED: {path}` | `src-tauri/src/bridge/system_os.rs:55-57` |
| `open_dir` 越界拒绝 `OPEN_DIR_REJECTED: {path}` | `src-tauri/src/bridge/system_os.rs:66-68` |
| 允许根 = 系统下载目录 + 应用数据目录 + `$DSH_HOME`（测试中即 `$E2E_HOME/home/.dsh.dev`，§5.3）+ 检测到的本地核心包目录 | `src-tauri/src/bridge/guard.rs:18-34` |
| 匹配前两侧都 canonicalize（`dunce`，剥 Windows verbatim 前缀）后按组件比较 | `src-tauri/src/bridge/guard.rs:50-61` |
| 路径不存在直接判不允许 | `src-tauri/src/bridge/guard.rs:51-53` |
| `reveal_data_dir` 先 `create_dir_all`，再按平台 `explorer` / `open` / `xdg-open` | `src-tauri/src/bridge/system_os.rs:74-95` |
| `open_external_url` 仅放行 `http://` / `https://`，否则 `EXTERNAL_URL_INVALID: {url}` | `src-tauri/src/bridge/system_os.rs:239-242` |
| `read_run_logs` 四段：`### 环境信息` / `### 服务日志` / `### 前台日志` / `### 后台日志` | `src-tauri/src/bridge/system_os.rs:164`、`:216-222` |
| 行数上限 `MAX_LINES = 100`，前台日志减半 `FRONTEND_MAX_LINES = 50` | `src-tauri/src/bridge/system_os.rs:165`、`:167` |
| 环境段含 app 版本、dsh 版本、node 版本、os 与 arch | `src-tauri/src/bridge/system_os.rs:198-210` |
| 后台日志段剔除 `target: frontend` 残余行 | `src-tauri/src/bridge/system_os.rs:184-196`、`:229-235` |
| `read_service_logs` 默认上限 64 KiB，超出取尾部 | `src-tauri/src/bridge/system_os.rs:122-138`、`:132` |
| 尾部裁剪回退到 UTF-8 字符边界（`tail_bytes`） | `src-tauri/src/bridge/system_os.rs:111-118` |
| 日志文件不存在时返回空串（非错误） | `src-tauri/src/bridge/system_os.rs:127-129` |
| `clear_service_logs` 以空串覆写日志文件 | `src-tauri/src/bridge/system_os.rs:142-145` |
| `RuntimeInfo` 字段：`app_version` / `dsh_version` / `node_version` / `service_url` / `data_dir` / `log_path` / `platform` / `arch` | `src-tauri/src/config/runtime.rs:587-598` |
| `get_runtime_info` 优先取当前活动核心版本 | `src-tauri/src/bridge/system_os.rs:22-27` |
| `dsh_version` 为 `Option<String>`，取不到即 `null` | `src-tauri/src/config/runtime.rs:591`；`src-tauri/src/config/runtime.rs:563-585` |
| `proxy_health_check` 无持有进程：`HARNESS_NOT_OWNED: no Harness process is owned by this app` | `src-tauri/src/service/workflow/health.rs:47-53`、`:61-63` |
| `launch` 仍在进行（守卫未释放）时返回可重试的 `HARNESS_NOT_READY: Harness service is still starting` | `src-tauri/src/service/workflow/health.rs:47-53` |
| 模块就绪判定 `healthy - {ready}/{total} client modules ready` | `src-tauri/src/service/workflow/health.rs:90-92` |
| 前端：服务日志面板 2 秒回读、清空、复制服务地址、打开数据目录 | `src/ui/config/debug.tsx:69-73`、`:98-108`、`:130-139`、`:173-179`、`:280-289` |
| 前端：核心「打开目录」调 `open_dir` | `src/ui/config/core.tsx:216-226` |
| 前端：下载完成提示的「在文件夹中显示」调 `reveal_in_folder` | `src/layout/index.tsx:113-118` |
| 前端：帮助→文档与关于页仓库链接调 `open_external_url` | `src/layout/components/navbar.tsx:260-267`；`src/ui/dialog/about.tsx:59` |
| 前端：启动失败页「复制日志」调 `read_run_logs` | `src/layout/components/setup.tsx:28`；`src/layout/components/navbar.tsx:299` |
| 前端：`console.*` 劫持经 `log_frontend` 落盘 | `src/utils/logger.ts:81` |
| 启动失败诊断按 16 KiB 上限取服务日志尾部 | `src/store/modules/harness/utils.ts:147`；`src/store/modules/harness/constants.ts:28` |
| Windows 极简模式：`apply` 由预装插件安装成功与启动自愈调用 | `src-tauri/src/service/plugin/install/mod.rs:387-391`；`src-tauri/src/service/plugin/install/single.rs:391-395`；`src-tauri/src/service/workflow/launch.rs:409-411` |
| `PATCH_ENTRY` 用显式相对入口 `./node_modules/dsh-win-terminal-inspector/index.js` + `id: win-terminal-inspector` | `src-tauri/src/service/workflow/win_inspector.rs:45-49` |
| 注入判定标记 `dsh-win-terminal-inspector` | `src-tauri/src/service/workflow/win_inspector.rs:52` |
| 用户 preset id `minimal-win` | `src-tauri/src/service/workflow/win_inspector.rs:55` |
| Git Bash 候选路径（含 x86 变体）与环境变量 `DSH_GIT_BASH_PATH` 覆盖 | `src-tauri/src/service/workflow/win_inspector.rs:58-63`、`:241-252` |
| 插件是否装入读 profile `package.json` 的 `dependencies` | `src-tauri/src/service/workflow/win_inspector.rs:87-99` |
| `ensure_patch` 把顶层数组整体改写给 YAML 库，并迁移遗留裸包名/目录写法 | `src-tauri/src/service/workflow/win_inspector.rs:106-134`、`:224-228` |
| `prune_patch_if_uninstalled` 只删本插件块，删空后自愈为 `[]` | `src-tauri/src/service/workflow/win_inspector.rs:145-168` |
| `ensure_patch_scaffold` 修复「仅注释」scaffold（YAML `null`） | `src-tauri/src/service/workflow/win_inspector.rs:177-200` |
| 错误串 `PATCH_RENDER_FAILED` / `PATCH_WRITE_FAILED` / `PATCH_PARSE_FAILED` / `PATCH_NOT_ARRAY` / `PATCH_PRUNE_FAILED` | `src-tauri/src/service/workflow/win_inspector.rs:132`、`:133`、`:208`、`:212`、`:167` |
| 官方 inspector 版本边界：`0.1.0-rc.8` 起可用，rc.6/rc.7 走兼容分支 | `src-tauri/src/service/workflow/win_inspector.rs:398-406` |
| 新核心路径：清理遗留挂载并记日志后返回 | `src-tauri/src/service/workflow/win_inspector.rs:410-418` |
| 旧核心路径：scaffold → 未装插件则清理返回 → 装了就写 patch 与 preset | `src-tauri/src/service/workflow/win_inspector.rs:419-427` |
| preset 组成：`terminal-bash.shellPath` 指向 Git Bash，`shellArgs: ['--noprofile','--norc','-i']` | `src-tauri/src/service/workflow/win_inspector.rs:328-333` |
| persistent-shell 组内 `sandbox-policy` 为 `danger-full-access` | `src-tauri/src/service/workflow/win_inspector.rs:322-326` |
| preset 落盘于 `${DSH_HOME}/.agent-presets/minimal-win/`，含 `agent.cordis.yml` 与 `preset.yml` | `src-tauri/src/service/workflow/win_inspector.rs:369-395`；`:277-285` |
| Git Bash 未找到时跳过并告警，不阻断主流程 | `src-tauri/src/service/workflow/win_inspector.rs:370-375` |
| 非 Windows 的 `apply` 为无操作，`git_bash_bin_dirs` 返回空 | `src-tauri/src/service/workflow/win_inspector.rs:695-706`；`:712-714` |
| 档案 `parse_workspace_document` 归一化多文档 YAML（后者覆盖前者同名键） | `src-tauri/src/service/profile/mod.rs:123-152` |
| 自愈时记 `PROFILE_WORKSPACE_MULTI_DOCUMENT: normalized …` 并回写 | `src-tauri/src/service/profile/mod.rs:164-171`、`:191-202` |
| 单文档策略注入由插件安装路径调用（跨平台） | `src-tauri/src/service/profile/mod.rs:154`；`src-tauri/src/service/plugin/install/mod.rs:213`；`src-tauri/src/service/plugin/install/single.rs:266` |
| 打包目标 `bundle.targets = "all"` | `src-tauri/tauri.conf.json:21` |
| macOS 打包：`hardenedRuntime` / `infoPlist` / `entitlements` | `src-tauri/tauri.conf.json:34-39` |
| Windows 打包：NSIS 模板与中英语言、WiX 语言与开机自启清理 fragment | `src-tauri/tauri.conf.json:40-52` |
| 麦克风与相机用途说明（TCC 缺少即杀进程） | `src-tauri/Info.plist:19`、`:21` |
| Hardened Runtime 下的音频输入与相机 entitlement | `src-tauri/Entitlements.plist:16`、`:18` |
| Linux 托盘自建（KSNI），构建失败只告警不阻断启动 | `src-tauri/src/desktop/linux_tray.rs:35-39`、`:37` |
| Linux 托盘左键单击唤起主窗口，菜单项 `open` / `quit` | `src-tauri/src/desktop/linux_tray.rs:88-95`、`:48-50`、`:106-110` |

---

### 路径守卫与系统唤起

### [P1] 验证在文件夹中显示允许根内的文件

[Case ID] TC-DSK-L3-10-020
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/system_os.rs:52-58`；`src-tauri/src/bridge/guard.rs:18-34`；`src/layout/index.tsx:113-118`
[自动化] 待接线（`test/e2e/desktop/10-system-integration.e2e.ts`）
[前置条件] 应用处于 `ready`；系统下载目录内存在一个普通文件
[测试数据] 路径 = `<系统下载目录>/<已存在文件>`
[测试步骤] 1. 调用 `reveal_in_folder` 传入该路径。2. 读取返回结果与系统文件管理器唤起记录。
[预期结果] 1. 返回成功（无错误文本）。2. 未出现 `REVEAL_PATH_REJECTED`，调用被交给系统文件管理器。
[清理] 删除构造的文件；`DELETE /session/<id>`

---

### 日志与运行时诊断

### [P1] 验证运行时诊断文本框返回完整四段

[Case ID] TC-DSK-L3-10-024
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167`、`:198-210`、`:216-222`；`src/layout/components/setup.tsx:28`
[自动化] 待接线（`test/e2e/desktop/10-system-integration.e2e.ts`）
[前置条件] 应用处于 `ready`；`logs/desktop.log` 与 `logs/desktop.frontdesk.log` 均存在且行数分别超过 100 与 50；服务日志存在
[测试数据] 调用 `read_run_logs` 的返回文本
[测试步骤] 1. 调用 `read_run_logs`。2. 读取返回文本中的段标题。3. 分段统计行数并读取环境段字段。
[预期结果] 1. 调用成功返回文本。2. 依次出现 `### 环境信息`、`### 服务日志`、`### 前台日志`、`### 后台日志` 四段。3. 服务段与后台段各不超过 100 行、前台段不超过 50 行；环境段含 app 版本、dsh 版本、node 版本、os 与 arch。
[清理] `DELETE /session/<id>`

---

### Windows 极简模式（Windows 专属）

### [P1] 验证官方内置 inspector 的核心不再挂载社区注入

[Case ID] TC-DSK-L3-10-027
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/win_inspector.rs:398-406`、`:410-418`；`src-tauri/src/service/plugin/install/single.rs:391-395`
[自动化] 待接线（`test/e2e/desktop/10-system-integration.e2e.ts`）
[前置条件] Windows 宿主；活动核心版本 ≥ `0.1.0-rc.8`；活动档案的 `cordis.patch.yml` 内含本插件的遗留 `- insert:` 块
[测试数据] 观察点：`$E2E_HOME/home/.dsh.dev/profiles/<档案>/cordis.patch.yml`（§5.3）、桌面端日志
[测试步骤] 1. 读取 patch 文件并确认遗留块存在。2. 触发一次会调用 `win_inspector::apply` 的流程（启动自愈或插件操作）。3. 重新读取 patch 文件与日志。
[预期结果] 1. 遗留块存在。2. 流程完成且无 `PATCH_*` 错误。3. patch 中不再含 `win-terminal-inspector`，且未追加新的挂载块；日志出现「provides the official Windows process inspector」。
[清理] 恢复 patch 文件原始内容；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-config-reveal-data-dir` | 「打开数据目录」按钮 | 待补 |
| `dsh-config-clear-service-logs` | 清空日志按钮 | 待补 |
| `dsh-config-service-logs` | 日志展示区 | 待补 |
| `dsh-config-core-open-dir` | 核心「打开目录」按钮 | 待补 |
| `dsh-toast-download-show-in-folder` | 下载完成提示的「在文件夹中显示」动作 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-10-021` | 验证拒绝定位允许根之外的文件 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-022` | 验证拒绝打开允许根之外的目录 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-023` | 验证拒绝非 http(s) 方案的外部链接 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-025` | 验证服务日志按 64 KiB 取尾且不截断多字节字符 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-026` | 验证无持有进程时健康检查返回可区分的失败信号 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-028` | 验证 rc.6/rc.7 已装插件时写入显式入口挂载并创作 preset | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-029` | 验证挂载幂等且遗留裸包名被迁移为显式入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-030` | 验证非 Windows 平台极简模式修复为无操作 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-10-031` | 验证 pnpm-workspace 多文档被自愈归一化为单文档 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/bridge/system_os.rs:52-58`；`src-tauri/src/bridge/guard.rs:18-34`；`src/layout/index.tsx:113-118`` | `TC-DSK-L3-10-020` | 正向 |
| ``src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167`、`:198-210`、`:216-222`；`src/layout/components/setup.tsx:28`` | `TC-DSK-L3-10-024` | 正向 |
| ``src-tauri/src/service/workflow/win_inspector.rs:398-406`、`:410-418`；`src-tauri/src/service/plugin/install/single.rs:391-395`` | `TC-DSK-L3-10-027` | 正向 |

---

### 缺口与假设

- **G-D10-9**：`reveal_in_folder` / `open_dir` / `reveal_data_dir` 只断言桥接层成功返回与错误串，**不验证系统文件管理器/浏览器的实际呈现**（属系统表面，见 `00-overview.md` G9）。人工确认项。
- **G-D10-10**：`open_external_url` 的方案判定是**字面前缀匹配**（`src-tauri/src/bridge/system_os.rs:240`），`HTTPS://` 或 `https:/` 一类变体的行为由实现决定，本套未断言；接线前需要先确认期望语义，否则会把实现的宽松/严格当成缺陷。
- **G-D10-11**：跨平台打包配置（`bundle.targets = "all"`、macOS `hardenedRuntime` + `Info.plist` + `Entitlements.plist`、Windows NSIS/WiX）是**构建期**事实，无法在真实窗口的页面内断言。本文件只把它们登记为事实基线；若需覆盖，应另立构建产物校验批次（对 `.app` / `.dmg` / `.exe` 的签名与 plist 键做静态检查），不在 L3 页面用例内实现。
- **G-D10-12**：Linux 托盘（`src-tauri/src/desktop/linux_tray.rs`）的单击唤起与菜单动作是**系统托盘表面**，页面内不可断言；本文件只引用其「失败只告警不阻断启动」的语义（`:35-39`），实际托盘交互归 `01-window-shell.md` 的「窗口控制与托盘」模块或手工确认。
- **G-D10-13**：TC-DSK-L3-10-027 与 TC-DSK-L3-10-028 需要切换活动核心版本到 `0.1.0-rc.6` / `rc.7` 与 `≥ 0.1.0-rc.8` 两侧。旧 rc 核心可能已无法下载，接线时需准备本地核心（`00-overview.md` 未覆盖该前置）。此外两条用例都会改写 `cordis.patch.yml` 与 `$E2E_HOME/home/.dsh.dev/.agent-presets/`（§5.3），测试必须备份与还原（`00-overview.md` G8）。
- **G-D10-14**：TC-DSK-L3-10-030 的「无副作用」断言依赖档案目录的文件清单快照能力，当前无该工具；退化为断言 `apply` 返回 `Ok` 与 `git_bash_bin_dirs` 为空集合。
- **G-D10-15**：Windows 极简模式的错误串（`PATCH_RENDER_FAILED` / `PATCH_WRITE_FAILED` / `PATCH_PARSE_FAILED` / `PATCH_NOT_ARRAY` / `PATCH_PRUNE_FAILED`）**未覆盖**：需要在写入时制造 YAML 库渲染失败或非法顶层类型，属难以稳定构造的故障注入。
- **假设**：`read_run_logs` 的四个段标题在无内容时仍然出现（段标题由 `format!` 固定拼接，`src-tauri/src/bridge/system_os.rs:216-222`），因此 TC-DSK-L3-10-024 的段结构断言不依赖日志是否为空，但行数上限断言依赖日志足够长。
- **假设**：路径守卫的「允许根之外」以系统临时目录为例；`00-overview.md` §5.1 未把临时目录列入允许根，本文件据此假定它必然被拒绝（`src-tauri/src/bridge/guard.rs:18-34`）。
