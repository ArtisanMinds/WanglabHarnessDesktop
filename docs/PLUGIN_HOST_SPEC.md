# 插件宿主端开发协议与架构规范 (Plugin Host Architecture Protocol)

> 本规范是 [通用软件开发规范与协议 (DEVLOPMENT.SPEC.md)](./DEVLOPMENT.SPEC.md) 在 **DeepSeek Harness 内置插件宿主端（Plugin Host Half / Node Runtime）** 的具象化工程落地协议。所有插件的 `src/host` 实现必须严格遵循本规范。

---

## 一、 核心架构原则与映射 (Alignment with Core Principles)

本规范与 `DEVLOPMENT.SPEC.md` 的核心原则映射关系如下：

1. **唯一事实来源 (SSOT) 在宿主状态中的落地**
   - 运行期内存单例（如防抖队列、异步任务在途映射、特定会话上下文标记）**只允许存在单一权威实例**，统一由 `config/runtime.ts` 集中持有与导出。
   - 严禁通过参数在 `apply -> service -> routes` 间层层透传可变状态。
2. **零无用中间层 (Zero Pass-Through Layers) 与扁平化**
   - 插件入口 `apply.ts` 必须遵循 **“只做接线总线，不写业务逻辑”**。
   - 严禁在只有 2~3 个具体文件的子领域建立纯转发性质的 `index.ts`（例如 `tools/`、`prompts/`、`events/` 直接按文件名具名导出，直接在 `apply.ts` 中引用）。
   - 外部业务无直接复用价值的临时数据结构转换必须就地处理，不抽象中间层。
3. **彻底删除与零包袱原则 (Radical Cleanup)**
   - 废弃的旧版本兼容逻辑、数据自愈代码或已过期的过渡层，必须在重构中彻底清理，禁止保留 `legacy`、`compat` 文件。
4. **单向依赖流 (Unidirectional Dependency Flow)**
   - 依赖严格自上而下流动，严禁跨层反向依赖或同级环状引用：
     $$\text{apply.ts (装配)} \longrightarrow \begin{bmatrix} \text{routes/ (HTTP 触发)} \\ \text{tools/ (Agent 触发)} \\ \text{events/ (事件触发)} \\ \text{prompts/ (上下文触发)} \end{bmatrix} \longrightarrow \text{service/ (业务领域)} \longrightarrow \begin{bmatrix} \text{storage/ (持久化)} \\ \text{utils/ (无状态纯函数)} \end{bmatrix}$$

---

## 二、 模块目录分类通用标准 (Host Directory Protocol)

每个插件的 `src/host` 目录必须严格遵循以下按职责边界划分的物理落点决策树：

```text
packages/<plugin>/src/host/
├── apply.ts                       # 【装配入口】声明式组装工具、事件、提示词与路由，无逻辑实现
├── config/                        # 【配置与状态】
│   ├── runtime.ts                 # 运行期内存单例状态（SSOT，内存队列/标记/在途状态）
│   └── constants.ts               # 静态常量与默认配置（数值、正则、默认参数、UI 排序等）
├── types/                         # 【类型定义】
│   └── index.ts                   # 领域模型、DTO、输入输出接口（纯类型定义，无业务实现）
├── storage/                       # 【持久化底层】
│   └── index.ts                   # 纯 unstorage / 持久化驱动实例导出，不写业务读写逻辑
├── routes/                        # 【HTTP 路由层】（可选，按需声明）
│   ├── index.ts                   # defineRoutes 路由集合挂载
│   └── <resource>/<method>.ts     # 纯协议转换层（入参校验、调用 service、状态码）
├── tools/                         # 【Agent 工具层】（可选，单工具单文件）
│   ├── <tool-name>.ts             # 单个工具的声明、JSON Schema 与 execute 编排
│   └── ...
├── prompts/                       # 【系统提示词层】（可选，按提示词类别拆分）
│   ├── <domain>-section.ts        # ctx.systemPrompt.section 常驻系统提示词
│   └── <domain>-context.ts        # ctx.systemPrompt.context 动态单次上下文注入
├── events/                        # 【事件监听层】（可选，按事件类型拆分）
│   ├── <event-name>.ts            # 宿主生命周期事件处理（如 turn/end、工具前置拦截等）
│   └── ...
├── service/                       # 【领域业务层】（无 HTTP 协议概念，高内聚纯业务）
│   ├── manager.ts                 # 核心生命周期编排（主业务流程聚合）
│   ├── task-queue.ts / cleaner.ts # 长耗时操作的异步任务调度、重试与状态机管理
│   ├── <domain>.ts                # 具体业务逻辑实现（如会话继承、规则演算）
│   └── <entity>-store.ts          # 业务实体的序列化/持久化封装（读写 storage）
└── utils/                         # 【底层纯工具层】（完全脱离业务上下文的无状态纯函数）
    ├── <tech-stack>.ts            # 外部 CLI / 进程交互封装（如 git、docker、curl 等）
    ├── filesystem.ts              # 跨平台文件系统可靠操作（目录清理、加锁、原子写等）
    └── ...
```

