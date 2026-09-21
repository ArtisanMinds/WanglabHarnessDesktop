# 总览与前置（00）：桌面端插件测试用例集

> 层级：总览（不承载可执行用例本体）
> 规范来源：[插件 E2E 测试规范](../../specs/plugin.test.md)、[桌面端 E2E 测试规范](../../specs/desktop.test.md)
> 流程来源：[渐进式测试推进规则](../progressive.md)
> 状态：已验证（总览事实已按当前实现刷新；批次 01 已通过运行验证）

---

## 1. 任务理解

- **被测对象**：仓库内置插件（`packages/*`）在两层真实宿主中的可观察行为，以及桌面端壳层对插件的装配结果。
- **两级宿主**（来自 `docs/specs/plugin.test.md` §2）：

| 层级 | 宿主 | 驱动方式 | 覆盖对象 |
| --- | --- | --- | --- |
| L2 插件宿主 E2E | 真实 `dsh web` 进程（+ 真实浏览器页面） | Vitest `plugin` project；HTTP 断言先行，浏览器断言待接线 | 宿主路由、客户端挂载点、崩溃防护 |
| L3 桌面端宿主 E2E | 真实 Tauri 窗口（`deepseek-harness-desktop.exe`） | Vitest `desktop` project + WebdriverIO（内嵌 WebDriver server） | 依赖 Tauri 桥的插件与壳层集成 |

- **纳入范围**：`packages/` 下 10 个产品可见插件、核心桥接包 `dsh-tauri`、编排骨架与共享路由契约。
- **不纳入范围**：`source/`（vendored dsh 核心）、`archive/`、`test/archive/`、上游核心自身的功能正确性。

**覆盖策略**：按「先证明地基、再证明插件自报产物、最后证明桌面端集成」推进；每条用例只断言外部可观察事实（HTTP 字节、DOM 标记、窗口集合），不接受插件自我报告。

---

## 2. 多源输入与冲突处理

| 来源 | 提供的规则 |
| --- | --- |
| `docs/specs/plugin.test.md` | L1/L2/L3 分层、批次 1–18 路线图、断言准则、环境变量表、L2 执行流程 |
| `docs/specs/desktop.test.md` | 用例文档字段与优先级口径、`data-testid` 规范、端口/数据目录隔离、目录归属 |
| `docs/testing/progressive.md` | 单批单卡、状态定义与台账位置 |
| 源码事实 | `packages/*/src/**`、`src/**`、`src-tauri/src/**`、`test/e2e/support/**` |
| 现有测试 | `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts`（编排骨架 + 共享路由契约 12 例已落地）、`test/e2e/plugins/02-dsh-tauri-pet.e2e.ts`（SSE 首帧 2 例已落地） |

**已记录的冲突与取舍**：

1. **用例文档目录**：`desktop.test.md` §3.2 写 `docs/testing/plugins/<插件名>.md`，`plugin.test.md` §4 写 `docs/testing/plugins/<name>.md`；两者一致。本次额外要求「从 00 编号开始」，故统一采用 `<序号>-<主题>.md`。
   **测试文件同规则**：`test/e2e/plugins/<序号>-<主题>.e2e.ts`，与用例文档**同名同序号一一对应**（一个编号 = 一个文档 = 一个测试文件，批内多段用 `describe` 分区，不再拆文件）。
   **唯一例外（批次 02）**：4 条 Tauri 原生窗口用例落在 `test/e2e/desktop/02-pet-window.e2e.ts`，两文件 `it()` 合计等于该文档 `[Case ID]` 数；理由见 §3 的跨文件例外说明。
