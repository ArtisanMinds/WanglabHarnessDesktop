> 该文档已固定，禁止修改。

# 插件客户端架构规范 (Plugin Client Architecture Protocol)

> 本规范是 [通用软件开发规范与协议 (DEVELOPMENT.spec.md)](./DEVELOPMENT.spec.md) 在 **DeepSeek Harness 内置插件客户端半区（Plugin Client Half / Browser Runtime）** 的具象化工程落地协议。所有插件的 `src/client` 实现必须严格遵循本规范。
>
> **姊妹协议**：[插件宿主端架构规范 (PLUGIN_HOST.spec.md)](./PLUGIN_HOST.spec.md) 与 [插件宿主端领域服务协议 (PLUGIN_HOST_SERVICE.spec.md)](./PLUGIN_HOST_SERVICE.spec.md)。两端共享同一套分层哲学（SSOT、零无用中间层、单向依赖流），但**词汇表不同**——客户端有 React 与浏览器生命周期，不能照搬宿主端的动词白名单。

---

## 一、 核心架构原则与映射 (Alignment with Core Principles)

1. **唯一事实来源 (SSOT) 在 store**
   - 一切**会被 UI 读取的可变共享状态**只允许存在于 `store/modules/<domain>.ts`（`defineStore` 定义）。
   - **禁止在 `service/` / `register/` / 组件文件中持有模块级可变状态**。跨调用需要留存的东西（在途去重表、请求代数、已处理标记集合）要么进 store，要么进 `defineRegister` 的 controller 闭包。
     > 违规实例：`packages/dsh-tauri-worktree/src/client/service/actions.ts:118` 的 `const discardInFlight = new Map(...)`、`packages/dsh-tauri-session/src/client/service/archive.ts:34` 的 `let refreshGeneration = 0`。两者都是「游离于 store 之外的第二状态源」，热重载后不清、无订阅、无法测试。
2. **零无用中间层 (Zero Pass-Through Layers)**
   - `src/client/index.ts` 只做装配，不放状态、监听、初始化或请求。
   - 严禁建立只有转发的 barrel：`service/` 与 `utils/` 按文件名直接引用，不为 2~3 个文件造 `index.ts`。
   - **薄别名同样是中间层**。`packages/dsh-tauri-worktree/src/client/service/actions.ts:19-41` 的 `fetchBindings()` / `fetchStatus()` 只是 `apis/index.ts` 中 `getBindings()` / `getStatus()` 的改名转发，调用方应直接用 api 层函数。
3. **彻底删除与零包袱原则 (Radical Cleanup)**
   - 废弃的旧注册写法、过渡包装、兼容 re-export 一律删除，禁止 `legacy` / `compat` / `old` 文件。
   - 重命名与搬迁一律使用 `git mv`。
   - 统一措辞：注册函数一律 `register*`，**不保留 `install*`**。
4. **单向依赖流 (Unidirectional Dependency Flow)**
   - 依赖严格自上而下流动，严禁跨层反向依赖或同级环状引用：

     $$\text{client/index.ts (装配)} \longrightarrow \begin{bmatrix} \text{register/ (副作用·槽位·订阅)} \\ \text{hooks/ (React 组合)} \\ \text{components/ (纯 UI)} \end{bmatrix} \longrightarrow \text{service/ (领域动作)} \longrightarrow \begin{bmatrix} \text{apis/ (HTTP 出口)} \\ \text{store/ (状态读)} \end{bmatrix} \longrightarrow \text{dsh-tauri/client}$$

   - 关键约束：**`apis/` 不得导入 `store/`**（数据层不认识状态层）；**`utils/` 不得导入以上任何一层**。
5. **生命周期声明式收敛 (Declarative Side-Effect Ownership)**
   - 客户端的副作用归口只有一个：`defineRegister` 的 `controller`。订阅、`timeout`、`interval`、`observe`、`listen` 一律经 controller 登记。
   - 禁止裸 `setTimeout` / `setInterval` / `addEventListener` / `new MutationObserver` / `setInterval` 变体。
     > 违规实例：`packages/dsh-tauri-session/src/client/service/archive.ts:84` 的 `new Promise<void>(resolve => setTimeout(resolve, 2_000))`——该超时不在任何 controller 名下，插件卸载后仍会触发。
   - 命令式副作用白名单写法：`// keep:effect`（见 `DEVELOPMENT.spec.md` 第 ⑤ 条）。

