# dsh-tauri-worktree 宿主端 (host) 重构架构规范

本文档定义 `packages/dsh-tauri-worktree/src/host` 模块的重构规范与架构分层标准。旨在解决历史实现中逻辑交织、概念模糊、依赖穿透与缺乏规整感的问题，建立轻量、直观且高内聚的函数式工程结构。

---

## 1. 核心架构设计原则

1. **装配器极致扁平（Minimalist `apply.ts`）**：
   `apply.ts` 作为插件宿主端的装配总线，仅负责声明式注册工具、事件监听器、系统提示词和 HTTP 路由，代码量控制在 30 行左右。禁止在 `apply.ts` 中内联业务逻辑、字符串模板、闭包状态或生命周期透传。
2. **轻量函数式与文件路径路由（RESTful File Routes）**：
   路由层遵循 H3 / Nitro 哲学（文件路径即 URL 路径），路由处理器只做 HTTP 协议解析（入参读取、基础校验、状态码映射与响应序列化），严格禁止直接操作底层的 Storage、Git 或 Workspace 内部接口。
3. **状态与配置统一收拢至 `config/`**：
   - 运行期内存单例（如 Handback 队列、已注入上下文标记）由 `config/runtime.ts` 集中管理。
   - 静态配置与全局常量（正则、重试次数、超时配额等）由 `config/constants.ts` 集中管理。
   - 杜绝为了状态共享而在不同函数层级间深度透传依赖。
4. **单向依赖流与纯净底层**：
   - `storage/index.ts` 保持纯粹，仅导出 `unstorage` 存储实例，不承载任何业务序列化。
   - 业务序列化（Ledger 账本读写、Checkout 上下文存取）全部收敛至 `service/`。
   - `utils/` 包含纯函数工具（Git 命令、目录清理、依赖软链接），不依赖任何上层业务上下文（如 `sessionId` 或 `ctx`）。

---

## 2. 重构文件树

```text
packages/dsh-tauri-worktree/src/host/
├── apply.ts                       # 【极简平铺装配】ctx.tools / ctx.on / ctx.systemPrompt / routes 显式注册
│
├── config/                        # 【配置、常量与运行期内存状态】
│   ├── runtime.ts                 # 运行期状态 (pendingHandoffs, injectedCheckoutContexts)
│   └── constants.ts               # 常量定义 (正则、默认链接目录、重试与保留上限等)
│
├── types/
│   └── index.ts                   # 领域与协议类型定义 (Binding, CheckoutContext, DiscardJob 等)
│
├── storage/                       # 【持久化层】纯导出
│   └── index.ts                   # 纯导出 unstorage 实例 (export const storage = ...)
│
├── routes/                        # 【RESTful 文件路由】(文件路径 = URL 路径，只做协议转换)
│   ├── index.ts                   # defineRoutes 路由集合入口
│   ├── post.ts                    # POST   /api/dsh-worktree            (创建工作树)
│   ├── delete.ts                  # DELETE /api/dsh-worktree            (异步放弃工作树)
│   ├── bindings/
│   │   └── get.ts                 # GET    /api/dsh-worktree/bindings   (批量查绑定与任务)
│   ├── status/
│   │   └── get.ts                 # GET    /api/dsh-worktree/status     (查单个工作树状态/任务)
│   ├── attach/
│   │   └── post.ts                # POST   /api/dsh-worktree/attach     (归属到源工作区)
│   └── checkout/
│       └── post.ts                # POST   /api/dsh-worktree/checkout   (检出至本地并带回会话)
│
├── tools/                         # 【Agent 工具】(单工具单文件)
│   ├── create-worktree.ts         # create_worktree 工具定义与 execute 编排
│   └── checkout-worktree.ts       # checkout_worktree 工具定义与 execute 编排
│
├── prompts/                       # 【系统提示词与上下文注入】
│   ├── worktree-section.ts        # ctx.systemPrompt.section (工作树隔离环境常驻提示)
│   └── checkout-context.ts        # ctx.systemPrompt.context (检出完成首条上下文注入)
│
├── events/                        # 【事件监听处理器】
│   ├── session-event.ts           # handleSessionEvent (turn/end 交接消费与上下文清理)
│   └── tools-execute.ts           # handleToolsExecute (安装依赖前断开软链接拦截)
│
├── service/                       # 【领域业务服务】
│   ├── manager.ts                 # 工作树业务核心流程 (创建工作树、检出到本地、关联工作区)
│   ├── cleaner.ts                 # 异步删除工作树与重试任务调度 (原 discard-jobs + discardWorktree)
│   ├── handoff.ts                 # 会话继承逻辑 (会话复制、Seed 组装、历史带回)
│   ├── ledger.ts                  # 工作树账本服务 (封装 storage 对 ledger/* 的具体读写与解析)
│   ├── checkout.ts                # 检出上下文服务 (封装 storage 对 checkout-context/* 的读写)
│   └── session-context.ts         # 会话解析与项目路径推演辅助
│
└── utils/                         # 【底层纯函数工具】
    ├── git.ts                     # 纯 Git 命令行封装 (simple-git raw 调用、patch 等)
    ├── filesystem.ts              # 文件系统底层操作 (跨平台安全移除目录、空容器清理)
    └── dependencies.ts            # node_modules 软链接/硬物化纯逻辑
```

