# 桌面载体鉴权适配提案 (dsh-tauri-connection)

> 状态：已实施。内置插件 `packages/dsh-tauri-connection` 取代
> `src-tauri/src/service/patch/alpha_auth.rs`（该补丁已删除）。

---

## 1. 问题

桌面端用 Tauri WebView 承载 DSH Web UI：壳层文档是 `tauri.localhost`，UI 跑在
`http://127.0.0.1:<port>` 的**跨源沙箱 iframe** 里（`src/layout/components/iframe.tsx:192`，
地址由 `src/store/modules/harness/utils.ts:37` 生成）。

上游 `dsh-client-connection` 的浏览器鉴权只有一条通道：根路径 `GET /?token=<...>`
把进程 token 换成绑定 authority 的签名 Cookie，此后每个 Host RPC 方法与 WebSocket
stream 都要求该 Cookie 在场，否则 401（`dsh-client-connection/README.zh.md:35`）。

该 Cookie 是 `SameSite=Strict`（`dsh-client-connection/lib/index.js:293`），跨源 iframe
下浏览器不会携带它，token 交换也无法稳定完成——于是桌面端每一次请求都是 401。

## 2. 结论

不换载体、不改核心磁盘文件：在**插件层**覆写 `connection` 服务的两道鉴权闸门。

原 `alpha_auth` 补丁的做法是在活动核心的 JS 里改两个方法体，并把开关做成
`--skip-auth` CLI 选项——需要同时改 `dsh-web-app/lib/startup.js` 与
`dsh-client-connection/lib/index.js` 两个文件，并兼容 pkg / npm 两种布局锚点
（见 issue #358 的回归用例）。插件把同一件事移到运行期：**锚点消失，核心换版本不再
需要重新验证补丁命中**，WebSocket 通道也一并覆盖。

## 3. 契约：两道闸门

| 闸门 | 返回 | 已装核心调用点 |
| --- | --- | --- |
| `requestRejection(request)` | `401 \| 403 \| undefined` | `dsh-client-connection/lib/index.js:611`（per-channel `register()`）、`:774`（`/api` 共享通道）、`dsh-api-gateway/lib/index.js:463`（WebSocket upgrade）、`dsh-host-open-in-app/lib/index.js:1318` |
| `authorizeIndex(request, response)` | `boolean`，`false` 表示调用方不再写出 index | `dsh-host-frontend-static/lib/index.js:95`（`serveStatic` 在 `:60` 以 `if (!authorizeIndex()) return` 消费返回值） |

四处调用点**全部是调用时属性查找**（`this.requestRejection(req)` /
`connection.requestRejection(req)` / `ctx.connection.authorizeIndex(req, res)`），
因此在服务实例上覆盖方法即可同时生效——包括 WebSocket upgrade。

上游对应位置：`packages/client/connection/src/rpc-host.ts:75`（`super(ctx, 'connection')`
——插件名是 `client-connection`，服务名才是 `connection`）、
`packages/client/connection/src/index.ts:144`（`/api`）、
`packages/api/gateway/src/index.ts:215`（WS upgrade）、
`packages/host/frontend-static/src/index.ts:139`（index）。

### 语义

```ts
connection.requestRejection = (request) => {
  const rejected = rejection.call(connection, request)
  return rejected === 401 ? undefined : rejected // 403 原样保留
}
connection.authorizeIndex = () => true
```

`requestRejection` **不整体放行**：Host/Origin fence 的 403 继续生效，只把
browser-session 的 401 降级为放行——与 `alpha_auth` 补丁后的方法体逐字等价。

## 4. 载体标记

插件只在自己被**显式**要求接管时才生效：

* Tauri 壳在 spawn 时注入 `DSH_TAURI_EMBEDDED=1`
  （`src-tauri/src/service/workflow/launch.rs` 的 envs 注入点，与 `DSH_PNPM` 同一处）。
* 未注入时 `gate.attach()` 直接返回空卸载函数，插件是 no-op。

这一步不能省：内置插件被安装进**用户档案**（`internal-plugins.json`），而档案是桌面端
与终端 `dsh web` 共用的。没有这个标记，任何一次 `dsh web --profile web` 都会静默绕过
鉴权。

## 5. 安全边界

放行等价于原 `--skip-auth`：**凡通过 `isTrustedApiRequest` Host/Origin fence 的请求
一律视为已鉴权**。这是「跨源 iframe 无法完成 Cookie 交换」这一载体约束的直接代价，
不是修复。要真正恢复 browser-session 鉴权，必须换载体（让 DSH Web UI 成为独立顶层
上下文），不在本提案范围内。

静态资源本来就是公开的；本插件不放宽任何比原补丁更宽的口子。

## 6. 插件落点

