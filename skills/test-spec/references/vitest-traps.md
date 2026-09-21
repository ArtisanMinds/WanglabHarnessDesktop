# Vitest 陷阱速查

只收录**评审时会判错**的点。通用 API 用法不在此重复。

## 断言与异步

| 陷阱 | 后果 | 判定 |
| :--- | :--- | :--- |
| `expect(p).resolves.toX()` 缺 `await`/`return` | 用例在 promise settle 前结束，**恒过** | blocker |
| `async` 用例里 `arr.forEach(async ...)` 内断言 | 同上，回调不被等待 | blocker |
| `.then(v => expect(v)...)` 没有 return | 同上 | blocker |
| 用例内断言数为 0 | 只贡献绿色 | blocker（`@ts-expect-error` 类型用例除外） |
| `toBeDefined()` / `toBeTruthy()` 单独收尾 | 几乎任何值都过 | blocker ~ nit，看是否有其它真断言 |

正确形态：`await expect(fetchUser(1)).resolves.toMatchObject({ id: 1 })`。
挂起/超时不是"超时太短"，而是 promise 永不 settle。

## mock 与 spy

| 陷阱 | 说明 |
| :--- | :--- |
| `jest.fn` / `jest.mock` / `jest.spyOn` | 模型语料偏 Jest 的高频误用；本仓统一 `vi.*` |
| `vi.mock('./m')` vs `vi.mock(import('./m'))` | 后者类型安全、重构友好。**本仓现用字符串路径**，新代码保持一致；迁移属可选演进，不要当 blocker |
| `vi.fn()` | 默认返回 `undefined`、不做任何事，只记调用 |
| `mockReturnValue` | 忽略入参；需要按入参分支时用 `mockImplementation` |
| `vi.spyOn(obj, 'x')` | **默认仍执行原实现**（与 `vi.fn()` 不同），适合观测 |
| `mockClear()` | 只清调用记录与返回值，**保留**自定义实现 |
| `mockReset()` | 清记录 + **移除**自定义实现 |
| `mockRestore()` | 还原 `spyOn` 的原始对象方法（对 `vi.fn()` 近似 reset） |
| `.mock.calls` | 存的是**实参引用**；实参被 mutate 后 `toHaveBeenCalledWith(原值)` 会失败 → 在 `mockImplementation` 里 `structuredClone`，或在 mutate 前断言 |
| `vi.mocked(fn)` | 拿带类型的 mock 引用 |
| 手工替身对象 | 本仓偏好：比 `vi.mock` 更常用（`createHost()` 之类最小上下文） |

**还原纪律（本仓无全局配置，必查）**：`afterEach(() => vi.restoreAllMocks())`、`beforeEach(() => vi.clearAllMocks())`，或 try/finally 里 `spy.mockRestore()`。
没有还原意味着某个用例覆写的返回值会泄漏到后续用例——单跑绿、全量红。

**部分替身**用 `importOriginal` 形参，而非 `import('./x')`：
```ts
vi.mock('dsh-tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dsh-tauri')>()
  const { testDshHome: home } = await import('../../../../.test/test-utils')
  return { ...actual, DSH_HOME: home }
})
```

## 定时器与时间

- `vi.useFakeTimers()` 必须在 `afterEach(() => vi.useRealTimers())` 中还原；配 `vi.advanceTimersByTimeAsync(n)`。
- 断言"没有泄漏定时器"：`expect(vi.getTimerCount()).toBe(0)`。
- `vi.stubGlobal(name, value)` 配 `afterEach(() => vi.unstubAllGlobals())`。
- 时钟偏移：`vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset)`，不要改真实系统时间。
- 时区相关用例必须保存并还原 `process.env.TZ`（本仓 `beforeAll` 设置 / `afterAll` 恢复）。
- 等待异步条件用 `vi.waitFor(() => expect(...).toHaveBeenCalledTimes(1))`，不要 `await new Promise(r => setTimeout(r, N))`。

## 快照

- `toMatchSnapshot()` → `__snapshots__/<file>.snap`，**必须提交并 review**。
- `toMatchInlineSnapshot()` → 首参留空，首次运行自动回填并写入文件本身；适合小且聚焦的值。
- `await expect(x).toMatchFileSnapshot('./fixtures/x.html')` → 格式敏感产物（HTML/SVG/CSS/生成代码）。
- 更新：watch 模式按 `u`、`vitest -u`。**盲目接受 diff 会让坏输出变成"预期"**。
- 动态值必须传非对称匹配器：`expect(user).toMatchSnapshot({ id: expect.any(Number), createdAt: expect.any(Date) })`。
- 错误快照注意序列化形态：`toThrowErrorMatchingInlineSnapshot("[Error: Unexpected end of input at position 0]")`。
- 不该用快照：输出每次不同；或只关心一两个字段（用 `toMatchObject`/`toHaveProperty` 更明确）。
- 快照保护"任何变化"，定向断言表达"特定性质"——评审时优先问"这条断言想守住什么性质"。

## 隔离与环境

- 共享模块级状态：单跑绿、全量红 → blocker。修法 `beforeEach` 复位或 `test.extend`（本仓尚未使用 `test.extend`，新增需与库风格对齐）。
- `document is not defined`：用例跑在 node 环境却要 DOM → 改 `environment` / Browser Mode，别加 `typeof document` 兜底。
- 本仓 `test/setup/tauri-runtime.ts`（`unit` project 的 setupFiles）：因壳层模块在**导入期**就访问 Tauri API，node 下会 `ReferenceError: window is not defined` 并使整轮判失败。它 `globals.window ??= {...}`（只补空缺）、`mockIPC(() => undefined)`、`mockWindows('main')`——**真实后端行为仍须各用例自己 mock**。
- 进程级 `process.env` 改写必须有还原路径；依赖 `fileParallelism: false` 时要写明前提。

## Agent / CI 注意事项

- **Vitest 默认 watch 模式**：本仓的 `pnpm test` / `test:unit` / `test:e2e:*` 脚本**没有**带 `run`，交互式终端下会进入 watch 并挂住。评审时用 `vitest run --project <p>`，并给命令加超时。
- **单文件过滤必须用位置参数**：`vitest run --project unit format.test.ts` ✅。带 `--` 的 `vitest --project unit -- <file>`（本仓 `docs/` 里的写法）**不会过滤**，实测会跑完整个 project（99 files / 884 tests）——别照抄文档。
- 无 `globals: true` 时必须显式 `import { describe, it, expect, vi } from 'vitest'`。
- 生成测试后**立刻运行**：AI 写的测试常导错、引用不存在的函数、用错 API。
- 修复 bug 的提示词要明确"先写会红的回归用例"，否则 agent 容易**改测试而不是改代码**。

## 实测基线（2026-05，本仓）

- `vitest run --project unit` → `Test Files 99 passed (99)`、`Tests 884 passed (884)`，`Duration 132.66s`。
- `vitest run --project unit format.test.ts` → 1 file / 18 tests，413ms。
- 基线用于判断"是不是本次改动引入的问题"；数字变化时先确认是新增用例还是被过滤掉了。