---

## 二、 模块目录分类通用标准 (Client Directory Protocol)

每个插件的 `src/client` 必须严格遵循以下按职责边界划分的物理落点决策树：

```text
packages/<plugin>/src/client/
├── index.ts                       # 【装配入口】声明式组装 feature 与样式，无业务逻辑
├── constants/                     # 【常量】slot 名、注册 id、样式 id、storage key、order/priority
│   └── index.ts                   #   （多领域拆 constants/<domain>.ts；跨 half 协议常量放 src/shared/）
├── types/                         # 【类型】跨文件共享的 interface / type，纯类型无实现
│   └── index.ts                   #   （多领域拆 types/<domain>.ts）
├── locales/                       # 【双语字典】词典 + installLocale
│   └── index.ts
├── apis/                          # 【HTTP 出口】唯一允许发请求的层；文件路径 = 路由路径
│   ├── index.ts                   #   fetch 调用函数（get*/post*/delete* + 领域名词）
│   └── index.type.ts              #   请求/响应 DTO（从 types/ 复用领域模型的再导出）
├── store/                         # 【状态层】唯一可变共享状态
│   ├── index.ts                   #   只聚合模块并导出 store 对象
│   └── modules/<domain>.ts        #   defineStore({ state, actions }) 单领域一文件
├── register/                      # 【注册层】唯一允许登记副作用的层
│   └── <feature>.ts               #   defineRegister feature：槽位 / 订阅 / 观察者 / 定时器 / DOM 补丁
├── service/                       # 【领域服务层】Query / Action 原型（无副作用生命周期）
│   └── <domain>.ts                #   一个文件一个领域，导出该领域的动作函数
├── hooks/                         # 【React 组合层】跨组件复用的 hook（含 useStore 订阅封装）
│   └── use-<thing>.ts
├── components/                    # 【组件层】纯 UI；每组件一文件 + 同名 .cssr.ts
│   ├── <name>.tsx
│   └── <name>.cssr.ts
├── styles/                        # 【样式层】无组件面的公共 cssr 树
│   └── index.cssr.ts
├── config/                        # 【配置层】只读配置与初始化标志；可变状态去 store/
│   └── index.ts
└── utils/                         # 【纯工具层】完全脱离业务的无状态纯函数
    └── <tech>.ts
```

**落点判定问句**（当你不确定放哪时，按顺序自问）：

1. 它会不会变、变了要不要重渲染？→ 会：`store/`；不会：`config/` 或 `constants/`。
2. 它发不发请求？→ 发：`apis/`（裸请求）或 `service/`（编排）。
3. 它是否需要跨多次事件存活（订阅/定时器/观察者）？→ 是：`register/`；否：`service/`。
4. 它要读写官方 DOM 吗？→ 是：`register/`（DOM 补丁**没有**独立目录，见第四章第 4 节）。
5. 它返回 JSX 吗？→ 是：`components/`（带样式节点则同时有 `.cssr.ts`）。
6. 它只在 React 渲染周期内有意义吗？→ 是：`hooks/`。
7. 它只碰路径/字符串/数组这类值、不认识 `sessionId` 之类业务概念吗？→ 是：`utils/`。

---

## 三、 参考范例：以 Worktree 插件为例 (Reference Implementation)

以同时具备 RPC 客户端、按会话缓存状态、四条独立槽位注册与 DOM 补丁的典型复杂插件 `dsh-tauri-worktree` 为例，其客户端**目标物理文件树**如下（`★` 标记为相对现状的结构性搬迁）：