```text
packages/dsh-tauri-connection/
├── cordis.patch.yml            # 插入 loader entry dsh-tauri-connection
├── package.json                # dsh.bundle.patch 指向上面
├── tsdown.config.ts            # defineDshConfig({ client: false })
└── src/
    ├── index.ts                # name / inject: ['connection'] / apply
    ├── shared/constants.ts     # PLUGIN_ID
    └── host/
        ├── apply.ts            # 装配：绑定宿主 → ctx.effect(gate.attach())
        ├── config/runtime.ts   # defineHostRuntime<ConnectionHost>()
        ├── service/gate.ts     # 覆写/还原两道闸门（唯一接触宿主的层）
        ├── service/gate.test.ts
        └── types/index.ts      # ConnectionHost / ConnectionLogger
```

`defineDshConfig()` 原本**无条件**产出 `src/client/index.ts` 入口，本插件是本仓第一个纯宿主
插件，因此 `packages/dsh-tauri-tsdown/src/index.ts` 新增 `client: false`：只产出宿主 entry，
其余插件的 `client` 选项语义不变（已用 `dsh-tauri-session` 回归双入口构建）。

登记点（缺一不可）：

1. `packages/dsh-tauri-bundle/package.json` 的 `dependencies` —— 决定 `build:plugins`
   把哪些 workspace 包 deploy 进 `src-tauri/resources/node_modules`；
2. `src-tauri/resources/internal-plugins.json` —— 决定启动时把哪些内置插件自愈安装进
   用户档案；
3. `pnpm-lock.yaml`（`pnpm install --lockfile-only`）。

插件没有路由、没有 client half，因此**不**登记进 `genapi.config.ts`。

## 7. 落地清单

**新增**

* `packages/dsh-tauri-connection/**`
* `docs/specs/connection.proposal.md`（本文）

**删除**

* `src-tauri/src/service/patch/alpha_auth.rs`
* `docs/host.proposal.md`、`docs/host.migration.md`（旧载体方案，已废弃）

**改动**

* `src-tauri/src/service/patch/mod.rs`：移除 `alpha_auth` 模块声明与 `apply_all_at`
  注册项，数组长度 `7` → `6`。
* `src-tauri/src/service/workflow/launch.rs`：
  * 删除 `alpha_auth::apply` 调用块；
  * 删除 `skip_auth` 判定与三处 `--skip-auth` 参数（Windows args、Unix 首次 spawn、
    Unix 重复 loader entry 重试）；
  * 新增 `envs.insert("DSH_TAURI_EMBEDDED", "1")`。
* `packages/dsh-tauri-bundle/package.json`、`src-tauri/resources/internal-plugins.json`、
  `pnpm-lock.yaml`。
* `src-tauri/src/utils/mod.rs`：删除只服务 `--skip-auth` 能力探测的 `dsh_rel_contains`
  （`alpha_auth` 是它唯一的调用方）。
* `packages/dsh-tauri-tsdown/src/index.ts`：`DshConfigOptions.client` 接受 `false`，
  让纯宿主插件不再被迫产出浏览器半区。
* `README.md` / `README.en.md` / `README.es.md`：插件清单登记新包。
* `docs/specs/upstram.sync.md` §5.2、`docs/specs/plugin.test.md`、`docs/testing/plugins/01-dsh-host-and-core-contract.md`
  中指向旧补丁的表述。

`--no-open` 与 `web_supports_no_open_flag` 保持不动。

## 8. 验证

| 层 | 断言 |
| --- | --- |
| 单元 | `gate.test.ts`：未注入标记时两道闸门引用不变；注入后 401 降级、403 透传、`authorizeIndex` 恒真且不调用原实现；卸载后引用复原；核心缺闸门时告警且不抛错 |
| 类型 | `pnpm typecheck` |
| 构建 | `pnpm --filter dsh-tauri-connection build`：只产出 `dist/index.js` + `dist/index.d.ts`，publint 无问题，入口无静态 `@deepseek-ai/*` 导入 |
| 资源闭包 | `test/plugin-resource-closure.test.ts`（构建后）覆盖新包的 `dist/index.js` 入口与「无静态 `@deepseek-ai/*` 导入」 |
| L2 / L3 | 桌面端启动后 iframe 内 `/api` 不再 401；终端 `dsh web` 仍走 Cookie 交换 |
| Rust | `cargo check` 零警告、`cargo test --lib` 全绿 |

## 9. 已知残留

* **已装核心上的补丁残留**：`alpha_auth` 对活动核心的改写不会被回滚。打过补丁的
  `dsh-client-connection/lib/index.js` 保留两处 `if (process.env.DSH_SKIP_AUTH === "1")`
  分支与标记注释。因为再没有任何路径写入 `DSH_SKIP_AUTH`，它们是死代码；插件覆写整个
  方法后更不可达。重新安装核心即得到干净文件。
* **上游改动风险**：若 `requestRejection` / `authorizeIndex` 改名或改语义，插件告警并
  降级为 no-op（表现回到 401），不阻断启动——与其他核心补丁「最佳努力、失败只告警」
  的约定一致。
