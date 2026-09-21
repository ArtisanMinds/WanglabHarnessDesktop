# 应用更新与内部机制

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/09-update.e2e.ts`（待建立）
> 前置：见 `00-overview.md` §5.1；`dist/` 与 debug 二进制已按最新源码重建
> 运行：`vitest --project desktop -- test/e2e/desktop/09-update.e2e.ts`

更新提示走 UI，静默下载、退出自动安装与版本护栏走内部机制。

---

## 1. 更新

桌面端自更新有两条独立链路：**应用自身更新**（`desktopUpdater`，低频轮询 + 导航栏 chip）与**核心更新**（`harnessUpdater`，toast 提示）。本文件覆盖检测、提示、对话框与破坏性更改确认。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 应用更新轮询间隔 10 分钟，启动即检查一次 | `src/layout/index.tsx:21`、`:85-89` |
| 轮询失败一律静默（不打扰用户） | `src/layout/index.tsx:86` |
| 「更新可用」chip 紧跟「帮助」右侧，三平台均显示 | `src/layout/components/navbar.tsx:529-542` |
| 「帮助 → 检查更新」：有更新才弹框，无更新提示「已是最新」 | `src/layout/components/navbar.tsx:283-295` |
| 检查失败 → 危险提示「检查失败」（不冒充「已是最新」） | `src/layout/components/navbar.tsx:291-294` |
| 更新对话框 `DesktopUpdateDialog` | `src/ui/dialog/update.tsx`；`src/layout/components/navbar.tsx:278-280` |
| 「检查更新」项内的新版本标记 | `src/layout/components/navbar.tsx:484-489` |
| 核心更新提示由 `harnessUpdater.showToast` 触发，仅提示不打断 | `src/layout/index.tsx:128-133` |
| 「立即更新」先过破坏性更改确认，取消即中止 | `src/layout/index.tsx:135-141`；`src/ui/config/hooks/use-core-breaking-confirm.tsx` |
| 「应用」面板核心版本旁的新版本链接 | `src/ui/config/debug.tsx:260-269` |
| 下载完成事件 `harness-download-finished` 由外壳订阅 | `src/layout/index.tsx:94-126` |

---

### 检测与提示

### [P1] 验证发现新版本时导航栏出现更新入口

[Case ID] TC-DSK-L3-09-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:532-542`；`src/layout/index.tsx:88-89`
[自动化] 待接线（`test/e2e/desktop/09-update.e2e.ts`）
[前置条件] 已构造「存在更高版本」的更新检查结果；联网
[测试数据] 选择器 `dsh-navbar-update-chip`
[测试步骤] 1. 触发一次更新检查。2. 等待检查结果写入。3. 读取导航栏更新入口存在性与文案。
[预期结果] 1. 检查被触发。2. 结果写入完成。3. 更新入口存在且文案为「有可用更新」语义。
[清理] 清除构造的更新结果；`DELETE /session/<id>`

### [P2] 验证点击更新入口打开更新对话框

[Case ID] TC-DSK-L3-09-002
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:278-280`、`:532-540`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-09-001 通过（更新入口存在）
[测试数据] 选择器 `dsh-navbar-update-chip`、`dsh-update-dialog`
[测试步骤] 1. 点击更新入口。2. 读取更新对话框可见性与版本信息。
[预期结果] 1. 点击被接受。2. 对话框可见，包含目标版本号与下载/安装状态信息。
[清理] 关闭对话框；`DELETE /session/<id>`

---

### 失败与破坏性更改

### [P3] [反向] 验证检查更新失败时提示失败而非已是最新

[Case ID] TC-DSK-L3-09-003
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/navbar.tsx:291-294`
[自动化] 待接线（同上）
[前置条件] 构造更新检查失败（如不可达的更新源）
[测试数据] 菜单项 `check-update`
[测试步骤] 1. 点击「检查更新」。2. 等待失败返回。3. 读取提示文案与语义。
[预期结果] 1. 点击被接受。2. 失败在超时内返回。3. 提示为「检查失败」语义且为危险样式；不出现「已是最新」。
[清理] 恢复更新源；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-navbar-update-chip` | 「更新可用」Chip | 待补 |
| `dsh-navbar-menu-help-new-version` | 「检查更新」项内的新版本标记 | 待补 |
| `dsh-update-dialog` | 更新对话框根节点 | 待补 |
| `dsh-update-dialog-install` | 「立即更新」按钮 | 待补 |
| `dsh-config-dsh-version-new` | 「应用」面板新版本链接 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-09-004` | 验证后台轮询失败不影响其他功能 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/navbar.tsx:532-542`；`src/layout/index.tsx:88-89`` | `TC-DSK-L3-09-001` | 正向 |
| ``src/layout/components/navbar.tsx:278-280`、`:532-540`` | `TC-DSK-L3-09-002` | 正向 |
| ``src/layout/components/navbar.tsx:291-294`` | `TC-DSK-L3-09-003` | 异常 |

