# 评审清单：R1–R18

每条含：**判什么 / 怎么判 / 典型反例 / 定级基线**。定级可按上下文升降，但降级必须写出理由。

判定总纲（来自 Vitest 官方 learn 文档）：

> 如果别人重写了内部实现、但对外输出不变，这个测试还应该通过。会红的，就是在测实现细节而不是行为。

---

## R1 断言是否验到真实契约 · 基线 blocker

- **判什么**：每个 `expect` 是否在验证「调用方真正依赖的东西」——返回值字段、落盘结果、抛出的错误类型与消息、对外可观察的副作用。
- **怎么判**：把断言逐条念一遍，问"如果实现返回一个完全错误的但非空的值，这些断言会不会红？"。
  `expect(user).toBeDefined()`、`expect(result).toBeTruthy()`、`expect(list).toHaveLength(...)` 单独出现时几乎不设防。
- **反例**：`expect(await createUser(input)).toBeDefined()`
- **正例**：`expect(user).toMatchObject({ name, email })` + `expect(user.id).toBeTypeOf('string')` + `expect(user.password).not.toBe(input.password)`
- 只有 `toBeDefined/toBeTruthy` 收尾且无其它 matcher → blocker；与其它真断言并存时降为 nit。

## R2 行为还是实现 · 基线 major

- **判什么**：测试是否耦合到内部结构——调用顺序、内部方法被调次数、私有函数名、中间变量。
- **怎么判**：问"把内部实现换一种写法（同样的输出），这个测试会不会红？"；红了就是实现耦合。
  重点看：断言内部协作方被调用的**顺序/次数**、`vi.spyOn` 到被测对象自己的方法、快照整个内部对象结构。
- **反例**：断言 `intlFormat` 收到了哪些 options、断言 `service.repository.save` 被调用过。
- **正例**：只断言 `formatPrice(1, 'USD') === '$1.00'`。
- 例外：若"调用顺序"本身就是**对外契约**（协议握手、审计日志顺序、幂等重试），断言它是正确的，需在报告里说明理由。

## R3 用例是否真的会跑 · 基线 blocker

- **判什么**：能不能在 CI 里真的执行并真的失败。
- **怎么判**：实际跑；再故意破坏实现验证它会红（mutation 式抽查，至少挑核心用例做一次）。
  检查：`.only` 残留、`it.skip`/`describe.skipIf` 让门禁静默变绿、导入不存在的导出、错误 API（`jest.*`）、假异步（见 R7）、被 project `include` 排除的文件名（`*.e2e.ts` 放进 `packages/`）。
- **反例**：`describe.skipIf(!BUILT)(...)` 让某平台上唯一门禁用例永久跳过且不计入失败。
- 跳过本身不一定是 blocker，**但"让唯一门禁静默变绿"是**。

## R4 边界与错误路径 · 基线 major

- **判什么**：是否只覆盖 happy path。
- **怎么判**：列出函数的输入域与失败模式，对照已有用例；只看**真实可达**的输入类型，不为每条分支都要求用例。
  必查四类：空/缺输入、边界值（0、上限、恰好越界）、失败依赖（网络/fs/DB 抛错）、空集合。
- **反例**：`parseAge` 只测 `'25'`，不测 `'0'`、`'150'`、`'-1'`、`'abc'`、`''`。
- 产出：给出**具体缺哪条用例**（函数 + 输入 + 期望），而不是笼统说"边界不足"。

## R5 一个用例一个行为 · 基线 minor

- 标题里出现 `并且/同时/以及/并且…又` 或英文 `and`、断言横跨两个独立行为 → 拆开。标题里带 `and` 本身只是**信号**，要看是否真的在验两件事（如 `stays inert and warns` 就是两件事）。
- 反例：`it('formats price and handles errors and logs the result')`。

## R6 用例名描述行为 · 基线 minor

- 读失败输出时**只看标题**就该知道哪里坏了。
- 反例：`it('should correctly return the formatted price string when given a valid positive number and a supported currency code')`、`it('test1')`、`it('works')`。
- 正例：`formats USD prices`、`throws for negative amounts`、`returns empty array when no items match`。
- 本仓 E2E 层另有约定：中文「验证…」开头，反向用例加 `[反向] ` 前缀。

## R7 异步正确性 · 基线 blocker

- 缺 `await` 的 `expect(promise).resolves/rejects` → 用例在断言生效前就结束，**恒过**。
- 其它形态：`async` 用例里 `forEach` 配 `async` 回调（不等待）、未 return 的 promise、`.then()` 里的断言没有 return。
- 正确：`await expect(fetchUser(1)).resolves.toMatchObject({ id: 1 })`。
- 反向：用 `await` 断言的**数量为 0** 的 async 用例也要查。
- 挂起/超时通常是 promise 永不 settle（回调没调用、条件不可能成立、死锁），不是"加个超时"能解决的。

