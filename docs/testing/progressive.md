# 渐进式测试推进规则

定义桌面端与插件测试逐条补齐的协作流程与进度台账。

> **规范参考**：测试方案详见 [桌面端测试规范](../specs/desktop.test.md) 与 [插件测试规范](../specs/plugin.test.md)。
> **编号口径**：批次号 = 用例文档序号（桌面端 `00`–`29`、插件 `00`–`18`），与两个 `00-overview.md` §3 的清单逐行对应；不另设 `D*` / `B*` / `PP*` 别名。

---

## 1. 核心原则

1. **单批单卡**：每批仅交付**一个可观察结果**（单个用例或其最小必需基础设施），严禁超前开发。
2. **文档同步**：批内先写用例文档，再写对应测试代码，同批交付，禁止跨批漂移。
3. **独立可运行**：每批必须提供明确的运行命令，无法独立运行的批次视为不合格。
4. **审核阻塞**：单批交付后暂停推进，经人工审查与运行验证通过后，方可描述下一批。
5. **显式授权**：下一批需明确说明变更范围、代价与风险，获得同意后方可动手。
6. **零容忍推进**：当前批次失败必须原地修复，禁止带病推进；无法修复则停止并说明原因。
7. **实时记账**：状态变更需实时更新至台账，严禁滞后补记。

---

## 2. 协作流程

```
[① 提案描述] ───► [② 确认授权] ───► [③ 代码实现]
  (变更/代价/命令)     (回复 "ok")         (更新台账为「待验证」)
                                                  │
[⑤ 批次收尾] ◄─── [④ 审查与验证] ◄─────────────────┘
 ├─ 通过 ──► 标记「已验证」 ──► 进入下一个 ①
 └─ 失败 ──► 原地修复 ──► 重试 ④
```

> **注意**：提案描述必须如实评估风险与代价（如构建开销、新增依赖、影响文件及预期耗时）。

---

## 3. 状态定义

| 状态 | 含义 |
| --- | --- |
| `提案中` | 方案已提交，等待授权 |
| `已同意` | 方案已获批，开始实施 |
| `已实现` | 产物已落地，**等待审查与运行验证** |
| `已验证` | 运行验证通过，本批次关闭 |
| `已阻塞` | 存在明确阻塞条件（附详细原因），暂停推进 |

---

## 4. 进度台账

> 状态变化即时更新本节。

### 4.1 桌面端 (`docs/testing/desktop/`)