---

## 三、 参考范例：以 Worktree 插件为例 (Reference Implementation)

以包含完整 HTTP 路由、Agent 工具、异步删除任务与上下文注入的典型复杂插件 `dsh-tauri-worktree` 为例，其实际物理文件树映射如下：

```text
packages/dsh-tauri-worktree/src/host/
├── apply.ts                       # 极简平铺装配器
├── config/
│   ├── runtime.ts                 # pendingHandoffs (等待交接队列), injectedCheckoutContexts
│   └── constants.ts               # 分支正则、默认软链目录、删除重试次数与保留上限
├── types/
│   └── index.ts                   # Binding, CheckoutContext, DiscardJob 等类型
├── storage/
│   └── index.ts                   # export const storage = createStorage({ driver: fsAtomicDriver(...) })
├── routes/                        # RESTful 文件路由 (文件路径 = URL 路径)
│   ├── index.ts                   # defineRoutes 路由集合声明
│   ├── post.ts                    # POST   /api/worktree            (创建工作树)
│   ├── delete.ts                  # DELETE /api/worktree            (异步删除工作树)
│   ├── bindings/get.ts            # GET    /api/worktree/bindings   (批量查询工作树及任务)
│   ├── status/get.ts              # GET    /api/worktree/status     (查询单个工作树状态)
│   ├── attach/post.ts             # POST   /api/worktree/attach     (关联到源工作区)
│   └── checkout/post.ts           # POST   /api/worktree/checkout   (检出到本地并带回会话)
├── tools/
│   ├── create-worktree.ts         # create_worktree 工具定义与执行
│   └── checkout-worktree.ts       # checkout_worktree 工具定义与执行
├── prompts/
│   ├── worktree-section.ts        # ctx.systemPrompt.section (工作树隔离环境常驻提示)
│   └── checkout-context.ts        # ctx.systemPrompt.context (检出完成首条动态上下文)
├── events/
│   ├── session-event.ts           # session/event 监听：turn/end 消费 handoff 并清理上下文
│   └── tools-execute.ts           # tools/execute 拦截：安装依赖前断开软链并物化
├── service/
│   ├── manager.ts                 # 工作树业务主流程 (创建、检出、挂载)
│   ├── cleaner.ts                 # 异步删除工作树与重试任务调度 (原 discard-jobs + discardWorktree)
│   ├── handoff.ts                 # 会话继承与 Seed 搬运
│   ├── ledger.ts                  # 绑定账本数据访问层 (读写 storage/ledger/*)
│   ├── checkout.ts                # 检出上下文数据访问层 (读写 storage/checkout-context/*)
│   └── session-context.ts         # 宿主会话与项目工作区路径推演
└── utils/
    ├── git.ts                     # 纯 Git 命令封装 (worktree add/remove/prune/patch)
    ├── filesystem.ts              # 跨平台目录可靠清理与空父目录清理
    └── dependencies.ts            # node_modules 软链接/硬拷贝纯逻辑
```

---

## 四、 各层通用实现规范与细则

### 1. 装配总线规范 (`apply.ts`)
`apply.ts` 是插件宿主生命周期的接入点，代码行数原则上控制在 30~50 行以内，保持平铺直叙：
- **核心原语**：只允许包含显式注册语句（`ctx.tools.register()`、`ctx.on()`、`ctx.systemPrompt.*()`、`ctx.effect()`）。
- **零复杂内联**：回调函数如果超过 2 行，必须抽离至 `events/` 或 `prompts/`。
- **禁止参数穿透**：不得创建全局打包的 `deps` 字典传递给路由或工具，各模块直接从对应的 `config/` 或 `service/` 引入所需功能。

