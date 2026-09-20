# 插件异常定位、修复、安全模式与内置插件自愈（批次 14）

> 层级：L3 桌面端宿主 E2E（真实 Tauri 窗口）
> 自动化：`test/e2e/plugins/plugin-recovery-backend.e2e.ts`、`test/e2e/plugins/internal-plugins.e2e.ts`（待接线，见 `00-overview.md` G4）
> 前置：应用已启动；可构造插件异常态与损坏的补丁层；`resources/node_modules/` 内已随包分发内置插件产物；档案可写
> 运行：待接线（`desktop` project 未配置，见 `00-overview.md` G4）

本批由「异常落盘 / 日志定位 / 修复 / 安全模式」与「内置插件离线物化 / 自愈 / 弃用清理」两部分合并而成：两者同属**启动链与档案落盘的自愈面**，共享「会真实改写档案与资源目录、用例结束必须恢复」的前置，故作为一个批次推进。

**与桌面端套件的分工**：`../desktop/07-recovery-error.md` 断言恢复页、运行期对话框、全屏错误页与三个针对性入口的呈现；本文件断言**错误记录的落盘形态、日志定位的判定结果、修复动作对文件的真实改动、安全模式的隔离副作用，以及内置插件的物化与自愈结果**。共同覆盖归档套件 `06-plugin/03-插件异常与恢复`。

---

## 1. 事实基线

### 1.1 异常落盘、日志定位与修复（`TC-REC-L3-14-*`）

| 事实 | 位置 |
| --- | --- |
| 错误记录文件：应用数据目录下 `plugin-errors.json` | `src-tauri/src/service/plugin/errors.rs:31` |
| 记录结构：`{ message, action, at }`，`action ∈ install/update/remove/runtime` | `src-tauri/src/service/plugin/errors.rs:21`、`src-tauri/src/service/plugin/errors.rs:25` |
| 同 id 幂等覆盖 | `src-tauri/src/service/plugin/errors.rs:53` |
| 安装/升级/卸载成功即清除对应记录 | `src-tauri/src/service/plugin/install/artifact.rs:35`、`src-tauri/src/service/plugin/single.rs:353` |
| 清单合并时过滤「install 错误但版本已可解析」 | `src-tauri/src/service/plugin/watch.rs:230` |
| 上报命令 `report_plugin_error` | `src-tauri/src/bridge/plugin.rs:166` |
| 事件 `plugin-recovery-required` | `src-tauri/src/service/plugin/recovery/mod.rs:37` |
| 定位命令 `detect_plugin_recovery(logs)` | `src-tauri/src/bridge/plugin.rs:195`、`src-tauri/src/service/plugin/recovery/mod.rs:118` |
| 日志解析：5 组正则 + 失败卡片 | `src-tauri/src/service/plugin/recovery/extract.rs:10`、`src-tauri/src/service/plugin/recovery/extract.rs:45` |
| `reason` 取值集合 | `src-tauri/src/service/plugin/recovery/extract.rs:91` |
| `raw_error`：最多 8 行、截断 2000 字符 | `src-tauri/src/service/plugin/recovery/mod.rs:140` |
| 归属判定：仅证据唯一时返回 | `src-tauri/src/service/plugin/recovery/ownership.rs:217` |
| 根集合取 bundles 并过滤 `@deepseek-ai/*` | `src-tauri/src/service/plugin/recovery/ownership.rs:46` |
| 修复命令 `recover_plugin` | `src-tauri/src/bridge/plugin.rs:207`、`src-tauri/src/service/plugin/recovery/mod.rs:160` |
| 拒绝核心/官方包 `PLUGIN_RECOVERY_REFUSED` | `src-tauri/src/service/plugin/recovery/mod.rs:163` |
| 修复动作：摘 dependencies+bundles、删包体、剥离 patch、删 lock、清错误 | `src-tauri/src/service/plugin/recovery/uninstall.rs:13`、`src-tauri/src/service/plugin/recovery/uninstall.rs:61`、`src-tauri/src/service/plugin/recovery/uninstall.rs:128`、`src-tauri/src/service/plugin/recovery/mod.rs:188`、`src-tauri/src/service/plugin/recovery/mod.rs:193` |
| 安全模式：建 `profiles/safe`、隔离补丁层、失败不改活动档案 | `src-tauri/src/bridge/lifecycle.rs:359`、`src-tauri/src/bridge/lifecycle.rs:362`、`src-tauri/src/bridge/lifecycle.rs:363`、`src-tauri/src/bridge/lifecycle.rs:370` |
| 安全档案清理用户插件（保护集为空则拒绝） | `src-tauri/src/service/plugin/safe.rs:63`、`src-tauri/src/service/plugin/safe.rs:73` |
| 补丁层隔离命名 `.broken-<UTC 时间戳>` | `src-tauri/src/service/plugin/patch_guard.rs:13`、`src-tauri/src/service/plugin/patch_guard.rs:94` |
| 隔离失败码 `PATCH_LAYER_QUARANTINE_FAILED` | `src-tauri/src/service/plugin/patch_guard.rs:195` |
| 悬空 insert 剥离前备份 `.bak-<时间戳>` | `src-tauri/src/bridge/lifecycle.rs:399`、`src-tauri/src/service/plugin/patch_entries.rs:137` |
| 前端触发点：上报 / 定位 / 修复 / 安全模式 | `src/layout/components/iframe.tsx:145`、`src/ui/plugin/recovery.tsx:51`、`src/ui/plugin/recovery.tsx:89`、`src/store/modules/harness/store.ts:673`（`enter_safe_mode` 调用点） |