| 批次 | 用例 / 基础设施 | 对应文档 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 00 | 总览、前置与追踪矩阵 | `00-overview.md` | 已验证 | 索引/前置/矩阵/缺口已核对；G3 选择器事实随 `01` 批次同步 |
| 01 | 窗口启动、几何约束、启动前置校验 | `01-window-boot.md` | 已实现 | 7 条已接线并跑通；005 改手工（G-D01-4） |
| 02 | 壳层导航栏与条件渲染 | `02-shell-navigation.md` | 已实现 | 8 条已接线（`TC-DSK-L3-02-001`～`004`、`007`、`008`、`010`、`011`）；`005`/`006` 暂缓（G-D02-1/2）；`009` 手工 |
| 03 | 配置对话框打开/定位/切换/关闭 | `03-config-dialog.md` | 已验证 | 5 条已接线并跑通（`TC-DSK-L3-03-001`～`004`、`007`）；`005`/`006` 暂缓（G-D03-1/4）；补 `dsh-config-*` 选择器与「应用」面板标题；PR #623 合并 |
| 04 | 语言即时切换与持久化、主题自适应 | `04-locale-theme.md` | 已实现 | 6 条已接线并跑通（`TC-DSK-L3-04-001`～`006`）；`006` 走真实装配车道；补 `dsh-config-language-*` / `dsh-shell-iframe` / `dsh-setup-preinstall-skip` 选择器、E2E 独占 WebView2 profile，并修复首次进入主题默认与导航栏装饰层遮挡 |
| 05 | 档案列表、新建、克隆、删除 | `05-profile.md` | 提案中 | 8 条 |
| 06 | iframe 渲染条件、加载状态机、boot 桥 | `06-harness-embed.md` | 提案中 | 7 条 |
| 07 | 服务重启/停止/外部打开、进程退出 | `07-harness-lifecycle.md` | 提案中 | 7 条 |
| 08 | 预装插件引导页与默认勾选 | `08-preinstall-onboarding.md` | 提案中 | 9 条 |
| 09 | 插件列表与写操作（禁用/快照/卸载） | `09-plugin-panel.md` | 提案中 | 10 条 |
| 10 | 插件异常全屏恢复页与运行期对话框 | `10-plugin-recovery.md` | 提案中 | 7 条 |
| 11 | 非插件类启动失败错误页与恢复动作 | `11-startup-error.md` | 提案中 | 8 条 |
| 12 | 窗口按钮、托盘菜单、退出语义、几何持久化 | `12-window-tray.md` | 提案中 | 8 条 |
| 13 | 端口、缩放、开机自启、关闭行为、CLI link、日志 | `13-application-settings.md` | 提案中 | 10 条 |
| 14 | 核心列表、切换、下载、卸载、基线兼容 | `14-core-management.md` | 提案中 | 8 条 |
| 15 | 备份创建、还原、还原为新档案、删除 | `15-backup-restore.md` | 提案中 | 8 条 |
| 16 | 应用更新检测、提示、破坏性更改确认 | `16-update.md` | 提案中 | 7 条 |
| 17 | 桌宠窗口创建/销毁、几何、尺寸、穿透 | `17-pet-window.md` | 提案中 | 7 条 |
| 18 | 通知桥、下载落盘与提示、剪贴板图片 | `18-notification-download.md` | 提案中 | 7 条 |
| 19 | 多窗口隔离、缩放快捷键与桥、导航命令 | `19-multi-window.md` | 提案中 | 7 条 |
| 20 | 首次装配、任务编排、进度阶段、下载失败与完整性 | `20-assembly.md` | 提案中 | 14 条 |
| 21 | shim 与 PATH 注册、转义规则、解析优先级、用户命令保护 | `21-cli-integration.md` | 提案中 | 12 条 |
| 22 | 端口默认值与占用回退、子进程启动、数据目录隔离 | `22-isolation.md` | 提案中 | 12 条 |
| 23 | 本地监听边界、无遥测、日志与支持包、路径守卫 | `23-privacy.md` | 提案中 | 9 条 |
| 24 | 档案名称规则、创建/克隆校验、初始化形态、档案隔离 | `24-profile-rules.md` | 提案中 | 12 条 |
| 25 | 核心标识与查找、切换与回滚、下载/卸载错误码矩阵 | `25-core-error-matrix.md` | 提案中 | 14 条 |
| 26 | 状态迁移与事件、健康检查、进程韧性与孤儿清扫 | `26-service-state-machine.md` | 提案中 | 12 条 |
| 27 | 插件升级/卸载/快照、异常注册表、恢复、内置插件自愈 | `27-plugin-lifecycle.md` | 提案中 | 14 条 |
| 28 | 静默下载、退出自动安装、版本护栏、更新摘要与路径守卫 | `28-desktop-update-internals.md` | 提案中 | 12 条 |
| 29 | 系统操作集成、路径守卫、跨平台打包、Windows 极简模式 | `29-system-integration.md` | 提案中 | 14 条 |

合计 `01`–`29` 共 **275** 条用例。`desktop` project 已建立，用例落在 `test/e2e/desktop/`；`01` 批次 7 条、`02` 批次 8 条、`03` 批次 5 条已接线，其余批次尚无自动化产物。

### 4.2 插件 (`docs/testing/plugins/`)

