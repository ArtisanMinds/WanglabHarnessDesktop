# 本仓测试约定与已知债

评审时以**仓库现状**为准。与通用最佳实践冲突时，按这里；要推动改变，写成「可选演进」而非 blocker。

## 配置层事实

- 四个配置：`vitest.config.ts`（root，只列 `test.projects`，自身不收用例）、`vitest.unit.config.ts`、`vitest.plugin.config.ts`、`vitest.desktop.config.ts`。
- 三个 project 均**没有** `globals: true`，root 也**没有** `restoreMocks` / `clearMocks` / `mockReset` / `snapshotFormat`。
  → 「显式 import」「文件自管 mock 还原」是**正确**写法；要求改用全局 API 才是错的。
- root 的 `resolve.alias '@' → ./src` **不被 project 继承**，`unit` 里重复声明了一次。新增 project 需自行声明。
- 名字即归属：`unit` = `packages/**`、`test/**`、`src/**/*.test.ts`（排除 `test/archive/**`）；`plugin` = `test/e2e/plugins/**/*.e2e.ts`（`fileParallelism: false`）；`desktop` = `test/e2e/desktop/*.e2e.ts`。

## Import 与命名

- 一律 `import { describe, it, expect, vi } from 'vitest'`，标识符按字母序。**全仓零 `test(`**，只用 `it`。
- `describe` 常用但非必须；命名取被测模块/函数，同族用 `/` 合并：`describe('formatCounts / formatTotals')`。
- 文件命名：源码旁 `*.test.ts`；纯 helper 用 `.utils.test.ts` 后缀（如 `session-stream.utils.test.ts`）。
- 标题语言**按包/层级分化，不是按文件**：
  - E2E 层（`test/e2e/**`）：100% 中文，「验证…」开头，反向用例加 `[反向] ` 前缀。
  - 单测层：`dsh-tauri-pet`、`dsh-tauri-worktree` 偏中文长句（常在标题带括号补充）；`dsh-tauri-turnrewind/lock`、`panel-scheduler/schedule`、`rightclick/menu`、`dsh-tauri` 纯函数与 client 偏英文陈述句（`parses…` / `renders…` / `rejects…`）。
  - 同一文件内中英混排是既有常态，**不要**当缺陷报。

## 断言风格

- 主力：`toBe` / `toEqual` / `toMatchObject` / `toContain` / `toContainEqual` / `toHaveLength` / `toMatch(/re/)` / `toBeUndefined` / `toBeNull` / `toBeDefined` / `toBeGreaterThanOrEqual` / `toBeLessThanOrEqual`。
- 异常：`toBeInstanceOf(WorkspaceLockTimeoutError)`、`toThrowError(/duplicate/)`、`toThrowError(boom)`（传 Error 实例）。
- 异步 house style：`await expect(promise).resolves.toBe('parallel')`、`.rejects.toBeInstanceOf(...)`、`.rejects.toMatchObject({ ... })`。
- spy：`toHaveBeenCalledWith` / `toHaveBeenCalledTimes` / `not.toHaveBeenCalled`。
- **全仓零** `expect.extend` / `expect.soft` / `expect.poll`；异步等待用 `vi.waitFor`。
- **全仓零快照**（`toMatchSnapshot` / `toMatchInlineSnapshot` / `toMatchFileSnapshot`）。新引入快照需要理由。
- 断言消息（第二参数）：**E2E 几乎逐条必带中文消息**（`expect(response.status, 'SSE 路由必须存在且返回 200').toBe(200)`），单元测试几乎不带。
- 自定义断言靠局部 helper 函数，不是自定义 matcher：`waitFor<T>(read, label)`（2s 上限，超时抛 `timeout waiting for ${label}`）、`waitUntil(predicate, label)`、`withHeld(lock, key, test)`（保证断言失败时也释放并回收持有者）、`allowMethods(response)`。

## Mock 与夹具

