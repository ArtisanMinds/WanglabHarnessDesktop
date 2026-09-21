# 测试评审协议

> **本文件是「测试写得对不对、可不可信」的唯一权威来源**：评审维度与判据、本仓 Vitest 陷阱、可机检的扫描命令、评审报告与四态判定、与 CI 门禁的关系，全部自包含在本文件内。
> **与另两份协议的分工**（本文件不重复它们的运行命令与编排细节）：
> * [plugin.test.md](./plugin.test.md) — 插件侧**怎么跑**：L1/L2/C 分层与归属、宿主编排与鉴权、驱动选型、选择器口径、隔离红线、已知坑。
> * [desktop.test.md](./desktop.test.md) — 桌面侧**怎么跑**：L3 准入原则、平台与前置、隔离、驱动、稳定性。
> * **本文件** — 测试**怎么写才算数**：断言有没有验到契约、用例会不会真的执行、有没有假绿、隔离与确定性是否成立。
>
> **本仓不再维护用例文档**：测试不由「文档条目 ↔ `it()`」驱动，`it()` 标题即契约描述（[plugin.test.md](./plugin.test.md) §10）。不存在 `TC-*` 编号、`[Case ID]`、`[自动化]` 标记、批次台账或变更历史台账，本文件也不需要同步它们。

---

## 1. 适用范围

**用**：评审新增 / 修改的测试；评审 AI 生成的测试；判断一个 PR 的测试是否够格；排查 flaky；查「测试全绿但线上还是坏」的覆盖缺口；写测试时作为自检清单。

**不用**：评审被测业务代码本身（那是各自 `.spec.md` 的事）；也不用来替代 [plugin.test.md](./plugin.test.md) / [desktop.test.md](./desktop.test.md) 的运行规范——那两份管「怎么跑」，本文件管「跑出来的绿值不值钱」。

### 铁律

1. **没跑过的测试不算通过。** 静态读完必须实际执行；只读代码就断言「测试没问题」是评审事故。运行命令一律显式带 `run`（默认 watch 会挂住），并给命令设超时。
2. **禁止为了变绿而改测试。** 测试与实现不符时，默认判定「实现或测试有一条错」并指出证据；只有用户明确要求「修测试」时才动手，且不得放松断言。
3. **每条结论必须可定位。** 固定格式：`文件:行` + 原文片段 + 判定 + 依据（引用本文件的维度号，或两份运行协议的章节）。
4. **区分「机械可判定」与「语义判断」。** 前者（`.only`、缺 `await`、Jest API……）交给 §6 的 `rg` 命令；后者（断言是否验到契约、是否过度 mock）必须自己读代码判断，命令结果只是线索。
5. **本仓规范优先于通用最佳实践。** 仓库既有约定与 Vitest 官方推荐不一致时按仓库现状，差异写成「可选演进」，不作为 blocker（见 §9）。

---

## 2. 评审流程

### Step 0 定范围

明确要评审的文件集合：PR 的测试改动、用户点名的文件，或最近新增的 `**/*.{test,spec}.ts` + `test/e2e/**/*.e2e.ts`。拿不到 diff 时用 `git status --short` / `git diff --name-only HEAD~1` 定位。

### Step 1 建上下文（缺这一步的评审都是瞎猜）

* 读**被测源码**的完整签名与分支，而不是测试文件里对它的描述。
* 读**同目录已有的兄弟测试**，确认命名、断言、夹具风格。
* 读 `vitest*.config.ts`：`globals`、`restoreMocks`、`environment`、project 的 `include` / `setupFiles`（事实见 §5）。
* 涉及 E2E 时读 [plugin.test.md](./plugin.test.md) / [desktop.test.md](./desktop.test.md)（分层与归属、选择器口径、隔离红线、已知坑的唯一权威）。

### Step 2 机械扫描

用 §6 的 `rg` 命令做一轮证据收集。**每条命中都要回读原文确认**——命令会误报（注释、字符串、合法兜底），也一定会漏掉语义问题。不要把命令输出直接当报告交差。

### Step 3 逐条过语义维度

按 §3 的 D1–D8 逐用例检查。重点永远是 **D1（是否验到真实契约）、D2（是否真的会执行）、D3（假绿与静默失败）、D5（隔离与确定性）、D7（变异验证）**——它们对应「测试全绿但毫无价值」的主要成因。

### Step 4 实证

```bash
node node_modules/vitest/vitest.mjs run --project unit                              # 全量
node node_modules/vitest/vitest.mjs run --project unit <file>                       # 单文件：位置参数
node node_modules/vitest/vitest.mjs run --project unit --sequence.shuffle --sequence.seed=1  # 顺序无关性
```

