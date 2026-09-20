# dsh-tauri-turnrewind：会话级隔离调查与方案

> 目标：让 turnrewind 的「快照 / 变更归属 / 撤销 / 保留」四个域都以**会话**为边界，
> 而不是以**工作区**为边界。文档同时给出主流开源实现的对照证据与分阶段落地计划。

---

## 一、现状：为什么现在做不到会话级隔离

隔离边界只有一个地方定义：私有快照仓的定位。

```ts
// packages/dsh-tauri-turnrewind/src/host/service/snapshot.ts:65-71
resolve(worktree: string, commonDir?: string | null): SnapshotStore {
  return {
    worktree,
    gitDir: join(snapshotWorkspacesDir(), `${workspaceHash(worktree)}.git`),
    commonDir: commonDir ?? null,
  }
}
```

`gitDir = $DSH_HOME/dsh-tauri-turnrewind/workspaces/<workspaceHash>.git`
（`snapshot.ts:441-443`，`workspaceHash` 见 `packages/dsh-tauri-turnrewind/src/host/utils/workspace.ts:35-37`）。

**一个工作区一个仓，被该工作区全部会话共享。** refs 已经按会话命名空间
（`snapshot.ts:74-78`：`refs/turnrewind/<sanitized>-<sha8>/<turn>/<phase>`），账本也已按会话分文件
（`packages/dsh-tauri-turnrewind/src/host/service/ledger.ts`，`keyOf` = `<sanitized>.slice(0,96)-<sha256(sessionId).slice(0,8)>.json`），
但**共享仓**带来四个跨会话缺陷。

### 缺陷 1：变更归属是「整工作区树对树 diff」，没有会话归属

```ts
// snapshot.ts:225-259  diff(before, after)
const numstat = await gitInSnapshot(store, ['diff', '--numstat', '-z', '--no-renames', beforeCommit, afterCommit])
```

`capture.ts:133-154` 用 `before`/`after` 两次 `git add --all`（`snapshot.ts:139`）生成两棵树，
再整树 diff。**该 turn 时间窗内任何进程改过的文件都会被算进这一轮**——
包括同一工作区里另一个会话的 agent 改动。

后果：会话 A 的变更卡片会列出会话 B 的文件；A 的账本行把它们记成「A 的改动」。

### 缺陷 2：撤销会把另一个会话的成果静默回滚

```ts
// undo.ts:81 冲突预检
const conflicts = await snapshot.conflicts(store, afterCommit, record.files)
// snapshot.ts:697  git diff --name-only -z --no-renames <afterCommit> -- <tracked paths>
```

冲突判定是「工作区当前内容 vs **本轮自己的** after 快照」。若另一个会话在 A 的 turn 窗口内改过
文件 Y，B 的 Y1 已经**被包含在 A 的 afterCommit 里**，于是 `git diff afterCommit -- Y` 为空
→ 判定「无冲突」→ `snapshot.restore`（`snapshot.ts:380`，`git checkout <beforeCommit> -- <paths>`）
把 Y 写回 Y0。**B 的工作被无声销毁**，而 B 的账本仍认为 Y1 是自己的改动，
B 之后自己撤销时反而会撞冲突、卡死。

这是「没能做到会话级隔离」最严重的表现形式：不是读错数字，而是丢数据。

### 缺陷 3：保留域是工作区级，一个会话能把所有会话的历史一起作废

```ts
// snapshot.ts:446-448  标记文件与仓同名前缀
function workspaceMarkerPath(store: SnapshotStore): string {
  return `${store.gitDir}.json`
}
```

```ts
// retention.ts:49-58  超限 → 整仓隔离重建
const quarantine = `${store.gitDir}.retention-quarantine`
await rename(store.gitDir, quarantine)
await snapshot.rotate(store, `repository exceeded ${maxRepoMb}MB ...`)
```

`generation` 是**工作区级**（`retention.ts:25` `MAX_SNAPSHOT_REPO_MB = 2048`）。
任一会话的活动把该工作区的私有仓推过 2GB，整仓重建 → generation 轮换 →
`undo.ts:62-67` 对**该工作区所有会话**的旧记录判定 `TURNREWIND_EXPIRED`。
一个会话的重活杀掉另一个会话的全部可撤销历史。

