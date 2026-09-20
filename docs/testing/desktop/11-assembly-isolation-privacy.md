# 装配、网络隔离与隐私

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`

首次装配决定应用能否起来，端口与数据目录隔离决定用例之间能否互不干扰，监听边界与路径守卫决定暴露面。

---

## 1. 首次装配与依赖安装

首次装配是桌面端唯一「带真实下载、解压、落盘、校验」的流程，也是首次启动体验的全部。本文件覆盖任务编排、进度事件、复用与跳过、失败恢复四类行为。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `install_dependencies` 返回 `Ok(true)` 表示本次真正落盘 dsh 核心（前端需重启），`Ok(false)` 表示未发生安装 | `src-tauri/src/bridge/lifecycle.rs:74` |
| 并发互斥 `INSTALL_LOCK`，`try_lock` 失败即 `Ok(false)` 并记 `Installation process already running, skipping` | `src-tauri/src/bridge/lifecycle.rs:19`、`:79` |
| 就绪探测 = `Nodejs`/`Dsh`/`Pnpm` 的 `check_installed()` + `config::git_runtime_ready()` | `src-tauri/src/bridge/lifecycle.rs:86` |
| 自愈：四项就绪但 `installed == false` → 补记 `installed=true` + `sync_cli_link`，**不联网**，返回 `Ok(false)` | `src-tauri/src/bridge/lifecycle.rs:103` |
| 仅缺 Git 的补装捷径：`Status::Installing` + `workflow::install(&app_handle, None)`（不查核心版本） | `src-tauri/src/bridge/lifecycle.rs:120` |
| 安装执行：置 `Installing` + `emit_status` → `workflow::install`；失败 `reset_install_status` 并返回 Err；成功置 `installed=true` | `src-tauri/src/bridge/lifecycle.rs:234`、`:46` |
| 收尾 `sync_cli_link` 按 `cli_link_enabled` 走 `cli::ensure`/`cli::remove`，失败仅 warn | `src-tauri/src/bridge/lifecycle.rs:54` |
| 安装任务固定顺序 `Nodejs`、`Dsh`、`Pnpm`（索引 0/1/2） | `src-tauri/src/service/workflow/install.rs:53` |
| 任务数：非 Windows 3 个（6 阶段）；Windows 4 个（追加 `download::Git`，8 阶段） | `src-tauri/src/service/workflow/install.rs:95`、`src-tauri/src/service/download/installable.rs:112` |
| 阶段模型 `ProgressTracker::new(&window, tasks.len() * 2)`，每任务 `download` → `extract` 两阶段 | `src-tauri/src/service/workflow/install.rs:98`、`:142`、`:207` |
| 首装进度映射为等权阶段：`global = current_phase*100/total + stage_pct*(100/total)/100`，clamp 0..100（**不是 0-50/50-100**） | `src-tauri/src/service/download/progress.rs:105` |
| 0-50/50-100 两阶段仅存在于核心槽位下载 `download_version` | `src-tauri/src/service/core/version.rs:517` |
| 子任务进度：ZIP 用 `(i+1)/total*100`；TGZ 传 `-1.0`（总数未知） | `src-tauri/src/service/download/extractor.rs:76`、`:164` |
| 已就绪且非过期的任务 `skip_phases(2)` | `src-tauri/src/service/workflow/install.rs:130` |
| 循环结束补 `tracker.update(100.0, i18n("install.done"), "All tasks completed")` | `src-tauri/src/service/workflow/install.rs:218` |
| 安装前 `stop()` 自有进程 + `terminate_stale_harness_processes`（失败 `STOP_FAILED`） | `src-tauri/src/service/workflow/install.rs:28` |
| `runtime_ready` 纯本地无网络，仅四项 `check_installed` | `src-tauri/src/bridge/lifecycle.rs:424` |
| 前端：`!ready \|\| !config.installed` → 置 `installing` 并 `invoke('install_dependencies')` | `src/store/modules/harness/store.ts:522` |
| `setting.installed=false` 唯一写入点：启动时 node/dsh 二进制缺失 | `src-tauri/src/service/workflow/launch.rs:170` |
| Node 复用：`prefer_bundled_node_runtime()` 优先捆绑；否则本地兼容 Node 直接可用 | `src-tauri/src/service/download/installable.rs:44` |
| 本地 Node 探测：PATH 中 `node`/`node.exe`（macOS 另查 homebrew 两路径），实跑 `--version` | `src-tauri/src/config/runtime.rs:112`、`:195` |
| 版本约束：major 22 → minor≥19；major≥24 → 真；**major 23 不支持**；须三段数字（`v22.19.0-rc.1` 判假） | `src-tauri/src/config/runtime.rs:524` |
| 捆绑版本 `NODE_VERSION = "v22.22.0"` | `src-tauri/src/config/constants.rs:4` |
| Node 二进制解析优先级：ABI 强制捆绑 > 本地兼容 > 已装捆绑 | `src-tauri/src/config/runtime.rs:243` |
| `find_user_pnpm` 在继承 PATH + 常见目录中查找，**排除应用自身 bin 目录** | `src-tauri/src/service/cli/path/pnpm.rs:17`、`:96` |
| `pnpm_env_value` 对自身 shim 目录返回 `None`（拒绝自身 shim） | `src-tauri/src/service/cli/path/pnpm.rs:89` |
| 用户 pnpm 存在则 `Pnpm::check_installed` 为真（记 `Detected user-installed pnpm, skipping bundled pnpm`） | `src-tauri/src/service/download/installable.rs:101` |
| 启动时注入 `DSH_PNPM`；捆绑优先时另注入 `DSH_PREFER_BUNDLED_PNPM=1` | `src-tauri/src/service/workflow/launch.rs:564`、`:579` |
| Dsh 官方源 `DSH_CORE_URL`，镜像前缀 `DSH_MIRROR_PREFIX="https://ghfast.top/"` | `src-tauri/src/config/constants.rs:13`、`:18`、`src-tauri/src/config/runtime.rs:94` |
| Dsh 尝试顺序 `vec![primary, mirror_download_url(&primary)]`：官方在前、镜像兜底 | `src-tauri/src/service/workflow/install.rs:155` |
| Node/pnpm/Git 为单一 URL，**无镜像回退** | `src-tauri/src/service/workflow/install.rs:167` |
| 切换源时 `tracker.update(0.0, "主下载源不可用，已切换镜像源重试（{host}）", ...)` | `src-tauri/src/service/download/core.rs:35` |
| 单源重试 `MAX_DOWNLOAD_ATTEMPTS = 5`，Range 续传，退避 2/4/8/8s | `src-tauri/src/service/download/core.rs:100`、`:162` |
| 重试耗尽 → `DOWNLOAD_INTERRUPTED: 下载中断（网络传输被重置），已自动重试 5 次仍失败…` | `src-tauri/src/service/download/core.rs:162` |
| URL 白名单：https + 主机白名单，否则 `DOWNLOAD_SOURCE_UNTRUSTED` / `DOWNLOAD_URL_INVALID` / `DOWNLOAD_URL_EMPTY` | `src-tauri/src/service/download/core.rs:251`、`:39` |
| Node 源按地域**二选一**（非回退列表）：`nodejs.org` vs `npmmirror.com` | `src-tauri/src/config/constants.rs:7`、`:10`、`src-tauri/src/config/region.rs:36` |
| pnpm 源同样地域二选一；`PNPM_VERSION="11.7.0"` | `src-tauri/src/config/constants.rs:21`、`:25`、`:45` |
| dsh release 元数据最多 3 次，退避 `500*(attempt+1)`ms；全败 `DSH_INTEGRITY_UNAVAILABLE` | `src-tauri/src/service/workflow/install.rs:62` |
| 校验入口 `verify_sha256` 位于下载后、解压前 | `src-tauri/src/service/workflow/install.rs:202`、`src-tauri/src/service/download/core.rs:276` |
| 校验规则：长度≠64 或非 hex → `INTEGRITY_METADATA_INVALID`；不等 → `INTEGRITY_CHECK_FAILED` | `src-tauri/src/service/download/core.rs:277` |
| 摘要来源：Node `SHASUMS256.txt`；Dsh `dsh_latest.digest`；Pnpm 常量；Git `get_mingit_sha256()` | `src-tauri/src/service/workflow/install.rs:179`、`src-tauri/src/service/download/core.rs:295` |
| 摘要缺失：Dsh `DSH_INTEGRITY_UNAVAILABLE: trusted release digest is required`；Node `INTEGRITY_METADATA_MISSING` | `src-tauri/src/service/workflow/install.rs:188`、`src-tauri/src/service/download/core.rs:304` |
| `CORE_INTEGRITY_*` 仅属核心槽位下载，**不在首装路径** | `src-tauri/src/service/core/version.rs:513`、`:531` |
| 暂存/备份命名 `.{leaf}.installing-{pid}` / `.{leaf}.backup` | `src-tauri/src/service/download/core.rs:474` |
| 暂存清理失败 `INSTALL_PATH_LOCKED: cannot remove {path}`（重试 40×250ms ≈ 10s） | `src-tauri/src/service/download/core.rs:481`、`:333` |
| 提交顺序：恢复 backup→dest（`INSTALL_RECOVERY_FAILED`）→ 删旧 backup → dest→backup（`INSTALL_BACKUP_FAILED`）→ staging→dest（失败回滚 + `INSTALL_COMMIT_FAILED`） | `src-tauri/src/service/download/core.rs:412` |
| rename 重试 60×500ms ≈ 30s | `src-tauri/src/service/download/core.rs:390` |
| 失败残留：仅下次安装开头清 staging；本次解压中途失败**不删** staging，旧 dest 完好 | `src-tauri/src/service/download/core.rs:518`、`:555` |
| 进度事件 `install-progress`，载荷 camelCase：`title`/`detail`/`log`/`type`/`percentage`/`progress` | `src-tauri/src/service/download/progress.rs:6`、`:75` |
| 50ms 节流 | `src-tauri/src/service/download/progress.rs:55` |
| 前端对 `percentage` 做**单调过滤**（只前进不后退），日志保留最近 5 条 | `src/store/modules/harness/store.ts:335` |
| Git 任务仅 Windows：`#[cfg(windows)] tasks.push(Box::new(download::Git))` | `src-tauri/src/service/workflow/install.rs:93`、`src-tauri/src/service/download/installable.rs:111` |
| Git 跳过：`find_system_git_binary()` 命中（`git --version` 成功且 `--exec-path` 下有 `git-remote-https.exe`） | `src-tauri/src/service/download/installable.rs:133`、`src-tauri/src/config/runtime.rs:387` |
| 非 Windows `git_runtime_ready` 恒真；`get_git_cmd_dir` 返回 `None` | `src-tauri/src/config/runtime.rs:442`、`:430` |
| MinGit 版本 `2.53.0.2`，文件名 `MinGit-2.53.0.2-64-bit.zip` / `…-arm64.zip`；其他架构 `MINGIT_PLATFORM_UNSUPPORTED` | `src-tauri/src/config/constants.rs:30`、`:41`、`src-tauri/src/config/runtime.rs:334` |
| 状态机 `Initial/Installing/Starting/Running/Stopped`；事件 `dsh-status-updated` | `src-tauri/src/service/workflow/status.rs:6`、`:26` |