* L2 / L3 的前置与车道命令见 [plugin.test.md](./plugin.test.md) §3 / [desktop.test.md](./desktop.test.md) §2，本文件不复述。
* 怀疑隔离问题时**单跑该文件**再**跑整个 project**：单跑绿、全量红 = 用例间共享状态。
* 怀疑恒过时**故意改坏实现**，确认用例真的会红（D7）；验证完必须还原实现，不提交半成品。
* 先记录本次运行的基线（文件数 / 用例数 / 耗时），后续差异才有参照；数字变化先确认是新增用例还是被过滤掉了。

### Step 5 定级

按 §4 的 `blocker` / `major` / `minor` / `nit` 定级。报告里给出 blocker 时，必须同时给出**修法**与**复跑命令**；只给问题不给修法等于没评审。

### Step 6 出报告

严格按 §7 的四态判定与模板输出。

### Step 7 只改该改的

用户要求动手修时：一次只改一类问题，改完**重跑同一命令**并把结果贴回报告；不得顺手重构测试结构、不得删除用户认为有价值的用例、不得改断言去迁就实现。

---

## 3. 评审维度（D1–D8）

每条含「怎么判」与「反例」。定级基线可按上下文升降，但降级必须写出理由。

### D1 断言是否验到真实契约 · 基线 blocker

* **怎么判**：把断言逐条念一遍，问「如果实现返回一个完全错误的但非空的值，这些断言会不会红？」；再问「期望值是从哪里来的？」。
* **独立 oracle 要求**：期望值必须有**独立来源**——字面量，或与被测路径不复用同一实现的独立算法 / 夹具。**期望值不得由被测实现现算**。
* **反例**：`expect(await createUser(input)).toBeDefined()`（几乎不设防）；`expect(format(d)).toBe(format(d))`、`expect(parse(x)).toEqual(roundTrip(x))`（自比）；`expect(service.compute(input)).toBe(reference.compute(input))` 而 `reference` 调用的是同一份被测逻辑（借用被测实现当 oracle）。
* **正例**：`expect(user).toMatchObject({ name, email })` + `expect(user.id).toBeTypeOf('string')` + `expect(user.password).not.toBe(input.password)`；`expect(formatPrice(1, 'USD')).toBe('$1.00')`。
* 只有 `toBeDefined` / `toBeTruthy` 收尾且无其它真断言 → blocker；与真断言并存时降为 nit。
* **同义反复 / 蕴含冗余 / 断言自己设的桩**：`expect(f(x) === f(y)).toBe(process.platform === 'win32')`（非 Windows 上退化为 `false === false`）；先 `expect(status).toBe(404)` 再 `expect(status).not.toBe(200)`（第二条零信息）；`mockReturnValue(42)` 后 `expect(fn()).toBe(42)`（在验 mock 框架）。基线 major。

### D2 用例是否真的会执行 · 基线 blocker

* **怎么判**：实际跑；再故意破坏实现验证它会红。逐个确认用例是否落在某个 project 的 `include` 里（`*.e2e.ts` 放进 `packages/`、`test/archive/**` 里的文件都不会被收集）。
* **写了却永不运行**：文件名后缀与 project 归属不符（见 D8）、导入不存在的导出、用错 API（`jest.*`）导致整文件失败或被忽略、平台条件让唯一门禁用例静默跳过。
* **跳过必须显式化**：`skipIf` / `describe.skip` / `it.skip` 本身不一定是 blocker，**但「让唯一门禁静默变绿」是**。
* **反例**：`describe.skipIf(process.platform === 'darwin')(...)`、`describe.skipIf(!BUILT)(...)`、`describe.skipIf(process.platform !== 'win32')(...)` 让该平台上唯一用例永久跳过且不计入失败（本仓现存三处，见 §9）。
* 抽查方式：把条件反转/临时置真跑一次，确认用例真的会执行到断言。

### D3 假绿与静默失败 · 基线 blocker

这一类的共同形态是「用例在没验到任何东西的情况下结束，或者把失败当成功」。逐条对照：