## R8 mock 的边界 · 基线 major

- **绝不允许 mock 被测对象本身**：测 `UserService` 就 mock 它的依赖（DB、邮件），让 service 真跑。
- 真实现够快够稳就用真的（纯函数、内存数据结构）；只有慢 / 不确定 / 有不可控副作用时才 mock。
- HTTP 优先用 MSW 之类的请求层拦截，而不是直接 mock `fetch`。
- **过度 mock 的识别**：测试文件里 mock 掉了被测模块的所有依赖，于是用例实际只在验证"我配置的 mock 返回了我配置的值"。
- 反例：一个 50 行文件 mock 掉 `../apis`、`../locales`、第三方重导出，剩下 3 个用例全在验透传。
- **层级约束**（本仓硬规则）：L1 单元测试允许 mock 宿主；L2/L3 E2E **下游全部为真**，只允许 mock 外部服务（网络、模型、时钟）。E2E 里 mock 后端命令 = blocker。

## R9 mock 卫生 · 基线 major

- 用 `vi.*`，不是 `jest.*`（模型训练语料偏 Jest，这是高频误用）。
- `vi.spyOn(obj, 'method')` 默认**仍执行原实现**（与 `vi.fn()` 不同）；只是观测就不必再 mock 返回值。
- 还原纪律：`mockClear()` 只清调用记录、保留实现；`mockReset()` 连实现一起清；`mockRestore()` 才把 `spyOn` 的原方法还回去。
  本仓无全局 `restoreMocks`，所以文件必须自管：`afterEach(() => vi.restoreAllMocks())`、`beforeEach(() => vi.clearAllMocks())`，或 try/finally 里 `spy.mockRestore()`。
- **`.mock.calls` 存的是实参引用不是拷贝**：传入对象后被 mutate，`toHaveBeenCalledWith(原值)` 会失败。在 `mockImplementation` 里 `structuredClone` 或在 mutate 前断言。
- 类型化 mock 用 `vi.mocked(fn)`。

## R10 快照纪律 · 基线 major

- 快照是断言，必须**提交并像普通断言一样 review**；不许盲目按 `u` 接受 diff。
- 选择：小且聚焦 → `toMatchInlineSnapshot()`（首参留空，首次运行自动回填）；HTML/SVG/CSS/生成代码等格式敏感产物 → `await expect(x).toMatchFileSnapshot(path)`；大而杂的结构 → 外部快照。
- 含时间戳 / 随机 ID / UUID 时必须传非对称匹配器：`expect(user).toMatchSnapshot({ id: expect.any(Number), createdAt: expect.any(Date) })`。
- **不该用快照的场景**：输出每次不同；或只关心一两个字段——此时 `toMatchObject`/`toHaveProperty` 更能表达意图。
- 本仓现状：`packages/**` 与 `test/**` **完全不用快照**。新引入快照需要理由。

## R11 用例隔离 · 基线 blocker

- 共享状态：模块级数组/对象、全局变量、单例、缓存、`process.env`、文件系统残留。
- 判定手法：单跑该文件 vs 跑整个 project；或调整用例顺序后跑。
- 正确姿势：`beforeEach` 复位，或 `test.extend` 提供每个用例一份的新鲜夹具。
- 本仓通用收尾模式：模块级 `openConnections` / `openServers` / `temporaryDirectories` 数组 + `afterEach` 里 `splice(0)` 逐个 dispose/删除。
- 进程级环境变量的改写（`process.env.X = ...`）必须在 finally/afterAll 还原，并且依赖 `fileParallelism: false` 兜底时要在报告里写明这个前提。

## R12 确定性 · 基线 major

- 依赖真实时间、随机数、UUID、真实网络、机器端口、时区、文件系统排序 → 迟早 flaky。
- 时间/随机：`vi.useFakeTimers()` + `vi.setSystemTime()`；时区：保存/还原 `process.env.TZ` 并在 afterAll 恢复。
- 长等待：用可轮询的条件等待（本仓用 `vi.waitFor`）而不是 `await new Promise(r => setTimeout(r, N))`。
- 严格等于时序量（如"首个响应块内到达，chunks === 1"）属脆弱断言，应改为范围/最终条件断言。
- 端口：E2E 前必须断言空闲；机器级独占资源被占用时另开端口，**不要杀用户进程**。

## R13 层级与环境归属 · 基线 major

