# 系统集成、路径守卫、跨平台与 Windows 极简模式

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/29-system-integration.e2e.ts`（待建立）
> 前置：`01-window-boot.md` 通过；应用处于 `ready`；Windows 用例需 Windows 宿主
> 运行：`vitest --project desktop -- test/e2e/desktop/29-system-integration.e2e.ts`（待配置，见 G2）

壳层与操作系统的接触面由 `bridge/system_os.rs` 收口：唤起浏览器与文件管理器、读写日志、代理健康检查、透传前端日志。本文件的重点是**这些接触面同时是安全边界**——来自可被第三方插件注入脚本操纵的 iframe 的路径参数必须被白名单限制，越界即拒绝；其次是 Windows 极简模式的落盘修复与平台门控。

---

## 1. 事实基线

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

## 2. 路径守卫与系统唤起

### [P1] 验证在文件夹中显示允许根内的文件

[Case ID] TC-DSK-L3-29-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/system_os.rs:52-58`；`src-tauri/src/bridge/guard.rs:18-34`；`src/layout/index.tsx:113-118`
[自动化] 待接线（`test/e2e/desktop/29-system-integration.e2e.ts`）
[前置条件] 应用处于 `ready`；系统下载目录内存在一个普通文件
[测试数据] 路径 = `<系统下载目录>/<已存在文件>`
[测试步骤] 1. 调用 `reveal_in_folder` 传入该路径。2. 读取返回结果与系统文件管理器唤起记录。
[预期结果] 1. 返回成功（无错误文本）。2. 未出现 `REVEAL_PATH_REJECTED`，调用被交给系统文件管理器。
[清理] 删除构造的文件；`DELETE /session/<id>`

---

## 3. 日志与运行时诊断

### [P1] 验证运行时诊断文本框返回完整四段

[Case ID] TC-DSK-L3-29-006
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167`、`:198-210`、`:216-222`；`src/layout/components/setup.tsx:28`
[自动化] 待接线（`test/e2e/desktop/29-system-integration.e2e.ts`）
[前置条件] 应用处于 `ready`；`logs/desktop.log` 与 `logs/desktop.frontdesk.log` 均存在且行数分别超过 100 与 50；服务日志存在
[测试数据] 调用 `read_run_logs` 的返回文本
[测试步骤] 1. 调用 `read_run_logs`。2. 读取返回文本中的段标题。3. 分段统计行数并读取环境段字段。
[预期结果] 1. 调用成功返回文本。2. 依次出现 `### 环境信息`、`### 服务日志`、`### 前台日志`、`### 后台日志` 四段。3. 服务段与后台段各不超过 100 行、前台段不超过 50 行；环境段含 app 版本、dsh 版本、node 版本、os 与 arch。
[清理] `DELETE /session/<id>`

---

## 4. Windows 极简模式（Windows 专属）

### [P1] 验证官方内置 inspector 的核心不再挂载社区注入

[Case ID] TC-DSK-L3-29-010
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/win_inspector.rs:398-406`、`:410-418`；`src-tauri/src/service/plugin/install/single.rs:391-395`
[自动化] 待接线（`test/e2e/desktop/29-system-integration.e2e.ts`）
[前置条件] Windows 宿主；活动核心版本 ≥ `0.1.0-rc.8`；活动档案的 `cordis.patch.yml` 内含本插件的遗留 `- insert:` 块
[测试数据] 观察点：`$E2E_HOME/home/.dsh.dev/profiles/<档案>/cordis.patch.yml`（§5.3）、桌面端日志
[测试步骤] 1. 读取 patch 文件并确认遗留块存在。2. 触发一次会调用 `win_inspector::apply` 的流程（启动自愈或插件操作）。3. 重新读取 patch 文件与日志。
[预期结果] 1. 遗留块存在。2. 流程完成且无 `PATCH_*` 错误。3. patch 中不再含 `win-terminal-inspector`，且未追加新的挂载块；日志出现「provides the official Windows process inspector」。
[清理] 恢复 patch 文件原始内容；`DELETE /session/<id>`

---

## 5. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-config-reveal-data-dir` | 「打开数据目录」按钮 | 待补 |
| `dsh-config-clear-service-logs` | 清空日志按钮 | 待补 |
| `dsh-config-service-logs` | 日志展示区 | 待补 |
| `dsh-config-core-open-dir` | 核心「打开目录」按钮 | 待补 |
| `dsh-toast-download-show-in-folder` | 下载完成提示的「在文件夹中显示」动作 | 待补 |

---