2. **优先级口径**：用例编写通用口径为 P0–P3，本仓规范为 P1–P5。**以本仓规范为准**（见 §4），不混用。
3. **L2 浏览器驱动**：`plugin.test.md` §3.2 指定 Playwright 库 API，子设计 01 已把 `playwright` 落在 `package.json` / `pnpm-lock.yaml`。本套用例因此**在 `plugin` project 内**（`environment: 'node'`）用 `import { chromium } from 'playwright'` 拉起真实 Chromium，不引入 Test Runner、不新增 Vitest project；共享编排在 `test/e2e/support/browser.ts`。
4. **桌面端端口是否固定**：`desktop.test.md` §6 称 debug 固定 `3081`、不可动态修改；实现侧存在端口占用后递增的逻辑（`src-tauri/src/service/workflow/launch.rs:874`，`src-tauri/capabilities/default.json:4` 注释亦声明 port is NOT fixed）。**本套文档以「默认 3081 + 运行前实测空闲」为准**，不假设端口绝对不变（见 §8 G5）。
5. **插件客户端只在内嵌 frame 内生效**：`dsh-tauri`、`dsh-tauri-pet` 的 client 入口均有 `window.parent === window` 早退（`packages/dsh-tauri/src/client/apply.ts:29`、`packages/dsh-tauri-pet/src/client/index.ts:24`）。浏览器层用例因此统一构造同源嵌入环境（`page.route` 提供 `/dsh-e2e-embed.html`，内含指向 `/` 的 iframe），而不是在顶层页面断言槽位——顶层页面的**负向**事实本身也是一条用例（`TC-PET-C-02-001`）。

---

## 3. 编号与文件清单（渐进顺序）

编号即推进顺序：编号越大，依赖越多、断言面越宽。

| 编号 | 文件 | 测试文件（同名同序号） | 被测对象 | 主层级 | 对应批次 |
| --- | --- | --- | --- | --- | --- |
| 00 | `00-overview.md` | —（总览不承载用例） | 总览、前置、追踪矩阵 | — | — |
| 01 | `01-dsh-host-and-core-contract.md` | `01-dsh-host-and-core-contract.e2e.ts` | 编排骨架（scratch 宿主 + 挂载 + 随机端口）与共享路由契约（OPTIONS/405/403/413） | L2 | 批次 1–2 |
| 02 | `02-dsh-tauri-pet.md` | `02-dsh-tauri-pet.e2e.ts` **+ `test/e2e/desktop/02-pet-window.e2e.ts`** | 桌宠插件（SSE → 客户端挂载 → 桌面端窗口） | L2 → L3 | 批次 3 |
| 03 | `03-dsh-tauri-rightclick.md` | `03-dsh-tauri-rightclick.e2e.ts` | 右键菜单与外部打开 | L2 | 批次 4+ |
| 04 | `04-dsh-tauri-session.md` | `04-dsh-tauri-session.e2e.ts` | 会话归档与打开目录 | L2 | 批次 4+ |
| 05 | `05-dsh-tauri-worktree.md` | `05-dsh-tauri-worktree.e2e.ts` | 工作树面板与路由 | L2 | 批次 4+ |
| 06 | `06-dsh-tauri-ui.md` | `06-dsh-tauri-ui.e2e.ts` | 壳层槽位注入（导航/侧栏/设置） | L2 | 批次 4+ |
| 07 | `07-dsh-tauri-panel-extension.md` | `07-dsh-tauri-panel-extension.e2e.ts` | 扩展管理面板（技能 / MCP / 市场） | L2 | 批次 4+ |
| 08 | `08-dsh-tauri-panel-scheduler.md` | `08-dsh-tauri-panel-scheduler.e2e.ts` | 定时任务面板 | L2 | 批次 4+ |
| 09 | `09-dsh-tauri-turnrewind.md` | `09-dsh-tauri-turnrewind.e2e.ts` | 回合级变更记录 | L2 | 批次 4+ |
| 10 | `10-dsh-tauri-model-config.md` | `10-dsh-tauri-model-config.e2e.ts` | 模型配置 | L2 | 批次 4+ |
| 11 | `11-dsh-tauri-connection.md` | `11-dsh-tauri-connection.e2e.ts` | 桌面载体鉴权适配（401 降级 / 索引放行） | L2 | 批次 4+ |