| 形态 | 反例 | 为什么是假绿 |
| :--- | :--- | :--- |
| 吞异常 | `try { await doThing() } catch {}` | 被测路径抛错也判绿；至少要 `expect.fail()`、断言错误类型/消息，或配 `expect.assertions(n)` |
| 宽泛错误过滤 | 把回调里的 `console.error` 白名单放宽成「不收集」；用 `filter(e => !e.message.includes('fetch'))` 把真问题一起滤掉 | 错误采集必须窄且逐条给理由（[plugin.test.md](./plugin.test.md) §7.5），放宽过滤等于取消断言 |
| 空默认值掩盖失败 | 实现或用例里 `?? []` / `\|\| []`，断言只到 `toHaveLength(0)` | 无法区分「上游真的返回空集合」与「上游坏了返回 `undefined`」；应显式断言 `undefined` 或先断言来源契约 |
| 到期 `return` | `if (!ok) return`、`if (!process.env.X) return` | 用例在到达断言前静默结束，贡献一个绿；应 `expect(ok).toBe(true)`、用 `test.skipIf` 显式声明，或直接失败 |
| 析取式断言中和 | `expect(state === 'a' \|\| state === 'b').toBe(true)`、`expect([A, B]).toContain(state)` 里只有 A 是真契约、B 是兜底 | 任何状态都过；只断唯一契约值 |
| `?.` 让「元素整体消失」也判绿 | `expect(await el?.getText()).toBe('...')`、`expect(res?.status)`、`expect(query?.rows?.length ?? 0).toBe(0)` | 元素/字段整体不存在时得到 `undefined` / `0`，与「存在且符合预期」不可区分；先断存在性（`isExisting()` / `toBeDefined()`）再断内容 |
| 空壳用例 | 用例体内没有任何 `expect`（且不是 `@ts-expect-error` 类型用例） | 只贡献绿色；补真断言或删除 |

* 异步的 `resolve/rejects` 没有 `await`/`return` 也属此类（见 D4 与本文件 §5）。
* 反例与修法必须成对给出：指出「这里静默成功」时，同一行要写清「改成什么才会红」。

### D4 异步与 mock / snapshot 卫生 · 基线 blocker / major

* **异步**：`expect(p).resolves.toX()` 缺 `await` / `return` → 用例在 promise settle 前结束，**恒过**（blocker）。同类：`async` 用例里 `arr.forEach(async ...)` 内的断言、`.then(v => expect(v)...)` 没有 `return`、`async` 用例里 `await` 的断言数为 0。挂起/超时通常是 promise 永不 settle，不是「超时太短」。
* **等待真实信号而非固定 sleep**：单测用 `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`，或 `vi.waitFor(() => expect(...).toBe(...))`；E2E 用 `expect.poll(...)` 或可轮询的条件等待。反例：`await new Promise(r => setTimeout(r, 500))`。
* **mock 的边界**（major）：**绝不允许 mock 被测对象本身**；测 `UserService` 就 mock 它的依赖（DB、邮件），让 service 真跑。真实现够快够稳就用真的（纯函数、内存数据结构）。HTTP 优先用请求层拦截而不是直接 mock `fetch`。
* **过度 mock 的识别**：一个 50 行文件 mock 掉 `../apis`、`../locales`、第三方重导出，剩下 3 个用例全在验透传 / 验「我配置的 mock 返回了我配置的值」。
* **层级约束**（本仓硬规则）：L1 允许 mock 宿主；L2 / C / L3 **下游全部为真**，只允许 mock 外部服务（网络、模型、时钟）。E2E 里 mock 后端命令 = blocker。
* **还原纪律**（major）：本仓无全局 `restoreMocks` / `clearMocks`，文件必须自管——`afterEach(() => vi.restoreAllMocks())`、`beforeEach(() => vi.clearAllMocks())`，或 try/finally 里 `spy.mockRestore()`。语义差异见 §5。
* **snapshot 不替代结构断言**（major）：快照保护「任何变化」，定向断言表达「特定性质」。只关心一两个字段时用 `toMatchObject` / `toHaveProperty`，不要用快照。本仓现状是**全仓零快照**，新引入快照需要理由，且必须提交并像普通断言一样 review（禁止盲目按 `u` 接受 diff）。

### D5 隔离与确定性 · 基线 blocker

* **绝不触碰用户真实数据**：`~/.dsh`、`~/.dsh.dev`、`.store.dev.dat`、`.store.dat`（blocker）。L2 必须走 `DSH_E2E_HOME` 隔离根，L3 必须走重定向 home + `DSH_E2E_WEBVIEW_DATA_DIR`（见 [desktop.test.md](./desktop.test.md) §3）。
* **不得真的拉起系统程序**（文件管理器、默认浏览器等），除非用例显式声明该副作用并标注为手工用例；**不得杀用户进程**。
* **共享状态**：模块级数组/对象、全局变量、单例、缓存、`process.env`、文件系统残留。判定手法：单跑该文件 vs 跑整个 project；或调换用例顺序。修法：`beforeEach` 复位，或工厂函数提供每个用例一份的新鲜夹具。
* **临时目录 / 进程 / 端口**：`mkdtemp` 必须登记进模块级数组并在 `afterEach` 清理；启动的进程/服务器/监听必须在 `finally` 收尾，不得留下残留进程或占用端口；端口占用时另开端口，不杀用户进程。
* **时间 / 时区 / 随机**：`vi.useFakeTimers()` + `vi.setSystemTime()`，且必须 `afterEach(() => vi.useRealTimers())`；时区用例保存并还原 `process.env.TZ`；固定随机种子；严格等于时序量的断言（如「首个响应块内到达，`chunks === 1`」）属脆弱断言，应改为范围或最终条件断言。
* **顺序无关性**：在 `--sequence.shuffle` 下仍应全绿。红了就是用例间有隐藏依赖（blocker）。
* 进程级环境变量改写必须有还原路径；依赖 `fileParallelism: false` 兜底时要在报告里写明这个前提。