---

### 首次装配主路径

### [P1] 验证首次启动自动装配并进入 Running

[Case ID] TC-DSK-L3-11-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/lifecycle.rs:86`、`:234`；`src-tauri/src/service/workflow/install.rs:53`
[自动化] 待接线（`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`）
[前置条件] 全新装配态（store `installed=false`，`$E2E_HOME/home/.dsh.dev` 下无 `dependencies/dsh`）；联网
[测试数据] 选择器 `dsh-setup-root`；启动阶段键 `status.installing`
[测试步骤] 1. 拉起应用并读取初始 `get_dsh_status`。2. 等待装配完成与服务健康。3. 读取最终状态与 `runtime_ready`。
[预期结果] 1. 初始状态为 `Initial` 或 `Installing`。2. 装配过程中推送 `dsh-status-updated=Installing`，完成后服务进入健康。3. 最终状态为 `Running`；`runtime_ready` 返回真。
[清理] 保留装配产物，或按测试隔离目录整体清理；`DELETE /session/<id>`

### [P1] 验证安装任务按固定顺序推进且进度阶段等权

[Case ID] TC-DSK-L3-11-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/install.rs:53`、`:98`、`:142`、`:207`；`src-tauri/src/service/download/progress.rs:105`
[自动化] 待接线（同上）
[前置条件] 同上；已订阅 `install-progress`
[测试数据] 期望任务顺序 `Nodejs` → `Dsh` → `Pnpm`（Windows 追加 `Git`）；非 Windows 6 阶段、Windows 8 阶段
[测试步骤] 1. 记录全部 `install-progress` 事件。2. 读取 `title` 序列。3. 读取 `type` 取值集合与 `percentage` 序列。
[预期结果] 1. 事件按任务顺序出现，`title` 序列与期望任务顺序一致。2. `type` 仅取 `download` 与 `extract` 两值，且同一任务内 download 先于 extract。3. `percentage` 非递减，且非 Windows 每阶段约 16.67%、Windows 约 12.5%（**不出现 0-50/50-100 的两段式**）。
[清理] `DELETE /session/<id>`