- `vi.mock` 用**字符串路径**；部分替身用 `importOriginal` 形参；取类型化 mock 用 `vi.mocked(fn)`。
- 偏好**手写最小替身对象**（`createHost()` 之类 HostContext）而不是 `vi.mock`。
- 还原靠文件自管：`afterEach(() => vi.restoreAllMocks())` 或 `beforeEach(() => vi.clearAllMocks())`，局部 spy 用 try/finally + `mockRestore()`。
- fake timers 规范写法：`beforeEach(() => vi.useFakeTimers())` + `afterEach(() => { ...; vi.useRealTimers(); vi.unstubAllGlobals() })`；局部写法在测试体内开、`finally` 关。
- **无 `test.extend`**：夹具靠工厂函数 + `describe` 作用域。`format.test.ts` 的 `function turnSummary(patch: Partial<TurnSummary> = {}): TurnSummary` 是 default-merge 工厂范本。
- 临时目录：`mkdtemp(join(tmpdir(), '<prefix>-'))` 登记进模块级数组，`afterEach` 里 `while (arr.length) await rm(arr.pop()!, { recursive: true, force: true })`。
- 真实 git 仓库夹具（**不 mock git**）：`execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()`，三步 `git init -b main` + `config user.email/user.name` + `commit -m init`。
- 真实跨进程竞争：`spawn(process.execPath, ['--import', 'tsx', workerFile, ...], { stdio: ['ignore','pipe','pipe','ipc'], windowsHide: true })` + `fixtures/lock-worker.ts`，`finally` 里全部 `SIGKILL`。
- 模块级累计态统一收尾：`openConnections` / `openServers` / `unloaders` 数组 + `afterEach` 里 `splice(0)` 逐个 dispose。
- **环境隔离唯一手法**：`DSH_HOME` 是 `dsh-tauri` 的模块级常量（导入即求值），只能靠 `vi.mock('dsh-tauri')` 换成 `packages/.test/test-utils.ts` 的 `testDshHome = mkdtempSync(join(tmpdir(), 'dsh-test-home-'))`；`resetTestDshHome()` 只删 `['ledger','checkout-context','worktrees','.trash']` 四个自有目录，**不删整个 root**。

## E2E 约定

- 定位**只认 `data-testid`**；跨用例常量集中在 `test/e2e/support/selectors.ts`（现有 `SHELL_ROOT` / `SHELL_IFRAME` / `SETUP_ERROR` / `SETUP_PREINSTALL_SKIP`），命名 `dsh-<业务域>-<元素名>`。用例删除时同步删除无消费者的常量。
- 唯一例外：内嵌 dsh 页面的结构锚点 `#root`，且**必须作为参数传入** `browser.execute` 的回调——`browser.execute` 只序列化函数体，模块级常量在页面上下文里不存在（引用即 `DSH_ROOT is not defined`）。
- 断 `data-*`：拿 WDIO element 后 `isDisplayed()` / `isExisting()` / `getAttribute('src')`；无浏览器的插件侧走纯 HTTP `fetch(url, { headers: apiHeaders() })` + 断状态码。
- 宿主地址/凭据：`globalSetup` 里 `project.provide('dshBaseUrl' | 'dshUrl' | 'dshCookie' | 'dshHome' | 'dshMounted', ...)`，用例里 `inject('dshCookie')`。globalSetup 在 worker 之外执行，所以只能这样传递。
- Cookie 获取：`dsh-host.ts` 的 `exchangeLaunchToken(url)` → 对根路径 `?token=` 做 `fetch(launch.href, { redirect: 'manual' })`，**要求 303 + `Set-Cookie`**，返回 `first.split(';', 1)[0].trim()`。根路径 token 交换是唯一取用途径，query token 与 Authorization 头都不被接受。
- `test/e2e/support/dsh-host.ts` 导出：`REPO_ROOT`、`assertMountRegistered(profileDir, packages)`、`scaffoldDshProfile(options)`、`startDshHost(options)`，类型 `StartDshHostOptions { plugin; also?; keepHome? }`、`DshProfile { home; profileDir; packages }`、`DshHost { url; baseUrl; cookie; home; logPath; mounted; stop }`。
- `test/e2e/support/desktop-host.ts` 导出：`REPO_ROOT`、`APP_PORT = 3081`、`APP_TITLE`、`MAIN_WEBVIEW = 'main'`、`WEBDRIVER_PORT`、`startDesktopApp(options)`、`defaultBinaryPath()`、`isPortBusy(port)`、`assertPreconditions(options)`、`resetTestStore()`、`purgeStaleHomes()`，类型 `StartDesktopAppOptions`、`DesktopApp { browser; home; downloadCacheDir; binaryPath; stop }`。
- 运行命令：`pnpm build:plugins` → `pnpm test:e2e:plugin`；`pnpm build:debug` → `pnpm test:e2e:desktop`。
  **两个实测坑**：①`pnpm test` / `test:unit` / `test:e2e:*` 对应的脚本是 `vitest [--project x]`，**没有带 `run`**，交互式终端下会进 watch 挂住——评审用命令一律显式 `vitest run --project <p>`；
  ②单文件过滤必须用**位置参数**：`vitest run --project unit format.test.ts`（实测 1 file / 18 tests）。`docs/` 里的 `vitest --project unit -- <file>` 写法带 `--`、**不过滤**，实测会跑完整个 project。