### D6 边界与错误路径 · 基线 major

* **怎么判**：列出被测函数的输入域与失败模式，对照已有用例；只看**真实可达**且**有风险**的输入。不为每条分支都要求用例。
* **必须验「拒绝」而不是「静默改写」**：缺参 / 越界 / 上游不可达时，断言错误码、错误体或异常类型，而不是断言「返回了空值 / 被改成默认值」。反例：窗口尺寸越界后只断言「没崩」；缺 `sessionId` 时只断言 `ok`；上游 502 时用 `?? []` 吞成空集合。
* **必查四类**：空/缺输入、边界值（0、上限、恰好越界）、失败依赖（网络 / fs / DB 抛错）、空集合。反例：`parseAge` 只测 `'25'`，不测 `'0'`、`'150'`、`'-1'`、`'abc'`、`''`。
* **需要真实模型 / 公网 / 系统副作用的用例不写自动化假绿**：能通过自种数据（缓存、配置文件）与外网解耦的必须先解耦再自动化（见 [plugin.test.md](./plugin.test.md) §7.4 / §9 #5）；不能解耦的场景保持手工执行，或显式标注且不作为 CI 门禁。
* 产出必须具体：`<文件:行>` 的 `<分支>` 没有用例 → 建议新增 `it('<行为>')`：输入 `<x>` 期望 `<y>`。

### D7 变异验证 · 基线 判据（不是可选项）

* **定义**：断言有效的证据是「改坏实现 → 用例变红」。对核心用例至少做一次抽查：改返回值、删一个分支、把错误吞掉、去掉一次副作用，跑目标用例看是否变红。**没红的用例就是无效断言**（按 D1 定级）。
* **bug fix 必须配回归用例**：先写**会红的**回归用例，确认它红，再修实现。评审时看到「修了 bug 但测试直接绿的」就要问：这个用例在修复前会不会红？
* 验证完必须还原实现；把这个过程写进报告的「运行时验证」小节：破坏了什么、哪个用例变红、哪个没红（没红的才是问题）。

### D8 标题、分层归属与单一行为 · 基线 major / minor

* **`it()` 标题即契约描述**（major）：必须写清「验证什么对象、在什么条件下、期望什么可观察结果」。标题空泛（「测试正常」「works」「test1」）、与断言不符、或多个行为塞进一个标题 = major。
* **分层归属**（major）：断言 dsh iframe 内部 DOM 却写成 L3、或纯函数断言写成 E2E = major；判据见 [desktop.test.md](./desktop.test.md) §1 与 [plugin.test.md](./plugin.test.md) §1。文件名后缀与 project 归属必须匹配。
* **行为改动必须同步测试代码**：只改实现不改测试 = major。
* **一个用例一个行为**（minor）：标题里出现「并且 / 同时 / 以及」或英文 `and`（如 `stays inert and warns`），或断言横跨两个独立行为 → 拆开。
* **可读性**（minor / nit）：标题过长导致失败时无法一眼定位；调试残留（`console.log`）；`TODO/FIXME`；重复样板未抽 helper。
* **断言消息**（nit，E2E 层升为 major）：本仓 E2E 断言几乎逐条带中文消息（`expect(response.status, 'SSE 路由必须存在且返回 200').toBe(200)`），缺消息在失败时无法定位；单元测试不必加。

---

## 4. 分级与准入门禁

| 级别 | 含义 | 处理 |
| :--- | :--- | :--- |
| **blocker** | 用例恒过、恒不跑、断言为空、门禁静默跳过、污染用户真实环境、E2E mock 后端、假绿与静默失败 | 必须修，修完复跑 |
| **major** | 会漏掉真实缺陷或在重构时误红：弱断言、自比/同义反复断言、实现耦合、过度 mock、隔离缺失、缺关键边界、测试未随行为同步、分层归属错误、快照替代结构断言 | 本 PR 内修，或明确记 issue 并说明风险 |
| **minor** | 可读性与维护成本：命名、拆分、重复样板、调试残留、真实时间等待 | 可顺带修，不阻塞 |
| **nit** | 风格偏好 | 可选，不要拿来充数 |

**准入门禁**（与两份运行协议的准入标准一致）：

1. 独立运行 ≥ 5 次无 flake；
2. 失败能精确归因到「用例 - 步骤 - 期望 vs 实际」；
3. `it()` 标题即契约描述且与断言一致，分层归属正确；
4. 不依赖上一次运行遗留的状态（`--sequence.shuffle` 下仍绿）；
5. 环境完全隔离（不改用户真实数据目录）。