> `dsh-tauri-bundle`、`dsh-tauri-tsdown` 是打包/构建工具包（无 `exports["./client"]`，见各自 `package.json`），不属于产品可见插件，不在本套用例范围。
>
> **跨文件例外（仅批次 02）**：`plugin.test.md` §4 的「一个编号只允许一个测试文件」对批次 `02` 有**明确例外**——L2/浏览器段在 `test/e2e/plugins/02-*.e2e.ts`，L3 段（4 条 Tauri 原生窗口用例）在 `test/e2e/desktop/02-pet-window.e2e.ts`。原因是运行归属：`plugin` 车道的 CI 作业是 ubuntu-latest（`.github/workflows/ci.yml`），Tauri 与 `build:debug` 是 Windows-only；把窗口用例留在插件文件里就是「写了却永不执行」。两文件 `it()` 合计等于该文档 `[Case ID]` 数。
>
> **L3 收敛**：除批次 `02` 的 4 条外，原有 `-L3-*` 用例已按「只有断言对象是 Tauri 原生产物才允许 L3」的原则降级为浏览器断言（`03` `-RC-L3-03-001/002`、`04` `-SESS-L3-04-001/002`、`05` `-WT-L3-05-001`、`06` `-UI-L3-06-001/002`、`07` `-EXT-L3-07-001`、`08` `-SCH-L3-08-001`、`09` `-REW-L3-09-001`、`10` `-MC-L3-10-001`）。

---

## 4. 优先级定义（按仓规范）

| 优先级 | 含义 |
| --- | --- |
| P1 | 核心正向：插件在真实宿主里被用户看见/可用的主路径 |
| P2 | 基本正向：次要入口、幂等重复、可恢复路径 |
| P3 | 核心异常：拒绝、超时、缺少依赖、非法入参 |
| P4 | 边界：空值、极值、并发、环境变量边界 |
| P5 | 低频：跨平台差异、罕见组合 |

单条用例只变更**一个变量**；标题以「验证」开头，反向用例前缀 `[反向]`。

---

## 5. 全局前置与环境隔离

### 5.1 L2（可立即运行的部分）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 构建前置 | `pnpm build:plugins`（除 `dsh-tauri-bundle` / `dsh-tauri-tsdown` 外，`packages/*/dist` 均已产出） | `test/e2e/support/dsh-host.ts:172` |
| 入口解析 | `DSH_E2E_DSH_BIN` → 仓库依赖树 → 桌面端装配目录 | `test/e2e/support/dsh-host.ts:144` |
| Node 入口 | `DSH_E2E_NODE_BIN`（默认 `process.execPath`） | `test/e2e/support/dsh-host.ts:101` |
| 目标插件 | `DSH_E2E_PLUGIN`（默认 `dsh-tauri-pet`） | `test/e2e/global-setup.ts:39` |
| 附加挂载 | `DSH_E2E_ALSO`（逗号分隔，默认挂载全部产品可见插件） | `test/e2e/global-setup.ts:42` |
| 挂载模式 | `DSH_E2E_MOUNT=link`（默认）/ `cli` | `test/e2e/support/dsh-host.ts:412` |
| 保留现场 | `DSH_E2E_KEEP_HOME=1` | `test/e2e/global-setup.ts:41` |
| 运行 | `pnpm test:e2e:plugin`（= `vitest --project plugin`） | `package.json:22` |
| 隔离 | 每次运行独占 `<tmp>/dsh-e2e-<plugin>-<时间戳>`，不触碰用户真实 `DSH_HOME` | `test/e2e/support/dsh-host.ts:407` |
| 用例归属 | `test/e2e/plugins/<序号>-<主题>.e2e.ts`（`fileParallelism: false`） | `vitest.plugin.config.ts:15` |

> 环境变量只影响 `globalSetup` 起的那一个共享宿主。自带宿主的用例（如 `01` 的 001/005）在进程内直接传参，不受这些变量左右。
> **宿主最小化**：用例能复用共享宿主就绝不另起进程——每个 `dsh web` 都要多付一个进程与一行日志。
> **控制台输出**：每次起宿主只留 3 行——`🚀 挂载 DSH 核心 [<版本>] (profile: <scratch 目录名>)`、`└─ 路径: <dsh bin>`、`✅ 就绪 [<baseUrl>] → <已挂载包>`；`dsh web` 的完整输出只进 `home/dsh-web.log`。

