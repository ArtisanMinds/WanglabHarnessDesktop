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
2. **优先级口径**：用例编写通用口径为 P0–P3，本仓规范为 P1–P5。**以本仓规范为准**（见 §4），不混用。
3. **L2 浏览器驱动**：`plugin.test.md` §3.2 指定 Playwright 库 API；当前 `package.json` 与 `pnpm-lock.yaml` 中均无 `playwright`（见 §8 缺口 G2），因此浏览器类用例在本套文档中保留设计，但标注为**未接线**。
4. **桌面端端口是否固定**：`desktop.test.md` §6 称 debug 固定 `3081`、不可动态修改；实现侧存在端口占用后递增的逻辑（`src-tauri/src/service/workflow/launch.rs:874`，`src-tauri/capabilities/default.json:4` 注释亦声明 port is NOT fixed）。**本套文档以「默认 3081 + 运行前实测空闲」为准**，不假设端口绝对不变（见 §8 G5）。
5. **插件客户端只在内嵌 frame 内生效**：`dsh-tauri`、`dsh-tauri-pet` 的 client 入口均有 `window.parent === window` 早退（`packages/dsh-tauri/src/client/apply.ts:29`、`packages/dsh-tauri-pet/src/client/index.ts:24`）。因此「客户端用例」必须构造 iframe 环境，不能在顶层页面断言槽位（见 §8 G6）。

---

## 3. 编号与文件清单（渐进顺序）

编号即推进顺序：编号越大，依赖越多、断言面越宽。

| 编号 | 文件 | 测试文件（同名同序号） | 被测对象 | 主层级 | 对应批次 |
| --- | --- | --- | --- | --- | --- |
| 00 | `00-overview.md` | —（总览不承载用例） | 总览、前置、追踪矩阵 | — | — |
| 01 | `01-dsh-host-and-core-contract.md` | `01-dsh-host-and-core-contract.e2e.ts` | 编排骨架（scratch 宿主 + 挂载 + 随机端口）与共享路由契约（OPTIONS/405/403/413） | L2 | 批次 1–2 |
| 02 | `02-dsh-tauri-pet.md` | `02-dsh-tauri-pet.e2e.ts` | 桌宠插件（SSE → 客户端挂载 → 桌面端窗口） | L2 → L3 | 批次 3 |
| 03 | `03-dsh-tauri-rightclick.md` | `03-dsh-tauri-rightclick.e2e.ts` | 右键菜单与外部打开 | L2 → L3 | 批次 4+ |
| 04 | `04-dsh-tauri-session.md` | `04-dsh-tauri-session.e2e.ts` | 会话归档与打开目录 | L2 → L3 | 批次 4+ |
| 05 | `05-dsh-tauri-worktree.md` | `05-dsh-tauri-worktree.e2e.ts` | 工作树面板与路由 | L2 → L3 | 批次 4+ |
| 06 | `06-dsh-tauri-ui.md` | `06-dsh-tauri-ui.e2e.ts` | 壳层槽位注入（导航/侧栏/设置） | L2 → L3 | 批次 4+ |
| 07 | `07-dsh-tauri-panel-extension.md` | `07-dsh-tauri-panel-extension.e2e.ts` | 扩展管理面板（技能 / MCP / 市场） | L2 → L3 | 批次 4+ |
| 08 | `08-dsh-tauri-panel-scheduler.md` | `08-dsh-tauri-panel-scheduler.e2e.ts` | 定时任务面板 | L2 → L3 | 批次 4+ |
| 09 | `09-dsh-tauri-turnrewind.md` | `09-dsh-tauri-turnrewind.e2e.ts` | 回合级变更记录 | L2 → L3 | 批次 4+ |
| 10 | `10-dsh-tauri-model-config.md` | `10-dsh-tauri-model-config.e2e.ts` | 模型配置 | L2 → L3 | 批次 4+ |

> `dsh-tauri-bundle`、`dsh-tauri-tsdown` 是打包/构建工具包（无 `exports["./client"]`，见各自 `package.json`），不属于产品可见插件，不在本套用例范围。

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
| 附加挂载 | `DSH_E2E_ALSO`（逗号分隔，默认 `dsh-tauri,dsh-tauri-rightclick`） | `test/e2e/global-setup.ts:36` |
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
2. **核心扩展（L2 可立即运行）**：`03`–`10` 中全部 `-L2-*` 用例；每条只依赖 `pnpm build:plugins` 与 scratch 宿主。
3. **桌面端集成**：`02`、`03`、`05`、`06` 的 `-L3-*` 用例（需先补 `data-testid` 与 `desktop` project，见 §8 G3/G4）。
4. **客户端渲染层**：全部 `-C-*` 用例（需先引入浏览器驱动，见 §8 G2）。
5. **需真实会话/凭据的用例**：`06` 的 `TC-UI-L2-06-003/004`、`10` 的端点探测成功路径（见 §8 G9）。

---

## 7. 追踪矩阵

### 7.1 文件 → 用例编号