- 文件后缀与 project 归属必须匹配：L1 `*.test.ts`（`packages/<name>/src/**`）、L2 `test/e2e/plugins/*.e2e.ts`、L3 `test/e2e/desktop/*.e2e.ts`。
- `document is not defined` = 用例跑在 node 环境却需要 DOM；改 `environment` 或用 Browser Mode，而不是在用例里加 `typeof document !== 'undefined'` 兜底。
- 桌面端 `test/setup/tauri-runtime.ts` 只补空缺的 `window` 并 `mockIPC(() => undefined)`；不要靠它替代用例自己的 mock。

## R14 夹具、清理与资源 · 基线 major

- 临时目录必须清理：本仓 `mkdtemp(join(tmpdir(), '<prefix>-'))` 登记进数组，`afterEach` 里 `rm(..., { recursive: true, force: true })`。
- 启动的进程/服务器/监听必须在 `finally` 收尾；测试不得留下残留进程或占用端口（本仓规范：有残留直接 Fail）。
- **严禁触碰用户真实数据**：`~/.dsh`、`~/.dsh.dev`、`.store.dev.dat`、`.store.dat`。E2E 必须走 `DSH_E2E_HOME` 隔离根。
- E2E 收尾必须主动关闭应用并等待平滑退出。

## R15 契约描述与分层归属 · 基线 major

- 本仓**已废弃用例文档与 `TC-*` 编号**（`docs/testing/**` 已删除，见 `docs/specs/plugin.test.md` §10）：不存在「文档条目 ↔ `it()`」映射，也不存在需要同步的文档台账。
- **`it()` 标题即契约描述**：必须写清「验证什么对象、在什么条件下、期望什么可观察结果」；标题空泛（「测试正常」「works」）、与断言不符、或多个行为塞进一个标题 = major。
- 行为改动必须同步测试代码本身；只改实现不改测试 = major。
- **分层归属**：断言 dsh iframe 内部 DOM 却写成 L3、或纯函数断言写成 E2E = major；判据见 `docs/specs/desktop.test.md` §1。

## R16 覆盖缺口 · 基线 major

- 不看覆盖率百分比，看**契约与风险**：被测函数对外承诺的每条行为，是否有用例守着？代码路径里有没有"改坏了不会有任何测试变红"的地方？
- 产出必须具体：`<文件:行> 的 <分支> 没有用例；建议新增 <函数>(<输入>) → 期望 <输出>`。
- 修复类改动尤其重要：bug fix 必须先写**会红的回归用例**，确认它红，再修实现。评审时看到"修了 bug 但测试直接绿的"就要问：这个用例在修复前会不会红？

## R17 断言消息 · 基线 nit（E2E 层升为 major）

- 本仓 E2E 的断言几乎逐条带中文消息：`expect(response.status, 'SSE 路由必须存在且返回 200').toBe(200)`。缺消息的 E2E 断言在失败时无法定位到"用例-步骤-期望 vs 实际"。
- 单元测试不必加。

## R18 无意义/同义反复断言 · 基线 major

- 自证型：`expect(f(x) === f(y)).toBe(process.platform === 'win32')` —— 在非 Windows 上退化成 `false === false`。
- 蕴含冗余：先 `expect(status).toBe(404)` 再 `expect(status).not.toBe(200)`（404 已蕴含非 200），第二条零信息。
- 断言自己刚设的桩：先 `mockReturnValue(42)` 再 `expect(fn()).toBe(42)` —— 在验 mock 框架而不是产品代码。
- 断言实现细节的中间量（临时目录名、内部 key 拼写）在产物非对外的结构上，应改为断言可观察结果。

---

## 分级与门禁

| 级别 | 含义 | 处理 |
| :--- | :--- | :--- |
| **blocker** | 用例恒过、恒不跑、断言为空、门禁静默跳过、污染用户真实环境、E2E mock 后端 | 必须修，修完复跑 |
| **major** | 会漏掉真实缺陷或在重构时误红：弱断言、实现耦合、过度 mock、隔离缺失、缺关键边界、测试未随行为同步、分层归属错误 | 本 PR 内修，或明确记 issue 并说明风险 |
| **minor** | 可读性与维护成本：命名、拆分、重复样板、调试残留、真实时间等待 | 可顺带修，不阻塞 |
| **nit** | 风格偏好 | 可选，不要拿来充数 |

**准入门禁**（本仓 `docs/specs/*.test.md` 的准入标准）：
1. 独立运行 ≥ 5 次无 flake；
2. 失败能精确归因到「用例 - 步骤 - 期望 vs 实际」；
3. `it()` 标题即契约描述且与断言一致，分层归属正确；
4. 不依赖上一次运行遗留的状态；
5. 环境完全隔离（不改用户真实数据目录）。

报告里给出 blocker 时，必须同时给出**修法**与**复跑命令**；只给问题不给修法等于没评审。
