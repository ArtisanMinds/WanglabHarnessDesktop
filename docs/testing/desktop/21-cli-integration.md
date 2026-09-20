# CLI 集成：shim 与 PATH

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/21-cli-integration.e2e.ts`（待建立）
> 前置：`13-application-settings.md` 通过；可观察 shim 目录与用户 PATH
> 运行：`vitest --project desktop -- test/e2e/desktop/21-cli-integration.e2e.ts`（待配置，见 G2）

CLI 集成的产物是「用户新终端里能直接敲 `dsh`」。它由 shim 文件与 PATH 注册两部分组成，两者都必须幂等、可回滚、且**不覆盖用户自己的同名命令**。Debug 构建刻意只写 pnpm shim、不注册 PATH，以免污染开发机。

---

## 1. 事实基线

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

## 2. 状态与幂等

### [P1] 验证启用命令行集成后状态为已链接

[Case ID] TC-DSK-L3-21-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/cli/core.rs:48`、`:29`；`src-tauri/src/bridge/config.rs:91`
[自动化] 待接线（`test/e2e/desktop/21-cli-integration.e2e.ts`）
[前置条件] 当前 CLI link 为关闭；可读写 shim 目录与用户 PATH（非 debug 构建验证注册）
[测试数据] 选择器 `dsh-config-cli-link`
[测试步骤] 1. 读取 `get_cli_link_status`。2. 打开开关并等待命令返回。3. 再次读取 `get_cli_link_status` 与磁盘上的 shim。
[预期结果] 1. `enabled=false`、`shim_exists=false`、`path_registered=false`。2. 开关被接受且无错误提示。3. `enabled=true`、`shim_exists=true`、`bin_dir` 与 `shim_path` 为非空绝对路径，且 `shim_path` 指向的文件确实存在。
[清理] 关闭开关并复原 PATH；`DELETE /session/<id>`

---

## 3. 用户命令保护与平台行为

### [P3] [反向] 验证用户自装的同名 dsh 不被覆盖

[Case ID] TC-DSK-L3-21-008
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

[Case ID] TC-DSK-L3-21-009
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/cli/shim/write.rs:24`；`build.rs:24`（issue #581）
[自动化] 待接线（同上）
[前置条件] shim 目标路径存在一个指向不存在目标的符号链接（模拟官方 dsh 安装器残留）
[测试数据] 悬空符号链接 `dsh -> $E2E_HOME/home/.dsh/source/current/bin/dsh`
[测试步骤] 1. 启用 CLI link。2. 读取 shim 路径的链接类型与内容。3. 读取 `shim_exists`。
[预期结果] 1. 启用成功。2. 悬空链接被删除并替换为常规 shim 文件（不再是符号链接）。3. `shim_exists=true`。
[清理] 移除 shim；关闭开关；`DELETE /session/<id>`

## 4. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-21-002` | 验证重复启用保持幂等 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-003` | 验证关闭命令行集成后 shim 与 PATH 被清理 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-004` | 验证 Windows shim 的路径转义与行尾符合约定 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-005` | 验证 Unix shim 的单引号转义 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-006` | 验证 shim 内 Node 解析优先级 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-007` | 验证 shim 内 pnpm 解析优先级且拒绝自身 shim | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-010` | 验证 debug 构建不注册 PATH 且不写 dsh shim | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-011` | 验证 Windows PATH 写回保留原注册表类型 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-21-012` | 验证读取 PATH 失败时中止而非视作空 PATH | 纯逻辑断言，下沉单元测试层 |

---

## 5. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/service/cli/core.rs:48`、`:29`；`src-tauri/src/bridge/config.rs:91`` | `TC-DSK-L3-21-001` | 正向 |
| ``src-tauri/src/service/cli/shim/write.rs:70`、`:55`；`src-tauri/src/service/cli/core.rs:20`` | `TC-DSK-L3-21-008` | 异常 |
| ``src-tauri/src/service/cli/shim/write.rs:24`；`build.rs:24`（issue #581）` | `TC-DSK-L3-21-009` | 异常 |

---

## 6. 缺口与假设

- **G-D21-1**：`TC-DSK-L3-21-010`/`TC-DSK-L3-21-011` 会**真实改写用户注册表 PATH**。按 `00-overview.md` G8，接线时必须先记录原始类型与文本，并在清理中逐字还原，否则会污染开发者本机环境。
- **G-D21-2**：Unix rc 注入路径（`.zshrc`/`.bashrc`，含 `<file>.dsh-backup` 备份与 rename 失败回滚）**未覆盖**，需 macOS/Linux 环境；相应地 `BACKUP_RC_FAILED` / `WRITE_RC_FAILED` / `RENAME_RC_FAILED` / `READ_RC_FAILED` / `RC_HOME_RESOLVE_FAILED` 五个错误串均未断言。
- **G-D21-3**：Debug 构建刻意不写 dsh shim、不注册 PATH（`TC-DSK-L3-21-009`）。这意味着 L3 用例在 Debug 二进制下**无法完整验证 shim 生成**；若要覆盖 dsh shim 内容，需要 Release 构建，而 `desktop.test.md` §6 的端口/数据目录隔离约定（Debug 3081 + `.dsh.dev`）正是为 Debug 二进制设计，两者冲突。本条登记为已知结构性缺口，接线时需先确定是否引入 Release lane。
- **G-D21-4**：`TC-DSK-L3-21-003` 的 `%` 转义只断言 shim **文本**正确，未在「路径真含 `%`」的机器上实际执行 shim。运行期生效需专门环境。
- **假设**：CLI 集成的真值以 `get_cli_link_status` 的六个字段为准，不直接断言注册表内部结构（除 `TC-DSK-L3-21-010`/`TC-DSK-L3-21-011` 这两条明确针对注册表类型的用例）。
