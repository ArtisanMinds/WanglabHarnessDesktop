# 测试文档索引

本目录是桌面端与内置插件的测试用例与推进台账的唯一入口。测试代码在 `test/e2e/`（`plugins/` 与 `desktop/` 两条通道），本目录只放**规范、用例文档与进度**。

---

## 1. 文档索引

| 文档 | 内容 |
| --- | --- |
| [`../specs/desktop.test.md`](../specs/desktop.test.md) | 桌面端测试规范：分层、驱动选型、`data-testid`、环境隔离、执行命令 |
| [`../specs/plugin.test.md`](../specs/plugin.test.md) | 插件测试规范：L2/L3 宿主分层、真实挂载流程、断言准则、依赖替身规则 |
| [`progressive.md`](./progressive.md) | 推进规则与**进度台账**：单批单卡、审核阻塞、批次状态 |
| [`desktop/00-overview.md`](./desktop/00-overview.md) | 桌面端总览：覆盖范围、环境事实、前置校验、数据目录隔离、运行命令 |
| [`desktop/01-boot.md`](./desktop/01-boot.md) | 桌面端 L3 用例：启动冒烟（进入下载装配 → dsh 内核启动 → 页面无报错）；桌宠窗口 4 条 L3 见 [`plugins/02-dsh-tauri-pet.md`](./plugins/02-dsh-tauri-pet.md) |
| [`plugins/00-overview.md`](./plugins/00-overview.md) | 插件总览：分层策略、可立即运行的部分、追踪矩阵、缺口 |
| [`plugins/01-dsh-host-and-core-contract.md`](./plugins/01-dsh-host-and-core-contract.md) … [`11-dsh-tauri-connection.md`](./plugins/11-dsh-tauri-connection.md) | 插件用例（`01`–`11`，11 个文件），单文件即一个批次；`02` 的 4 条 L3 桌宠窗口用例落在 `desktop` 车道 |

**用例规模**（本轮整改后实测）：`desktop` 车道 **2 个文件 / 5 条**——`test/e2e/desktop/boot.e2e.ts` 1 条启动冒烟 + `test/e2e/desktop/02-pet-window.e2e.ts` 4 条桌宠窗口；`plugin` 车道 **11 个文件 / 92 条**（连续 5 次运行全绿）；插件用例文档合计 **132** 条 `[Case ID]`，其中 **96** 条 `[自动化] 是` 与代码 `it()` 逐文件 1:1（`plugin` 车道 92 + `desktop` 车道 4），其余为手工执行 / 待接线条目；`unit` 车道 **103 files / 981 tests**。每个 `00-overview.md` 只承载总览与矩阵，不含用例本体；逐文件明细见 [`plugins/00-overview.md`](./plugins/00-overview.md) §7.1 追踪矩阵。

---

## 2. 分层模型

| 层 | 用例位置 | 运行器 | 驱动 / 宿主 |
| --- | --- | --- | --- |
| **L1** 单元 | `packages/<name>/src/**/*.test.ts` | Vitest `unit` project | 无宿主，允许 Mock |
| **L2** 插件宿主 E2E | `test/e2e/plugins/<序号>-<主题>.e2e.ts` | Vitest `plugin` project（`environment: 'node'`） | 真实 `dsh web` 进程；浏览器断言用 Playwright 库 API（`chromium.launch()`，共享编排 `test/e2e/support/browser.ts`），**已接线** |
| **L3** 桌面端宿主 E2E | `test/e2e/desktop/*.e2e.ts` | Vitest `desktop` project（`environment: 'node'`） | 真实 Tauri 窗口；WebdriverIO standalone session + `@wdio/tauri-service` |

全仓**只有一个测试运行器**（Vitest，通过 `test.projects` 分层）。WebdriverIO 与 Playwright 只作为**驱动库**被用例调用，不引入各自的 runner。

**L3 准入原则**：只有断言对象是 **Tauri 原生产物**（独立 OS 窗口句柄、窗口几何夹紧、Tauri IPC 往返）才允许进 `desktop` 车道；业务面板、侧栏、tab、对话框等嵌在 dsh iframe 内部的 DOM 一律用 L2 浏览器断言，细则见 [`../specs/desktop.test.md`](../specs/desktop.test.md) §1。

插件用例的测试文件与用例文档**同名同序号一一对应**：`test/e2e/plugins/<序号>-<主题>.e2e.ts` ↔ `docs/testing/plugins/<序号>-<主题>.md`，一个编号只允许一个测试文件（批内按层用 `describe` 分区）。**唯一例外**是批次 `02`：其 4 条 Tauri 原生窗口用例落在 `test/e2e/desktop/02-pet-window.e2e.ts`（`plugin` 车道的 CI 作业是 ubuntu-latest，Tauri 是 Windows-only），该文档的 `[自动化] 是` = 两个文件 `it()` 之和（9 + 4 = 13），见 [`../specs/plugin.test.md`](../specs/plugin.test.md) §4。