```text
packages/dsh-tauri-worktree/src/client/
├── index.ts                       # 极简装配：feature 逐个 ctx.effect + 样式 feature
├── constants/index.ts             # effect 标签、样式 id、轮询上限/间隔、插件名
├── types/                         # index.ts / worktree.ts / runtime.ts / locale.ts
├── locales/index.ts
├── apis/
│   ├── index.ts                   # getBindings / getStatus / postCreate / postAttach
│   │                              # / postCheckout / postDiscard（一行一函数，只做 URL 与 DTO）
│   └── index.type.ts              # GetStatusQuery / PostCreateBody 等请求 DTO
├── store/
│   ├── index.ts                   # ★ 只聚合 modules 并导出 store 对象（去掉 selectors / use* / wrappers）
│   └── modules/
│       ├── worktree.ts            # defineStore({ state: { bySession }, actions: { patch } })
│       ├── preferences.ts         # 新会话模式偏好（unstorage 持久化）
│       └── locale.ts
├── register/
│   ├── styles.ts                  # ★ 新增：把 index.ts 内联的 mountStyle 收敛为一个 feature
│   ├── locale.ts                  # defineRegister：词典安装
│   ├── mode-select.ts             # defineRegister：输入区模式选择下拉框
│   ├── surface.ts                 # defineRegister：工作树常驻状态条
│   ├── dialog.ts                  # defineRegister：检出/放弃两个模态框
│   ├── session-icons.ts           # defineRegister：侧边栏分支图标（DOM 补丁）
│   └── hydration.ts               # ★ 瘦身至 ~30 行：只做 defineRegister + 订阅编排
├── service/
│   ├── actions.ts                 # Action：createWorktree / attachWorktreeSession /
│   │                              # applyCheckout / applyDiscard（乐观更新 + 结果判定）
│   ├── handoff.ts                 # Action：openWorktreeSession 会话交接
│   └── hydration.ts               # ★ 新增：HydrationTracker 状态机（纯逻辑、可单测、无副作用）
├── hooks/
│   └── use-worktree-session.ts    # ★ 从 store/index.ts 迁出的 useStore 订阅 hook
├── components/
│   ├── mode-select.tsx / mode-select.cssr.ts
│   ├── surface.tsx    / surface.cssr.ts
│   ├── dialog.tsx     / dialog.cssr.ts
├── styles/index.cssr.ts
└── utils/
    ├── worktree.ts                # 纯函数：分支名校验、key 解析等
    ├── throttle.ts                # createKeyedThrottle（schedule 由调用方注入 controller.timeout）
    └── draft-attachments.ts
```

**为什么 `register/hydration.ts` 要瘦身**：它现在是 577 行（`packages/dsh-tauri-worktree/src/client/register/hydration.ts`），内含 `class HydrationTracker`（第 42 行，14 个 Map/Set 字段）与十余层嵌套闭包。而 `defineRegister` 的职责是「登记副作用并交给 controller 托管」——把领域状态机写在注册文件里，等于把**可单测的纯逻辑**和**不可单测的浏览器生命周期**焊死。状态机下沉 `service/hydration.ts` 后，`register/hydration.ts` 只剩「构造状态机 + 把订阅交给 controller」。

---

## 四、 各层通用实现规范与细则

### 1. 装配入口规范 (`src/client/index.ts`)

装配入口原则上控制在 **40 行以内**，平铺直叙：

- **只允许**：`ctx.effect(feature, LABEL)`、`ctx.slots.register(...)` 的间接调用（经 `register/*`）、locale 安装调用。
- **禁止**：内联回调超过 2 行、内联 `mountStyle` 组合逻辑、任何 `await` / `void promise` 形式的启动期请求。
  > 违规实例：`packages/dsh-tauri-worktree/src/client/index.ts:61` 的 `void hydratePreferredMode()`——一个不在任何 feature 名下、卸载后无法取消的启动副作用；`:62-72` 的内联样式挂载应改为 `ctx.effect(stylesFeature, STYLES_EFFECT)`。
- 所有 `ctx.effect` 的标签必须取自 `constants/`（`LOCALE_EFFECT` / `STYLES_EFFECT` …），禁止裸字符串字面量。