---

## 3. 各模块分层职责规范

### 3.1 `apply.ts`（装配器规范）

`apply.ts` 必须严格遵循“只做接线，不写逻辑”的标准，示例实现：

```typescript
import type { HostContext } from './types'
import { handleSessionEvent } from './events/session-event'
import { handleToolsExecute } from './events/tools-execute'
import { checkoutContextProvider } from './prompts/checkout-context'
import { worktreeSectionProvider } from './prompts/worktree-section'
import { routes } from './routes'
import { checkoutWorktreeTool } from './tools/checkout-worktree'
import { createWorktreeTool } from './tools/create-worktree'

export function apply(ctx: HostContext): void {
  // 1. 注册 Agent 工具
  ctx.tools.register(createWorktreeTool(ctx))
  ctx.tools.register(checkoutWorktreeTool(ctx))

  // 2. 注册系统事件监听
  ctx.on('session/event', (session: any, event: any) => handleSessionEvent(ctx, session, event))
  ctx.on('tools/execute', (exec: any, next: any) => handleToolsExecute(ctx, exec, next))

  // 3. 注册系统提示词注入
  ctx.systemPrompt.context(checkoutContextProvider)
  ctx.systemPrompt.section(worktreeSectionProvider)

  // 4. 挂载 HTTP 路由
  ctx.effect(() => routes(ctx), 'dsh-tauri-worktree: routes')
}
```

---

### 3.2 `config/`（状态与常量规范）

#### `config/runtime.ts`
集中管理生命周期中的内存单例，替代过去的闭包透传：
- `pendingHandoffs = new Map<string, PendingHandoff>()`：等待 `turn/end` 消费的新工作树交接上下文。
- `injectedCheckoutContexts = new Set<string>()`：已向模型注入过检出提示的会话 ID 集合。

#### `config/constants.ts`
集中管理所有数值、正则表达式与文本规则：
- `WORKTREE_BRANCH_NAME_PATTERN`：分支名前缀校验正则（如 `^dsh\/.+`）。
- `DEFAULT_LINK_DEPENDENCY_DIRECTORIES`：默认依赖链接目录列表（`['node_modules']`）。
- `RETRY_ATTEMPTS`、`RETRY_DELAY_MS`、`JOB_RETENTION`：清理任务重试次数、重试延迟与内存队列保留上限。

---

### 3.3 `storage/`（持久化规范）