---

### 缺口与假设

- **G-D09-1**：本文件的多数用例需要「可控的更新结果」（有更高版本 / 无更高版本 / 检查失败）。当前无测试替身更新源，接线时需引入（例如指向本地 HTTP 服务），否则 `TC-DSK-L3-09-001` 不可达。
- **G-D09-2**：真实更新检查会触发 GitHub 未认证限流（60 次/小时/IP，见 `src/layout/index.tsx:20-21`）。测试**不得**依赖真实 GitHub，必须使用替身源。
- **G-D09-3**：破坏性更改确认只覆盖「取消中止」。确认后继续执行更新会替换核心并重启服务，破坏性极强，**未覆盖**。
- **G-D09-4**：`harness-download-finished` 的下载完成提示归 `10`，本文件不重复。
- **假设**：`desktopUpdater.check()` 返回非空即表示「有更新」；返回空或抛错分别对应「无更新」与「检查失败」（`navbar.tsx:283-295`）。

---

## 2. 桌面端自更新内部：静默下载、退出自动安装、版本护栏与摘要校验

「更新」模块覆盖的是「看得见的入口」；本模块覆盖入口背后的**自动行为**：发现正式版后静默下载、用户不安装时退出即安装、拉起安装器前的版本护栏与停服、以及安装包的摘要校验与路径守卫。判定不依赖界面自述，而依赖落盘结果、store 标记与系统调用返回。

---

### 事实基线

| 事实 | 位置 |
| --- | --- |
| 命令 `check_desktop_update` / `download_desktop_update` / `open_desktop_installer` / `get_desktop_about` | `src-tauri/src/bridge/updater.rs:11`、`:19`、`:27`、`:33` |
| `fetch_latest_release()` 按 feed 顺序（最新在前）扫描，跳过非法 semver / pre-release / 不高于当前版本 | `src-tauri/src/service/update/meta.rs:161`、`:165-176` |
| `UPDATE_SKIP` 四类跳过原因：非法 semver / pre-release / 不高于当前 / 无当前平台资产 | `src-tauri/src/service/update/meta.rs:166`、`:170`、`:174`、`:200` |
| `Ok(None)` = 无更新或当前平台无匹配资产；网络失败为 `Err` | `src-tauri/src/service/update/meta.rs:159-161`、`:181` |
| 摘要必须按**当前平台选中的资产**解析（不能取页面里第一个可解析的摘要） | `src-tauri/src/service/update/meta.rs:184`、`:204` |
| 摘要缺失不阻断官方直连，但禁用镜像兜底（防投毒） | `src-tauri/src/service/update/meta.rs:24-27`；`src-tauri/src/service/update/install.rs:144-154` |
| 正式版判定 `is_stable`（纯数字，无 pre-release / build metadata） | `src-tauri/src/service/update/version.rs:25-27` |
| 严格更高判定 `is_newer`（`0.7.14 > 0.7.14-rc.1`） | `src-tauri/src/service/update/version.rs:33-38` |
| 安装包存放 `AppData/updates/<asset>`，目录不存在则创建 | `src-tauri/src/service/update/install.rs:23-36` |
| `.part` 临时文件 + 原子改名，避免半成品被误判为「已下载」 | `src-tauri/src/service/update/install.rs:247`、`:270-271`、`:297` |
| 摘要存在则强制校验，失败即删除半成品并拒绝 | `src-tauri/src/service/update/install.rs:289-295`；`:178`、`:202-206` |
| 多源全失败错误 `UPDATE_DOWNLOAD: …（已尝试 N 个下载源）` | `src-tauri/src/service/update/install.rs:280-285` |
| 路径守卫：`UPDATE_PATH_REJECTED`（越界）/ `UPDATE_NOT_FOUND`（不存在） | `src-tauri/src/service/update/install.rs:316-337`、`:333`、`:347` |
| 待安装标记 `PendingInstaller { path, version }` 存于独立 store 键 | `src-tauri/src/service/update/pending.rs:34`、`:41-49` |
| 键名 `desktop_pending_installer`，刻意不放进 `Setting`（前端会整对象写回） | `src-tauri/src/config/constants.rs:104`；`src-tauri/src/service/update/pending.rs:6-9` |
| 退出路径 `RunEvent::Exit` → `launch_pending_installer` | `src-tauri/src/lib.rs:57-67`；`src-tauri/src/service/update/pending.rs:82` |
| 版本护栏：待安装版本不高于当前运行版本则记录并跳过 | `src-tauri/src/service/update/pending.rs:88-99` |
| 拉起前先清标记（无论能否打开都不再反复尝试） | `src-tauri/src/service/update/pending.rs:86-88` |
| 拉起前 `workflow::stop_for_installer`，避免 Harness 孤儿占端口 | `src-tauri/src/service/update/pending.rs:106-111`；`src-tauri/src/service/workflow/process.rs:493-501` |
| 对话框「立即更新」路径同样先停服再打开 | `src-tauri/src/service/update/install.rs:412-416`、`:419` |
| 前端轮询间隔 `DESKTOP_UPDATE_POLL_INTERVAL = 10 * 60_000`，启动即检查一次 | `src/layout/index.tsx:21`、`:88-89` |
| 轮询失败静默（`.catch(() => {})`），不打扰用户 | `src/layout/index.tsx:86` |
| 「帮助 → 检查更新」三态：有更新弹框 / 无更新「已是最新」/ 失败危险提示 | `src/layout/components/navbar.tsx:283-295` |
| 「更新可用」chip 与帮助菜单打开同一对话框 | `src/layout/components/navbar.tsx:532-542` |
| 静默下载：`check()` 命中即 `void this.download()`，失败只 `console.error` | `src/store/modules/desktop-updater/store.ts:57-64`、`:94-96` |
| 在途下载单飞（模块级 `downloadTask` 复用） | `src/store/modules/desktop-updater/store.ts:16`、`:82-83` |
| 进度事件 `desktop-update-progress` 写入 store，仅对话框渲染 | `src/store/modules/desktop-updater/store.ts:168-176`；`src/ui/dialog/update.tsx:71-86` |
| 对话框主按钮：已下载→直接打开；未下载→等待/发起下载后打开 | `src/ui/dialog/update.tsx:33-46`、`:96-105` |