---

### 下载失败与完整性

### [P3] [反向] 验证摘要不匹配时安装失败且旧版本完好

[Case ID] TC-DSK-L3-11-011
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/download/core.rs:277`、`:412`、`:518`
[自动化] 待接线（同上）
[前置条件] 已有可用版本在盘；构造摘要与下载内容不一致
[测试数据] 篡改摘要或下载内容
[测试步骤] 1. 记录当前已装版本。2. 触发装配并等待失败。3. 读取返回错误与磁盘目录状态。
[预期结果] 1. 记录成功。2. 报错 `INTEGRITY_CHECK_FAILED: SHA-256 mismatch, expected {e}, got {a}`。3. 已装版本目录**未被替换**（提交阶段未执行）；本次可能残留 `.{leaf}.installing-{pid}` 暂存目录，且该目录在下次安装开头被清理。
[清理] 清理可能残留的暂存目录；`DELETE /session/<id>`

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-11-003` | 验证四项就绪时 runtime_ready 为真且不触发安装 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-004` | 验证运行时文件在盘但记录显示未安装时自愈补记 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-005` | 验证本机兼容 Node 被复用而不下载内置运行时 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-006` | 验证用户已装 pnpm 时跳过捆绑 pnpm | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-007` | 验证本机 Node 为 v23 时不兼容并回退内置运行时 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-008` | 验证安装过程中重复触发安装被抑制 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-009` | 验证官方源失败时切换镜像兜底成功 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-010` | 验证 SHA-256 摘要缺失时安全中止 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-012` | 验证下载中断自动重试并给出可判定错误 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-013` | 验证非白名单下载源被拒绝 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-014` | 验证 Windows 追加 Git 任务且非 Windows 不出现 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/bridge/lifecycle.rs:86`、`:234`；`src-tauri/src/service/workflow/install.rs:53`` | `TC-DSK-L3-11-001` | 正向 |
| ``src-tauri/src/service/workflow/install.rs:53`、`:98`、`:142`、`:207`；`src-tauri/src/service/download/progress.rs:105`` | `TC-DSK-L3-11-002` | 正向 |
| ``src-tauri/src/service/download/core.rs:277`、`:412`、`:518`` | `TC-DSK-L3-11-011` | 异常 |