- 文件：`storage/index.ts`
- 职责：只保留 `unstorage` 实例创建与导出。绝对不允许在该文件内定义具体的业务结构读写函数（如 `loadBinding`、`saveBinding` 等）。
```typescript
import { DSH_HOME, fsAtomicDriver } from 'dsh-tauri'
import { createStorage } from 'unstorage'

export const storage = createStorage({
  driver: fsAtomicDriver({ base: DSH_HOME }),
})
```

---

### 3.4 `service/`（业务领域层规范）

业务领域服务统一采用命名导出函数，职责严格隔离：

| 文件 | 职责说明 | 禁止行为 |
| :--- | :--- | :--- |
| **`manager.ts`** | 工作树核心生命周期编排（创建工作树、检出到本地分支、关联至 Workspace）。 | 不直接执行底层 Git 命令（调 `utils/git.ts`）；不直接读写 unstorage（调 `ledger.ts`）。 |
| **`cleaner.ts`** | 统一负责“放弃工作树”的异步清理与重试任务管理（取代原 `createDiscardJobs` + `discardWorktree`）。维护内存中的 Job 状态机（`deleting` / `completed` / `failed`），处理幂等与轮询支持。 | 状态不暴露给其它无关模块，通过 `cleaner.discard()`、`cleaner.lookup()` 提供服务。 |
| **`handoff.ts`** | 负责会话的上下文迁移（Seed 复制、事件搬运、历史带回）。 | 不处理 Git 操作与持久化细节。 |
| **`ledger.ts`** | 封装工作树绑定的账本持久化逻辑（对应 `ledger/<sessionId>.json` 的存取与校验）。 | 业务逻辑不应渗透进该层，仅负责 Binding 对象的读写、校验与删除。 |
| **`checkout.ts`** | 封装一次性检出上下文的持久化（对应 `checkout-context/<sessionId>.json` 的存取与删除）。 | 仅处理一次性提示上下文文件的生命周期。 |
| **`session-context.ts`**| 会话上下文安全解析（根据 `ctx` 与 `session` 推断项目根路径，严防在竞态下猜测回退）。 | 保持无副作用推断。 |

---

### 3.5 `routes/`（HTTP 路由层规范）

- 严格保持 **文件路径 = URL 路径** 的 RESTful 约定。
- 每个路由文件默认导出一个 `defineEventHandler`。
- 路由内部只做四件事：
  1. `readBody` / `getQuery` 解析请求入参；
  2. 验证必填字段形状（非法返回 400）；
  3. 调用对应的 `service` 执行业务；
  4. 根据执行结果设置状态码并格式化 JSON 响应。
- **禁止在路由层中执行任何 Git 命令或直接读取 `storage` 原始文件。**

---

### 3.6 `tools/`、`prompts/` 与 `events/`

1. **`tools/`**：
   - `create-worktree.ts` 与 `checkout-worktree.ts` 各自包含工具描述、JSON Schema、参数验证与 `execute` 编排。
2. **`prompts/`**：
   - `worktree-section.ts`：负责处于工作树时的常驻环境声明与操作说明（`ctx.systemPrompt.section`）。
   - `checkout-context.ts`：负责检出完成后的第一条一次性上下文注入（`ctx.systemPrompt.context`）。
3. **`events/`**：
   - `session-event.ts`：监听 `session/event` 的 `turn/end`，消费 `pendingHandoffs` 与清理 `injectedCheckoutContexts`。
   - `tools-execute.ts`：拦截包管理器安装指令，前置断开软链接并执行依赖物化。

---

### 3.7 `utils/`（底层纯工具层规范）

- `git.ts`：对 `simple-git` 的纯命令行封装（`worktree add` / `worktree remove` / `worktree prune` / `apply patch` 等），仅接受工作目录路径与参数，输出统一的 `OperationResult`。
- `filesystem.ts`：跨平台安全移除目录（含重试、解除占用及 `.trash` 兜底），清理空容器父目录。
- `dependencies.ts`：处理软链接创建、解绑与目录硬拷贝逻辑。
- **纯工具层必须保持无状态与纯粹性，不得引入任何业务概念（如 Session ID、Binding 等）。**