### 1.2 内置插件离线物化与自愈（`TC-INT-L3-14-*`）

| 事实 | 位置 |
| --- | --- |
| 内置清单 10 条（`id` / `spec` / `name` / `description` / `repoUrl`，必要时带 `package`） | `src-tauri/resources/internal-plugins.json:3`、`src-tauri/resources/README.md:76` |
| 打包方式：`pnpm deploy` 工作区包 → `resources/node_modules/<name>` | `scripts/build-plugins.ts:28`、`scripts/build-plugins.ts:550`、`src-tauri/resources/README.md:81` |
| 运行时查找：`resources/node_modules/<name>`，兼容旧目录 `resources/internal-plugins/<id>` | `src-tauri/src/service/plugin/preset.rs:281`、`src-tauri/src/service/plugin/preset.rs:315` |
| 旧目录启动清理 | `src-tauri/src/service/plugin/preset.rs:338` |
| 内置插件强制 `link:<捆绑目录>` | `src-tauri/src/service/plugin/install/spec.rs:30` |
| 离线物化：自建目录链接 + 写回 dependencies/bundles | `src-tauri/src/service/plugin/internal/materialize.rs:37`、`src-tauri/src/service/plugin/internal/materialize.rs:107` |
| 自愈命令 `ensure_internal_plugins` / `cancel_internal_plugins` | `src-tauri/src/bridge/plugin.rs:95`、`src-tauri/src/bridge/plugin.rs:101` |
| 启动编排顺序：npmrc → 弃用卸载 → 内置自愈 → 预设补齐 | `src-tauri/src/service/workflow/launch.rs:461`、`src-tauri/src/service/workflow/launch.rs:467`、`src-tauri/src/service/workflow/launch.rs:474`、`src-tauri/src/service/workflow/launch.rs:482` |
| 就绪判定：`dependencies` 匹配 `link:` 且包体可解析为对象 | `src-tauri/src/service/plugin/internal/mod.rs:624`、`src-tauri/src/service/plugin/internal/manifest.rs:263` |
| 单飞协调 + 绝对超时 600s + 心跳 5s | `src-tauri/src/service/plugin/internal/mod.rs:96`、`src-tauri/src/service/plugin/internal/mod.rs:69`、`src-tauri/src/service/plugin/internal/mod.rs:459` |
| 可写性预检 | `src-tauri/src/service/plugin/internal/mod.rs:260` |
| 阶段事件 `internal-plugins-phase` | `src-tauri/src/service/plugin/internal/mod.rs:506` |
| 失败码：`INTERNAL_PLUGIN_INSTALL_FAILED` / `INTERNAL_PLUGIN_PATCH_PARSE_FAILED` | `src-tauri/src/service/plugin/internal/mod.rs:750`、`src-tauri/src/service/plugin/internal/mod.rs:197` |
| 弃用清单（纯字符串数组 4 项）与自动卸载 | `src-tauri/resources/deprecated-plugins.json:1`、`src-tauri/src/service/workflow/launch.rs:467` |
| 前端 boot 阶段再次自愈 + 超时预算 | `src/store/modules/harness/store.ts:533`、`src/store/modules/harness/constants.ts:20` |