---

### 缺口与假设

- **G-D11-1**：本文件是整个套件中**最依赖真实网络**的部分。按 `00-overview.md` G7，离线环境应整体跳过摘要校验相关用例（`TC-DSK-L3-11-011`），而非判为失败。
- **G-D11-2**：`TC-DSK-L3-11-001` 需要「全新装配态」。`setting.installed=false` 的唯一写入点是启动时 node/dsh 二进制缺失（`launch.rs:170`），因此接线时应通过隔离数据目录 + 删除 `dependencies/dsh` 来构造，**不得改动开发者本机真实 `~/.dsh.dev`**（按 `00-overview.md` §5.3，`~/.dsh.dev` 在测试中一律指 `$E2E_HOME/home/.dsh.dev`）。
- **G-D11-3**：首装进度为**等权阶段**（Windows 8 阶段 / 非 Windows 6 阶段），归档旧文档中的「下载 0-50、解压 50-100」只适用于核心槽位下载（`service/core/version.rs:517`）。`TC-DSK-L3-11-001` 明确断言这一点，不得按旧文档改写。
- **G-D11-4**：前端对 `percentage` 做单调过滤（`store.ts:335`），因此断言必须取「非递减」而非「严格递增」；`payload.type` 是字段名（源为 `r#type`），旧文档中的 `phase` 命名不存在。
- **G-D11-5**：`install-progress` 有 50ms 节流（`progress.rs:55`），断言事件条数时不可依赖固定数量，只可依赖顺序与取值集合。
- **G-D11-6**：三个提交阶段失败分支（`INSTALL_RECOVERY_FAILED` / `INSTALL_BACKUP_FAILED` / `INSTALL_COMMIT_FAILED`）需要制造 rename 失败（如句柄独占），构造成本高，登记为已知盲区。
- **假设**：默认在 Windows 上执行；Node/pnpm 走地域二选一（非回退），镜像兜底断言只对 Dsh 核心任务成立。

---

## 2. 端口与数据隔离

桌面端以构建类型（debug / release）为界，把端口、数据目录、store 文件与可执行核心目录逐层切开，使开发版与已安装版本可以并存而不互写。本文件验证这条边界是外部可观察的事实：默认端口、占用回退、残留清扫与目录归属都必须能由窗口、命令返回值与落盘路径证明，而不是只存在于注释的意图里。