```typescript
// 规范范例
export function apply(ctx: ClientContext): void {
  ctx.effect(localeFeature, LOCALE_EFFECT)
  ctx.effect(stylesFeature, STYLES_EFFECT)
  ctx.effect(modeSelectFeature, MODE_SELECT_EFFECT)
  ctx.effect(surfaceFeature, SURFACE_EFFECT)
  ctx.effect(dialogFeature, DIALOG_EFFECT)
  ctx.effect(hydrationFeature, HYDRATION_EFFECT)
}
```

### 2. 状态层规范 (`store/`)

- 一领域一文件：`store/modules/<domain>.ts`，导出的标识符 = 文件名驼峰化（`worktree.ts` → `export const worktree`）。
- 一律使用 `defineStore({ state, actions })`：**`state` 只放数据，`actions` 只放同步状态迁移**。
  > 正例：`packages/dsh-tauri-worktree/src/client/store/modules/worktree.ts:43-53`——`state: { bySession }` + 唯一 action `patch`。
- **禁止在 store 里发请求或写 `try/catch`**：异步编排属于 `service/`。store 的 action 必须是同步纯迁移，可被单测直接调用。
- 缺席态（空对象）必须是**模块级常量**以保证引用稳定，否则订阅方会因「每次读到新对象」无限重渲染。
  > 正例：`packages/dsh-tauri-worktree/src/client/store/modules/worktree.ts:40` 的 `export const EMPTY_STATE`。
- `store/index.ts` 只做两件事：`import` 各 module、导出聚合的 `store` 对象。**selectors、`use*` hook、迁移期薄封装一律不得留在这里**。
  > 违规实例：`packages/dsh-tauri-worktree/src/client/store/index.ts` 同时承担聚合、`selectSessionState`（:48）、`patchSession`（:55）、`hydratePreferredMode`（:60）、`useWorktreeSession`（:75）。selector 属 `utils/`，React hook 属 `hooks/`。
- 读写约定：外部读 `store.<domain>.<field>`；外部写 `store.<domain>.<action>(...)`；组件订阅 `useStore(store.<domain>)`；非 React 消费方用 `$subscribe` / `$patch` / `$state`。
- **投影官方数据结构时必须比较内容而非引用**：`ctx.slots.entriesOfSlot()` 每次返回新数组，写入 `useSyncExternalStore` 的 store 前必须做内容比较，否则快照每帧变化。参考 `packages/dsh-tauri-panel/src/client/service/panel-list.ts`。

### 3. 领域服务层规范 (`service/`)

`service/` 是客户端**最容易长歪**的一层（现状：`controller.tsx` / `panel-list.ts` / `width.ts` / `handle-post-mcp-restart.ts` / `registry.ts` / `menu.ts` / `open-path.ts` 八种形态并存）。因此只允许两种原型：

| 原型 | 判定问句 | 允许的动词 | 返回 |
| :--- | :--- | :--- | :--- |
| **Query** | 只读宿主数据并写回 store？ | `fetch*` / `load*` | `Promise<Data>` |
| **Action** | 一次用户意图 → 变更宿主 → 写 store？ | 领域动词（`create` / `attach` / `checkout` / `discard` / `archive` / `unarchive` / `delete` / `open`）+ 领域名词 | `Promise<{ ok: boolean, error?: string }>` |

三条不可协商的边界：

1. **无模块级可变状态**。需要跨调用留存的（在途去重、请求代数、已处理标记）放 store 或 Controller 闭包；纯函数式传参优先。
2. **无副作用生命周期**。`service/` 里不得出现 `setTimeout` / `setInterval` / `addEventListener` / `MutationObserver` / `subscribe` —— 需要它们就说明这段逻辑属于 `register/`（Controller 原型）。
3. **单入参、返回业务结果**。签名统一 `(input: X) => Promise<R>`，禁止 `archiveSession(sessionId, workspaceId?, beforeSessionId?)` 式散装参数（`packages/dsh-tauri-session/src/client/service/archive.ts:98`）；不抛含 UI 语义的异常，`{ ok, error }` 由调用方决定如何呈现。