### 缺陷 4：共享 index 与共享实时读数

```ts
// utils/git.ts:80-82  所有快照 git 调用的唯一收口
export function gitInSnapshot(store, args, options = {}) {
  return execGit(store.worktree, ['--git-dir', store.gitDir, '--work-tree', store.worktree, ...args], options)
}
```

没有 `GIT_INDEX_FILE`，所以 `<gitDir>/index` 是**跨会话共享的可变状态**。
所有 git 动作经 `workspaceQueue`（`host/config/runtime.ts:21`，进程内 FIFO + 跨进程内核锁）
串行，因此不会撞 `index.lock`，但 `snapshot.live`（`snapshot.ts:271-302`）
每 1.5s（`capture.ts:34` `LIVE_POLL_INTERVAL_MS = 1500`）对一个共享 index 做 `add --all`
并按 `git diff <beforeCommit>` 读数——**运行中提示条会把别的会话的改动显示成本轮的改动**。

### 已经正确的部分（保留）

- 账本按会话分文件、load-modify-save 按会话串行（`turns.ts:65-84`）。
- `MAX_TURNS_PER_SESSION = 50` / `MAX_TURN_RECORDS = 200`（`config/constants.ts:29,32`）
  与 `applyRetention`（`turns.utils.ts:41-74`）已是**每会话**语义，淘汰只删本会话的 refs。
- 撤销的路径安全（`utils/paths.ts` 词法包含 + 父级符号链接校验）、TOCTOU 复检、
  单路径失败只计入 `failed` 不标记已撤销——这些都要原样保留。

---

## 二、主流开源实现对照

调研覆盖 11 个实现。结论先行：**只有「按工具调用做路径归属」和「独立 upper/工作树」两条路能真正防住跨会话覆盖**；
「每会话一个 shadow git 目录」只隔离了 index/refs，**没有隔离工作树**。

| 实现 | 隔离单元 | 文件快照机制 | 共享工作区下能否防跨会话覆盖 |
| --- | --- | --- | --- |
| **MiniMax-AI/minimax-code** | **session_id**（DB 列 `UNIQUE(session_id, turn_id)`） | PreToolUse/PostToolUse 抓 before/after 文件内容，存 SQLite `undo_json` 列 | **能**（写前 sha256 CAS + 冲突跳过并报告） |
| **opencode** | session 活动目录 + **每 step 路径归属** | 独立内部 git 对象库 | **能**（"Paths not attributed to those steps are left alone"） |
| Claude Code | session（`~/.claude/file-history/<session>/`） | 明文文件副本 `<hash>@v1/@v2/@v3` | **不能**（官方明确：并发会话改动不被捕获，restore 是盲写覆盖） |
| openai/codex | thread UUID（rollout 文件） | **已移除**（`ghost_snapshot` / feature key `undo` → `Stage::Removed`） | 不适用（只剩对话 revert） |
| Cline | session + `refs/cline/checkpoints/<sessionId>/<runCount>` | shadow git + 三父 stash commit | **不能**（只隔离 index/refs） |
| Roo-Code | task（`<globalStorage>/tasks/<taskId>/checkpoints`） | per-task shadow git dir + `core.worktree` 指向用户工作区 | **不能**（只隔离 index） |
| Zed | **work directory**（`GitStoreCheckpoint { checkpoints_by_work_dir_abs_path }`） | 项目 git 对象库里的 dangling commit | **不能**（同一 worktree 上并发 thread 共享） |
| Gemini CLI | **project_hash**（`~/.gemini/history/<project_hash>`） | shadow git | 不能（连会话级都不是） |
| OpenHands | conversation（`container_name = 'openhands-runtime-' + sid`） | 无 checkpoint；overlayfs 每容器独立 upper/work | **能**（但仅 Linux + 容器） |
| Aider | 内存 Set（`aider_commit_hashes`，不持久化） | 直接改用户仓库 HEAD | 不能 |
| lobehub | agent / topic（`topics.projectWorkingDirectoryId`） | **无文件回滚**（`document_histories` 是 per-document） | 不适用 |

### 三个最有价值的参考实现

#### 1. minimax-code —— 与本插件问题同构，方案最完整

`packages/local-runtime/src/turns/file-changes.ts`：