---

## 2. 用例

### 2.1 异常落盘、日志定位与修复（`TC-REC-L3-14-*`）

#### [P1] 验证运行期上报落盘为 runtime 类记录并推送清单事件

[Case ID] TC-REC-L3-14-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/errors.rs:53`、`src-tauri/src/bridge/plugin.rs:166`
[自动化] 待接线（`desktop` project 未配置）
[前置条件] 应用运行中；已装某插件；可触发一次页面内插件错误（或经桥上报）
[测试数据] 插件 id 与错误文本（含首尾空白的字符串，用于验证 trim）
[测试步骤] 1. 触发上报。2. 读取应用数据目录下 `plugin-errors.json`。3. 读该 id 的 `message` / `action` / `at`。4. 观察界面异常标记。
[预期结果] 1. 文件存在且为该 id 的记录。2. `action` 为 `runtime`。3. `message` 已去除首尾空白且长度 ≤ 2000。4. `at` 为纯数字字符串（unix 秒）。5. 界面出现异常标记。
[清理] 删除该记录并刷新

#### [P3] 验证同一插件的重复上报只保留最新记录

[Case ID] TC-REC-L3-14-002
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/service/plugin/errors.rs:53`
[自动化] 待接线（同上）
[前置条件] 同 TC-REC-L3-14-001
[测试数据] 同一 id 的两条不同错误文本，先后上报
[测试步骤] 1. 上报 A。2. 上报 B。3. 读 `plugin-errors.json` 中该 id 的条目数与 `message`。
[预期结果] 1. 该 id 只有 1 条记录。2. `message` 为 B 的文本（幂等覆盖）。
[清理] 删除该记录

#### [P2] 验证恢复可解析后不再把安装错误暴露为当前错误

[Case ID] TC-REC-L3-14-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/watch.rs:230`、`src-tauri/src/service/plugin/install/artifact.rs:35`
[自动化] 待接线（同上）
[前置条件] 某插件存在一条 `install` 类错误记录，但其包已在 `node_modules` 中可解析
[测试数据] 该插件 id
[测试步骤] 1. 保留错误记录、确认包体可解析。2. 刷新插件清单。3. 读该行的 `error` 字段与异常标记。
[预期结果] 1. 清单该行**不**包含 `error` 字段。2. 界面不显示异常标记。3. `plugin-errors.json` 中的记录可能仍在（合并时才过滤），因此断言只针对清单输出。
[清理] 清理记录

#### [P3] 验证日志定位返回唯一根插件与规范化的 reason

[Case ID] TC-REC-L3-14-004
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/recovery/mod.rs:118`、`src-tauri/src/service/plugin/recovery/extract.rs:91`、`src-tauri/src/service/plugin/recovery/mod.rs:140`
[自动化] 待接线（同上）
[前置条件] 可取得一份真实的插件加载失败日志（含失败卡片或冲突行）
[测试数据] `logs` 数组（至少包含失败行）
[测试步骤] 1. 调 `detect_plugin_recovery(logs)`。2. 读 `plugins`、`reason`、`rawError`、`detail`。
[预期结果] 1. `plugins` 恰好包含 1 个根插件 id。2. `reason` 属于 `duplicate_route` / `duplicate_loader_entry` / `cannot_resolve_bundle` / `no_dsh_bundle` / `slot_conflict` / `load_failed` / `unknown` 之一。3. `rawError` 长度 ≤ 2000 且行数 ≤ 8。4. `detail` 与 `reason` 语义一致（非空）。
[清理] 无

#### [P4] [反向] 验证证据不唯一时不给出归属

