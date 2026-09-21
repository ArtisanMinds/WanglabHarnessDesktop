# 测试文档变更历史

> 本文件承接原 `progressive.md` §5 的变更历史，独立成文以便查阅。
> 推进规则与进度台账见 [progressive.md](./progressive.md)，文档入口见 [README.md](./README.md)。

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
| 2026-09 | 禁用下载时渲染「下载已被环境禁用」页替代启动失败页（`RuntimeInfo::auto_download_disabled` → `setup.tsx`），布局与失败页同源；新增 `TC-DSK-L3-02-011`守门 |
| 2026-09 | 桌面端 E2E 车道加固：会话建立后显式切到主窗口 webview `main`（默认窗口可能落在桌宠 `pet`），`assertPreconditions` 增加 WebDriver 端口 4445 占用校验（被别的实例占住时会静默挂到对方窗口） |
| 2026-09 | 批次 `03` 实现：配置对话框 5 条接线（`005` 需服务运行中、`006` 需异常插件夹具，暂缓）；`config.tsx` 补 `dsh-config-dialog` / `-close` / `-nav-*` / `-nav-plugins-badge` / `-panel-body` 并给导航项加 `aria-current` 选中态；`Panel.Header` 增加 `testId` 与可选 `description`，据此给「应用」面板补上标题（原三面板自持标题、它独缺）；菜单操作从 `02` 抽出为 `test/e2e/support/navbar-menu.ts` 供两批复用 |
| 2026-09 | 批次 `03` 运行验证：桌面端全车道 `01`+`02`+`03` 共 20 条全绿；修正 `TC-DSK-L3-03-007`的尺寸断言——HeroUI `modal__container` 的入场缩放动画（`matrix3d(scale)` 起手 ~1.03）会让 `getBoundingClientRect()` 把对话框读大最多 3%，断言前须等尺寸稳定（G-D03-6） |
| 2026-09 | 批次 `03` CI 加固：windows runner 上对话框偶发在打开后 ~100–200ms 被收起（G-D03-7）。用例侧修两处竞态——`closeDialog()` 改为等节点从 DOM 卸载并排空 overlastic 退场窗口（`duration = 300`）后再重开；导航项点击改为每轮重新定位（`waitForClickable()` 只认首次句柄，节点被替换后必然轮询到超时）。失败信息附现场快照（`pageMark`/`navbar`/`disabledPage`/`url`） |
| 2026-09 | 批次 `03` 合并（PR #623），台账置「已验证」 |
| 2026-09 | 批次 `04` 实现：语言与主题 5 条接线（`006` 需 iframe 即全装配车道，暂缓）；`debug.tsx` 语言下拉补 `dsh-config-language-select` 与两个选项的 `data-testid`；配置对话框生命周期从 `03` 抽出为 `test/e2e/support/config-dialog.ts` 供后续批次复用；harness 增加 `homeDir`（复用隔离根重启）、`resetStore`、`stop({ keepHome })` |
| 2026-09 | E2E 独占 WebView2 profile：`app_local_data_dir()` 由 `SHGetKnownFolderPath` 解析，重定向 `LOCALAPPDATA` 无效，原先 debug 构建的 `EBWebView-dev`（含 localStorage）与用户开发会话共用——E2E 切语言会污染开发会话。新增 `DSH_E2E_WEBVIEW_DATA_DIR`（仅 `is_e2e_run()` 下生效）并由 harness 指到 scratch home，实测开发 profile 时间戳不再变化 |
| 2026-09 | 批次 `04` 运行验证：桌面端全车道 `01`–`04` 共 25 条全绿（`01` 7、`02` 8、`03` 5、`04` 5） |
| 2026-09 | 批次 `04` 补 `TC-DSK-L3-04-006`（语言切换不重建 iframe）：该用例要验真实 iframe，改走**真实装配车道**（不置 `disableDownload`）。为让该车道可跑：预装引导跳过编排（`test/e2e/support/preinstall.ts`）、`stop()` 收掉被强杀应用遗留的 dsh 子进程（`killOrphanHarness`）、真实车道下点击统一改为每轮重新定位（`clickWhenReady`）。全车道 26 条全绿 |
| 2026-09 | 修复**首次进入主题默认**：`theme.rs` 的 `DEFAULT_THEME` 由 `Dark` 改为 `System`（无 `settings.yaml` 与偏好非法时都跟随系统），`use-theme-adaptive.ts` 的折算同步覆盖「偏好尚未取到」窗口；新增 Rust 单测 `config::theme::tests`，`TC-DSK-L3-04-005`增加「首次进入必须回退 system」断言 |
| 2026-09 | 纠正**导航栏装饰层**的理解：该层镜像 dsh 页面遮罩，dsh 弹官方模态（如首次进入的 apiKey 引导）时遮罩铺满，此时壳层**就该**不可点，因此**不**加 `pointer-events-none`（先前误加，已撤销）。随之 `TC-DSK-L3-04-006`的 `afterEach` 语言归一改为「导航栏被遮罩时跳过」，不因此判失败（G-D04-7） |
| 2026-09 | 打通**跨域 iframe**（`TC-DSK-L3-04-006`的前置基础设施）：上游 `tauri-plugin-wdio-webdriver` 1.4.0 用 JS 模拟帧上下文（`frame.contentWindow.eval`），壳层 `tauri://localhost` 与内嵌 dsh `http://127.0.0.1:<port>` 跨域时 `contentDocument` 为 `null`，任何帧内脚本必然超时。以 `[patch.crates-io]` 指向 `src-tauri/vendor/tauri-plugin-wdio-webdriver`，Windows 路径改用原生 `ICoreWebView2Frame2::ExecuteScript`（引擎按帧路由，不受同源策略约束）；`frame_context` 为空时行为不变，深层嵌套帧仍回退上游路径。探针实测跨域帧内脚本从 167s 超时变为 173ms 正确返回。待上游支持后删除 vendor 与 `[patch.crates-io]`（`PATCH.md` 记载移除步骤；已提上游 issue [desktop-mobile#665](https://github.com/webdriverio/desktop-mobile/issues/665)） |
| 2026-09 | **桌面端用例范围收敛（275 → 109）**：桌面端用例过多且与插件用例集存在重叠，按「P1 全保留 + 每批次补足 3 条（安全边界优先）」重定范围，保留 **109** 条 L3 E2E 用例。被裁条目分两类：① 断言对象为**后端纯逻辑**（函数/时序/协议、转义、状态机细节）的 **106 条**下沉为「单元测试层」，在各文档同名小节保留记录，不计入 E2E；② 无用户可见后果或重复断言面的 UI 细节**直接删除**。`17` 桌宠批次整章移出，改由插件用例集 `plugins/02-dsh-tauri-pet.md`（`TC-PET-L3-02-001`～`004`）承载，桌面端不再维护桌宠用例。`18` 批次保持原样（7 条），以避免与 main 的 Linux 剪贴板修复冲突。已接线的 `01`–`04`（26 条）不受影响 |
| 2026-09 | **插件用例文档合并（19 → 17 个文件，用例总数不变 170 条）**：`01-host-lane-skeleton.md` + `02-dsh-tauri-core.md` → `01-dsh-host-and-core-contract.md`（编排骨架 + 共享路由契约）；`17-internal-plugins.md` 并入 `14-plugin-error-and-recovery.md`（异常与恢复 + 离线物化自愈）；`03`–`16` 顺移一位、`18` → `16`。用例编号按合并后文件序号重排（`TC-<域>-<层>-<文件序号>-<序号>`），`TC-HOST-L2-01-*`、`TC-CORE-L2-01-*`、`TC-REC-L3-14-*`、`TC-INT-L3-14-*` 四个前缀并存；`plugins/00-overview.md` §3/§6/§7、`docs/testing/README.md` 与插件文档内交叉引用同步 |
| 2026-09 | **桌面端用例文档合并（29 → 11 个文件，用例总数不变：109 条 E2E + 106 条单元测试层）**：按业务分组合并为 `01`–`11`，`TC-DSK-L3-*` 与 `G-D*` 编号按「新文件序号 + 文件内连续」重排（含「单元测试层」条目）；E2E 代码同步合并为 `test/e2e/desktop/01-window-shell.e2e.ts` 与 `test/e2e/desktop/02-config-locale.e2e.ts`，已接线的 26 条编号随之更新 |
| 2026-09 | **桌面端 E2E 收敛为一条启动冒烟**：桌面壳层职责收敛为「进入下载装配 → dsh 内核启动 → 页面无报错」。删除 `test/e2e/desktop/01-window-shell.e2e.ts`、`02-config-locale.e2e.ts` 与只服务它们的 `support/{navbar-menu,config-dialog,onboarding}.ts`，新增 `test/e2e/desktop/boot.e2e.ts`（`TC-DSK-L3-01-001`，含壳层与帧内报错收集）；`support/selectors.ts` 只保留冒烟用到的锚点。`desktop-host.ts` 去掉 `disableDownload` 车道，下载缓存默认改为本次运行独占空目录（装配必然真的下载并落盘），WebDriver 端口改从 `TAURI_WEBDRIVER_PORT` 读取（默认 4445，非法值当场 Fail）。生产侧「禁用自动下载」机制一并移除：`DISABLE_AUTO_DOWNLOAD`、`DSH_E2E_DISABLE_DOWNLOAD`、`auto_download_disabled()`、`RuntimeInfo.auto_download_disabled`、`setup.tsx` 的禁用页与 `status.download_disabled*` 文案、`store.harness.downloadDisabled` 及相关 Rust 单测。文档：`docs/testing/desktop/` 只保留 `00-overview.md`（重写）与 `01-boot.md`（新增），其余 11 份用例文档归档到 `archive/docs/testing/desktop/`；`docs/specs/desktop.test.md` 与 `docs/testing/README.md` 同步收敛 |
| 2026-09 | **插件用例文档收敛（17 → 11 个文件，170 → 108 条）**：移除清单监控、生命周期指令、预装引导、异常恢复、档案与补丁隔离、跨插件集成 6 份文档（`11`–`16`），归档到 `archive/docs/testing/plugins/`；`plugins/00-overview.md` §3/§6/§7/§8、`docs/testing/README.md`、`docs/testing/progressive.md` §4.2 与 `docs/specs/desktop.test.md` §7 同步收敛 |
| 2026-09 | 变更历史从 `progressive.md` §5 迁出为独立文件 `docs/testing/history.md`；`AGENTS.md` 增加测试入口约定（改动行为须同步 `docs/testing/README.md` 指向的用例文档与测试代码） |
| 2026-09 | **测试文件与用例文档同名同序号**：`test/e2e/plugins/<序号>-<主题>.e2e.ts` ↔ `docs/testing/plugins/<序号>-<主题>.md`，一个编号只允许一个测试文件（批内按层用 `describe` 分区）。`session-stream.e2e.ts` → `02-dsh-tauri-pet.e2e.ts`；新增 `01-dsh-host-and-core-contract.e2e.ts`。`docs/specs/plugin.test.md` §4 与 `plugins/00-overview.md` §2/§3/§9 同步 |
| 2026-09 | **插件 L2 宿主用量与日志收敛**：一次 `pnpm test:e2e:plugin` 从 7 次起宿主降到 3 次（21s，原 50s）。`globalSetup` 的共享宿主默认挂载改为 `dsh-tauri-pet` + `also: dsh-tauri,dsh-tauri-rightclick`，使 `01` 的 002 与共享契约段共 8 条复用同一进程；`dsh-host.ts` 抽出并导出 `scaffoldDshProfile`（只建 profile + 挂载、不起宿主），`01` 的 006 改为只验 `dsh plugin add` 的落盘结果；005 只保留 `keepHome` 分支（「默认清理」由 001 覆盖）。控制台每次起宿主只留 3 行（`🚀 挂载 DSH 核心 [<版本>] (profile: <scratch 目录名>)` / `└─ 路径: <dsh bin>` / `✅ 就绪 [<baseUrl>] → <已挂载包>`），删除「挂载方式/profile=」「启动 dsh web（DSH_HOME=…）」「使用桌面端已装配的 dsh：<长路径>」「KEEP_HOME：保留」四处刷屏 |
| 2026-09 | **批次 `01` 实现并运行验证（插件车道，12 例全绿）**：`test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts` 覆盖编排骨架 6 例（`TC-HOST-L2-01-001`–`006`）+ 共享路由契约 6 例（`TC-CORE-L2-01-001`–`006`），`pnpm test:e2e:plugin` 全车道 14 例通过。编排新增导出 `assertMountRegistered`，使 link 模式下不可达的「挂载漏登记」分支可被直接覆盖。「未构建产物」夹具改用 `dsh-tauri-tsdown`（源码即产物、被 `build:plugins` 显式排除），不再移动仓库产物。**实测修正**：跨源变更请求在真实宿主里由上游 `dsh-client-connection` 的 Host/Origin 围栏先拒（`forbidden`），路由层 `routes/index.ts:287` 的 `cross-origin-request` 在 L2 不可达，该分支由 L1 `packages/dsh-tauri/src/host/routes/index.test.ts:240` 覆盖，`plugins/01` 的期望值已按可观察事实改写；`plugins/00-overview.md` 缺口 G1/G4 消解、新增 G10 |
| 2026-09 | **应用标识符缩短**：`tauri.conf.json` 的 `identifier` 由 `io.github.hairyf.deepseek-harness-desktop` 改为 `dsh-tauri`（app-data / app-local-data 目录名随之变化），新增 `config::APP_IDENTIFIER` / `LEGACY_APP_IDENTIFIER` 常量，`logger` 不再自带字面量。新增启动期迁移 `service::migrate::migrate_app_data_dir`：在 `detect_first_install` 之前把旧标识符兄弟目录整体搬入新目录（同卷 rename 快路径，已存在则递归合并、新者胜，搬入的 pnpm 元数据清除），失败仅告警不阻断；**debug/E2E 不执行**（app-data 根与生产共用，不得搬动；E2E 门控只看 `TAURI_WEBDRIVER_PORT`，release 二进制也可能跑 E2E，故与 debug 分开判定），迁移根为符号链接 / Windows reparse point 时拒绝迁移（避免越出 app-data 边界）。由 Rust 单测覆盖路径映射、链接识别与「目标已存在（logger 先落盘 logs）时仍完整搬入 Store/依赖」三个场景。同步更新 E2E 编排路径（`desktop-host.ts` / `dsh-host.ts`）、shim/进程测试夹具、`resources/README.md`、`skills/handle/SKILL.md`、`docs/specs/desktop.test.md` §6.1 与 `docs/testing/desktop/00-overview.md` §5 |
| 2026-09 | **插件批次 `02`–`09` 的 L2 段落地并运行验证（插件车道 9 files / 55 tests 全绿）**：新增 `test/e2e/plugins/02`–`09` 共 8 个 L2 宿主路由文件与同名用例文档（`02` 扩充既有文件），合计接线 **43** 条新用例（`01` 的 12 条不变，累计 55 条）。编排侧把 `global-setup.ts` 的共享宿主从「`dsh-tauri`,`dsh-tauri-rightclick`」改为**默认挂载全部产品可见插件**，`02`–`09` 的 L2 段复用同一进程（一次全车道仅起 3 次宿主）；`01` 的「未挂载插件 → 404」探针原用 `dsh-tauri-turnrewind`（该包已被 `09` 挂载），改用仓库内不存在的插件 id 并补断言「404 响应体不带插件领域文案」。各批文档同步：头部署名改真实路径（旧名 `open-routes`/`archive-routes`/`worktree-routes`/`resume-route`/`extension-routes`/`scheduler-routes`/`turnrewind-routes`.e2e.ts 作废）、`[自动化]` 填真实 `文件:行号`、`desktop` project「未配置（G4）」过时表述统一改为「待接线（L3 通道尚未接入）」。**实测修正**：`04` 的空归档集合清空（`/session/archive/clear`）状态码确为 500，但响应体是宿主未处理异常的标准载荷 `{status:500,unhandled:true,message:'HTTPError'}`，领域文案 `缺少 sessionIds` **不下发客户端**（根因 `packages/dsh-tauri-session/src/host/service/archive.ts:62`，记 G-SESS-4，疑似缺陷）；`05` 的 `POST /checkouts` 未绑定失败体只有 `{error}` 无 `ok`（`checkouts/post.ts:16`，与 `delete.ts:12` 的 `{ok:false,error}` 不一致，文档预期按实测收紧）；`07` 的 `GET /skills` **不受 scratch `DSH_HOME` 隔离**（读到运行机真实用户技能目录，记 G-EXT-4，E2E 隔离性缺口而非产品缺陷，故条数与内容不作断言），且 `POST /host/restart` 无 `Origin` 时未被上游连接门遮蔽、403 由插件自身给出（记 G-EXT-5）；`08` 的 `-003` 三类缺参 `error` 文案按实测收紧为逐字相等。**按实测固化的疑似缺陷**（未改实现）：`04` 空集合清空返回未处理异常载荷、`05` `DELETE` 缺参返回 200 幂等失败体（与 `session` 的缺参 400 风格不一致，G-WT-4）。**顺带修复**：`dsh-tauri-turnrewind` 的 `summary/get.ts:2`、`live/get.ts:2` 过期注释（把端点写作 `.../session/summary`、`.../session/live`，实际注册为 `/summary`、`/live`，G-REW-4）；`02` 的两处 `test()` 别名与 `it()` 标题口径统一到文档（G-PET-4 消解）。`-C-*`（G2 未装 playwright）与 `-L3-*`（L3 通道尚未接入）保持未接线；`10` 整批待办 |
| 2026-09 | **插件批次 `10`–`11` 落地并运行验证（插件车道 11 files / 92 tests 全绿）**：新增 `test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts`（8 例，`GET`/`PUT /config/editor`、`GET /endpoint/models`、`GET /presets`、`POST /config/open` 的响应形状与错误面）与 `test/e2e/plugins/11-dsh-tauri-connection.e2e.ts`（3 例，内嵌模式鉴权闸门覆写与 `<iframe>` reload 链路），配套用例文档 `10-dsh-tauri-model-config.md` / `11-dsh-tauri-connection.md`。实测：`GET /presets` 恰六字段且 `count=1574`，`?ns=nope` → 502，`?ns=` 空串 → 500 未处理载荷（登记为缺陷线索）；`TC-MC-L2-10-002` 不可自动化，刻意不写 `it()`（G-MC-4/9）。**L3 收敛**：`03`–`10` 的 11 条 `-L3-*` 按「只有断言对象是 Tauri 原生产物才允许 L3」降级为浏览器断言并保留原编号与条数，仅批次 `02` 保留 4 条 L3 于 `test/e2e/desktop/02-pet-window.e2e.ts`（跨文件例外）。**文档↔代码一致性**：11 份用例文档 `[自动化] 是` 96 ↔ `it()` 96（逐文件相等），`[Case ID]` 合计 132；G2（未装 playwright）与 G4（`desktop` project 未配置）消解，新增 G10 跨源遮蔽、G11 依赖会话的浏览器用例无法真跑 |
| 2026-09 | **桌面车道下载缓存改为默认共享**：`test/e2e/support/desktop-host.ts` 的 `DSH_DOWNLOAD_CACHE_DIR` 由「本次运行独占空目录」改为默认 `$DSH_E2E_DOWNLOAD_CACHE_DIR`（缺省 `<os.tmpdir()>/dsh-e2e-download-cache`），已下好的 Node / dsh 核心不再每次重下；只有显式 `coldCache: true`（等价 `DSH_E2E_COLD_ASSEMBLY=1`）才退回独占空目录。`test/e2e/desktop/boot.e2e.ts` 显式 `coldCache: true`，以保持它「装配必然真的下载并落盘」的断言强度。文档同步：`docs/specs/desktop.test.md` §6/§6.1/§8.1、`docs/testing/desktop/00-overview.md` §3/§5、`docs/testing/desktop/01-boot.md` |
| 2026-09 | **测试体系整改收口（子设计 04 文档同步）**：`docs/specs/desktop.test.md` 与 `docs/specs/plugin.test.md` 按整改后事实重写——L3 准入原则（断言对象必须是 Tauri 原生产物）写入 `desktop.test.md` §1，`plugin.test.md` §3 改为 Playwright 库 API 驱动、§8 改为实际批次 `01`–`11`、§4/§6 补跨文件例外与按元素归属分流的选择器口径；`docs/testing/README.md` 索引补 `11-dsh-tauri-connection.md`、用例规模按实测重写、目录树删掉不存在的 `test/unit/` 并补 `test/e2e/support/browser.ts`、运行命令补 `-- --run` 提醒与正确的单文件位置参数、新增 §7 覆盖率；`docs/testing/desktop/**` 与 `progressive.md` §4（本子设计独占）按实测计数重写。详细分节见下 |

---

## 测试体系整改（2026-09，`docs/specs/09-21-测试体系整改-*`）

> 主 Spec：`docs/specs/09-21-测试体系整改-主设计.md`；子设计 `01` 架构 / `02` 插件 E2E / `03` 单测质量 / `04` 文档同步。波次按 DAG 串行：第 1 波只做 `01`（独占 `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `.github/workflows/ci.yml`），第 2 波 `03` ∥ `02`，第 3 波 `04` 收口。`docs/testing/progressive.md` §4 与本文的写入权独占归 `04`，`02` / `03` 只上报不改。

### 第 1 波：架构（子设计 01）

- **放弃 Vitest browser mode**：`@vitest/browser-webdriverio` / `@vitest/browser-playwright` 均不接入。插件层与桌面层都是 `environment: 'node'` + **驱动库 API**——插件车道用 Playwright 库 API（`import { chromium } from 'playwright'`，复用 `globalSetup` 起的真实 dsh 宿主与已换取的 Cookie），桌面车道用 WebdriverIO standalone session。证否依据见该子设计 §2：Tauri webview 的顶层文档就是应用自身，而 browser mode 需要自己的 orchestrator 作为顶层页面，二者不可兼得；wdio provider 的 `supportedBrowser` 不含 tauri/wry，也没有注入既有 session 的 API。
- `test/e2e/support/dsh-host.ts` 与 `test/e2e/support/desktop-host.ts` **保留未删**，`test/e2e/global-setup.ts` **未改名**。
- 依赖：`playwright` 与 `@vitest/coverage-v8` 加入 `pnpm-workspace.yaml` 的 `catalogs.testing` 并在 `package.json` 引用（整改前 `require.resolve('playwright')` 为 `MODULE_NOT_FOUND`，浏览器用例根本 import 不到）。
- CI：`Plugins E2E Tests` 作业增加 Chromium 安装（`pnpm exec playwright install --with-deps chromium`，二进制不带在 npm 包里）；`Unit Tests` 作业前置 `pnpm build:plugins`（该产物缺失时相关用例 `skipIf` 跳过、在 CI 里从不执行）。

### 第 2 波 A：单测质量（子设计 03）

- `pnpm test:unit -- --run` = **103 files / 981 tests** 全绿（整改前 99 / 884）；`--sequence.shuffle`（seed `1789992333147`）亦全绿。
- 7 条 blocker 全部经**变异验证**（故意破坏实现 → 11 个用例转红）。收口时用 `node node_modules/vitest/vitest.mjs run --project unit` 复核 = 103 files / 981 tests（135.68s）。
- 覆盖率：`@vitest/coverage-v8` 已安装且**必须能产出报告**，但**不设阈值、不卡关、不进 CI 门禁**。`exclude` 只能落在根 `vitest.config.ts`（project 级同名字段被 Vitest 忽略），已排除 `source/`、`archive/`、`test/archive/`、`src-tauri/`。实测基线：Statements 66.06% / Branches 60.24% / Functions 68.18% / Lines 66.31%。

### 第 2 波 B：插件 E2E（子设计 02）

- 用例文档扩到 `01`–`11`：新增 `10-dsh-tauri-model-config.md`（8 例）与 `11-dsh-tauri-connection.md`（3 例），后者是本轮**唯一新建**的用例文档。
- **L3 收敛**：只有断言对象是 Tauri 原生产物（独立 OS 窗口句柄、窗口几何夹紧、Tauri IPC 往返）才允许 L3；业务面板 / 侧栏 / tab / 对话框等 dsh 内部 DOM 一律用 L2 浏览器断言。实际落地：**仅批次 `02` 保留 4 条 L3**（`test/e2e/desktop/02-pet-window.e2e.ts`，跨文件例外），其余 `03`–`10` 的 11 条 `-L3-*` 降级为浏览器断言并保留原编号与条数。
- 文档 ↔ 代码一致性：11 份用例文档的 `[自动化] 是` **96** ↔ 代码 `it()` **96**（逐文件相等；`plugin` 车道 92 + `desktop` 车道 4），`[Case ID]` 合计 **132**。旧文档写的 107 / 108 / 122 均不成立。
- 实测：插件车道连续 5 次运行均 **11 files / 92 tests** 全绿。

### 第 3 波：文档同步（子设计 04）

- `docs/specs/desktop.test.md`：§1 增加**可机检的 L3 准入原则**（只有断言对象是 Tauri 原生产物才允许 L3）；桌面端表述从「唯一一条用例」改为 `01-boot` + `02-pet-window` 两类；§3.2 补跨文件例外；§5 选择器改为按元素归属分流（壳层 `data-testid` / 插件包 `data-dsh-*` / 内嵌 dsh 上游锚点，并登记 `packages/dsh-tauri-ui/src/client/obstructions.ts:88` 的 `attributeFilter` 属行为钩子、不得为测试改名）；§6/§6.1/§8.1 同步下载缓存与命令口径；§8.2 补 `exclude` 说明；新增 §8.4 覆盖率。
- `docs/specs/plugin.test.md`：§1 补 L3 准入原则与「只承接 Tauri 原生产物」的定位；§3 改为 Playwright **库 API**（删除已证否方案的描述）；§4 补跨文件例外与 `browser.ts`；§6 选择器与禁止项改为按元素归属分流；§8 批次表重写为实际 `01`–`11`（含逐批用例数与实测）；§9 补 `-- --run` 与位置参数口径。
- 修掉子设计 04 §4 列出的 12 项缺陷：`合计 108`、`plugins/10-*.md` 的悬空引用与 `[自动化]` 矛盾、`plugins/04-*.md` 的行号偏移（+7）、`plugins/07-*.md` 的标题不一致、`plugins/00-overview.md` 的 G2 过期事实、两个 `00-overview.md` 的过期范围、`plugin.test.md` §8 的「批次 1–18」、单文件过滤的 `vitest ... -- <file>` 写法、缺 `-- --run` 提醒、选择器适用范围、跨文件例外。
- `docs/testing/README.md`：索引补 `11-dsh-tauri-connection.md`；用例规模按实测重写（`desktop` 2 files / 5 tests、`plugin` 11 files / 92 tests、`unit` 103 files / 981 tests、`[Case ID]` 132 / `[自动化] 是` 96）；目录树删掉不存在的 `test/unit/`、补 `test/e2e/support/browser.ts`；§4 补 `-- --run` 提醒、正确的单文件位置参数与 `node node_modules/vitest/vitest.mjs run --project <lane>` 直跑写法；新增 §7 覆盖率。
- 已证否 / 不存在的方案描述**直接删除**（不留「已废弃」注记堆积）：`docs/testing/**` 与两个 `*.test.md` 内不再出现 Vitest browser mode 系列的方案描述；`archive/docs/testing/**` 一轮内不读取、不引用内容、不搬回。

### 文档侧一致性核对（计数口径与输出，可复核）

- `[Case ID]` **字段行**：`rg --count-matches '^\[Case ID\]' docs/testing/plugins/` 逐文件 12/13/12/13/11/12/23/15/7/10/3，合计 **131**；追踪矩阵（`plugins/00-overview.md` §7.1）记 **132**，差额 1 处是 `plugins/02-dsh-tauri-pet.md:10` §4 正文里的引用（非用例条目）。
- `[自动化] 是`：`rg --count-matches '\[自动化\] 是' docs/testing/plugins/` 逐文件与对应 `it()` **逐文件相等**（`02` 为 13 = `plugin` 9 + `desktop` 4）。
- `it()` 总数：`rg -c '^\s*it\(' test/e2e/plugins/*.e2e.ts` 合计 **92**，加 `test/e2e/desktop/02-pet-window.e2e.ts` 的 **4** = **96**；`test/e2e/desktop/boot.e2e.ts` 另 **1** 条（`desktop` 车道合计 5）。
- `[自动化] 是（<file>:<line>）` 指针体检：80 处指向 `it(` 所在行命中；4 处（`plugins/02-dsh-tauri-pet.md` → `test/e2e/desktop/02-pet-window.e2e.ts:139/154/164/180`）实际 `it(` 在 `:144/:159/:169/:185`，属待修的行号偏移。
- 废弃表述扫描：`rg -n '@vitest/browser|browser-webdriverio|browser-playwright|setup-desktop|setup-plugin' docs/` 在 `docs/testing/**` 与两个 `*.test.md` 内**零命中**，仅余两份整改 Spec（`docs/specs/09-21-*`）自身的「已放弃并说明原因」记录。
- 悬空引用扫描：`rg -n 'test/e2e/[A-Za-z0-9/_.-]+\.(ts|mjs)' docs/testing docs/specs` 命中项逐个核对存在性，`docs/testing/**` 与两个 `*.test.md` 内无指向不存在文件的引用。