```ts
const MAX_TEXT_SNAPSHOT_BYTES = 2 * 1024 * 1024
const MAX_CAPTURE_PATHS_PER_TOOL = 64
const SNAPSHOT_CAPTURE_CONCURRENCY = 4
const STRUCTURED_WRITE_TOOLS = new Set([
  'edit', 'write', 'multiedit', 'multi_edit', 'file_edit',
  'apply_patch', 'notebookedit', 'notebook_edit', 'str_replace_editor',
])
const SHELL_TOOLS = new Set(['bash', 'shell', 'sh', 'zsh', 'powershell', 'pwsh'])
```

- 归属靠 **PreToolUse / PostToolUse 钩子**按 `sessionId / turnId / toolCallId` 抓 before/after。
- 快照形状（`packages/local-runtime/src/persistence/ports.ts`）：
  `LocalTurnDiffSnapshotEntry { file, exists, hash?, sizeBytes?, content?, binary?, oversized? }`、
  `LocalTurnDiffUndoEntry { file, before, after }`、`LocalTurnDiffRecord { changeSetId, sessionId, turnId, workspaceDir, status: 'active'|'reverted', undo?, undoable? }`。
- 回滚计划不可变 + 按 `operationId` 幂等 receipt（`diff-rewind.ts:89-98`）：
  plan 的 `sessionId` 与请求不符 → `request-conflict`；已有 receipt → 直接返回。
- **写前 CAS**（`diff-rewind-files.ts:43-58` `applyFileIfSafe`）：重新读盘算 sha256 与 plan 的
  `expected` 比对，不一致就**跳过并报告**，原因枚举
  `'workspace-file-missing' | 'workspace-file-unexpected' | 'workspace-content-changed' | 'workspace-read-failed' | 'workspace-write-failed'`，
  **绝不盲写覆盖**。binary / oversized 快照 → `assertSnapshotComplete` 拒绝，`undoable = false`。
- 变更动作 `mutateTurnDiff(sessionId, 'revert'|'reapply', selector)` 的失败原因里有一条
  `'not_latest'` —— **只允许回退最新回合**。
- 文件身份 key = `path.resolve(workspaceDir) + '\0' + relativePath`（`diff-rewind.ts:329-331`）。
- Retention 7 天（`local-runtime-v2/.../storage-retention.ts:3-4` `TURN_DIFF_RETENTION_MS = 7 * DAY_MS`），
  且**未完成 rewind（`receipt_json IS NULL`）的会话整包不清理**。

#### 2. opencode —— 路径归属的语义表述最清楚

官方快照文档原文：每个 model step 前后各做一次快照，"The assistant message records which paths changed between those snapshots"；
回滚时 "A rollback restores **only paths attributed to assistant steps** after the selected conversation boundary …
**Paths not attributed to those steps are left alone.**"
捕获范围：活动目录内的 tracked 文件 + 未被忽略的 untracked（单个 ≤ 2 MiB）；
git-ignored 文件不捕获；会话运行中拒绝回滚。

#### 3. Cline —— 并发原语可抄

- `sdk/packages/core/src/hooks/checkpoint-hooks.ts:43`
  `checkpointScratchDir(cwd, sessionId)` = `sha256(`${cwd}\0${sessionId}`).slice(0,32)` ——
  **per-(工作区, 会话) 的私有 scratch 目录**，注释明确目的是避免"different workspace from inheriting a foreign index"。
- `:630` `refs/cline/checkpoints/${sessionId}/${runCount}` —— 刻意不写 `refs/stash`。
- `sdk/packages/core/src/session/checkpoint-restore.ts`：`git update-ref <ref> <new> <old>`
  被当作 **git 原生 CAS** 用，注释原文 "closing the race between the guard check and the reset"；
  两阶段 restore 事务（`git stash push --include-untracked` → 挪到私有 ref → `git stash drop`），
  失败回滚 `reset --hard` + `stash apply --index`。
- 只在快照含 `^3`（未追踪文件父提交）时才允许 `git clean -fd`，否则"deleting them would be unrecoverable data loss"。

#### 反面教训