[Case ID] TC-REC-L3-14-005
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/service/plugin/recovery/ownership.rs:217`
[自动化] 待接线（同上）
[前置条件] 构造两条不同插件都可能导致失败的日志（冲突证据）
[测试数据] 混合日志
[测试步骤] 1. 调 `detect_plugin_recovery`。2. 读 `plugins`。
[预期结果] 1. `plugins` 为空数组（不猜测归属）。2. 界面按「无归属」呈现，而不是任选一个插件。
[清理] 无

#### [P2] 验证修复剥离插件四处痕迹并清除错误记录

[Case ID] TC-REC-L3-14-006
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/recovery/uninstall.rs:13`、`src-tauri/src/service/plugin/recovery/uninstall.rs:128`、`src-tauri/src/service/plugin/recovery/mod.rs:188`
[自动化] 待接线（同上）
[前置条件] 活动档案中存在一个可被定位的问题插件（非核心/官方包），且该插件在 `cordis.patch.yml` 与 `pnpm-lock.yaml` 中有痕迹
[测试数据] 该插件 id
[测试步骤] 1. 记录修复前：`dependencies`、`bundles`、`node_modules/<id>`、`cordis.patch.yml` 条目、`pnpm-lock.yaml` 大小、错误记录。2. 调 `recover_plugin(id)`。3. 逐项复查。
[预期结果] 1. `dependencies` 与 `dsh.profile.bundles` 不再含该 id。2. `node_modules/<id>` 已删除（scoped 包的空父目录也一并清理）。3. `cordis.patch.yml` 中该插件相关条目被剥离。4. `pnpm-lock.yaml` 已删除或重建（产物由 CLI 决定）。5. 该插件的错误记录被清除。6. 其他插件的依赖与配置保持不变。
[清理] 重新安装该插件以恢复环境

#### [P3] [反向] 验证修复拒绝核心与官方包