- 一个文件一个领域，导出该领域的多个动作函数；**同名能力禁止混用 `get` / `fetch` / `load` / `read`**（选定 `fetch*` 即全用 `fetch*`）。
- 乐观更新必须与失败回滚写在**同一个 Action 内**，不允许把 `patch` 散落到组件里。
- `service/` 允许读写 store，但**不得 import 组件、样式、locales 之外的 UI 概念**；需要文案时从 `locales/` 取。

### 4. 注册层规范 (`register/`) —— 客户端唯一的副作用登记口

- 一个 feature 一个文件，一律 `defineRegister`，导出标识符 = `<feature>Feature`。

```typescript
// register/<feature>.ts
export const demoFeature = defineRegister<ClientContext>((controller, _ctx, adapter) => {
  controller.add(listenParent(handler, TYPE_SYNC))
  controller.observe(document.body, () => sync(), { childList: true, subtree: true })
})
```

- 资源一律经 `controller.add()` / `controller.observe()` / `controller.interval()` / `controller.timeout()` / `controller.listen()` 登记，**业务代码不手写 `return () => { ... }`**。
- 长异步流程（轮询、重试、退避）必须显式检查 `controller.isDisposed()`，并在 `finally` 中收敛；控制器销毁后不得再写 store。
- **注册文件应当薄**：只做「登记 + 编排」，领域状态机下沉 `service/`。经验阈值——超过 150 行就该拆（现状 `register/hydration.ts` = 577 行）。
- DSH 升级差异一律经 `adapter`（能力探测 + 退级阶梯），**不猜核心版本号、不写死槽名**；面板类插件统一经 `panel.protocol.registerPanel` 注册。
- **DOM 补丁没有独立目录，它本身就是 `register/` 的一种 feature（不设 `dom/`）**。范例：`packages/dsh-tauri-worktree/src/client/register/session-icons.ts`。约束：
  - 仅当官方 API 与桌面壳补丁都无法满足时使用（退级阶梯第 3 级）。
  - `MutationObserver` / 捕获阶段监听一律经 `controller.observe()` / `controller.listen()` 登记，**不得自行 `new MutationObserver`**。
  - 选择器必须稳定：`aria-label` / `role` / 插件前缀 class；**绝不依赖生成的 CSS module 哈希**。
  - 补丁写入的 DOM 属性与插入的节点，必须在 controller 卸载时恢复 / 移除。

### 5. API 层规范 (`apis/`)

- **唯一允许发请求的层**。`apis/index.ts` 只做 URL 拼接与 DTO 传递，一行一函数。
  > 正例：`packages/dsh-tauri-worktree/src/client/apis/index.ts:8-35`。
- 一律使用 `dsh-tauri/client` 导出的 `fetch`（ofetch 统一 JSON 客户端 + 非 2xx 错误解析），**禁止 `window.fetch` / `axios` / 手写 `requestJson`**。
- 函数名 = HTTP 方法 + 领域名词：`getBindings` / `getStatus` / `postCreate` / `postDiscard`。**不用 `getXxxList` 这类同义变体混搭。**
- base URL 取自 `shared/constants.ts` 的 API 前缀，禁止硬编码。
- 请求/响应 DTO 放 `apis/index.type.ts`；**领域模型本身放 `types/`**，`apis/index.type.ts` 只允许 re-export 与请求专属形状。
- **错误归一在客户端内统一完成**，调用方不重复包 `try/catch` 做 JSON 解析。

### 6. 组件层规范 (`components/`)

- 文件全小写 kebab-case（`extension-panel.tsx`），一组件一文件；有样式面则配同名 `<name>.cssr.ts`。
- **组件只读状态、只发命令**：
  - 读：`useStore(store.<domain>)`（或经 `hooks/` 封装的切片 hook）；
  - 写：调用 `service/` 的 Action，**不得直接 `store.x = y` 做业务变更**，不得直接 `fetch`、不得直接 `storage.getItem`。
