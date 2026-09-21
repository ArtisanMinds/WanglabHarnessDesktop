## 插件开发规范

- 如果你正在处理插件客户端的代码，必须严格遵守 [plugin.client.md](./plugin.client.md) 规范。
- 如果你正在处理插件宿主端的代码，必须严格遵守 [plugin.host.md](./plugin.host.md) 规范。
- 如果你正在处理插件宿主端服务的代码，必须严格遵守 [plugin.host.service.md](./plugin.host.service.md) 规范。
- 如果你正在处理全局面板的代码，必须严格遵守 [plugin.client.panel.md](./plugin.client.panel.md) 规范。
- host 直接安装 lodash-es 作为依赖
- client 需引用 `dsh-tauri/client/` 导出的 lodash-es 模块，禁止直接从模块中加载

## 测试（修复 / 新功能必须同步）

- **唯一规范**：[plugin.test.md](./plugin.test.md)。修 bug、加功能、改行为之前先读它，按其中「分层与归属 / 目录 / 运行命令 / 隔离红线」定位或新增测试。
- **用例位置**：`test/e2e/plugins/*.e2e.ts`（`plugin` project：真实 `dsh web` 进程 + 真实 Chromium，承载 L2 宿主路由与 C 浏览器层）与 `packages/*/src/**/*.test.ts`（`unit` project，L1 纯单测）。
- **运行**：`node node_modules/vitest/vitest.mjs run --project plugin`（单文件过滤用位置参数）。**不要**用 `pnpm run <script>`——本仓 pnpm 的 deps 校验与 `.bin` shim 在部分环境会失败。稳定性要求：同一批用例连续 5 次运行无 Flake。
- **同步义务**：行为改动必须同步更新测试代码。**不再维护用例文档**——测试不由「文档条目 ↔ `it()`」驱动，`it()` 标题即契约描述（[plugin.test.md](./plugin.test.md) §10）。

## 通用协议：常量归属（host / client 同一套）

适用于 `packages/*` 的宿主端与客户端两侧；与任何 `.spec.md` 冲突时以本节为准。

- **单一消费方 → 消费方文件**：只被**一个文件**使用的常量，直接定义在那个文件里——模块级 `const`、**不导出**、放在 import 之后（放文件末尾会被 `ts/no-use-before-define` 拒绝）。
- **同侧多消费方 → 该侧常量模块**：被同侧**两个及以上**文件使用的常量才登记进常量模块——host 是 `src/host/config/constants.ts`，client 是 `src/client/constants/index.ts`。
- **跨 side → `src/shared/constants.ts`**：host 与 client 都要用的协议常量（`PLUGIN_ID`、SSE 参数、非路由场景的路径等）放共享模块，两侧各自 import。路由 `path` 不在此列：一律在 `routes/index.ts` 直接写字面量。
- **零消费方 → 删除**：没有消费方的常量直接删；某个常量模块被清空时删除整个文件，并清理悬空 import。
- **不因位置豁免**：`ctx.effect` 标签、样式 ID、槽位名、路由 `path` 等同样按上面四条判断归属，不再默认堆进 `constants/`；命名须全仓一致、语义唯一。