| 文件 | Case ID 前缀 | 条数 | 层级分布 |
| --- | --- | --- | --- |
| `01-dsh-host-and-core-contract.md` | `TC-HOST-L2-01-*` / `TC-CORE-L2-01-*` | 12 | L2 |
| `02-dsh-tauri-pet.md` | `TC-PET-L2-02-*` / `-C-02-*` / `-L3-02-*` | 13 | L2 → L3 |
| `03-dsh-tauri-rightclick.md` | `TC-RC-L2-03-*` / `-C-03-*` / `-L3-03-*` | 11 | L2 → L3 |
| `04-dsh-tauri-session.md` | `TC-SESS-L2-04-*` / `-C-04-*` / `-L3-04-*` | 11 | L2 → L3 |
| `05-dsh-tauri-worktree.md` | `TC-WT-L2-05-*` / `-C-05-*` / `-L3-05-*` | 10 | L2 → L3 |
| `06-dsh-tauri-ui.md` | `TC-UI-L2-06-*` / `-C-06-*` / `-L3-06-*` | 10 | L2 → L3 |
| `07-dsh-tauri-panel-extension.md` | `TC-EXT-L2-07-*` / `-C-07-*` / `-L3-07-*` | 13 | L2 → L3 |
| `08-dsh-tauri-panel-scheduler.md` | `TC-SCH-L2-08-*` / `-C-08-*` / `-L3-08-*` | 11 | L2 → L3 |
| `09-dsh-tauri-turnrewind.md` | `TC-REW-L2-09-*` / `-C-09-*` / `-L3-09-*` | 7 | L2 → L3 |
| `10-dsh-tauri-model-config.md` | `TC-MC-L2-10-*` / `-C-10-*` / `-L3-10-*` | 9 | L2 → L3 |

合计 **108** 条。`-C-*` 表示客户端浏览器层（当前未接线），`-L3-*` 表示桌面端宿主层（当前待接线）。

### 7.2 关键来源 → 覆盖位置

| 来源条目 | 覆盖文件 | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `plugin.test.md` §5（L2 执行流程 1–9 步） | `01` | 正向 / 异常 / 边界 | 端口冲突、宿主提前退出分支未覆盖 |
| `plugin.test.md` §6（必须断言项、禁止项） | `01`–`10` | 正向 / 异常 | 「零崩溃」需浏览器层，见 G2 |
| `plugin.test.md` §8 批次 3（pet） | `02` | 正向 / 异常 | 客户端渲染用例依赖 Playwright |
| `plugin.test.md` §8 批次 4+（worktree） | `05` | 正向 / 异常 | 真实 git 创建链路未覆盖 |
| `plugin.test.md` §8 批次 4+（其余插件） | `03`、`04`、`06`–`10` | 正向 / 异常 / 边界 | 各文件末节列出未覆盖分支 |
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
| G2 | 缺口 | `playwright` 未出现在 `package.json` / `pnpm-lock.yaml` / `node_modules`，与 `plugin.test.md` §3.2 的 L2 浏览器方案冲突 | 客户端渲染类用例（全部 `-C-*`）只能给出设计，标记「未接线」 |
| G3 | 缺口 | 壳层（`src/`）`data-testid` 数量为 **0**，而 `desktop.test.md` §5 要求 E2E 必须用 `data-testid` | 所有 L3 用例需先随用例补 `data-testid`；`test/e2e/support/selectors.ts` 已建立，新选择器须登记其中 |
| G4 | ~~缺口~~ 已消解 | `desktop` project 已配置（`vitest.desktop.config.ts`、`test:e2e:desktop` 脚本、`test/e2e/desktop/boot.e2e.ts` 均已落地） | L3 用例可写成可直接运行的 `it()` |
| G5 | 冲突 | `desktop.test.md` §6 称 debug 端口固定 `3081` 不可改；实现存在占用递增逻辑 | 全部 L3 用例的端口前置按「实测空闲」执行，不假设端口恒定 |
| G6 | 事实 | 插件 client 入口仅在内嵌 frame 内生效（`window.parent !== window`） | 所有 `-C-*` 与 `-L3-*` 用例必须构造 iframe 环境；顶层页面断言槽位必然失败 |
| G7 | 假设 | 各插件可被单独挂载（`startDshHost({ plugin })`）；需要核心桥时通过 `also: ['dsh-tauri']` 一并挂载 | 若某插件强依赖其它插件，需在其文件中追加 `also` 说明 |
| G8 | 缺口 | `test/e2e/.artifacts/` 仅有文档约定与 `.gitignore`，无实现 | 失败产物（截图 / stdout）需在接线时补齐，否则失败定位只能依赖日志 |
| G9 | 缺口 | 会话类用例（`09` turnrewind、`06` ui 的部分分支）需要真实会话，scratch 宿主当前无造会话手段 | 相关用例标记「待补」，是本套文档最大的功能盲区 |
| G10 | 事实 | 路由层的跨源 403（`routes/index.ts:287`，`cross-origin-request`）在真实宿主里被上游 Host/Origin 围栏遮蔽，L2 不可达 | 该类断言只能落在 L1（`packages/dsh-tauri/src/host/routes/index.test.ts:240`）；L2 按可观察事实断言 `forbidden` |

---

## 9. 维护规则

1. 每条用例条目与测试代码 `it()` **1:1 对应**；改文档必改代码，反之亦然（`plugin.test.md` §4）。
2. 测试文件与用例文档**同名同序号**（`<序号>-<主题>.e2e.ts` ↔ `<序号>-<主题>.md`）；一个批次只允许一个测试文件，批内多段用 `describe` 分区。
3. 状态变更实时登记到 `docs/testing/progressive.md` §4.2 台账，禁止滞后补记。
4. 新增 L3 用例必须同步补 `data-testid`，并登记到 `test/e2e/support/selectors.ts`（`desktop.test.md` §5）。
5. 单文件即单批次，未验证通过前不得推进到下一个编号。