---

## 6. 建议执行顺序

1. **冒烟子集**（最小可信集）：`01` 全部（编排骨架 + 共享路由契约）→ `02` 的 `TC-PET-L2-02-001` / `TC-PET-L2-02-002`。
2. **核心扩展（宿主 L2）**：`03`–`11` 中全部已接线的 L2 用例；每条只依赖 `pnpm build:plugins` 与 scratch 宿主。
3. **客户端渲染层**：全部已接线的 `-C-*` 用例（真实 Chromium + 同源嵌入文档，编排见 `test/e2e/support/browser.ts`）。
4. **桌面端集成**：`02` 的 4 条 `-L3-*` 窗口用例（`test/e2e/desktop/02-pet-window.e2e.ts`，Windows + `pnpm build:debug`）。
5. **需真实会话/凭据的用例**：全部**待补**条目——`04`/`05`/`07`/`08` 的面板与图标段、`09` 的卡片段、`06` 的续跑正向段、`06` 的 `TC-UI-L2-06-003/004/005/006`、`10` 的端点探测成功路径（见 §8 G9 / G11）。

---

## 7. 追踪矩阵

### 7.1 文件 → 用例编号

| 文件 | Case ID 前缀 | `[Case ID]` 条数 | `[自动化] 是` | `it()` | 层级分布 |
| --- | --- | --- | --- | --- | --- |
| `01-dsh-host-and-core-contract.md` | `TC-HOST-L2-01-*` / `TC-CORE-L2-01-*` | 12 | 12 | 12 | L2 |
| `02-dsh-tauri-pet.md` | `TC-PET-L2-02-*` / `-C-02-*` / `-L3-02-*` | 14 | 13 | 9 + 4（L3 段在 `desktop` 车道） | L2 → L3 |
| `03-dsh-tauri-rightclick.md` | `TC-RC-L2-03-*` / `-C-03-*` / `-L3-03-*` | 12 | 5 | 5 | L2 |
| `04-dsh-tauri-session.md` | `TC-SESS-L2-04-*` / `-C-04-*` / `-L3-04-*` | 13 | 9 | 9 | L2 |
| `05-dsh-tauri-worktree.md` | `TC-WT-L2-05-*` / `-C-05-*` / `-L3-05-*` | 11 | 7 | 7 | L2 |
| `06-dsh-tauri-ui.md` | `TC-UI-L2-06-*` / `-C-06-*` | 12 | 6 | 6 | L2 |
| `07-dsh-tauri-panel-extension.md` | `TC-EXT-L2-07-*` / `-C-07-*` / `-L3-07-*` | 23 | 19 | 19 | L2 |
| `08-dsh-tauri-panel-scheduler.md` | `TC-SCH-L2-08-*` / `-C-08-*` / `-L3-08-*` | 15 | 11 | 11 | L2 |
| `09-dsh-tauri-turnrewind.md` | `TC-REW-L2-09-*` / `-C-09-*` / `-L3-09-*` | 7 | 3 | 3 | L2 |
| `10-dsh-tauri-model-config.md` | `TC-MC-L2-10-*` / `-C-10-*` / `-L3-10-*` | 10 | 8 | 8 | L2 |
| `11-dsh-tauri-connection.md` | `TC-CONN-L2-11-*` | 3 | 3 | 3 | L2 |
| **合计** | — | **132** | **96** | **96** | — |

> **口径**：`[Case ID]` 是文档声明的用例条目总数；`[自动化] 是` 与 `it()` 两列必须逐文件相等（文档↔代码 1:1）。本轮实测的 `files/tests` 计数以 `pnpm test:e2e:plugin -- --run` 的真实输出为准（见 §8 G11 的运行记录）。批次的 `-L3-*` 条目按「Tauri 原生产物」原则折算：仅批次 `02` 保留 4 条（落在 `desktop` 车道），其余批次的 `-L3-*` 条目已降级为浏览器断言并保留原编号与条数。