---

## 5. 本仓 Vitest 陷阱

### 配置层事实

* 四个配置：`vitest.config.ts`（根，只列 `test.projects`，自身不收用例）、`vitest.unit.config.ts`、`vitest.plugin.config.ts`、`vitest.desktop.config.ts`。
* 三个 project 均**没有** `globals: true`，根也**没有** `restoreMocks` / `clearMocks` / `mockReset` / `snapshotFormat`。→ **必须显式 `import { describe, it, expect, vi } from 'vitest'`**，「文件自管 mock 还原」是正确写法；要求改用全局 API 才是错的。
* 根 `resolve.alias '@' → ./src` **不被 project 继承**，`unit` 里重复声明了一次；新增 project 需自行声明。
* **`coverage` 只能在根配置生效——project 级的同名字段会被忽略**。要调覆盖率配置必须改 `vitest.config.ts` 的根 `test.coverage`。
* 名字即归属：`unit` = `packages/**/*.{test,spec}.*`、`test/**/*.test.ts`、`src/**/*.test.ts`（排除 `test/archive/**`、`archive/**`，`setupFiles: ./test/setup/tauri-runtime.ts`，`maxWorkers: 4`）；`plugin` = `test/e2e/plugins/**/*.e2e.ts`（`fileParallelism: false`）；`desktop` = `test/e2e/desktop/*.e2e.ts`（`fileParallelism: false`）。

### 运行命令

* **不要用 `pnpm run <script>`**：本仓 pnpm 依赖校验与 `.bin` shim 在部分环境会失败。唯一可靠写法是 `node node_modules/vitest/vitest.mjs run --project <p>`（[plugin.test.md](./plugin.test.md) §3.1）。
* **必须带 `run`**：不带 `run` 的 vitest 在交互式终端进入 watch 并挂住。
* **单文件过滤必须用位置参数**：`… run --project unit format.test.ts`。写成 `… --project unit -- <file>` 时 `--` 之后不会被当作过滤条件，整条车道会全部跑一遍——`docs/` 里就是这种写法，别照抄。

### API 与 mock

| 陷阱 | 后果 / 正解 |
| :--- | :--- |
| `jest.fn` / `jest.mock` / `jest.spyOn` | 模型语料偏 Jest 的高频误用，本仓统一 `vi.*` |
| `vi.spyOn(obj, 'x')` | **默认仍执行原实现**（与 `vi.fn()` 不同），只观测就不必再 mock 返回值 |
| `vi.mock('./m')` vs `vi.mock(import('./m'))` | 后者类型安全；**本仓现用字符串路径**，迁移属可选演进，不是 blocker |
| `mockClear()` / `mockReset()` / `mockRestore()` | 分别只清记录 / 连实现一起清 / 还原 `spyOn` 的原方法 |
| `.mock.calls` | 存的是**实参引用**：实参被 mutate 后 `toHaveBeenCalledWith(原值)` 会失败 → 在 `mockImplementation` 里 `structuredClone`，或在 mutate 前断言 |
| 部分替身 | 用 `importOriginal` 形参，而非 `import('./x')` |
| 类型化 mock | `vi.mocked(fn)` |
| 手工替身对象 | 本仓偏好：`createHost()` 之类最小上下文替身比 `vi.mock` 更常用 |

* fake timers：`vi.useFakeTimers()` 必须配 `afterEach(() => vi.useRealTimers())`；`vi.stubGlobal` 配 `afterEach(() => vi.unstubAllGlobals())`；断言「没有泄漏定时器」用 `expect(vi.getTimerCount()).toBe(0)`；时钟偏移用 `vi.spyOn(Date, 'now')`，不要改真实系统时间。
* 异步等待：单测用 `vi.waitFor(...)`，E2E 用 `expect.poll(...)`（本仓两者都在用）。**全仓零** `expect.extend` / `test.extend` / `expect.soft`。
* 快照：本仓现存零快照。`toMatchInlineSnapshot()` 适合小且聚焦的值（首参留空，首次运行自动回填）；`toMatchFileSnapshot()` 适合 HTML/SVG/CSS/生成代码；含时间戳 / UUID 时必须传非对称匹配器；`toMatchSnapshot()` 落到 `__snapshots__/`，必须提交并 review，**盲目按 `u` 会让坏输出变成「预期」**。

### 隔离与环境

* `document is not defined` = 用例跑在 node 环境却要 DOM → 改 `environment` 或 Browser Mode，不要在用例里加 `typeof document !== 'undefined'` 兜底。
* `test/setup/tauri-runtime.ts`（`unit` project 的 `setupFiles`）只是给壳层模块补一个最小 `window` 并 `mockIPC(() => undefined)`——**真实后端行为仍须各用例自己 mock**，不要指望它替代用例的桩。
* 生成测试后立刻运行：AI 写的测试常导错、引用不存在的函数、用错 API。
* 修 bug 的任务要明确「先写会红的回归用例」，否则容易**改测试而不是改代码**。