```typescript
// 规范范例：清晰直观的装配总线
export function apply(ctx: HostContext): void {
  // 1. 注册 Agent 调用的工具
  ctx.tools.register(createWorktreeTool(ctx))
  ctx.tools.register(checkoutWorktreeTool(ctx))

  // 2. 注册系统事件监听
  ctx.on('session/event', (session: any, event: any) => handleSessionEvent(ctx, session, event))
  ctx.on('tools/execute', (exec: any, next: any) => handleToolsExecute(ctx, exec, next))

  // 3. 注册系统提示词注入
  ctx.systemPrompt.context(checkoutContextProvider)
  ctx.systemPrompt.section(worktreeSectionProvider)

  // 4. 挂载 HTTP 路由
  ctx.effect(() => routes(ctx), 'plugin: routes')
}
```

### 2. 配置与状态层规范 (`config/`)
- **`config/runtime.ts`**：
  - 仅用于导出当前插件生命周期内的内存单例（如在途请求防抖、长任务调度表、消费性标记队列）。
  - 每个导出实例必须具备清晰的消费与销毁机制，严防长期运行造成内存泄露。
- **`config/constants.ts`**：
  - 存放所有硬编码常量（数值上限、重试间隔、正则规则、Prompt 注入优先级等）。业务代码中严禁裸写 Magic Number / Magic String。

### 3. 持久化层规范 (`storage/`)
- `storage/index.ts` 必须做到极致纯粹，**只负责创建并导出持久化存储实例**：
  ```typescript
  import { DSH_HOME, fsAtomicDriver } from 'dsh-tauri'
  import { createStorage } from 'unstorage'

  export const storage = createStorage({
    driver: fsAtomicDriver({ base: DSH_HOME }),
  })
  ```
- **禁止在 `storage/` 下编写业务实体的增删改查方法**。业务实体（如 Ledger、Session Meta）的序列化格式、路径拼接、JSON 容错和校验，必须收拢在 `service/<entity>-store.ts` 中。

### 4. 路由层规范 (`routes/`)
- **路径契约**：严格遵循 **“文件路径 = URL 路径”** 的 RESTful 规则。
- **职责边界**：
  1. 仅负责 HTTP 报文解析（`readBody` / `getQuery`）。
  2. 执行 DTO 输入合法性校验（字段缺失或类型错误立即响应 400）。
  3. 调用对应的 `service` 函数，不得包含具体业务实现代码。
  4. **严禁在路由处理器内直接访问底层 `storage` 原始键值，或直接执行底层系统命令**。

### 5. 业务领域服务层规范 (`service/`)
- **`manager.ts`**：作为领域业务主编排者，组合调用各种底层 service 与 utils，形成完整业务用例。
- **异步任务管理 / 队列（如 `cleaner.ts` / `task-queue.ts`）**：
  - 当某些操作耗时较长、无法同步响应请求时，必须由专职的任务管理器封装为状态机（`pending` / `running` / `completed` / `failed`）。
  - 路由仅触发任务启动并获取任务 ID，客户端通过轮询获取最终状态。
- **持久化数据访问封装**：
  - 负责具体实体的读写（`load`、`save`、`remove`），承担数据校验与反序列化容错。

### 6. 底层纯工具层规范 (`utils/`)
- 保持纯粹与无状态，不得导入任何业务状态（如 `config/runtime.ts`）或高层业务概念（如 `sessionId`、业务 DTO 等）。
- 仅接受操作路径与纯参数，返回标准的操作结果对象 `{ ok: boolean, error?: string, ... }`。

---

## 五、 质量与重构自检清单 (Verification Checklist)

在开发新插件宿主端或重构既有模块时，开发者必须对照以下标准自检：

- [ ] **装配精简**：`apply.ts` 是否只包含声明式注册？是否存在内联的事件处理、模板字符串或过度嵌套？
- [ ] **状态收口**：内存中的临时 Map/Set 是否已收拢至 `config/runtime.ts`？是否存在通过参数层层击穿透传状态的情况？
- [ ] **路由纯度**：`routes/` 下的各个处理器是否只负责协议解析与 DTO 校验？是否存在直接调用 `storage` 或操作底层系统的越权代码？
- [ ] **存储抽象**：`storage/index.ts` 是否仅导出了存储驱动实例？具体的业务存取函数是否已移入 `service/`？
- [ ] **工具解耦**：`utils/` 下的代码是否完全脱离业务上下文？是否是无状态的纯函数？
- [ ] **无用代码清理**：历史遗留的自愈代码、废弃兼容层或无引用的 Barrel（`index.ts`）是否已全部删除？
- [ ] **工程校验**：执行 `pnpm --filter <pkg> typecheck` 与 `pnpm --filter <pkg> test`，确保类型完备且测试全绿。