[Case ID] TC-REC-L3-14-007
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/plugin/recovery/mod.rs:163`
[自动化] 待接线（同上）
[前置条件] 目标为核心包或 `@deepseek-ai/*` 官方包
[测试数据] 受保护 id
[测试步骤] 1. 记录三处文件与错误记录摘要。2. 调 `recover_plugin(id)`。3. 读错误前缀。
[预期结果] 1. 返回 `PLUGIN_RECOVERY_REFUSED: refusing to remove core/official package <id>`。2. `dependencies`、bundles、`node_modules` 均未变化。3. 错误记录未被清除。
[清理] 无

#### [P2] 验证安全模式隔离补丁层并在失败时不切换活动档案

[Case ID] TC-REC-L3-14-008
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/bridge/lifecycle.rs:362`、`src-tauri/src/bridge/lifecycle.rs:363`、`src-tauri/src/bridge/lifecycle.rs:370`
[自动化] 待接线（同上）
[前置条件] `<DSH_E2E_HOME>/home/.dsh.dev/cordis.patch.yml` 或档案层补丁含不可解析 YAML；活动档案为 scratch 档案
[测试数据] 损坏的补丁文件
[测试步骤] 1. 记录活动档案名。2. 触发 `enter_safe_mode`。3. 读 `profiles/safe` 是否存在、活动档案是否变化、损坏补丁文件是否被改名。
[预期结果] 1. `profiles/safe` 被创建。2. 损坏的补丁层被隔离（改名为 `.broken-<UTC 时间戳>`，原文件不被删除）。3. 隔离失败时返回 `PATCH_LAYER_QUARANTINE_FAILED: <详情>` 且**活动档案不变**。4. 成功后活动档案切到 `safe`。
[清理] 复原补丁文件与活动档案

#### [P4] 验证悬空 insert 剥离前保留备份

[Case ID] TC-REC-L3-14-009
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/bridge/lifecycle.rs:399`、`src-tauri/src/service/plugin/patch_entries.rs:137`
[自动化] 待接线（同上）
[前置条件] 某档案 `cordis.patch.yml` 含指向不存在插件的 `insert` 条目
[测试数据] 该补丁文件
[测试步骤] 1. 触发 `strip_unresolved_patch_entries`。2. 检查目录中是否出现 `.bak-<时间戳>` 副本。3. 读剥离后的补丁文件。
[预期结果] 1. 出现带 `.bak-<时间戳>` 后缀的备份副本（内容为剥离前原文）。2. 剥离后的文件不再含该 `insert` 条目。3. 其它条目保持不变。
[清理] 删除备份并恢复原补丁文件

### 2.2 内置插件离线物化与自愈（`TC-INT-L3-14-*`）

#### [P1] 验证全新档案下的内置插件自愈补齐依赖与 bundles

[Case ID] TC-INT-L3-14-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/internal/materialize.rs:37`、`src-tauri/src/service/workflow/launch.rs:474`
[自动化] 待接线（`desktop` project 未配置）
[前置条件] 新建一个空 scratch 档案（无 `dependencies`、无 `node_modules`）；`resources/node_modules/` 下内置产物齐全
[测试数据] 无
[测试步骤] 1. 切换到空档案并启动服务。2. 读该档案的 `package.json` 与 `node_modules`。3. 读 `internal-plugins.json` 的 10 个 id。
[预期结果] 1. `dependencies` 中出现全部内置 id，且值形如 `link:<捆绑目录>`。2. `dsh.profile.bundles` 同步包含这些 id。3. `node_modules/<name>` 可解析（存在可读的 `package.json`）。4. 服务进入 Running，界面无插件加载失败页。
[清理] 删除该 scratch 档案

#### [P2] 验证内置插件产物缺失时给出可诊断的失败而非静默

[Case ID] TC-INT-L3-14-002
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/plugin/internal/mod.rs:750`、`src-tauri/src/service/plugin/install/artifact.rs:78`
[自动化] 待接线（同上）
[前置条件] 临时移走 `resources/node_modules/` 中某一个内置插件目录
[测试数据] 被移走的插件名
[测试步骤] 1. 切换到一个未装该内置插件的新档案并启动。2. 读错误文案与界面呈现。
[预期结果] 1. 返回错误，前缀为 `INTERNAL_PLUGIN_INSTALL_FAILED`（或离线兜底失败时的 `PREINSTALL_SILENT_FAIL` 变体）。2. 界面给出可操作提示（含日志入口），而非静默跳过。3. 其余内置插件的依赖项仍被写入（不因单个失败整体放弃）。
[清理] 恢复被移走的目录

#### [P3] 验证内置目录写回可离线完成（无网络）

[Case ID] TC-INT-L3-14-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/plugin/internal/materialize.rs:107`
[自动化] 待接线（同上；需断网）
[前置条件] 全新 scratch 档案；断网（或使 npm/git 源不可达）
[测试数据] 无
[测试步骤] 1. 断网后启动服务。2. 读档案 `package.json` 与 `node_modules`。3. 观察是否出现下载/网络类失败。
[预期结果] 1. 内置插件的 `link:` 依赖仍被写入。2. `node_modules` 下出现自建目录链接。3. 不出现需要联网的 `dsh plugin add` 重试风暴（离线兜底优先）。
[清理] 恢复网络；删除档案

#### [P2] 验证就绪判定能识别「已写好但包体不可解析」的坏状态

[Case ID] TC-INT-L3-14-004
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/plugin/internal/mod.rs:624`、`src-tauri/src/service/plugin/internal/manifest.rs:263`
[自动化] 待接线（同上）
[前置条件] 某内置插件已写入 `dependencies`，但其 `node_modules/<name>/package.json` 被写成非法 JSON
[测试数据] 目标内置插件名
[测试步骤] 1. 制造坏状态后启动服务。2. 读自愈过程是否为该插件重新物化。3. 读最终 `package.json` 内容。
[预期结果] 1. 自愈**不**把该状态判定为就绪（坏 JSON 不算可解析）。2. 自愈动作后包体恢复为可解析状态（或被明确兜底重建）。3. 服务最终进入 Running。
[清理] 恢复正常产物

#### [P3] 验证自愈有绝对超时与可取消

[Case ID] TC-INT-L3-14-005
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/service/plugin/internal/mod.rs:69`、`src-tauri/src/bridge/plugin.rs:101`
[自动化] 待接线（同上）
[前置条件] 让自愈过程变慢（例如把 `node_modules` 设为只读或制造 pnpm 慢路径）
[测试数据] 无
[测试步骤] 1. 启动应用并在自愈进行中调 `cancel_internal_plugins`。2. 记录取消后的阶段事件与进程状态。3. 观察是否在 600s 内必然结束。
[预期结果] 1. 取消后自愈不再继续（前端退出等待态）。2. 进程树被回收，无残留 node/pnpm 进程。3. 若超时上限到达，必然终止而非无限等待。
[清理] 恢复环境

#### [P2] 验证弃用插件在启动时被自动卸载

[Case ID] TC-INT-L3-14-006
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/workflow/launch.rs:467`、`src-tauri/resources/deprecated-plugins.json:1`
[自动化] 待接线（同上）
[前置条件] 在 scratch 档案中人为写入一个存在于弃用清单中的包（如 `dsh-notification`）
[测试数据] 弃用清单中的包名
[测试步骤] 1. 写入依赖与 bundles。2. 启动服务。3. 读 `dependencies`、`bundles`、`node_modules` 与插件清单。
[预期结果] 1. 启动后该包从 `dependencies` 与 `dsh.profile.bundles` 中被移除。2. `node_modules` 中对应目录被清理。3. 插件清单中不再出现该包。4. 其他插件不受影响。
[清理] 清理 scratch 档案

#### [P4] 验证弃用卸载在无网络时仍能完成

[Case ID] TC-INT-L3-14-007
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `src-tauri/src/service/workflow/launch.rs:467`
[自动化] 待接线（同上；需断网）
[前置条件] 同 TC-INT-L3-14-006，且断网
[测试数据] 弃用包名
[测试步骤] 1. 断网后启动服务。2. 读三处文件。
[预期结果] 1. 依赖与 bundles 仍被清理。2. 不因断网阻塞启动（服务仍进入 Running）。3. 无残留半成品依赖项。
[清理] 恢复网络；清理档案

#### [P3] 验证旧资源目录在启动时被清理

[Case ID] TC-INT-L3-14-008
[层级] L3（真实 Tauri 窗口）
[类型] 回归
[追踪] `src-tauri/src/service/plugin/preset.rs:338`
[自动化] 待接线（同上）
[前置条件] 在应用资源目录下手动创建旧形态目录 `resources/internal-plugins/`
[测试数据] 旧目录及其中的一个占位子目录
[测试步骤] 1. 创建旧目录。2. 启动应用。3. 读该目录是否存在与启动日志。
[预期结果] 1. 旧目录被移除（升级残留清理）。2. 启动不受影响，服务进入 Running。3. 内置插件仍从新路径加载。
[清理] 无需清理（目录已被移除）

---

## 3. 追踪矩阵

### 3.1 异常落盘、日志定位与修复

| 来源（归档套件） | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `06-plugin/03` 验证页面运行期错误通过 report_plugin_error 记录并实时同步 | TC-REC-L3-14-001、TC-REC-L3-14-002 | 正向 / 边界 | 界面同步由 `../desktop/06`、`../desktop/07` 断言 |
| `06-plugin/03` 验证 detect_plugin_recovery 能定位到损坏插件 | TC-REC-L3-14-004、TC-REC-L3-14-005 | 正向 / 边界 | — |
| `06-plugin/03` 验证 recover_plugin 能恢复损坏插件 | TC-REC-L3-14-006 | 正向 | — |
| `06-plugin/03` 验证插件恢复正常后错误状态清除 | TC-REC-L3-14-003 | 正向 | — |
| `06-plugin/03` 验证 recover_plugin 拒绝卸载核心或官方包 | TC-REC-L3-14-007 | 异常 | — |
| `06-plugin/03` 验证补丁层 YAML 语法错误可被显式隔离并恢复启动 | TC-REC-L3-14-008 | 异常 | 错误页入口由 `../desktop/07` 断言 |
| 现行实现新增（悬空 insert 备份） | TC-REC-L3-14-009 | 边界 | — |
| `06-plugin/03` 验证 pnpm-workspace.yaml 多文档被归一化并恢复插件安装 | TC-ISO-L3-15-005（见 `15-profile-and-patch-isolation.md`） | 正向 | 归 15 |

### 3.2 内置插件离线物化与自愈

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `src-tauri/resources/README.md:76`（内置插件随包分发 + 启动自愈） | TC-INT-L3-14-001、TC-INT-L3-14-002 | 正向 / 异常 | 归档套件未为该机制设用例 |
| `internal/materialize.rs:107`（离线物化） | TC-INT-L3-14-003 | 正向 | 需断网构造 |
| `internal/mod.rs:624`（就绪判定） | TC-INT-L3-14-004 | 异常 | — |
| `internal/mod.rs:69`、`bridge/plugin.rs:101`（超时与取消） | TC-INT-L3-14-005 | 边界 | — |
| `deprecated-plugins.json:1` + `launch.rs:467`（弃用自动卸载） | TC-INT-L3-14-006、TC-INT-L3-14-007 | 正向 / 边界 | 归档套件未覆盖 |
| `preset.rs:338`（旧目录清理） | TC-INT-L3-14-008 | 回归 | — |
| `06-plugin/04` 的预装安装链路（社区插件） | `13-preinstall-and-preset.md` | — | 与内置自愈是两条不同链路，勿混用 |

---

## 4. 缺口与假设

### 4.1 异常落盘、日志定位与修复

- **G-REC-1**：`plugin-errors.json` 与 `$DSH_HOME` 分离——它位于**应用数据目录**（`src-tauri/src/service/plugin/errors.rs:8`），属桌面端诊断数据。用例读取该文件时必须用应用数据目录，而非 `<DSH_E2E_HOME>/home/.dsh.dev`。debug 构建的应用数据目录带 `.dev` 后缀（`src-tauri/src/config/runtime.rs:17`）。
- **G-REC-2**：`detect_plugin_recovery` 与 `get_dsh_plugins`、`get_plugin_backup` 一样声明为非 `Result`，异常输入不会以错误返回，而是退化为空/默认值（`src-tauri/src/bridge/plugin.rs:195`）。TC-REC-L3-14-005 断言的是这种退化行为，不是报错。
- **G-REC-3**：安全模式会真实改写活动档案与补丁层。执行前必须确认处于 scratch 数据目录；TC-REC-L3-14-008 的清理步骤若失败，应视为阻塞后续用例的环境污染。
- **G-REC-4**：`recover_plugin` 删除 `pnpm-lock.yaml` 的具体形态（整体删除 vs 重建）在 `src-tauri/src/service/plugin/recovery/mod.rs:188` 有实现，但重建产物由 pnpm 决定，故用例只断言「不再包含该插件」。
- **假设**：安全性由证据唯一性保证（`src-tauri/src/service/plugin/recovery/ownership.rs:217`），因此本文件不设计「猜测修复」类用例。

### 4.2 内置插件离线物化与自愈

- **G-INT-1**：内置插件自愈是**启动链的一部分**（`src-tauri/src/service/workflow/launch.rs:474`），因此这些用例的前置天然包含「可启动的服务」。若服务本身起不来，失败应归因到启动链，而不是本文件的插件断言。
- **G-INT-2**：TC-INT-L3-14-002 与 TC-INT-L3-14-004 需要改动应用**资源目录**（安装目录），而非测试数据目录。这违反「不改写用户环境」的一般原则，执行时必须先备份并在用例结束恢复；无法恢复时应中止而不是继续。
- **G-INT-3**：`internal-plugins.json` 现有 10 条，但其中部分插件的 `package` 字段与 `id` 不同（`src-tauri/resources/README.md:80`）。用例一律以运行时解析出的包名/目录名为准，不硬编码归档套件中的老包名。
- **G-INT-4**：前端在 boot 阶段会再调一次 `ensure_internal_plugins`（`src/store/modules/harness/store.ts:533`），前端超时预算为 600s/30s（`src/store/modules/harness/constants.ts:20`）。UI 层的等待表现归 `../desktop/07-recovery-error.md`，本文件只断言最终文件状态。
- **假设**：`resources/node_modules/` 在 debug 构建下同样可用（`src-tauri/src/service/plugin/preset.rs:257` 含 CARGO_MANIFEST_DIR 兜底），因此这些用例不需要安装版即可执行。
