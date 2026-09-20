# 首次装配与依赖安装

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/20-assembly.e2e.ts`（待建立）
> 前置：`07-harness-lifecycle.md` 通过；可构造全新装配态（store `installed=false`）
> 运行：`vitest --project desktop -- test/e2e/desktop/20-assembly.e2e.ts`（待配置，见 G2）

首次装配是桌面端唯一「带真实下载、解压、落盘、校验」的流程，也是首次启动体验的全部。本文件覆盖任务编排、进度事件、复用与跳过、失败恢复四类行为。

---

## 1. 事实基线

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

## 2. 首次装配主路径

### [P1] 验证首次启动自动装配并进入 Running

[Case ID] TC-DSK-L3-20-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/lifecycle.rs:86`、`:234`；`src-tauri/src/service/workflow/install.rs:53`
[自动化] 待接线（`test/e2e/desktop/20-assembly.e2e.ts`）
[前置条件] 全新装配态（store `installed=false`，`$E2E_HOME/home/.dsh.dev` 下无 `dependencies/dsh`）；联网
[测试数据] 选择器 `dsh-setup-root`；启动阶段键 `status.installing`
[测试步骤] 1. 拉起应用并读取初始 `get_dsh_status`。2. 等待装配完成与服务健康。3. 读取最终状态与 `runtime_ready`。
[预期结果] 1. 初始状态为 `Initial` 或 `Installing`。2. 装配过程中推送 `dsh-status-updated=Installing`，完成后服务进入健康。3. 最终状态为 `Running`；`runtime_ready` 返回真。
[清理] 保留装配产物，或按测试隔离目录整体清理；`DELETE /session/<id>`

### [P1] 验证安装任务按固定顺序推进且进度阶段等权

[Case ID] TC-DSK-L3-20-002
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

## 3. 下载失败与完整性

### [P3] [反向] 验证摘要不匹配时安装失败且旧版本完好

[Case ID] TC-DSK-L3-20-011
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/download/core.rs:277`、`:412`、`:518`
[自动化] 待接线（同上）
[前置条件] 已有可用版本在盘；构造摘要与下载内容不一致
[测试数据] 篡改摘要或下载内容
[测试步骤] 1. 记录当前已装版本。2. 触发装配并等待失败。3. 读取返回错误与磁盘目录状态。
[预期结果] 1. 记录成功。2. 报错 `INTEGRITY_CHECK_FAILED: SHA-256 mismatch, expected {e}, got {a}`。3. 已装版本目录**未被替换**（提交阶段未执行）；本次可能残留 `.{leaf}.installing-{pid}` 暂存目录，且该目录在下次安装开头被清理。
[清理] 清理可能残留的暂存目录；`DELETE /session/<id>`

## 4. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-20-003` | 验证四项就绪时 runtime_ready 为真且不触发安装 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-004` | 验证运行时文件在盘但记录显示未安装时自愈补记 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-005` | 验证本机兼容 Node 被复用而不下载内置运行时 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-006` | 验证用户已装 pnpm 时跳过捆绑 pnpm | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-007` | 验证本机 Node 为 v23 时不兼容并回退内置运行时 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-008` | 验证安装过程中重复触发安装被抑制 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-009` | 验证官方源失败时切换镜像兜底成功 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-010` | 验证 SHA-256 摘要缺失时安全中止 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-012` | 验证下载中断自动重试并给出可判定错误 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-013` | 验证非白名单下载源被拒绝 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-20-014` | 验证 Windows 追加 Git 任务且非 Windows 不出现 | 纯逻辑断言，下沉单元测试层 |

---

## 5. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/bridge/lifecycle.rs:86`、`:234`；`src-tauri/src/service/workflow/install.rs:53`` | `TC-DSK-L3-20-001` | 正向 |
| ``src-tauri/src/service/workflow/install.rs:53`、`:98`、`:142`、`:207`；`src-tauri/src/service/download/progress.rs:105`` | `TC-DSK-L3-20-002` | 正向 |
| ``src-tauri/src/service/download/core.rs:277`、`:412`、`:518`` | `TC-DSK-L3-20-011` | 异常 |

---

## 6. 缺口与假设

- **G-D20-1**：本文件是整个套件中**最依赖真实网络**的部分。按 `00-overview.md` G7，离线环境应整体跳过摘要校验相关用例（`TC-DSK-L3-20-011`），而非判为失败。
- **G-D20-2**：`TC-DSK-L3-20-001` 需要「全新装配态」。`setting.installed=false` 的唯一写入点是启动时 node/dsh 二进制缺失（`launch.rs:170`），因此接线时应通过隔离数据目录 + 删除 `dependencies/dsh` 来构造，**不得改动开发者本机真实 `~/.dsh.dev`**（按 `00-overview.md` §5.3，`~/.dsh.dev` 在测试中一律指 `$E2E_HOME/home/.dsh.dev`）。
- **G-D20-3**：首装进度为**等权阶段**（Windows 8 阶段 / 非 Windows 6 阶段），归档旧文档中的「下载 0-50、解压 50-100」只适用于核心槽位下载（`service/core/version.rs:517`）。`TC-DSK-L3-20-001` 明确断言这一点，不得按旧文档改写。
- **G-D20-4**：前端对 `percentage` 做单调过滤（`store.ts:335`），因此断言必须取「非递减」而非「严格递增」；`payload.type` 是字段名（源为 `r#type`），旧文档中的 `phase` 命名不存在。
- **G-D20-5**：`install-progress` 有 50ms 节流（`progress.rs:55`），断言事件条数时不可依赖固定数量，只可依赖顺序与取值集合。
- **G-D20-6**：三个提交阶段失败分支（`INSTALL_RECOVERY_FAILED` / `INSTALL_BACKUP_FAILED` / `INSTALL_COMMIT_FAILED`）需要制造 rename 失败（如句柄独占），构造成本高，登记为已知盲区。
- **假设**：默认在 Windows 上执行；Node/pnpm 走地域二选一（非回退），镜像兜底断言只对 Dsh 核心任务成立。
