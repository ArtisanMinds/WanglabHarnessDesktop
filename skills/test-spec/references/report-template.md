# 评审报告模板

按此结构输出。**没有证据的行不要写**；单条问题不超过 5 行；`blocker` 必须带修法与复跑命令。

---

````markdown
# 测试评审：<范围，如 PR #123 的测试 / packages/dsh-tauri-pet 全部单测>

## 结论
<1-3 句：能不能合。有无 blocker。测试是否真的在守行为。>

- 范围：<文件数 / 用例数>
- 机械扫描：`blocker N / major N / minor N`（命令：`node skills/test.spec/scripts/scan-tests.mjs <path>`）
- 实跑：`<命令>` → `<结果：N passed / N failed，耗时>`

## 运行时验证
<实际跑过的命令与真实结果。写清哪个 project、哪个文件、是否单跑过、是否全量跑过。>
<做了 mutation 式验证的话写明：破坏了什么、哪个用例变红、哪个没红（没红的才是问题）。>

| 命令 | 结果 |
| :--- | :--- |
| `vitest run --project unit` | 99 files / 884 tests passed |
| `vitest run --project unit format.test.ts` | 1 file / 18 tests passed |

## Blocker
### B1 <一句话结论> — `path/to/file.test.ts:123`
- 原文：`<逐字片段>`
- 为什么：<不修会怎样。引用规则号 R7 / 本仓 `docs/specs/desktop.test.md` §5 等>
- 修法：<具体到可直接落地的代码或命令>
- 复跑：`<命令>`

## Major
### M1 <结论> — `path:line`
- 原文 / 为什么 / 修法

## Minor
- `<path:line>` — <一句问题 + 一句修法>

## 覆盖缺口
<按 R16，给出具体缺的用例，而不是"覆盖不足"：>
- `<src/file.ts:行>` 的 `<分支/失败路径>` 无用例 → 建议新增 `it('<行为>', ...)`：输入 `<x>` 期望 `<y>`。
- 修复类改动：`<用例>` 在修复前不会红 → 不构成回归保护。

## 不建议改的
<明确写出你确认过、看起来可疑但其实正确的写法，防止下一个人误改：>
- `<path:line>` 的 `toBeDefined()` 不是弱断言：同一用例内还有 `expect(x).toMatchObject(...)`。
- `<path:line>` 未用 `test.extend`：与仓库既有夹具风格一致（本仓零 `test.extend`）。
- `<path:line>` 用字符串路径 `vi.mock`：本仓既有约定，迁移属可选演进。

## 顺带记录的既有债（非本 PR 引入）
- `<path:line>` — <问题>（详见 skills/test.spec/references/repo-conventions.md 的已知债表）
````

---

## 写作要求

- **每条结论必须能反查到行**：`文件:行` + 原文片段。做不到就不写。
- **区分"会漏掉缺陷"与"不好看"**：前者 major 起，后者 minor/nit。不要用风格问题充数。
- **给修法，不给口号**：写 `改为 await expect(...)`，不写"建议加强断言"。
- **统计必须来自真实运行**：用例数、通过数、耗时都从命令输出抄，禁止估算或编造。
- **宁少勿滥**：5 条有证据的问题优于 20 条猜测。扫描脚本的每条输出都要回读原文确认。
- **写"不建议改的"**：这是防止误改的关键一节，尤其在本仓存在大量"看似弱断言实际正确"的写法时。
- 中文报告；代码、路径、命令保持原文。