- **codex 移除了 shadow-git undo**（`codex-rs/features/src/lib.rs:944-950`，feature key 就叫 `undo`，
  `Stage::Removed`）。旧协议形状仍留在反序列化测试里：
  `{"type":"ghost_snapshot","ghost_commit":{...,"preexisting_untracked_files":[],"preexisting_untracked_dirs":[]}}`
  —— 整树快照必须额外记录「快照前已存在的 untracked 文件/目录」，否则撤销时无法区分
  「该删的新建文件」和「用户本来就有的文件」。这是删除语义最容易出 bug 的地方。
- **Claude Code 明确承认跨会话不隔离**：官方 checkpointing 文档说
  "Manual changes you make to files outside of Claude Code and **edits from other concurrent sessions
  are normally not captured**"；且不追踪 Bash 改的文件、subagent 编辑（除前台 `context: fork`）不恢复、
  symlink/hardlink 跳过并警告。
- **Zed / Roo-Code / Cline / Gemini CLI 都只隔离了 index 与 refs**，工作树仍然共享，
  所以 restore 仍会覆盖别的会话。Roo-Code 文档甚至直接写 "If nested Git repositories are detected
  in your workspace, checkpoints are disabled."

---

## 三、方案

设计原则：**对象库共享（内容寻址、不可变、天然去重），其余全部按会话分域；
撤销以「路径归属 + 写前 CAS」为准，冲突一律显式跳过并报告，绝不盲写。**

### I1 存储域：每会话私有 index，共享不可变对象库

- `SnapshotStore` 增加 `indexFile: string`：
  `$DSH_HOME/dsh-tauri-turnrewind/sessions/<sessionKey>.index`
  （`sessionKey` 与 `ledger.keyOf` 同形：`<sanitized>.slice(0,96)-<sha256(sessionId).slice(0,8)>`，
  抽到 `host/utils/session.ts` 供 `service/ledger.ts` 与 `service/snapshot.ts` 共用）。
- `gitInSnapshot`（`utils/git.ts:80-82`）注入 `env: { GIT_INDEX_FILE: store.indexFile }` —— 单点收口，改动最小。
- **不**采用 Roo-Code 的「每会话一个 git 仓」：同一工作区多会话会把相同 blob 重复存 N 份。
  对象库是 append-only + 内容寻址，跨会话共享无隔离风险；
  唯一共享的可变状态是 index，已由 `GIT_INDEX_FILE` 拆开。
  （与现有注释「私有仓自包含、不用 alternates」不冲突：alternates 才是被 gc 破坏的那个方案。）

### I2 归属域：按工具调用做路径归属

- 归属来源用**已有的钩子**：`host/events/tools-pre-execute.ts`（`exec.name` / `exec.arguments` /
  `exec.agent.session.id`，形状见 `node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:197-221`）。
- 路径抽取词表**直接复用官方 deliverables 的实现**，避免两套词表漂移：
  `node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js:289-318` `mutationPath(name, argsRaw)`
  —— `write` → `args.content` 为字符串时取 `args.file_path`；`edit` → `old_string` 非空且
  `old_string !== new_string` 时取 `args.file_path`；`str_replace_editor` → `args.path`，
  command ∈ `create` / `str_replace` / `insert`。再并入 minimax 的 `STRUCTURED_WRITE_TOOLS` 并集。
- `capture.settle` 的 after 快照由 `git add --all`（`snapshot.ts:139`）改为
  **`git add -- <attributedPaths>`**：私有 index 里其余路径仍保持 before 快照的内容，
  `write-tree` 得到的树 = before + 本会话本轮改动，`diff(before, after)` 恰好等于本会话的改动集。
- 无法归属的工具（`dsh-tool-bash` / `dsh-tool-bash-persistent` / `dsh-tool-pwsh` /
  `dsh-tool-pwsh-persistent`、MCP 工具、插件自定义工具）：
  尽力从 shell 命令里解析重定向目标（minimax 的 `SHELL_TOOLS` + `SHELL_CONTROL_TOKENS` 思路），
  解析不出则把该轮标记 `unattributed`，并把它纳入「不在撤销范围内」的路径清单。
- `snapshot.live` 同样按归属路径限定，运行中读数不再串台。

### I3 撤销域：写前 CAS + 跨会话 claim 预检