---

## 6. 扫描判据（可直接 `rg` 复核）

原先的扫描脚本已随 `skills/test-spec` 一并撤销；其判据全部转写为本节命令，评审**不依赖任何脚本**。命中后必须回读原文确认，命令只是线索。

| # | 坏味道 | 命令 | 等级 |
| :--- | :--- | :--- | :--- |
| 1 | 聚焦标记残留 | `rg -n '\.only\s*\(\|fdescribe\s*\(\|\bfit\s*\(' packages test src -g '*.ts'` | blocker |
| 2 | Jest API | `rg -n '\bjest\s*\.' packages test src -g '*.ts'` | blocker |
| 3 | 缺 `await` 的 `resolves/rejects` | `rg -n '(resolves\|rejects)\.' packages test src -g '*.ts' \| rg -v '\bawait\b\|\breturn\b'`（跨行断言会误报——`await` 在上一行；命中后回读原文） | blocker |
| 4 | 用例内无 `expect`（空壳） | `rg -n 'it\(' <file>` 后逐块人工核对（`@ts-expect-error` 类型用例除外） | blocker |
| 5 | 跳过 / 待办 | `rg -n 'skipIf\|it\.skip\|test\.skip\|describe\.skip\|it\.todo\|test\.todo' packages test src -g '*.ts'` | major（静默门禁 → blocker） |
| 6 | 弱断言收尾 | `rg -n '\.(toBeDefined\|toBeTruthy\|toBeFalsy)\(' packages test src -g '*.ts'` 后确认同用例内有无真断言 | blocker ~ nit |
| 7 | 真实用户数据 | `rg -n '\.dsh\.dev\|\.store\.dev\.dat\|[^-]\.store\.dat' test packages -g '*.test.ts' -g '*.e2e.ts'`（注释里的提及会误报，需回读） | blocker |
| 8 | 真实时间等待 | `rg -n 'await new Promise' packages test src -g '*.ts' \| rg 'setTimeout\|setInterval'` | minor（E2E 中 → major） |
| 9 | `.mock.calls` 存引用 | `rg -n '\.mock\s*\.\s*calls' packages test src -g '*.ts'` | minor |
| 10 | 快照（含动态值） | `rg -n 'toMatchSnapshot\|toMatchInlineSnapshot\|toMatchFileSnapshot' packages test src -g '*.ts'`；对 `(Date\.now\|Math\.random\|randomUUID\|new Date\()` 所在块另查是否传了非对称匹配器 | major |
| 11 | spy 用了但没还原 | `rg -n 'vi\.spyOn' <file>` 后确认存在 `restoreAllMocks` / `mockRestore`（配置层无 `restoreMocks`） | major |
| 12 | 临时目录无清理 | `rg -n 'mkdtemp' <file>` 后确认存在 `rm(` / `rmSync` / `purgeStale` | major |
| 13 | E2E 用 CSS 类名定位 | `rg -n '(querySelector(All)?\|locator\|\$\$?)\(\s*[\x22\x27\x60]\s*\.' test/e2e -g '*.e2e.ts'` | blocker |
| 14 | E2E 用文本 / 层级定位 | `rg -n 'getByText\|getByRole\(.*name:' test/e2e -g '*.e2e.ts'` | major |
| 15 | E2E 无任何锚点常量引用（无产物断言的信号） | `rg --files-without-match 'data-testid\|selectors\|data-dsh' test/e2e -g '*.e2e.ts'` | info（配合 D3 判断是否只断「无报错」） |
| 16 | 调试残留 | `rg -n 'console\.(log\|debug\|info)\(' packages test src -g '*.ts'`（`console.error` 断言属 E2E 契约，不在内） | minor |
| 17 | `TODO` / `FIXME` 残留 | `rg -n '(TODO\|FIXME\|XXX)' test packages -g '*.test.ts' -g '*.e2e.ts'` | minor |
| 18 | 标题过长 / 含「并且、同时、以及、and」 | `rg -n 'it\(\s*[\x22\x27\x60].{80,}' packages test src -g '*.ts'`；`rg -n 'it\(\s*[\x22\x27\x60][^\x22\x27\x60]*(并且\|同时\|以及\| and )' packages test src -g '*.ts'`（英文 `and` 只是信号，可能是单一行为，回读再判） | info |
| 19 | 用例声明用了 `test(` 而非 `it(` | `rg -n '^\s*test\(' packages test src -g '*.ts'`（本仓期望输出为空） | minor |