---

## 3. 目录约定

```
test/
├── e2e/
│   ├── global-setup.ts       # plugin project 生命周期：起停真实 dsh 宿主并交换 Cookie
│   ├── support/              # 共享编排（dsh-host / desktop-host / browser）与选择器常量
│   ├── plugins/              # L2 插件宿主用例（11 个文件）
│   └── desktop/              # L3 桌面端用例（boot + 02-pet-window）
├── archive/                  # 历史用例归档，任何 project 都不收
vitest.config.ts              # 根：projects 清单、全局别名与 coverage（coverage 只在此处生效）
vitest.unit.config.ts
vitest.plugin.config.ts
vitest.desktop.config.ts
```

---

## 4. 运行命令

```bash
pnpm test                       # 全部 project
pnpm test:unit -- --run          # 仅单元（日常迭代）
pnpm test:e2e:plugin -- --run    # 仅插件 L2（需先 pnpm build:plugins）
vitest run --project desktop test/e2e/desktop/boot.e2e.ts   # 单条 L3 用例
```

> **`-- --run` 不能省**：`test` / `test:unit` / `test:e2e:*` 脚本本身就是 `vitest`（不带 `run`），非 CI 的交互式终端会进入 watch 模式并挂住；CI 里写的是 `pnpm run test:unit -- --run` 这类形式。
> **单文件过滤必须用位置参数**：`vitest run --project desktop <file>`。写成 `vitest --project desktop -- <file>`（带 `--`）时 `--` 之后的内容不会被当作过滤条件，整条车道会全部跑一遍。
> 本机 pnpm 的依赖校验 / `.bin` shim 异常时，可绕开脚本直接跑：`node node_modules/vitest/vitest.mjs run --project <unit|plugin|desktop> [file]`。
> 插件 L2 只对**构建产物**运行，未构建时 `dsh-host.ts` 会直接失败并提示要跑的命令，不静默跳过。

---

## 5. 环境隔离

| 层 | 隔离根 | 关键点 |
| --- | --- | --- |
| L2 | `DSH_E2E_HOME` | `DSH_HOME` 指向其下的 scratch profile，独立端口 |
| L3 | `$E2E_HOME` | 重定向 `USERPROFILE`/`HOME` 一并隔离 dsh 数据与 app-data；须预建 `<home>/AppData/Local` 与 `AppData/Roaming`；Store 另用 `.store.test.dat` |

**禁止**读写用户真实的 `~/.dsh`、`~/.dsh.dev` 与 `.store.dev.dat` / `.store.dat`。L3 的隔离根是 home：`~/.dsh.dev` 与 `app_data_dir()`（`dirs::data_dir()/<identifier>`）都由它派生。端口或进程残留直接 Fail，**不自动强杀用户进程**。

---

## 6. 推进方式

1. 批次号 = 用例文档序号，一次只推进**一个**批次（单批单卡）。
2. 批内先写用例文档，再写测试代码，同批交付；文档条目与 `it()` 一一对应。
3. 每批必须可独立运行并给出确切命令；交付后**停下来**等人审查与实跑。
4. 失败就地修复，不带病推进。
5. 状态实时登记到 [`progressive.md`](./progressive.md) §4 台账，变更历史记入 [`history.md`](./history.md)。

用例编写口径（优先级、标题、步骤/预期编号对应、选择器）以两个 `../specs/*.test.md` 为准。定位锚点按**元素归属**分流：桌面壳层 `src/**` 用 `data-testid`；插件包 `packages/*` 用 `data-dsh-*`（其中一部分是行为钩子，不得为测试改名）；内嵌 dsh 页面用上游稳定锚点。禁止依赖 CSS 类名、非稳定文案与 DOM 层级。

---

## 7. 覆盖率

`@vitest/coverage-v8` 为 devDependency，**必须能产出报告，但不设阈值、不卡关、不进 CI 门禁**。`coverage` 只能写在根 `vitest.config.ts`——project 级同名字段被 Vitest 忽略；`exclude` 已排除 `source/`、`archive/`、`test/archive/`、`src-tauri/`。整改后实测基线：Statements 66.06% / Branches 60.24% / Functions 68.18% / Lines 66.31%。详见 [`../specs/desktop.test.md`](../specs/desktop.test.md) §8.4。