## 6. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-29-002` | 验证拒绝定位允许根之外的文件 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-003` | 验证拒绝打开允许根之外的目录 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-005` | 验证拒绝非 http(s) 方案的外部链接 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-007` | 验证服务日志按 64 KiB 取尾且不截断多字节字符 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-009` | 验证无持有进程时健康检查返回可区分的失败信号 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-011` | 验证 rc.6/rc.7 已装插件时写入显式入口挂载并创作 preset | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-012` | 验证挂载幂等且遗留裸包名被迁移为显式入口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-013` | 验证非 Windows 平台极简模式修复为无操作 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-29-014` | 验证 pnpm-workspace 多文档被自愈归一化为单文档 | 纯逻辑断言，下沉单元测试层 |

---

## 7. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/bridge/system_os.rs:52-58`；`src-tauri/src/bridge/guard.rs:18-34`；`src/layout/index.tsx:113-118`` | `TC-DSK-L3-29-001` | 正向 |
| ``src-tauri/src/bridge/system_os.rs:164`、`:165`、`:167`、`:198-210`、`:216-222`；`src/layout/components/setup.tsx:28`` | `TC-DSK-L3-29-006` | 正向 |
| ``src-tauri/src/service/workflow/win_inspector.rs:398-406`、`:410-418`；`src-tauri/src/service/plugin/install/single.rs:391-395`` | `TC-DSK-L3-29-010` | 正向 |

---

## 8. 缺口与假设

- **G-D29-1**：`reveal_in_folder` / `open_dir` / `reveal_data_dir` 只断言桥接层成功返回与错误串，**不验证系统文件管理器/浏览器的实际呈现**（属系统表面，见 `00-overview.md` G9）。人工确认项。
- **G-D29-2**：`open_external_url` 的方案判定是**字面前缀匹配**（`src-tauri/src/bridge/system_os.rs:240`），`HTTPS://` 或 `https:/` 一类变体的行为由实现决定，本套未断言；接线前需要先确认期望语义，否则会把实现的宽松/严格当成缺陷。
- **G-D29-3**：跨平台打包配置（`bundle.targets = "all"`、macOS `hardenedRuntime` + `Info.plist` + `Entitlements.plist`、Windows NSIS/WiX）是**构建期**事实，无法在真实窗口的页面内断言。本文件只把它们登记为事实基线；若需覆盖，应另立构建产物校验批次（对 `.app` / `.dmg` / `.exe` 的签名与 plist 键做静态检查），不在 L3 页面用例内实现。
- **G-D29-4**：Linux 托盘（`src-tauri/src/desktop/linux_tray.rs`）的单击唤起与菜单动作是**系统托盘表面**，页面内不可断言；本文件只引用其「失败只告警不阻断启动」的语义（`:35-39`），实际托盘交互归 `12-window-tray.md` 或手工确认。
- **G-D29-5**：TC-DSK-L3-29-010 与 TC-DSK-L3-29-011 需要切换活动核心版本到 `0.1.0-rc.6` / `rc.7` 与 `≥ 0.1.0-rc.8` 两侧。旧 rc 核心可能已无法下载，接线时需准备本地核心（`00-overview.md` 未覆盖该前置）。此外两条用例都会改写 `cordis.patch.yml` 与 `$E2E_HOME/home/.dsh.dev/.agent-presets/`（§5.3），测试必须备份与还原（`00-overview.md` G8）。
- **G-D29-6**：TC-DSK-L3-29-013 的「无副作用」断言依赖档案目录的文件清单快照能力，当前无该工具；退化为断言 `apply` 返回 `Ok` 与 `git_bash_bin_dirs` 为空集合。
- **G-D29-7**：Windows 极简模式的错误串（`PATCH_RENDER_FAILED` / `PATCH_WRITE_FAILED` / `PATCH_PARSE_FAILED` / `PATCH_NOT_ARRAY` / `PATCH_PRUNE_FAILED`）**未覆盖**：需要在写入时制造 YAML 库渲染失败或非法顶层类型，属难以稳定构造的故障注入。
- **假设**：`read_run_logs` 的四个段标题在无内容时仍然出现（段标题由 `format!` 固定拼接，`src-tauri/src/bridge/system_os.rs:216-222`），因此 TC-DSK-L3-29-006 的段结构断言不依赖日志是否为空，但行数上限断言依赖日志足够长。
- **假设**：路径守卫的「允许根之外」以系统临时目录为例；`00-overview.md` §5.1 未把临时目录列入允许根，本文件据此假定它必然被拒绝（`src-tauri/src/bridge/guard.rs:18-34`）。