- props 结构在 `types/` 中定义，不在多个组件间复制。
- 缺少可选 renderer patch 时必须 graceful fallback，不得白屏。

### 7. React 组合层规范 (`hooks/`)

- 只放**跨组件复用**的 hook（含 `useStore` 订阅封装、轮询 hook、提交拦截）。
- 命名统一 `use-<thing>.ts` → `useThing`。
- 优先使用 `@reause/core`（经 `dsh-tauri/client` 转出）而非自造：定时器、防抖节流、观察者、剪贴板、外部点击等。
- hook 内的定时器/监听器必须在卸载时清理；可用 `useIntervalFn` / `useTimeoutFn` / `useEventListener` 等 reause 原语替代手写。

### 8. 样式层规范 (`styles/` 与 `*.cssr.ts`)

沿用 `docs/AGENTS.plugins.md` 的既有细则（本规范不重复），要点：

- 全部走 `dsh-tauri-ui/client` 的统一 `cssr` 实例 + `useMountStyle` / `mountStyle`，禁止 inline style、禁止 `style.textContent`、禁止 `raw` 字符串绕过对象树。
- `.cssr.ts` **只导出 `CNode`**（`export default b('block', ...)`），不导出 mount 函数、不执行 mount。
- 挂载路线二选一：组件内 `useMountStyle(cnode, STYLE_ID)`；命令式 `mountStyle(cnode, STYLE_ID)` 返回 disposer，**收敛进 `register/styles.ts` 的 feature**（见第四章第 1 节的违规实例）。

### 9. 配置层规范 (`config/`)

- 只放**只读配置与初始化标志**（默认值、开关、模块级只读初始化状态）。
- 判定：**会变且驱动渲染 → `store/`；只读 → `config/`；纯字面量 → `constants/`**。禁止把可变状态放在 `config/`（与 `store/` 职责重叠是现状最典型的落点错误）。

### 10. 纯工具层规范 (`utils/`)

- 无状态纯函数，**不得导入 `store/` / `service/` / `register/` / `config/`**，不得出现 `sessionId`、业务 DTO 等领域概念。
- `utils/` 不是杂货铺：只碰值（字符串、路径、数组、时间格式、剪贴板文本）。
- 需要回调调度的工具（如节流器）必须**由调用方注入调度函数**，不得自己 `setTimeout`。
  > 正例：`packages/dsh-tauri-worktree/src/client/utils/throttle.ts` 的 `createKeyedThrottle({ intervalMs, schedule })` —— `schedule` 由 `register/hydration.ts:125` 注入 `controller.timeout`。

### 11. 依赖边界规范

- **客户端依赖统一经 `dsh-tauri/client` 导入**：`unstorage` / `hookable` / `ofetch` / `valtio-define` / `@reause/core` 一律禁止插件直接 import。
  > 现状核查（全仓 grep）：**该规则目前 100% 合规**——直接 import 只出现在 `packages/dsh-tauri/src/client/{controller,request,modules}/*`，即底座自身。新增代码必须保持。
- 通用 UI 只允许单向复用：消费插件从 `dsh-tauri-ui/client` 导入 `MenuSelect`、`styles`、共享图标；`dsh-tauri-ui/client` 不得反向依赖消费插件。`@gravity-ui/icons` 由 `dsh-tauri-ui` 单点内联。
- 跨 half 的协议常量（插件名 / API 前缀 / 分区顺序）放 `src/shared/constants.ts` 单向共享；`host/` 与 `client/` 互不导入。

---

## 五、 客户端封闭原型总表 (Closed Archetypes)

客户端只承认以下三种原型。**词汇表是「允许出现的动词上界」，不是「必须实现的清单」**；未被消费的方法一律不写。

| 原型 | 宏 / 落点 | 方法词汇表 | 状态 | 副作用 | 单测 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Store** | `defineStore` @ `store/modules/<domain>.ts` | `state` + `actions`（同步迁移） | 持有（唯一） | 禁止 | 直接可测 |
| **Query / Action** | 纯函数 @ `service/<domain>.ts` | Query: `fetch*` / `load*`；Action: 领域动词 | 禁止模块级 | 禁止 | 直接可测 |
| **Feature (Controller)** | `defineRegister` @ `register/<feature>.ts` | `controller.add/observe/interval/timeout/listen` | 允许（闭包内） | 唯一合法持有者 | 需集成测 |