本文件全部路径均在 `$E2E_HOME` 之下（`docs/specs/desktop.test.md` §6）。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `default_port()` = `cfg!(debug_assertions) ? DSH_DEV_PORT(3081) : DSH_PORT(3080)` | `src-tauri/src/config/setting.rs:149`；`src-tauri/src/config/constants.rs:50`、`:53` |
| `get_dsh_data_path`：debug 恒 `$E2E_HOME/home/.dsh.dev`（忽略 `DSH_HOME`）；release 优先非空 `DSH_HOME`，否则 `<home>/.dsh` | `src-tauri/src/config/runtime.rs:471`、`:455`、`:482` |
| Store 文件名：生产 `.store.dat` / 开发 `.store.dev.dat` / **E2E `.store.test.dat`**，位于 tauri store 的 AppData 根（不在 `dev` 子目录）；首装检测同源同文件名 | `src-tauri/src/config/setting.rs`（`store_dat_file_name`）、`:214`、`:230`；常量在 `config/constants.rs` |
| `get_base_dir` = debug `AppData/dev` : release `AppData`；其下放核心可执行物（`runtime`、`dependencies/dsh`、`dependencies/pnpm`、`dependencies/git`、`logs`） | `src-tauri/src/config/runtime.rs:17`、`:273`、`:491`；`src-tauri/src/config/constants.rs:63` |
| 端口回退 `find_available_port_by` 从 start 起 `checked_add(1)` 找首个空闲；`u16::MAX` 仍占用报 `PORT_EXHAUSTED: no available TCP port after the configured port` | `src-tauri/src/service/workflow/launch.rs:66`、`:75`、`:85` |
| `is_port_in_use` = 绑 `127.0.0.1:port` 失败即占用；调用前 `wait_for_port_release`（≤1500ms） | `src-tauri/src/service/workflow/utils.rs:154`；`src-tauri/src/service/workflow/launch.rs:48` |
| 端口自愈 `heal_target = setting.manual_port.unwrap_or(default_port())`，仅目标空闲时回落，最终端口写回 store | `src-tauri/src/service/workflow/launch.rs:98`、`:319`；`src-tauri/src/bridge/config.rs:48` |
| 启动参数 `--profile <active> --port <n>`（可选 `--no-open`、`--skip-auth`），**未传 `--host`** | `src-tauri/src/service/workflow/launch.rs:638`、`:645`、`:753` |
| `--no-open` 首个支持版本 `0.1.0-rc.8`，按实际将执行的 `bin.js` 判定 | `src-tauri/src/service/workflow/launch.rs:119`、`:144`、`:592` |
| Windows 经 `win_spawn::spawn_with_hidden_console_owned`（`CREATE_NEW_CONSOLE`+`SW_HIDE`）分配隐藏控制台 | `src-tauri/src/service/workflow/win_spawn.rs:144`、`:147`、`:162`；`src-tauri/src/service/workflow/launch.rs:625` |
| Unix 用 `.process_group(0)` 独立进程组 + 空 stdin | `src-tauri/src/service/workflow/launch.rs:766`、`:771` |
| Windows 早退重试：探测 ≤2.5s，命中 `duplicate loader entry` 签名则重置档案根重试，最多 3 次 | `src-tauri/src/service/workflow/launch.rs:665`、`:684`、`:256` |
| `.harness.pid` = `$DSH_HOME/.harness.pid`（两行：PID、端口），spawn 成功后落盘 | `src-tauri/src/service/workflow/sweep.rs:16`；`src-tauri/src/service/workflow/launch.rs:854` |
| 孤儿清扫双重确认：LISTENING 端口的 owner PID 必须等于文件 PID，否则不动；`port_owner_pid` 为探测函数 | `src-tauri/src/service/workflow/sweep.rs:34`、`:76` |
| `terminate_stale_harness_processes` 在 debug 为 no-op | `src-tauri/src/service/workflow/process.rs:357` |
| 迁移：debug 直接 `Ok`；release 检查 `dsh_home_migrated` 幂等标记 | `src-tauri/src/service/migrate.rs:38`；`src-tauri/src/desktop/builder.rs:108` |

---

### 端口默认值与占用回退

### [P1] 验证 debug 默认端口为 3081 且可读回配置

[Case ID] TC-DSK-L3-11-015
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/config/setting.rs:149`；`src-tauri/src/config/constants.rs:53`
[自动化] 待接线（`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`）
[前置条件] Debug 二进制；`$E2E_HOME` 下无历史 store（首次启动）
[测试数据] 期望端口 `3081`
[测试步骤] 1. 启动应用并等待 `ready`。2. 读取 `get_runtime_info().service_url`。3. 读取已保存的 `port`。
[预期结果] 1. 应用进入 `ready`。2. `service_url` 为 `http://127.0.0.1:3081`。3. 已保存 `port` 等于 `3081`。
[清理] `DELETE /session/<id>`

### [P1] 验证默认端口被占用时自动递增避让

[Case ID] TC-DSK-L3-11-016
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/launch.rs:66`、`:85`
[自动化] 待接线（同上）
[前置条件] 测试侧先占用 `127.0.0.1:3081`
[测试数据] 占用端口 `3081`；期望服务落在 `3082`
[测试步骤] 1. 占用 `3081`。2. 启动应用并等待服务健康。3. 读取 `service_url` 与已保存 `port`。
[预期结果] 1. 占用成功。2. 服务进入运行中。3. `service_url` 使用 `3082`，已保存 `port` 同步为 `3082`。
[清理] 释放测试占用的端口；`DELETE /session/<id>`

---

### 子进程启动与平台隔离

### [P1] 验证服务使用当前档案与配置端口启动

[Case ID] TC-DSK-L3-11-020
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/launch.rs:638`、`:640`、`:642`
[自动化] 待接线（同上）
[前置条件] 当前档案非默认档案（如已新建 `args-check`）
[测试数据] 观察点：服务子进程命令行
[测试步骤] 1. 切到目标档案并启动服务。2. 读取服务子进程命令行。3. 读取当前档案与端口。
[预期结果] 1. 服务进入运行中。2. 命令行含 `--profile <当前档案>` 与 `--port <配置端口>`；**不含** `--host`。3. 命令行中的档案与端口和运行期真值一致。
[清理] 切回原档案并重启；删除测试档案；`DELETE /session/<id>`

---

### 数据目录与残留清扫隔离

### [P1] 验证 debug 数据目录恒为 $E2E_HOME/home/.dsh.dev 且忽略 DSH_HOME

