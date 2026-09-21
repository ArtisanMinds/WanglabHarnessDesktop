---
name: test-spec
description: 评审测试代码质量并输出可执行的修改清单——断言是否验到真实契约、用例是否真的会运行、异步与 mock/snapshot 卫生、隔离与确定性、边界与错误路径覆盖，以及本仓 E2E 规范（data-testid、分层归属、环境隔离）。当用户提出「测试评审 / 测试代码评审 / 检查测试 / 测试质量 / 测试是否可靠 / 评审这个 PR 的测试 / 补充用例 / AI 写的测试能信吗」，或需要为新增、修复、AI 生成的测试把关时使用。Review Vitest test code (unit + E2E) for assertion quality, over-mocking, flakiness, isolation, and coverage gaps.
metadata:
  author: Hairyf
  version: "2026.05.20"
---

# 测试代码评审（test-spec）

对 Vitest 测试代码做**证据驱动**的评审：每条结论都要能落到「文件:行 + 原文 + 为什么是问题 + 怎么改」，而不是给一堆泛泛的最佳实践。

## 何时用 / 何时不用

用：评审新增或修改的测试、评审 AI 生成的测试、判断一个 PR 的测试是否够格、修复 flaky、查「测试全绿但线上还是坏」的覆盖缺口。

不用：只是让你**写**新测试（写测试时按 `docs/specs/plugin.test.md` / `docs/specs/desktop.test.md` 的规范走，本 skill 的清单可作为自检）；也不要用它评审被测源业务代码本身。

## 铁律

1. **没跑过的测试不算通过。** 静态读完必须实际执行（`vitest run --project <p>`）。只读代码就断言"测试没问题"是评审事故。
   两个实测坑：①本仓 `pnpm test` / `test:unit` / `test:e2e:*` 脚本**没有**带 `run`，交互式终端下会进 watch 挂住，评审命令一律显式带 `run`（或 `--no-watch`）并设超时；②单文件过滤要用位置参数 `vitest run --project unit <file>`，带 `--` 的写法**不过滤**，会跑完整个 project。
2. **禁止为了变绿而改测试。** 测试与实现不符时，默认判定为**实现或测试有一条错**并指出证据；只有用户明确要求"修测试"时才动手，且不得放松断言。
3. **每条结论必须可定位。** 格式固定为 `文件:行` + 原文片段 + 判定 + 依据（引用本仓规范或 references 里的规则号）。说不出行的结论不要写。
4. **区分「机械可判定」与「语义判断」。** 前者（jest API、`.only`、缺 await、CSS 选择器……）交给扫描脚本；后者（断言是否验到契约、是否过度 mock）必须自己读代码判断，脚本结果只是线索。
5. **本仓规范优先于通用最佳实践。** 仓库既有约定（只用 `it`、显式 import、字符串路径 `vi.mock`、E2E 中文「验证…」标题）与 Vitest 官方推荐不一致时，**按仓库现状**，把差异写成"可选演进"而不是 blocker。

## 工作流

### Step 0 定范围
明确要评审的文件集合：PR 改动的测试文件、用户点名的文件、或最近新增的 `**/*.{test,spec}.ts` + `test/e2e/**/*.e2e.ts`。
拿不到 diff 时用 `git status --short` / `git diff --name-only HEAD~1` 定位。

### Step 1 建上下文（缺这一步的评审都是瞎猜）
- 读**被测源码**的完整签名与分支，而不是测试文件里对它的描述。
- 读**同目录已有的兄弟测试**，确认命名、断言、夹具风格（本仓风格见 [references/repo-conventions.md](references/repo-conventions.md)）。
- 读 `vitest*.config.ts`：有没有 `globals: true`、`restoreMocks`、`environment`、project 的 `include`。
- 涉及 E2E 时读 `docs/specs/desktop.test.md` / `docs/specs/plugin.test.md`（唯一权威：分层与归属、运行命令、选择器口径、隔离红线、已知坑）。

### Step 2 机械扫描
```bash
node skills/test.spec/scripts/scan-tests.mjs <path...>          # 默认只报 blocker/major/minor
node skills/test.spec/scripts/scan-tests.mjs <path...> --json   # 结构化输出
node skills/test.spec/scripts/scan-tests.mjs <path...> --strict # 有 blocker 时退出码 1
node skills/test.spec/scripts/scan-tests.mjs <path...> --min=info  # 连命名类提示一起看
```
脚本只做**证据收集**：它报的每一条都要回读原文确认是不是真问题，也可能漏掉语义问题。不要把它的输出直接当日志交差。

### Step 3 逐条过语义清单
按 [references/rubric.md](references/rubric.md) 的 R1–R18 逐用例检查。**重点永远是 R1、R2、R7、R11、R16**——它们对应"测试全绿但毫无价值"的主要成因。Vitest 具体陷阱（mock 还原层级、`.mock.calls` 存引用、缺 await 恒过、快照纪律）见 [references/vitest-traps.md](references/vitest-traps.md)。