### 7.2 关键来源 → 覆盖位置

| 来源条目 | 覆盖文件 | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `plugin.test.md` §5（L2 执行流程 1–9 步） | `01` | 正向 / 异常 / 边界 | 端口冲突、宿主提前退出分支未覆盖 |
| `plugin.test.md` §6（必须断言项、禁止项） | `01`–`11` | 正向 / 异常 | 「零崩溃」现由浏览器层（`test/e2e/support/browser.ts`）承担，见 G2 |
| `plugin.test.md` §8 批次 3（pet） | `02` | 正向 / 异常 | L2 / 浏览器段已落地；L3 段在 `desktop` 车道 |
| `plugin.test.md` §8 批次 4+（worktree） | `05` | 正向 / 异常 | 真实 git 创建链路未覆盖 |
| `plugin.test.md` §8 批次 4+（其余插件） | `03`、`04`、`06`–`11` | 正向 / 异常 / 边界 | 各文件末节列出未覆盖分支 |
| `desktop.test.md` §5（`data-testid`） | 全部 L3 用例 | 前置约束 | 壳层当前 0 个 `data-testid`，见 G3 |
| `desktop.test.md` §6（端口/目录隔离） | `01` | 边界 | 端口「固定」表述与实现冲突，见 G5 |
| `progressive.md` §1（单批单卡） | 全部文件 | 流程约束 | 每个编号文件视为一个批次 |

### 7.3 高风险路径的正向 / 异常 / 边界覆盖

| 高风险路径 | 正向 | 异常 | 边界 |
| --- | --- | --- | --- |
| 宿主编排（挂载 + 启动） | TC-HOST-L2-01-001 | TC-HOST-L2-01-003、TC-HOST-L2-01-004 | TC-HOST-L2-01-005 |
| 共享路由契约 | TC-CORE-L2-01-001、TC-CORE-L2-01-002 | TC-CORE-L2-01-003、TC-CORE-L2-01-004、TC-CORE-L2-01-006 | TC-CORE-L2-01-005 |
| 插件路由真实响应 | 各文件 L2 正向 | 各文件 L2 异常 | 各文件 L2 边界 |
| 客户端挂载产物 | 各文件 `-C-001` | 各文件 `-C-003`/`-C-004` | 各文件 `-C-002`/`-C-004` |

---

## 8. 缺口与假设