| 批次 | 用例 / 基础设施 | 对应文档 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 00 | 总览、前置与追踪矩阵 | `00-overview.md` | 提案中 | 不承载用例本体 |
| 01 | 编排骨架（scratch 宿主 + 挂载 + 随机端口） | `01-host-lane-skeleton.md` | 提案中 | 编排代码 `test/e2e/support/dsh-host.ts` 已落地，用例文件待建 |
| 02 | 共享路由契约（OPTIONS/405/403/413） | `02-dsh-tauri-core.md` | 提案中 | - |
| 03 | `dsh-tauri-pet`（SSE → 客户端 → 桌面端窗口） | `03-dsh-tauri-pet.md` | 已实现 | SSE 首帧用例已迁至 `test/e2e/plugins/`；客户端与 L3 待接线 |
| 04 | `dsh-tauri-rightclick` | `04-dsh-tauri-rightclick.md` | 提案中 | - |
| 05 | `dsh-tauri-session` | `05-dsh-tauri-session.md` | 提案中 | - |
| 06 | `dsh-tauri-worktree` | `06-dsh-tauri-worktree.md` | 提案中 | - |
| 07 | `dsh-tauri-ui` | `07-dsh-tauri-ui.md` | 提案中 | - |
| 08 | `dsh-tauri-panel-extension` | `08-dsh-tauri-panel-extension.md` | 提案中 | - |
| 09 | `dsh-tauri-panel-scheduler` | `09-dsh-tauri-panel-scheduler.md` | 提案中 | - |
| 10 | `dsh-tauri-turnrewind` | `10-dsh-tauri-turnrewind.md` | 提案中 | - |
| 11 | `dsh-tauri-model-config` | `11-dsh-tauri-model-config.md` | 提案中 | - |
| 12 | 插件清单真值、文件监控与事件推送 | `12-plugin-inventory-and-watch.md` | 提案中 | - |
| 13 | 禁用/启用/升级/卸载/快照的落盘副作用 | `13-plugin-lifecycle-commands.md` | 提案中 | - |
| 14 | 预装引导、预设字段与指纹判定 | `14-preinstall-and-preset.md` | 提案中 | - |
| 15 | 异常落盘、日志定位、修复与安全模式 | `15-plugin-error-and-recovery.md` | 提案中 | - |
| 16 | 跨档案隔离与补丁层 / pnpm-workspace 治理 | `16-profile-and-patch-isolation.md` | 提案中 | - |
| 17 | 内置插件离线物化、自愈与弃用清理 | `17-internal-plugins.md` | 提案中 | - |
| 18 | 跨插件与壳层集成（收尾） | `18-cross-plugin-desktop.md` | 提案中 | - |

合计 `01`–`18` 共 **170** 条用例。L2 运行前需先跑一次 `pnpm build:plugins`，插件产物当前未构建。

---

## 5. 变更历史