- 保留现有 `snapshot.conflicts`，但语义升级为 minimax 的 `applyFileIfSafe`：
  逐路径重新读盘算 sha256，与记录的 after 快照比对；
  不一致 → 该路径进 `skipped` 并带原因（复用 `RestoreReport.failed[].reason` 通道），
  **绝不写**。这与现有「部分失败如实上报且不标记已撤销」一致，只是把判定从 git diff 换成显式内容比对。
- 新增工作区级 claim 注册表（读写都在既有工作区锁内）：
  `$DSH_HOME/dsh-tauri-turnrewind/workspaces/<workspaceHash>/claims.json`，
  `path → { sessionId, turn, at }`。撤销前查：目标路径被**其它未撤销会话**认领 → 409 新原因码
  `TURNREWIND_FOREIGN_CLAIM`，并列出会话/回合。
- 可选（建议采纳）：引入 minimax 的 `'not_latest'` 规则 —— **只允许撤销该会话最新的未撤销回合**。
  它一次性消掉「撤销中间回合后与后续回合纠缠」这一整类问题，且与「一次只撤一步」的用户心智一致。
  代价：UI 需把更早回合的撤销按钮置灰。

### I4 保留域：每会话代数 + 按会话 LRU 淘汰

- 代数标记从 `<gitDir>.json`（`snapshot.ts:446-448`）改为
  `<gitDir>.generation/<sessionKey>.json`；`snapshot.generation(sessionId)` 按会话读。
- `retention.enforce` 不再「超限即整仓重建」：改为**先按会话记录 LRU 淘汰最老回合**
  （跨会话按 `createdAt` 排序，淘汰时删该回合 refs 并 `pruneLooseObjects`），
  只有在淘汰到无回合可删仍超限时才走整仓重建（并只轮换**所有**会话的代数——这是最后手段，要写日志）。
- `retainedWorkspaces`（`retention.ts:36`）键从 gitDir 改为 `gitDir + sessionKey`。
- 采纳 minimax 的「未完成操作不清理」：有在飞 turn 或进行中撤销的会话，本轮保留治理跳过。

### I5 生命周期域

- `host/events/session-disposed.ts` 现在只 `capture.resetLive(sessionId)`（9 行）。
  增加：删除该会话的私有 index、该会话的 refs（`snapshot.remove`）、该会话的代数标记。
  账本保留（审计价值），由 `MAX_TURN_RECORDS` 治理。

### I6 边界（必须在 UI 与文档里如实声明）

沿用现有 `skippedOversized` / `skippedNestedRepos` 的呈现通道，新增 `unattributed`：

1. 不追踪外部编辑器/其它工具的改动（除非恰好与本会话改了同一文件）。
2. shell / MCP / 插件工具的文件副作用归属是 best-effort，解析不出即不纳入撤销范围。
3. 二进制与超限文件（`MAX_FILE_BYTES = 64MB`，`config/constants.ts:38`）不纳入。
4. symlink / junction 路径一律跳过（现有 `REASON_UNSAFE_PATH` 语义不变）。
5. 嵌套 Git 仓库内容不受保护（现有 `skippedNestedRepos` 语义不变）。

---

## 四、分阶段落地计划

| 阶段 | 内容 | 风险 | 验收 |
| --- | --- | --- | --- |
| **P0** | 归属采集只做观测：`tools/pre-execute` 解析路径写入内存集合 + 日志，不改任何行为 | 零 | 新增 `host/service/attribution.test.ts`；跑一段真实会话统计归属覆盖率 |
| **P1** | I1（`GIT_INDEX_FILE`）+ I4（每会话代数、LRU 淘汰）+ I5 | 低 | `snapshot.test.ts` 加「两会话共享工作区互不污染 index」；`retention.test.ts` 加「A 超限不使 B 过期」 |
| **P2** | I2（增量 after 快照 + diff 限定 + `live` 限定）+ `unattributed` 呈现 | 中 | `capture.test.ts` 加「并发会话的改动不进 A 的账本」；客户端卡片加 `data-unattributed` |
| **P3** | I3（写前 CAS + claim 注册表 + `TURNREWIND_FOREIGN_CLAIM`） | 中 | `undo.test.ts` 加「A 撤销不覆盖 B 的改动，返回 409 + 明细」；`docs/testing/plugins/09-dsh-tauri-turnrewind.md` 的 G-REW-1 顺带补上 |
| **P4** | 未归属工具的兜底：全量 diff + 跨会话 claim 仲裁，保住 shell 写入的可撤销性 | 高 | 需要先定策略（见下） |