[Case ID] TC-DSK-L3-11-023
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/config/runtime.rs:471`、`:455`、`:482`；`src-tauri/src/config/constants.rs:61`
[自动化] 待接线（同上）
[前置条件] 启动前设置非空 `DSH_HOME` 指向一个可区分的临时目录
[测试数据] `DSH_HOME=$E2E_HOME/decoy`；期望 `data_dir = $E2E_HOME/home/.dsh.dev`
[测试步骤] 1. 带上述 `DSH_HOME` 启动应用。2. 读取 `get_runtime_info().data_dir`。3. 读取「应用」面板显示的数据目录文本。
[预期结果] 1. 应用进入 `ready`。2. `data_dir` 为 `$E2E_HOME/home/.dsh.dev`，不等于 `DSH_HOME` 的值。3. 面板文本与 `data_dir` 一致。
[清理] 删除诱饵目录；`DELETE /session/<id>`

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-11-017` | 验证端口段耗尽时报可判定错误 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-018` | 验证重启前等待旧端口释放 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-019` | 验证端口避让后回落到设置端口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-021` | 验证 dsh 版本低于 rc.8 时不传 --no-open | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-022` | 验证 Windows 早退命中重复装载签名后重试 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-024` | 验证 debug 的 store 与可执行核心落在独立位置 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-025` | 验证残留标记落盘并按 PID 与端口双确认清扫 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-026` | 验证 debug 构建不执行旧数据迁移 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/config/setting.rs:149`；`src-tauri/src/config/constants.rs:53`` | `TC-DSK-L3-11-015` | 正向 |
| ``src-tauri/src/service/workflow/launch.rs:66`、`:85`` | `TC-DSK-L3-11-016` | 正向 |
| ``src-tauri/src/service/workflow/launch.rs:638`、`:640`、`:642`` | `TC-DSK-L3-11-020` | 正向 |
| ``src-tauri/src/config/runtime.rs:471`、`:455`、`:482`；`src-tauri/src/config/constants.rs:61`` | `TC-DSK-L3-11-023` | 正向 |

---

### 缺口与假设

- **G-D11-7**：TC-DSK-L3-11-019 需要先构造「已自动避让递增」的中间态（占用 `manual_port` → 启动 → 释放），再断言回落。构造步骤本身会拉起额外实例，接线时必须保证清扫与端口释放先完成，否则用例会观测到递增中间态而非回落结果。
- **G-D11-8**：TC-DSK-L3-11-022 需要把当前档案根构造成 `duplicate loader entry` 早退状态，且「重试次数不超过 3」只能从日志行断言。当前无结构化日志采集出口，接线时需在编排层解析服务日志，或在具备只读诊断出口前降级为「最终状态健康」。
- **G-D11-9**：TC-DSK-L3-11-025 只覆盖「标记 PID == 端口占用者」的正向分支。「标记不可解析 → 仅清标记」「端口占用者非标记 PID → 不动」「探测不到占用者 → 不动」三条负向分支（`sweep.rs:46-66`）**未覆盖**，需要构造一个非本应用占用同端口的场景。
- **G-D11-10**：debug 与 release 的并存隔离（3081/3080、`.dsh.dev`/`.dsh`、`.store.dev.dat`/`.store.dat`、app-data 根与 `dev` 子目录）是本文件的核心主张，但单次 L3 运行只能拉起一个构建。需两条流水线并发执行，或分两次运行后比对路径集合；当前无该编排。
- **G-D11-11**：store 键 `window_state`、`pet_window_state`、`desktop_pending_installer` 与 `setting` 的隔离只做了基线登记。本文件断言到 store 文件名与位置（TC-DSK-L3-11-024），**未逐键断言**；键级归属归 `01`、`09` 与桌宠用例集（`plugins/02-dsh-tauri-pet.md`）。
- **G-D11-12**：TC-DSK-L3-11-017 需要把 store 端口写成 `65535`。壳层端口输入域的合法上限正是 `65535`（`src/ui/config/debug.tsx:143-146`），可经 UI 构造，但该用例会短暂占用最后一档端口，接线时须与其它用例串行。
- **假设**：store 真值一律以运行期回读为准（同 `02-config-locale.md` 的「应用设置」模块），TC-DSK-L3-11-024 是唯一按落盘路径断言的用例；前置构造的目录与占用进程一律由测试侧自行清理。

---

## 3. 隐私、本地监听与运行时信息

本文件验证三条对外承诺：宿主只与本机回环地址通信、不向任何远端上传遥测、运行时信息与日志只在本机留存并以最小必要范围暴露。断言只取外部可观察事实（监听地址、子进程环境、命令返回值、落盘文件），不采信代码注释里的意图陈述。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| `loopback_http_client(timeout)` = `no_proxy()` + `timeout()`，禁用 `HTTP_PROXY`/`ALL_PROXY` 劫持回环探测 | `src-tauri/src/service/workflow/utils.rs:15` |
| 探测地址硬编码 `http://127.0.0.1:<port>`（旧版兼容入口与 boot 图入口同源） | `src-tauri/src/service/workflow/utils.rs:32`、`:85` |
| `DSH_HOST = "http://127.0.0.1"`，仅供 `get_dsh_service_url(port)` 拼地址 | `src-tauri/src/config/constants.rs:48`；`src-tauri/src/config/format.rs:4` |
| 启动参数为 `--profile <p> --port <n>`（可选 `--no-open`、`--skip-auth`），**不传 `--host`**，Windows 与 Unix 分支一致 | `src-tauri/src/service/workflow/launch.rs:640`、`:753` |
| 子进程环境注入 `DSH_TELEMETRY_DISABLED=1` | `src-tauri/src/service/workflow/launch.rs:510` |
| 插件安装子进程同样注入 `DSH_TELEMETRY_DISABLED=1` | `src-tauri/src/service/plugin/install/env.rs:39` |
| 三份 shim 文本（cmd / ps1 / sh）均硬编码 `DSH_TELEMETRY_DISABLED` | `src-tauri/src/service/cli/shim/build.rs:52`、`:100`、`:132` |
| 唯一的 `telemetry` 命中是补丁层测试夹具字符串 `session-telemetry-otel` | `src-tauri/src/service/plugin/patch_guard.rs:215` |
| `RuntimeInfo` 8 字段（snake_case）：`app_version`/`dsh_version`/`node_version`/`service_url`/`data_dir`/`log_path`/`platform`/`arch` | `src-tauri/src/config/runtime.rs:587` |
| `get_runtime_info` 以 `core::active_version` 覆写 `dsh_version`；命令入口先读 store 端口 | `src-tauri/src/bridge/system_os.rs:21` |
| `proxy_health_check` 命令入口先读 store 端口，再转发 | `src-tauri/src/bridge/system_os.rs:13` |
| 无持有进程时按 `LAUNCH_GUARD` 返回 `HARNESS_NOT_OWNED` 或 `HARNESS_NOT_READY: Harness service is still starting` | `src-tauri/src/service/workflow/health.rs:60`、`:34` |
| 就绪要求全部客户端模块可用：`all_client_modules_ready` 需 `total > 0 && ready == total` | `src-tauri/src/service/workflow/health.rs:55`、`:93` |
| 探测的归属门：就绪 = `has_owned_process() && is_dsh_running(port)` | `src-tauri/src/task/tick_check_dsh_process/mod.rs:16` |
| `is_dsh_running(port)` 用 2 秒超时回环客户端并要求 `/` 返回 HTTP 200 | `src-tauri/src/service/workflow/utils.rs:130` |
| 日志只落本机：服务 `logs/dsh-web.log`（debug `logs/dsh-web.dev.log`）、桌面端 `logs/desktop.log`、前端 `logs/desktop.frontdesk.log` | `src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167` |
| `read_run_logs` 输出四段 `### 环境信息` / `### 服务日志` / `### 前台日志` / `### 后台日志`，每段上限 `MAX_LINES = 100`（前端取半数） | `src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167` |
| 环境段含 app 版本、dsh 版本、node 版本、os 与 arch，即支持包内容 | `src-tauri/src/bridge/system_os.rs:198` |
| `open_external_url` 仅接受 `http://` / `https://`，否则 `EXTERNAL_URL_INVALID: {url}` | `src-tauri/src/bridge/system_os.rs:239` |
| `reveal_in_folder` 越界返回 `REVEAL_PATH_REJECTED: {path}`；`open_dir` 越界返回 `OPEN_DIR_REJECTED: {path}` | `src-tauri/src/bridge/system_os.rs:55`、`:66` |
| 允许根 = 系统下载目录、应用数据目录、`$DSH_HOME`（测试中即 `$E2E_HOME/home/.dsh.dev`，§5.3），外加本地核心包目录；两侧 canonicalize 后比较路径组件 | `src-tauri/src/bridge/guard.rs:18`、`:50` |