---

### 正常路径

### [P1] 验证发现正式版后无用户操作即静默下载

[Case ID] TC-DSK-L3-09-006
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/store/modules/desktop-updater/store.ts:57-64`、`:81-103`；`src-tauri/src/service/update/install.rs:23-36`、`:305`
[自动化] 待接线（`test/e2e/desktop/09-update.e2e.ts`）
[前置条件] 已构造「存在更高正式版且当前平台有匹配资产」的更新结果；`AppData/updates` 内无该安装包
[测试数据] 选择器 `dsh-navbar-update-chip`；观察点 `AppData/updates/<asset>` 落盘
[测试步骤] 1. 触发一次更新检查。2. 不做任何用户操作，等待下载收敛。3. 读取安装包落盘与 `updateInfo.downloaded`。
[预期结果] 1. 检查返回非空更新信息。2. 下载在无用户操作下完成。3. 安装包位于 `AppData/updates/<asset>` 且 `downloaded` 为 `true`。
[清理] 删除构造的安装包；清除构造的更新结果；`DELETE /session/<id>`

### [P2] 验证已下载未安装时退出应用自动拉起安装器

[Case ID] TC-DSK-L3-09-007
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/lib.rs:57-67`；`src-tauri/src/service/update/pending.rs:82-83`、`:101-114`
[自动化] 待接线（`test/e2e/desktop/09-update.e2e.ts`）
[前置条件] `AppData/updates` 内存在安装包且 store 中 `desktop_pending_installer` 标记版本高于当前运行版本；应用处于 `ready`
[测试数据] 观察点：store 键 `desktop_pending_installer`；安装器进程/`UPDATE_OPEN` 告警
[测试步骤] 1. 读取标记与安装包的存在性。2. 用托盘或导航栏退出应用（完整退出语义）。3. 读取退出全过程日志与标记状态。
[预期结果] 1. 标记与安装包均存在。2. 应用退出完成。3. 出现「Launching pending desktop installer on exit」记录，且标记已被清除。
[清理] 删除构造的安装包与标记；`DELETE /session/<id>`

---

### 异常与边界

### [P3] [反向] 验证摘要不匹配时删除半成品并拒绝安装