- 实测基线：`vitest run --project unit` → 99 files / 884 tests passed，132.66s。

## 用例编号

- 格式 `TC-<域>-L<层>-<文件序号>-<用例序号>`。桌面端 `TC-DSK-L3-01-001`；插件端前缀是插件短名，如 `TC-HOST-L2-01-001`、`TC-REW-L2-09-001`。
- 文件序号取 `docs/testing/<层>/<序号>-*.md`；用例序号在**文件内从 `001` 起、不跨文件连续**。
- 代码里几乎不带 id：仅 `test/e2e/desktop/boot.e2e.ts` 把 id 放进 `it()` 标题，`01-dsh-host-and-core-contract.e2e.ts` 在文件头注释里引用。其余 id 只活在用例文档的 `[Case ID]` 字段与 `[自动化] 是（文件:行）` 指针里。
- 文档标题与 `it()` 标题**逐字一致**（1:1）；`[反向]` 用例在文档里也带该前缀。

## 已知技术债（评审时不要当成本 PR 的新问题，也别说"仓库里没这种问题"）

| 位置 | 问题 |
| :--- | :--- |
| `packages/dsh-tauri-pet/src/host/routes/index.test.ts:267` | 标题把 `SSE` 写成 `sSE` |
| `packages/dsh-tauri-turnrewind/src/host/utils/lock.test.ts:313` | 同义反复断言：`expect(lock.lockPath('C:/Repo') === lock.lockPath('c:/repo')).toBe(process.platform === 'win32')`，非 Windows 上退化为 `false === false` |
| `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts:267-268` | 先断 `toBe(404)` 再断 `not.toBe(200)`，第二条零信息 |
| `packages/dsh-tauri-rightclick/src/client/service/menu.test.ts` | 52 行文件 mock 掉 `../apis`、`../locales`、`dsh-tauri/client` 三个依赖，3 个用例全在验透传/验 mock 返回值 |
| `packages/dsh-tauri-turnrewind/src/host/utils/lock.test.ts:330-340` | 用例内 O(10000) 暴力搜索造碰撞夹具（本身即被测算法） |
| `test/e2e/desktop/boot.e2e.ts:84` | `describe.skipIf(process.platform === 'darwin')` 让**唯一**桌面 L3 用例在非 Windows 上静默变绿 |
| `test/plugin-resource-closure.test.ts:41` | `describe.skipIf(!BUILT)` 同类问题 |
| `packages/dsh-tauri-worktree/src/host/service/worktree.test.ts` | `expect(ok).toBe(true); if (!ok) return` 收窄样板重复 10 次，未抽 helper |
| `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts:48` | 断言临时目录名这种实现细节（`toContain('dsh-e2e-dsh-tauri-')`） |
| `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts:167` | 时序脆弱断言：`expect(read.chunks).toBe(1)` 依赖网络分块行为 |
| `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts:139` | 进程级 `process.env.DSH_E2E_MOUNT = 'cli'`，靠 `fileParallelism: false` + finally 兜底 |
| `test/e2e/support/desktop-host.ts:317` | 注释与代码同行：`*/async function hasLiveProcess(...)` |
| `test/close-action.test.ts` | 用 `readFileSync` + `expect(source).toContain(...)` 做字符串级源码断言，属实现耦合型测试 |

干净的部分（可以放心引用）：全仓**无 `.only`**、**无 `it.todo`**、**无 Jest API**、**无快照**；唯一"跳过"是上面两处 `skipIf`。