**命名反面清单（出现即违规）**：

| 违规形态 | 说明 |
| :--- | :--- |
| `service/` 下出现 `.tsx` | 服务层不含 JSX（现状 `packages/dsh-tauri-panel/src/client/service/controller.tsx`） |
| `handle*` / `do*` / `*Handler` / `*Manager` 命名 | 统一为领域动词或 `fetch*` |
| 同名能力混用 `get` / `fetch` / `read` / `query` | 收敛到本节词汇表内的那一个 |
| 功能文件直接放在 `src/client/` 根 | 必须落入决策树的某一层（现状 `packages/dsh-tauri-panel-scheduler/src/client/prefill.ts`） |
| 独立的 `dom/` 目录 | DOM 补丁是 `register/` 的一种 feature，无独立目录；现状待迁移：`dsh-tauri-panel/src/client/dom/panel.ts`、`dsh-tauri-rightclick/src/client/dom/{locate,menu-item}.ts`、`dsh-tauri-session/src/client/dom/workspace-patch.ts`、`dsh-tauri-ui/src/client/dom/settings-obstructions.ts`、`dsh-tauri-pet/src/client/dom/sidebar-icon.ts` |
| 只有转发的 `index.ts`（薄别名层） | 直接引用真实文件 |
| `install*` 前缀 | 统一 `register*` |

---

## 六、 质量与重构自检清单 (Verification Checklist)

- [ ] **装配精简**：`client/index.ts` 是否只包含 `ctx.effect(feature, LABEL)` 与必要安装调用？是否存在内联 `mountStyle` 组合、启动期 `void promise`？
- [ ] **状态收口**：`service/` / `register/` / 组件里是否还有模块级可变状态（Map / Set / `let` 计数器）？是否都已进 store 或 controller 闭包？
- [ ] **Store 纯度**：每个 `store/modules/*.ts` 是否只有 `state` + 同步 `actions`？是否混入了请求、`try/catch` 或异步？
- [ ] **Barrel 纯净**：`store/index.ts` 是否只聚合与导出？selectors 是否在 `utils/`、React hook 是否在 `hooks/`？
- [ ] **服务原型**：`service/` 下每个文件是否落在 Query / Action 两种原型内？是否出现 `.tsx`、`handle*`、`*Manager`、散装多参数？
- [ ] **副作用归口**：是否还有裸 `setTimeout` / `setInterval` / `addEventListener` / `new MutationObserver` / `subscribe`？是否全部经 controller 登记并在卸载时收敛？
- [ ] **注册层厚度**：`register/*.ts` 是否只做登记与编排？超过 150 行的是否已把状态机下沉 `service/`？
- [ ] **请求纯度**：所有请求是否都在 `apis/` 且只用 `dsh-tauri/client` 的 `fetch`？是否残留薄别名转发？
- [ ] **组件边界**：组件是否只读 store、写走 service？是否直接 `fetch` / 直接 `storage.getItem` / 直接改 store？props 类型是否在 `types/`？
- [ ] **样式规范**：`.cssr.ts` 是否只导出 `CNode`？挂载是否经 `useMountStyle` / 收敛进 `styles` feature？是否使用统一 `cssr` 实例？
- [ ] **依赖收敛**：是否新增了 `unstorage` / `hookable` / `ofetch` / `valtio-define` / `@reause/core` / `@gravity-ui/icons` 的直接 import？
- [ ] **常量与类型集中**：共享常量是否在 `constants/`、跨文件类型是否在 `types/`？是否残留硬编码字符串或重复 interface？
- [ ] **用例与工程校验**：状态机、selectors、纯函数是否有单测？`pnpm --filter <pkg> typecheck` / `lint` / `test` / `build` 是否全绿？