| 编号 | 类型 | 内容 | 影响 |
| --- | --- | --- | --- |
| G1 | ~~事实~~ 已消解 | `packages/*/dist` 现已全部产出（仅 `dsh-tauri-bundle` / `dsh-tauri-tsdown` 无产物，且被 `build:plugins` 显式排除，已作为「未构建」夹具） | 不再阻塞 L2 |
| G2 | ~~缺口~~ **已消解** | `playwright` 已由子设计 01 落在 `package.json` / `pnpm-lock.yaml`，并按 `plugin.test.md` §3.2 以**库 API**（`import { chromium } from 'playwright'`，不引入 Test Runner、不新增 Vitest project）接入 `plugin` project | 客户端浏览器层用例全部可写、可跑；编排见 `test/e2e/support/browser.ts`，选择器分流口径见 `test/e2e/support/selectors.ts` |
| G3 | 缺口 | 壳层（`src/`）`data-testid` 数量为 **0**，而 `desktop.test.md` §5 要求 E2E 必须用 `data-testid` | 浏览器层用例的选择器只能走三档分流：插件包 `packages/*` 用 `data-dsh-*`、壳层 `src/` 用 `data-testid`（目前仅 `boot.e2e.ts` 的 4 个）、dsh 内部结构用稳定结构性锚点（`data-slot` / `role` / 插件 `dshp-*` 前缀类）并登记缺口；新选择器登记在 `test/e2e/support/selectors.ts` |
| G4 | ~~缺口~~ 已消解 | `desktop` project 已配置（`vitest.desktop.config.ts`、`test:e2e:desktop` 脚本、`test/e2e/desktop/boot.e2e.ts` 均已落地） | L3 用例可写成可直接运行的 `it()`；批次 `02` 的 4 条窗口用例即落在该车道 |
| G5 | 冲突 | `desktop.test.md` §6 称 debug 端口固定 `3081` 不可改；实现存在占用递增逻辑 | 全部 L3 用例的端口前置按「实测空闲」执行，不假设端口恒定 |
| G6 | ~~事实~~ **已消解** | 插件 client 入口仅在内嵌 frame 内生效（`window.parent !== window`），浏览器层用例已由同源嵌入文档（`page.route` 提供 `/dsh-e2e-embed.html` + 指向 `/` 的 iframe）构造出该环境 | `-C-*` 用例已全部可写；顶层页面那一条（`TC-PET-C-02-001`）反而成为该早退的**负向**证据 |
| G7 | 假设 | 各插件可被单独挂载（`startDshHost({ plugin })`）；需要核心桥时通过 `also: ['dsh-tauri']` 一并挂载 | 批次 `11` 需注入 `DSH_TAURI_EMBEDDED=1`：`startDshHost` 确实继承父 `process.env`（`test/e2e/support/dsh-host.ts:454-459`），但它的 `exchangeLaunchToken` 要求「token 交换 303 + Set-Cookie」，注入态下 `authorizeIndex=()=>true` 会把该请求放行成 200 并在返回句柄前抛错——故批次 `11` 复用 `scaffoldDshProfile` 自建 spawn 与就绪等待 |
| G8 | 缺口 | `test/e2e/.artifacts/` 仅有文档约定与 `.gitignore`，无实现 | 失败产物（截图 / stdout）尚未补齐，失败定位目前依赖 `home/dsh-web.log` 与 Playwright 报错定位 |
| G9 | 缺口 | 会话类用例（`04`/`05`/`06`/`07`/`08`/`09` 的面板与图标段）需要**真实会话**，scratch 宿主当前无造会话手段 | 这些浏览器用例保持「待补」并逐条登记在各文件 §6；是本套文档最大的功能盲区，详见 G11 |
| G10 | 事实 | 路由层的跨源 403（`routes/index.ts:287`，`cross-origin-request`）在真实宿主里被上游 Host/Origin 围栏遮蔽，L2 不可达 | 该类断言只能落在 L1（`packages/dsh-tauri/src/host/routes/index.test.ts:240`）；L2 按可观察事实断言 `forbidden` |
| G11 | 缺口（本轮实测） | `globalSetup` 只拉起一个 scratch `dsh web`，**不播种会话**，也没有造会话的 helper；而 dsh 的会话/工作区创建走壳层桥与 Typert 通道，`/api/**` 下没有任何可用的「创建会话」路由（本轮探测 15 个候选路径全 404） | 依赖会话的浏览器用例（`04`/`05`/`07`/`08` 的面板段、`09` 的卡片段、`06` 的续跑正向段）**无法真跑**。按子设计 §6「不写假绿用例」的要求，这些条目保持**待补**并逐条登记；补齐方向是在 `dsh-host.ts` 上加「经 Typert/桥接口建一条 scratch 会话」的 helper（属 `test/e2e/support/**`，超出本批写入范围的排他边界，需后续批次处理） |

---

## 9. 维护规则

1. 每条用例条目与测试代码 `it()` **1:1 对应**；改文档必改代码，反之亦然（`plugin.test.md` §4）。
2. 测试文件与用例文档**同名同序号**（`<序号>-<主题>.e2e.ts` ↔ `<序号>-<主题>.md`）；一个批次只允许一个测试文件，批内多段用 `describe` 分区。
3. 状态变更实时登记到 `docs/testing/progressive.md` §4.2 台账，禁止滞后补记。
4. 新增 L3 用例必须同步补 `data-testid`，并登记到 `test/e2e/support/selectors.ts`（`desktop.test.md` §5）。
5. 单文件即单批次，未验证通过前不得推进到下一个编号。