**不可机检、必须人工判断的**：断言是否验到真实契约与是否用了独立 oracle（D1）；期望值是否由被测实现现算（D1）；是否过度 mock（D4）；错误过滤是否过宽（D3）；异常是否被吞（D3）；边界与错误路径是否真的验了「拒绝」（D6）；变异验证（D7）。

---

## 7. 评审报告

### 四态判定

| 判定 | 含义 |
| :--- | :--- |
| `APPROVED` | 无 blocker、无未处理的 major；测试确实在守契约，实跑与变异证据齐全 |
| `APPROVED_WITH_NOTES` | 无 blocker；存在 minor / nit，或存在已记录的既有债（非本 PR 引入）；可顺带修或转 issue |
| `CHANGES_REQUIRED` | 存在 blocker，或存在未给风险说明与 issue 的 major |
| `BLOCKED` | 无法完成评审：跑不起来（前置缺失 / 环境被占用）、拿不到范围或被测源码、结论无法复现。必须写清缺什么、需要谁补 |

### 模板

按此结构输出。**没有证据的行不要写**；单条问题不超过 5 行；`blocker` 必须带修法与复跑命令。

````markdown
# 测试评审：<范围，如 PR #123 的测试 / packages/dsh-tauri-pet 全部单测>

## 判定
<APPROVED | APPROVED_WITH_NOTES | CHANGES_REQUIRED | BLOCKED>

## 结论
<1-3 句：能不能合。有无 blocker。测试是否真的在守行为。>

- 范围：<文件数 / 用例数>
- 机械扫描：<按 §6 命令跑出的 blocker / major / minor 计数>
- 实跑：`<命令>` → `<结果：N passed / N failed，耗时>`

## 运行时验证

| 命令 | 结果 |
| :--- | :--- |
| `node node_modules/vitest/vitest.mjs run --project unit` | <N files / N tests passed> |
| `node node_modules/vitest/vitest.mjs run --project unit <file>` | <单跑结果> |

<做了变异式验证就写明：破坏了什么、哪个用例变红、哪个没红（没红的才是问题）。>

## Blocker
### B1 <一句话结论> — `path/to/file.test.ts:123`
- 原文：`<逐字片段>`
- 依据：<引用维度号 D3 / D7，或 `docs/specs/desktop.test.md` §1 等>
- 建议：<具体到可直接落地的代码或命令>
- 复跑：`<命令>`

## Major
### M1 <结论> — `path:line`
- 原文 / 依据 / 建议

## Minor
- `<path:line>` — <一句问题 + 一句修法>

## 覆盖缺口
- `<src/file.ts:行>` 的 `<分支/失败路径>` 无用例 → 建议新增 `it('<行为>')`：输入 `<x>` 期望 `<y>`。
- 修复类改动：`<用例>` 在修复前不会红 → 不构成回归保护（D7）。

## 不建议改的
<明确写出你确认过、看起来可疑但其实正确的写法，防止下一个人误改。>

## 顺带记录的既有债（非本 PR 引入）
- `<path:line>` — <问题>（详见 §9 的既有债表）
````

### 写作要求

* **每条结论必须能反查到行**：`文件:行` + 原文片段。做不到就不写。
* **区分「会漏掉缺陷」与「不好看」**：前者 major 起，后者 minor / nit。不要用风格问题充数。
* **给修法，不给口号**：写 `改为 await expect(...)`，不写「建议加强断言」。
* **统计必须来自真实运行**：用例数、通过数、耗时都从命令输出抄，禁止估算或编造。
* **宁少勿滥**：5 条有证据的问题优于 20 条猜测。
* 中文报告；代码、路径、命令保持原文。

---

## 8. 与 CI 的关系

`.github/workflows/ci.yml` 的硬门禁（非零退出即 PR 红）：

| 作业 | 平台 | 门禁内容 |
| :--- | :--- | :--- |
| `unit` | ubuntu-latest | `pnpm run typecheck`、**`pnpm run lint`（退出码必须 0）**、`pnpm run test:unit -- --run` |
| `plugins-e2e` | ubuntu-latest | `pnpm run test:e2e:plugin -- --run`（先装 Playwright Chromium、`pnpm build:plugins`、隔离安装 dsh CLI） |
| `desktop-e2e` | windows-latest | `pnpm run test:e2e:desktop -- --run`（先构建前端产物与 debug 二进制） |
| `rust-test` | ubuntu-22.04 / macos-14 / windows-latest | `cargo test --all-features --locked`（`src-tauri`） |