---

### 本地监听边界

### [P1] 验证服务只监听回环地址

[Case ID] TC-DSK-L3-11-027
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/config/constants.rs:48`；`src-tauri/src/config/format.rs:4`；`src-tauri/src/service/workflow/launch.rs:640`、`:753`
[自动化] 待接线（`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`）
[前置条件] 服务处于运行中；已具备枚举本机监听地址的手段
[测试数据] 当前服务端口 `3081`；观察点：本机所有网卡的监听列表
[测试步骤] 1. 读取当前服务端口。2. 枚举该端口上的全部监听地址。3. 从非回环网卡地址请求该端口。
[预期结果] 1. 读取成功。2. 监听地址全部为 `127.0.0.1:<port>` 或 `[::1]:<port>`，不存在 `0.0.0.0` 或具体外部网卡地址。3. 非回环地址连接失败。
[清理] `DELETE /session/<id>`

---

### 无遥测与最小暴露

### [P1] 验证服务子进程环境关闭遥测

[Case ID] TC-DSK-L3-11-030
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/launch.rs:510`；`src-tauri/src/service/plugin/install/env.rs:39`
[自动化] 待接线（`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`）
[前置条件] 服务处于运行中；已具备读取服务子进程环境块的手段
[测试数据] 期望 `DSH_TELEMETRY_DISABLED=1`
[测试步骤] 1. 读取服务子进程的环境变量集合。2. 在同一环境块中查找遥测相关变量的取值。
[预期结果] 1. 读取成功。2. `DSH_TELEMETRY_DISABLED` 存在且值为 `1`，不存在未关闭遥测的取值。
[清理] `DELETE /session/<id>`