### 需要确认的三个决策

1. **是否接受能力收缩**：只做 P0–P3 时，shell / MCP 写出的文件不再可撤销（换来确定不丢别人的数据）。
   要保住这部分覆盖就必须做 P4 的 claim 仲裁。
2. **是否采纳「只能撤销最新未撤销回合」**（minimax `'not_latest'`）。
3. **快照粒度**：继续用「整工作区树 + 每会话 index」（复用现有压缩/流式 checkout 能力），
   还是改成 minimax 式的「每工具调用存 before/after 文件内容」（更精确，但要在 SQLite/JSON 里存明文，
   需另建 2MiB/路径数上限与二进制降级逻辑）。

---

## 五、证据索引

**本仓库**
- `packages/dsh-tauri-turnrewind/src/host/service/snapshot.ts:65-71,139,225-259,271-302,441-448,697`
- `packages/dsh-tauri-turnrewind/src/host/service/retention.ts:25,36,41-59,161`
- `packages/dsh-tauri-turnrewind/src/host/service/capture.ts:34,133-154`
- `packages/dsh-tauri-turnrewind/src/host/service/undo.ts:62-67,81`
- `packages/dsh-tauri-turnrewind/src/host/utils/git.ts:80-82`
- `packages/dsh-tauri-turnrewind/src/host/config/runtime.ts:21`
- `packages/dsh-tauri-turnrewind/src/host/events/session-disposed.ts:8`
- `node_modules/@deepseek-ai/dsh-client-ui-deliverables/lib/client.js:289-318,365-446`
- `node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:197-221`

**外部**
- minimax-code：`packages/local-runtime/src/turns/file-changes.ts`、`diff-rewind.ts:64,89-98`、
  `diff-rewind-files.ts:43-58,102-115,117-132,196-203`、`packages/local-runtime/src/persistence/ports.ts`
  （`LocalTurnDiffSnapshotEntry` / `LocalTurnDiffUndoEntry` / `LocalTurnDiffRecord` / `LocalTurnDiffStore`）、
  `packages/shared/src/local-runtime-paths.ts:53-73`、`packages/local-runtime-v2/src/service/session-system/storage-retention.ts:3-4`
- opencode 快照语义：https://opencode.ai/v2/docs/snapshots/
- Claude Code checkpointing（官方，含全部限制）：https://code.claude.com/docs/en/checkpointing
- Claude Code 目录布局：https://code.claude.com/docs/en/claude-directory
- Cline：`sdk/packages/core/src/hooks/checkpoint-hooks.ts:43,630`、
  `sdk/packages/core/src/session/checkpoint-restore.ts`、https://github.com/cline/cline/blob/main/docs/core-workflows/checkpoints.mdx
- Roo-Code：`src/services/checkpoints/ShadowCheckpointService.ts:157-161,281,436`、
  `src/services/checkpoints/RepoPerTaskCheckpointService.ts:7-9`、https://docs.roocode.com/features/checkpoints
- Zed：`crates/project/src/git_store.rs:492`、`crates/git/src/repository.rs:3063,3091,3774`、
  `crates/acp_thread/src/acp_thread.rs:294-309,4344-4375`、
  `crates/agent_ui/src/thread_worktree_archive.rs:77-79`
- codex：`codex-rs/features/src/lib.rs:379,944-950`、`codex-rs/core/src/config/mod.rs:228-240`、
  `codex-rs/protocol/src/models.rs:3796-3811`、`codex-rs/rollout/src/recorder.rs:1700-1722`
- OpenHands：`openhands/runtime/impl/docker/docker_runtime.py:136,324-389`
- Gemini CLI：https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/checkpointing.md
- Aider：`aider/commands.py:553-655`、`aider/coders/base_coder.py:349,2400`
- lobehub：`packages/database/src/schemas/session.ts`、`topics` / `project_working_directories` / `environment_instances`
- Cursor：https://cursor.com/docs/agent/overview.md、https://cursor.com/help/troubleshooting/agent-issues.md