### Step 4 实证
- 跑一遍：`vitest run --project unit`；单文件用**位置参数**：`vitest run --project unit format.test.ts`。
  ⚠️ 实测：`vitest --project unit -- <file>` 这种带 `--` 的写法**不会过滤**，会跑完整个 project（本仓 `docs/` 里就是这种写法，别照抄）。单文件验证请用上面的位置参数形式。
  E2E 前先 `pnpm build:plugins`（plugin）/ `pnpm build:debug`（desktop）。
- 怀疑隔离问题时**单跑该文件**再**跑整个 project**：单跑绿、全量红 = 用例间共享状态，属 blocker。
- 怀疑恒过时**故意破坏实现**，确认测试真的会红（mutation 式验证）。这一步对"断言是否有效"最有效。

### Step 5 定级
`blocker` / `major` / `minor` / `nit` 的定义与准入线见 [references/rubric.md](references/rubric.md) 的「分级与门禁」。

### Step 6 出报告
严格用 [references/report-template.md](references/report-template.md) 的结构：结论 → 分级问题（每条含文件:行、原文、为什么、怎么改）→ 覆盖缺口 → 已跑过的验证 → 不建议改的东西。**目录/统计必须来自真实运行，不得编造次数。**

### Step 7 只改该改的
用户要求动手修时：一次只改一类问题，改完**重跑同一命令**并把结果贴回报告；不得顺手重构测试结构、不得删除用户认为有价值的用例、不得改断言去迁就实现。

## 快速红线（命中即为 blocker）

| 现象 | 判定 |
| :--- | :--- |
| `expect(p).resolves.toX()` 没有 `await` / `return` | 用例**恒过**，断言从未生效 |
| 用例体内没有任何 `expect`（且不是 `@ts-expect-error` 类型用例） | 空壳用例，只贡献"绿" |
| `.only` / `fdescribe` / `fit` 残留 | 静默跳过其余用例 |
| 只在 `toBeDefined()` / `toBeTruthy()` 上收尾 | 几乎任何值都能过，属假信心 |
| 断言与自身实现同义反复（`expect(f(x) === f(y)).toBe(platform === 'win32')`） | 在多数平台上退化为 `false === false`，零信息 |
| 测试 Touch `~/.dsh`、`~/.dsh.dev`、`.store.dev.dat`、`.store.dat` | 污染用户真实环境，本仓明令禁止 |
| E2E 用 CSS 类名 / 文案 / DOM 层级定位 | 违反 `data-testid` 规范，重构即红 |
| E2E 只断言"没有报错" | 没有正向产物断言，"什么都没渲染"也会绿 |
| 单跑绿、全量红 | 用例间共享状态，未隔离 |
| 平台/构建条件让**唯一**门禁用例静默跳过（如 `describe.skipIf(!BUILT)`） | 门禁形同虚设 |

## 常见坑（评审者自己会踩的）

- **把风格差异当缺陷。** 本仓单测标题中英混排是常态（按包/层级分化），不要因为某文件用英文就判不合格。
- **把"用例少"直接判覆盖不足。** 先看被测函数的契约与分支，只对**真实可达**且**有风险**的路径提缺用例要求。
- **把仓库既有技术债当成新 PR 的问题。** 先确认问题是否本 PR 引入；既有债写成"顺带记录"，别阻塞本次评审。
- **忽略配置层事实。** 本仓四个 vitest 配置均**没有** `globals: true`，也**没有** `restoreMocks`/`clearMocks`——所以「显式 import」「文件自管还原」是**正确**写法，反过来要求用全局 API 才是错的。
- **只看测试不看源码。** 不知道函数契约时，任何"断言太弱"的判断都站不住。
- **在 watch 模式下跑。** 评审用 `vitest run`（或 `pnpm test:*`），`vitest` 默认 watch 会挂住。

## 交付

- 报告正文（模板见 references）。
- 用户要求时：修改后的测试文件 + 复跑命令与实际结果。
- 涉及行为改动的测试，提醒同步测试代码本身：本仓已废弃用例文档体系，测试不由「文档条目 ↔ `it()`」驱动，`it()` 标题即契约描述（`docs/specs/plugin.test.md` §10），无需登记任何台账。

## 参考文件

- [references/rubric.md](references/rubric.md) — R1–R18 检查项、分级定义、准入门禁
- [references/vitest-traps.md](references/vitest-traps.md) — Vitest 具体陷阱与正确写法（mock / 快照 / 异步 / 隔离）
- [references/repo-conventions.md](references/repo-conventions.md) — 本仓既有测试约定与已知技术债
- [references/report-template.md](references/report-template.md) — 评审报告输出模板
- [scripts/scan-tests.mjs](scripts/scan-tests.mjs) — 机械扫描脚本