### [P4] 验证文件系统命令拒绝允许根之外的路径

[Case ID] TC-DSK-L3-11-033
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/bridge/system_os.rs:55`、`:66`；`src-tauri/src/bridge/guard.rs:18`、`:50`
[自动化] 待接线（`test/e2e/desktop/11-assembly-isolation-privacy.e2e.ts`）
[前置条件] 应用处于 `ready`；已存在允许根内的一个真实文件与一个真实目录，以及允许根外的一个真实文件与一个真实目录
[测试数据] 允许根内 `<allowed_root>/<file>`、`<allowed_root>/<dir>`；允许根外 `<system_dir>/<file>`、`<system_dir>/<dir>`
[测试步骤] 1. 以允许根内的文件调用 `reveal_in_folder`。2. 以允许根外的文件调用 `reveal_in_folder`。3. 以允许根内的目录调用 `open_dir`。4. 以允许根外的目录调用 `open_dir`。
[预期结果] 1. 调用成功返回。2. 调用失败，错误以 `REVEAL_PATH_REJECTED:` 开头并回显路径。3. 调用成功返回。4. 调用失败，错误以 `OPEN_DIR_REJECTED:` 开头并回显路径。
[清理] 关闭被拉起的文件管理器窗口；`DELETE /session/<id>`

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-11-028` | 验证回环健康探测不受代理环境变量影响 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-029` | 验证目标端口被他人占用时不误判为就绪 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-031` | 验证运行期信息只含本机环境字段 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-032` | 验证非 http 协议的外部链接被拒绝 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-034` | 验证运行日志四段结构与本机落盘 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-11-035` | 验证前台日志段行数上限为服务段的一半 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/config/constants.rs:48`；`src-tauri/src/config/format.rs:4`；`src-tauri/src/service/workflow/launch.rs:640`、`:753`` | `TC-DSK-L3-11-027` | 正向 |
| ``src-tauri/src/service/workflow/launch.rs:510`；`src-tauri/src/service/plugin/install/env.rs:39`` | `TC-DSK-L3-11-030` | 正向 |
| ``src-tauri/src/bridge/system_os.rs:55`、`:66`；`src-tauri/src/bridge/guard.rs:18`、`:50`` | `TC-DSK-L3-11-033` | 边界 |

---

### 缺口与假设

- **G-D11-13**：TC-DSK-L3-11-030 需要读取服务子进程的环境块。当前无该能力的现成出口，接线时需在测试编排层读取（例如启动子进程快照）或增加只读诊断命令。在具备该能力前，闭环证据只能覆盖 shim 文本一侧。
- **G-D11-14**：「无任何遥测/分析上传代码」这一事实来源于对 `src`、`src-tauri/src`、`package.json`、`Cargo.toml` 的关键字检索（`sentry`/`posthog`/`analytics`/`gtag`/崩溃上报均无命中），属**静态证据**而非运行时证据。本文件只能断言「宿主显式注入关闭标志」与「不存在凭据类字段」；「运行期确实没有出站连接」需要网络层捕获，**未覆盖**（见 G-D11-15）。
- **G-D11-15**：TC-DSK-L3-11-027 断言监听地址与外部网卡不可达，覆盖的是**入站**面。**出站**面（应用进程是否向远端建立连接）需要防火墙或抓包手段，属环境依赖项，当前无该编排。
- **G-D11-16**：TC-DSK-L3-11-029 构造的是「同端口上存在他人 HTTP 200 服务」的场景。归属门为 `has_owned_process() && is_dsh_running(port)`，本用例覆盖「非本应用进程时结果不健康」；反向的「本应用持有进程但端口上是他人服务」需要杀掉 dsh 后用同 PID 占位，**未覆盖**（不可构造）。
- **G-D11-17**：`--host` 未被传递（Windows 与 Unix 分支均只见 `--profile`/`--port`/可选 `--no-open`/`--skip-auth`），因此绑定地址取决于 dsh 自身默认值。TC-DSK-L3-11-027 以**实际监听地址**为准，不假设也不断言该默认值的具体实现；若上游默认值变更，本用例会以真实观测结果失败，属预期行为。
- **G-D11-18**：TC-DSK-L3-11-035 的前端段行数上限来自 `FRONTEND_MAX_LINES = MAX_LINES / 2`。断言「不超过 50」在日志不足 50 行时恒真，接线时必须先确保前端日志已超过 100 行，否则该用例退化为无效断言。
- **假设**：所有探测命令（`get_runtime_info`、`proxy_health_check`、`read_run_logs`、`open_external_url`、`reveal_in_folder`、`open_dir`）均可由测试编排直接调用；这些命令当前无 `data-testid` 前置，属 G3 范畴。