[Case ID] TC-DSK-L3-09-013
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/update/install.rs:289-295`、`:178`、`:202-206`
[自动化] 待接线（`test/e2e/desktop/09-update.e2e.ts`）
[前置条件] 已构造摘要与安装包内容不一致的更新结果（资产页摘要与文件字节不符）
[测试数据] 观察点：`AppData/updates/<asset>.part`、`AppData/updates/<asset>`、`desktop_pending_installer`
[测试步骤] 1. 触发下载。2. 等待校验结果返回。3. 读取 `updates` 目录内容、错误文本与待安装标记。
[预期结果] 1. 下载被发起。2. 校验失败并返回 `INTEGRITY_CHECK_FAILED` 语义错误。3. `.part` 半成品已删除，最终路径不存在可安装文件，且未登记待安装标记。
[清理] 清理构造的摘要源与残留文件；`DELETE /session/<id>`

---

### 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-navbar-update-chip` | 「更新可用」Chip（与 `09` 共用） | 待补 |
| `dsh-update-dialog` | 更新对话框根节点（与 `09` 共用） | 待补 |
| `dsh-update-dialog-install` | 主按钮「立即更新」/「打开安装包」（与 `09` 共用） | 待补 |
| `dsh-update-dialog-progress` | 下载进度区（进度条 + 百分比） | 待补 |
| `dsh-update-dialog-state` | 已下载/下载中状态描述文本 | 待补 |

---

### 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-09-005` | 验证启动即检查一次并按 10 分钟间隔轮询 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-008` | 验证打开安装包前先释放 Harness 端口 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-009` | 验证静默下载失败不弹用户可见提示 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-010` | 验证在途下载单飞不重复发起 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-011` | 验证待安装版本不高于运行版本时退出不拉起安装器 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-012` | 验证退出拉起前先清除待安装标记 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-014` | 验证无可信摘要时不启用镜像兜底 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-015` | 验证安装包路径越界与不存在均被拒绝 | 纯逻辑断言，下沉单元测试层 |

---

### 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/store/modules/desktop-updater/store.ts:57-64`、`:81-103`；`src-tauri/src/service/update/install.rs:23-36`、`:305`` | `TC-DSK-L3-09-006` | 正向 |
| ``src-tauri/src/lib.rs:57-67`；`src-tauri/src/service/update/pending.rs:82-83`、`:101-114`` | `TC-DSK-L3-09-007` | 正向 |
| ``src-tauri/src/service/update/install.rs:289-295`、`:178`、`:202-206`` | `TC-DSK-L3-09-013` | 异常 |

---

### 缺口与假设

- **G-D09-5**：多数用例需要「可控的更新结果」（有更高正式版 / 无摘要 / 摘要不匹配 / 资产不可达）。按 `00-overview.md` §2 第 7 条，E2E 层禁止 Mock 后端命令，因此只能引入**替身更新源**（本地 HTTP 服务）并改写 `REPO_URL` 可达性；真实检查还会触发 GitHub 未认证限流（`src/layout/index.tsx:20-21`），接线前必须解决。
- **G-D09-6**：TC-DSK-L3-09-005 需要推进编排层时钟才能验证 10 分钟轮询间隔。当前无该能力时，本用例只能退化为断言「启动即检查一次」（`src/layout/index.tsx:88-89`）。
- **G-D09-7**：TC-DSK-L3-09-005 与 TC-DSK-L3-09-010 需要统计 `check_desktop_update` / `download_desktop_update` 的调用次数，当前无计数出口（同 `05` 的 G-D05-1），需在测试编排层计数或增加只读诊断命令。
- **G-D09-8**：TC-DSK-L3-09-007 只断言标记被清除与日志记录，**不验证系统安装器实际启动**（属系统表面，见 `00-overview.md` G9）。人工确认项。
- **G-D09-9**：摘要校验与路径守卫用例需要在 `AppData/updates` 内伪造/篡改文件，并在测后清理；不得触碰用户真实下载的安装包（`00-overview.md` G8）。
- **G-D09-10**：`pending.rs` 写入 store 失败只告警（`:56-59`、`:72-74`），「store 不可写 → 退出时不自动更新」的降级分支**未覆盖**。
- **G-D09-11**：资产选择规则（扩展名优先级、架构匹配、macOS Rosetta 宿主探测）为纯函数，已在 `src-tauri/src/service/update/version.rs` 的单元测试覆盖，本套不重复。
- **假设**：`check_desktop_update` 返回非空即「有更新」，返回空或抛错分别对应「无更新」与「检查失败」（同「更新」模块假设）；本模块不重复「更新」已覆盖的界面三态呈现。