| 日期 | 变更说明 |
| --- | --- |
| 2026-09 | 初始化规则 |
| 2026-09 | 补齐 `docs/testing/plugins/00`–`12` 用例文档（116 条） |
| 2026-09 | 覆盖率补全：新增 `docs/testing/plugins/12`–`17`（54 条），覆盖归档套件的插件生命周期治理面 |
| 2026-09 | 顺序调整：跨插件集成移至 `18` 收尾，原 `13`–`18` 前移为 `12`–`17` |
| 2026-09 | 补齐 `docs/testing/desktop/00`–`19` 桌面端用例文档（148 条） |
| 2026-09 | 参考 `archive/docs/testing` 旧套件与现有实现代码做覆盖率补全：新增 `desktop/20`–`29`（125 条），桌面端合计 273 条；数据目录隔离规范收敛到 `docs/specs/desktop.test.md` §6 |
| 2026-09 | 规范文档更名为 `desktop.test.md` / `plugin.test.md`；清除生成残留段落；批次编号统一为用例文档序号，移除 `D*` / `B*` / `PP*` 别名 |
| 2026-09 | 批次 `00` 验证通过：索引、前置、追踪矩阵与缺口清单核对无误；补 `docs/testing/README.md` 作为文档入口 |
| 2026-09 | 批次 `02` 实现：导航栏 7 条接线（`013`/`014` 暂缓、`017` 手工）；修复 `webview.tsx` 无条件下发 iframe 回调（死按钮）、拖拽区双击被原生/网页两侧各切一次互相抵消（G-D02-4/5）、三个 `Dropdown.Popover` 的 `w-5!` 把菜单压成 20px 竖条（G-D02-7，视口 < 48rem 时暴露）；选择器常量收敛到 `test/e2e/support/selectors.ts`；同步 `01` 批次的导航栏高度断言改为亚像素容差（非 100% 显示缩放下回传 44.0000038） |
| 2026-09 | 用例编号改为文件内连续：桌面端 `TC-DSK-L3-<文件序号>-<序号>`、插件 `TC-<业务域>-<层级>-<文件序号>-<序号>`；新增用例不再顺延后续文件（桌面端 274 → 275 条） |
| 2026-09 | 禁用下载时渲染「下载已被环境禁用」页替代启动失败页（`RuntimeInfo::auto_download_disabled` → `setup.tsx`），布局与失败页同源；新增 `TC-DSK-L3-02-011` 守门 |
| 2026-09 | 桌面端 E2E 车道加固：会话建立后显式切到主窗口 webview `main`（默认窗口可能落在桌宠 `pet`），`assertPreconditions` 增加 WebDriver 端口 4445 占用校验（被别的实例占住时会静默挂到对方窗口） |
| 2026-09 | 批次 `03` 实现：配置对话框 5 条接线（`005` 需服务运行中、`006` 需异常插件夹具，暂缓）；`config.tsx` 补 `dsh-config-dialog` / `-close` / `-nav-*` / `-nav-plugins-badge` / `-panel-body` 并给导航项加 `aria-current` 选中态；`Panel.Header` 增加 `testId` 与可选 `description`，据此给「应用」面板补上标题（原三面板自持标题、它独缺）；菜单操作从 `02` 抽出为 `test/e2e/support/navbar-menu.ts` 供两批复用 |
| 2026-09 | 批次 `03` 运行验证：桌面端全车道 `01`+`02`+`03` 共 20 条全绿；修正 `TC-DSK-L3-03-007` 的尺寸断言——HeroUI `modal__container` 的入场缩放动画（`matrix3d(scale)` 起手 ~1.03）会让 `getBoundingClientRect()` 把对话框读大最多 3%，断言前须等尺寸稳定（G-D03-6） |
| 2026-09 | 批次 `03` CI 加固：windows runner 上对话框偶发在打开后 ~100–200ms 被收起（G-D03-7）。用例侧修两处竞态——`closeDialog()` 改为等节点从 DOM 卸载并排空 overlastic 退场窗口（`duration = 300`）后再重开；导航项点击改为每轮重新定位（`waitForClickable()` 只认首次句柄，节点被替换后必然轮询到超时）。失败信息附现场快照（`pageMark`/`navbar`/`disabledPage`/`url`） |
| 2026-09 | 批次 `03` 合并（PR #623），台账置「已验证」 |
| 2026-09 | 批次 `04` 实现：语言与主题 5 条接线（`006` 需 iframe 即全装配车道，暂缓）；`debug.tsx` 语言下拉补 `dsh-config-language-select` 与两个选项的 `data-testid`；配置对话框生命周期从 `03` 抽出为 `test/e2e/support/config-dialog.ts` 供后续批次复用；harness 增加 `homeDir`（复用隔离根重启）、`resetStore`、`stop({ keepHome })` |
| 2026-09 | E2E 独占 WebView2 profile：`app_local_data_dir()` 由 `SHGetKnownFolderPath` 解析，重定向 `LOCALAPPDATA` 无效，原先 debug 构建的 `EBWebView-dev`（含 localStorage）与用户开发会话共用——E2E 切语言会污染开发会话。新增 `DSH_E2E_WEBVIEW_DATA_DIR`（仅 `is_e2e_run()` 下生效）并由 harness 指到 scratch home，实测开发 profile 时间戳不再变化 |
| 2026-09 | 批次 `04` 运行验证：桌面端全车道 `01`–`04` 共 25 条全绿（`01` 7、`02` 8、`03` 5、`04` 5） |
| 2026-09 | 批次 `04` 补 `TC-DSK-L3-04-006`（语言切换不重建 iframe）：该用例要验真实 iframe，改走**真实装配车道**（不置 `disableDownload`）。为让该车道可跑：预装引导跳过编排（`test/e2e/support/preinstall.ts`）、`stop()` 收掉被强杀应用遗留的 dsh 子进程（`killOrphanHarness`）、真实车道下点击统一改为每轮重新定位（`clickWhenReady`）。全车道 26 条全绿 |
| 2026-09 | 修复**首次进入主题默认**：`theme.rs` 的 `DEFAULT_THEME` 由 `Dark` 改为 `System`（无 `settings.yaml` 与偏好非法时都跟随系统），`use-theme-adaptive.ts` 的折算同步覆盖「偏好尚未取到」窗口；新增 Rust 单测 `config::theme::tests`，`TC-DSK-L3-04-005` 增加「首次进入必须回退 system」断言 |
| 2026-09 | 修复**导航栏被装饰层盖住**：`navbar.tsx` 镜像 dsh 遮罩样式的绝对定位层在遮罩铺满时（`inset: 0`）覆盖整条导航栏，菜单按钮既不响应真实点击也过不了 E2E 遮挡判定；补 `pointer-events-none` |