* **三条车道必须真跑**：不提供 skip 开关。前置不满足（产物缺失、dsh 解析不到、端口/进程残留、二进制缺失）一律直接 Fail，不允许用 `skipIf` 掩盖环境问题，否则 CI 会在什么都没断言的情况下报绿。
* **覆盖率仅报告，不设阈值、不进 CI 门禁**：根 `vitest.config.ts` 只有 `coverage` 的 `provider` 与 `exclude`（排除 `source/**`、`archive/**`、`test/archive/**`、`src-tauri/**`），没有 `thresholds`。覆盖率数字用于发现盲区（配合 D6），不作为准入判断——**不看覆盖率百分比，看契约与风险**。
* **文档改动不会触发 CI**：`pre_job` 的 `paths_ignore` 含 `**/docs/**` 与 `**/*.md`，纯文档变更会被 skip。因此改本文件或两份运行协议时，**验证靠 §6 的 `rg` 与人工复核**，不要指望 CI 兜底。

---

## 9. 已知债与「看似可疑其实正确」

### 既有债（评审时不要当成本 PR 的新问题，也不要说「仓库里没这种问题」）

行号会随重构漂移，引用前用 `rg` 复核。

| 位置 | 问题 |
| :--- | :--- |
| `packages/dsh-tauri-pet/src/host/routes/index.test.ts:276` | 标题把 `SSE` 写成 `sSE` |
| `packages/dsh-tauri-turnrewind/src/host/utils/lock.test.ts:313` | 同义反复断言：`expect(lock.lockPath('C:/Repo') === lock.lockPath('c:/repo')).toBe(process.platform === 'win32')`，非 Windows 上退化为 `false === false`（D1） |
| `packages/dsh-tauri-turnrewind/src/host/utils/lock.test.ts:330` | 用例内 O(10000) 暴力搜索造碰撞夹具（本身即被测算法） |
| `packages/dsh-tauri-rightclick/src/client/service/menu.test.ts` | 50 行左右的文件 mock 掉 `../apis`、`../locales`、`dsh-tauri/client` 三个依赖，用例全在验透传 / 验 mock 返回值（D4） |
| `packages/dsh-tauri-worktree/src/host/service/worktree.test.ts` | `expect(ok).toBe(true); if (!ok) return` 收窄样板重复多次，未抽 helper |
| `test/e2e/plugins/dsh-host-and-core-contract.e2e.ts:48` | 断言临时目录名这种实现细节（`toContain('dsh-e2e-dsh-tauri-')`） |
| `test/e2e/plugins/dsh-host-and-core-contract.e2e.ts:268` | 先断 `toBe(404)` 再断 `not.toBe(200)`，第二条零信息（D1） |
| `test/e2e/plugins/dsh-host-and-core-contract.e2e.ts:139` | 进程级 `process.env.DSH_E2E_MOUNT = 'cli'`，靠 `fileParallelism: false` + `finally` 兜底 |
| `test/e2e/plugins/dsh-tauri-pet.e2e.ts:190` | 时序脆弱断言：`expect(read.chunks, '就绪帧必须在首个响应块内到达').toBe(1)` 依赖网络分块行为 |
| `test/e2e/desktop/boot.e2e.ts:85` | `describe.skipIf(process.platform === 'darwin')` |
| `test/e2e/desktop/02-pet-window.e2e.ts:108` | `describe.skipIf(process.platform !== 'win32')` |
| `test/plugin-resource-closure.test.ts:43` | `describe.skipIf(!BUILT)`，不构建则整组用例在 CI 里从不执行（CI 用 `pnpm build:plugins` 兜住） |
| `test/close-action.test.ts:35,48` | `readFileSync` + `expect(source).toContain(...)` 做字符串级源码断言，属实现耦合型测试（D1/D4） |
| `test/e2e/support/desktop-host.ts:327` | 注释与代码同行：`*/async function hasLiveProcess(...)` |

干净的部分（可以放心引用）：全仓**无 `.only`**、**无 `it.todo`**、**无 Jest API**、**无快照**、**零 `test(`**（只用 `it`）；"跳过"只有上面三处 `skipIf`。

### 看似可疑其实正确（不要误改）

* **显式 import `describe/it/expect/vi`**：本仓没有 `globals: true`，这正是正确写法。
* **字符串路径 `vi.mock('./x')`**：本仓既有约定，迁移到 `vi.mock(import('./x'))` 属可选演进。
* **没有 `test.extend`**：本仓零 `test.extend`，夹具用工厂函数 + `describe` 作用域，风格一致。
* **E2E 用 `expect.poll`**：这是本仓等待异步条件的正确写法（单测对应 `vi.waitFor`），不是「固定 sleep」。
* **单测标题中英混排**：按包/层级分化是既有常态，不要当缺陷报。E2E 层则一律中文「验证…」开头，反向用例加 `[反向] ` 前缀。
* **`toBeDefined()` 单独出现但同用例内还有 `toMatchObject(...)`**：不是弱断言。
* **E2E 断言带中文第二参数**：这是本仓约定，不是多余。
* **用例数偏少**：先看被测函数的契约与真实可达分支，只对**有风险**的路径提缺用例要求，不按行数论断覆盖不足。
