# dsh-tauri-panel-extension：扩展管理面板（技能 / MCP / 市场）

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts`（§2 的 19 条 L2 已全部落地并实测通过）；客户端与 L3 见各用例标注
> 前置：`pnpm build:plugins`；网络用例（预设/MCP 探测）另需注明
> 运行：L2 `pnpm test:e2e:plugin`；L3 见 `00-overview.md` §5.2

这是**路由面最大的插件**（19 个 path+method 项），也是桌面端「扩展管理」的唯一实现方。本文件按「只读 → 缺参 → 领域拒绝 → 面板呈现」渐进覆盖，不触碰会真实改动用户配置的写入分支。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-panel-extension'` | `packages/dsh-tauri-panel-extension/src/shared/constants.ts:1` |
| 19 个 path+method 项声明 | `packages/dsh-tauri-panel-extension/src/host/routes/index.ts:24` |
| 技能清单 `GET /skills`；刷新 `POST /skills/refresh` | `packages/dsh-tauri-panel-extension/src/host/routes/skills/get.ts:6`、`packages/dsh-tauri-panel-extension/src/host/routes/skills/refresh/post.ts:6` |
| 技能详情 404 `skill not found` | `packages/dsh-tauri-panel-extension/src/host/routes/skill/get.ts:6` |
| 只读来源保存 → 403 | `packages/dsh-tauri-panel-extension/src/host/routes/skill/post.ts:29` |
| 运行期注册技能改策略 → 422 | `packages/dsh-tauri-panel-extension/src/host/routes/skill/policy/post.ts:6` |
| `open/dir` 的 `target` 白名单 `user-skills｜plugin-state｜skill｜root` | `packages/dsh-tauri-panel-extension/src/host/routes/open/dir/post.ts:13` |
| MCP：`GET/POST/DELETE /mcp`、`/mcp/toggle`、`/mcp/check`、`/mcp/copy` | `packages/dsh-tauri-panel-extension/src/host/routes/index.ts:37` |
| MCP 列表恒带 `restartNeeded: true` | `packages/dsh-tauri-panel-extension/src/host/routes/mcp/get.ts:5` |
| 导入：`GET /import/scan`、`POST /import/apply` | `packages/dsh-tauri-panel-extension/src/host/routes/import/scan/get.ts:6` |
| 技能根：`GET/POST/DELETE /roots` | `packages/dsh-tauri-panel-extension/src/host/routes/roots/get.ts:5` |
| 技能详情命中返回 `{name, content}` | `packages/dsh-tauri-panel-extension/src/host/routes/skill/get.ts:15` |
| 保存技能校验 `name` 为 kebab-case → 400 | `packages/dsh-tauri-panel-extension/src/host/service/skills.utils.ts:40`（经 `.../skill/post.ts:24` 回传） |
| 技能策略缺 `name` / `enabled` → 400；运行期注册技能 → 422 | `packages/dsh-tauri-panel-extension/src/host/routes/skill/policy/post.ts:10`、`packages/dsh-tauri-panel-extension/src/host/routes/skill/policy/post.ts:22` |
| MCP 行校验 `serverName` 1-32 字符 → 400 | `packages/dsh-tauri-panel-extension/src/host/service/mcp.utils.ts:38`（经 `.../mcp/post.ts:18` 回传） |
| MCP 探测缺 `id` → 400；未知 `id` → 404 `server row not found` | `packages/dsh-tauri-panel-extension/src/host/routes/mcp/check/post.ts:13`、`packages/dsh-tauri-panel-extension/src/host/routes/mcp/check/post.ts:21` |
| MCP 复制缺 `id` → 400 | `packages/dsh-tauri-panel-extension/src/host/routes/mcp/copy/post.ts:13` |
| 导入扫描返回 `{servers, existing}` | `packages/dsh-tauri-panel-extension/src/host/routes/import/scan/get.ts:9` |
| 导入应用缺 `items` 为无操作成功（**无 400 校验分支**） | `packages/dsh-tauri-panel-extension/src/host/routes/import/apply/post.ts:45` |
| 技能根删除缺 `id` → 400 | `packages/dsh-tauri-panel-extension/src/host/routes/roots/delete.ts:11` |
| 宿主重启：403 `untrusted origin`、409 由壳层接管 | `packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:18`、`packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:24` |
| 面板：`definePanel` order 20，落 `sidebar.panellist` + `main` | `packages/dsh-tauri-panel-extension/src/client/register/extension-panel.tsx:39` |
| 标签页 market / skills / mcp，`role="tab"` + `aria-selected` | `packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:30`、`packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:54` |
| 输入区预填槽位 `conversation.input.left`（id `.skill-prefill`） | `packages/dsh-tauri-panel-extension/src/client/constants/index.ts:10` |

---

## 2. L2：宿主路由

> 实测命令：`pnpm vitest run --project plugin test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts`。
> 复用 `globalSetup` 的共享宿主（`also` 默认已挂载本插件），不另起进程；实测 19/19 通过。
> 断言面：HTTP 状态码、响应字节，以及 scratch profile 下 `cordis.patch.yml` 的字节。

### [P1] 验证技能清单返回数组结构且不含错误

[Case ID] TC-EXT-L2-07-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skills/get.ts:6`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:88`）
[前置条件] scratch `DSH_HOME` 全新；**技能发现不受该隔离约束**——清单聚合运行机真实用户目录，见 §6 G-EXT-4
[测试数据] `GET /api/desktop/dsh-tauri-panel-extension/skills`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 200。2. 响应体含 `skills` 数组字段，且每行带字符串 `name`。3. 不存在 `error` 字段。
[实测] 状态码 200，`skills` 为数组且每行带 `name`；数组**非空**（本机实测 32 行），故不断言条数。原「无技能时返回空数组」的用例前提不成立，已按实测改写标题与预期。
[清理] 无

### [P3] [反向] 验证查询不存在的技能返回 404

[Case ID] TC-EXT-L2-07-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skill/get.ts:6`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:99`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `GET /skill?name=definitely-missing`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 404。2. 响应体 `error` 恰为 `skill not found`。
[实测] 404 + `skill not found`，与预期一致。
[清理] 无

### [P2] 验证 MCP 列表结构固定且标记需要重启

[Case ID] TC-EXT-L2-07-003
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/mcp/get.ts:5`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:108`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `GET /mcp`
[测试步骤] 1. 发起请求。2. 读状态码与响应体字段。
[预期结果] 1. 状态码 200。2. 响应体含 `servers` 数组与 `restartNeeded: true` 两个字段。
[实测] 200，`servers` 为数组、`restartNeeded` 恰为 `true`，与预期一致。
[清理] 无

### [P3] [反向] 验证 MCP 删除缺 id 返回 400

[Case ID] TC-EXT-L2-07-004
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/mcp/delete.ts:7`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:119`）
[前置条件] 同 TC-EXT-L2-07-001；`<DSH_HOME>/profiles/web/cordis.patch.yml` 已由脚手架产出
[测试数据] `DELETE /mcp`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。3. 对比请求前后 `cordis.patch.yml` 的字节。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `id is required`。3. 配置文件未被改写。
[实测] 400 + `id is required`，且 `cordis.patch.yml` 内容逐字节不变，与预期一致。
[清理] 无

### [P3] [反向] 验证 MCP 切换缺字段返回 400

[Case ID] TC-EXT-L2-07-005
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/mcp/toggle/post.ts:7`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:137`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /mcp/toggle`，body `{ "id": "x" }`（缺 `disabled`）
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `id and disabled are required`。
[实测] 400 + `id and disabled are required`，与预期一致。
[清理] 无

### [P4] [反向] 验证打开目录的未知 target 被拒

[Case ID] TC-EXT-L2-07-006
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/open/dir/post.ts:52`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:150`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /open/dir`，body `{ "target": "unknown-target" }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `unknown target`。3. 响应体不含 `ok`（`opener.open()` 在白名单校验之后才调用，400 即意味着没有触发系统打开动作）。
[实测] 400 + `unknown target`，响应体无 `ok`，与预期一致。
[清理] 无

### [P4] [反向] 验证技能根创建只接受 local / git

[Case ID] TC-EXT-L2-07-007
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/roots/post.ts:7`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:164`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /roots`，body `{ "kind": "svn", "path": "/tmp" }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `kind must be local or git`。
[实测] 400 + `kind must be local or git`（未落到 `path is required` 分支），与预期一致。
[清理] 无

### [P3] [反向] 验证宿主重启在本机无来源头时被拒

[Case ID] TC-EXT-L2-07-008
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:18`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:178`）
[前置条件] 同 TC-EXT-L2-07-001；请求不携带 `Origin`
[测试数据] `POST /host/restart`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。3. 请求前后各打一次 `GET /skills`，确认宿主仍由同一实例服务。
[预期结果] 1. 状态码 403。2. 响应体 `error` 恰为 `untrusted origin`。3. 宿主未重启。
[实测] 403 + `untrusted origin`，响应体无 `pid`；请求前后 `GET /skills` 均 200，宿主未重启。**上游围栏未遮蔽本用例**：`isTrustedApiRequest` 在「无 `Origin`」时放行，判定落到插件 handler（对照：异源 `Origin` 会在连接门先返回 `forbidden`，见 `01` 批次与 `00-overview.md` G10）。
[清理] 无

### [P3] [反向] 验证带转发头的重启请求同样被拒

[Case ID] TC-EXT-L2-07-009
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:18`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:198`）
[前置条件] 同 TC-EXT-L2-07-008
[测试数据] 同源 `Origin`（`new URL(inject('dshBaseUrl')).origin`，与 `Host` 一致）+ `x-forwarded-for: 10.0.0.1`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 403。2. 响应体 `error` 恰为 `untrusted origin`（转发头视为不可信）。
[实测] 403 + `untrusted origin`。同源 `Origin` 通过连接门与路由层 `isCrossOrigin`，拒绝确由插件 handler 的转发头判据给出，与预期一致。
[清理] 无

### [P2] 验证技能刷新同步返回与清单同源的新目录

[Case ID] TC-EXT-L2-07-010
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skills/refresh/post.ts:9`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:218`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /skills/refresh`，body `{}`；请求前后各打一次 `GET /skills`
[测试步骤] 1. 读刷新前的 `GET /skills`。2. `POST /skills/refresh`。3. 读状态码与响应体。4. 比较两次响应的技能名集合。
[预期结果] 1. 状态码 200。2. 响应体含 `skills` 数组字段且无 `error`。3. 刷新返回的名字集合与刷新前的清单一致（remount 不改变目录构成）。
[实测] 200，`skills` 为数组且与刷新前清单名字集合完全一致（本机各 32 行）。**修正 G-EXT-1**：`remountProvider()` 与 `getCatalog()` 在同一 handler 内串行 await，响应返回时目录已可读，因此该路由**可同步断言**，不需要轮询，也不再是「不覆盖」条目。
[清理] 无

### [P2] 验证按名查询已有技能返回定义与正文

[Case ID] TC-EXT-L2-07-011
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skill/get.ts:15`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:238`）
[前置条件] 同 TC-EXT-L2-07-001；技能名**从 `GET /skills` 动态取第一个字符串 `name`**，不硬编码
[测试数据] `GET /skill?name=<取自清单的技能名>`
[测试步骤] 1. `GET /skills` 取一个真实技能名。2. 以该名请求 `GET /skill`。3. 读状态码与响应体。
[预期结果] 1. 状态码 200。2. 响应体 `name` 与查询参数逐字相等。3. 响应体 `content` 为非空字符串（SKILL.md 正文）。
[实测] 200，`name` 回显一致，`content` 非空（本机取 `agent-browser`，正文 2316 字符）。清单为空时用例以「夹具前置」断言失败而非静默跳过。
[清理] 无

### [P3] [反向] 验证保存技能缺 name 返回 400

[Case ID] TC-EXT-L2-07-012
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/service/skills.utils.ts:40`（经 `packages/dsh-tauri-panel-extension/src/host/routes/skill/post.ts:24` 回传）
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:256`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /skill`，body `{}`（`name` 为空串）
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `name must be kebab-case (a-z, 0-9, dashes)`。3. 响应体不含 `ok`（校验在 `skills.save()` 之前返回，未写用户技能目录）。
[实测] 400 + 逐字文案，响应体仅 `{"error":…}`，与预期一致；**只走校验分支，不写盘**。
[清理] 无

### [P3] [反向] 验证技能策略缺参返回 400

[Case ID] TC-EXT-L2-07-013
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skill/policy/post.ts:10`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:270`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] `POST /skill/policy`，body `{}`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `name and enabled are required`。3. 不得落到 `skill has no file on disk (runtime-registered)`（422）或真实技能文件的写入分支。
[实测] 400 + 逐字文案，与预期一致。**422 分支未覆盖**：它要求 `skills.get(name).path === undefined`（`.../skill/policy/post.ts:22`），而本机 `GET /skills` 的 32 行全部 `provider: filesystem`、`policyEditable: true`、`dir` 与 `resourceBase.path` 齐备，无运行期注册技能；且探测该分支必须先对真实技能调用 `setPolicy` 写文件，故本批不构造，登记于 §6。
[清理] 无

### [P3] [反向] 验证新增 MCP 行的非法 serverName 被拒

[Case ID] TC-EXT-L2-07-014
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/service/mcp.utils.ts:38`（经 `packages/dsh-tauri-panel-extension/src/host/routes/mcp/post.ts:18` 回传）
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:284`）
[前置条件] 同 TC-EXT-L2-07-001；`<DSH_HOME>/profiles/web/cordis.patch.yml` 已由脚手架产出
[测试数据] `POST /mcp`，body `{ "serverName": "" }`
[测试步骤] 1. 读 patch 文件字节。2. 发起请求。3. 读状态码与响应体。4. 回读 patch 文件字节。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `serverName must be 1-32 chars of A-Z a-z 0-9 _ -`。3. `cordis.patch.yml` 逐字节不变。
[实测] 400 + 逐字文案，patch 文件逐字节不变，与预期一致。**实测修正**：`{}`（`serverName` 为 `undefined` 而非空串）不会命中本条——`SERVER_NAME_RE.test(undefined)` 会把 `undefined` 强转成字符串 `"undefined"` 并**通过** `[\w-]{1,32}` 校验，最终落到 `http transport requires an http(s) url`（`.../mcp.utils.ts:47`）。故测试数据固定为 `{"serverName":""}`。
[清理] 无

### [P3] [反向] 验证 MCP 探测的缺 id 与未知 id 两类失败

[Case ID] TC-EXT-L2-07-015
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/mcp/check/post.ts:13`、`packages/dsh-tauri-panel-extension/src/host/routes/mcp/check/post.ts:21`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:301`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] 先 body `{}`，再 body `{ "id": "definitely-missing" }`
[测试步骤] 1. 两次 `POST /mcp/check`。2. 读两次状态码与响应体。
[预期结果] 1. 第一次 400 且 `error` 恰为 `id is required`。2. 第二次 404 且 `error` 恰为 `server row not found`。3. 第二次响应体只含 `error` 一个键（没有行可探测，不得回传探测结果，也不得触发网络探测）。
[实测] 400 + `id is required`、404 + `server row not found`，第二次响应键集恰为 `['error']`，与预期一致。
[清理] 无

### [P3] [反向] 验证复制 MCP 行缺 id 返回 400

[Case ID] TC-EXT-L2-07-016
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/mcp/copy/post.ts:13`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:324`）
[前置条件] 同 TC-EXT-L2-07-014
[测试数据] `POST /mcp/copy`，body `{}`
[测试步骤] 1. 读 patch 文件字节。2. 发起请求。3. 读状态码与响应体。4. 回读 patch 文件字节。
[预期结果] 1. 状态码 400。2. 响应体 `error` 恰为 `id is required`。3. `cordis.patch.yml` 逐字节不变。
[实测] 400 + `id is required`，patch 文件逐字节不变，与预期一致。
[清理] 无

### [P3] 验证导入扫描返回候选来源与已存在名两份清单

[Case ID] TC-EXT-L2-07-017
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/import/scan/get.ts:9`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:341`）
[前置条件] 同 TC-EXT-L2-07-001；扫描读运行机用户目录（`~/.claude.json`、`~/.cursor/mcp.json`、`~/.codex/config.toml` 等），**只读**
[测试数据] `GET /import/scan`
[测试步骤] 1. 发起请求。2. 读状态码与响应体字段。
[预期结果] 1. 状态码 200。2. 响应体含 `servers` 与 `existing` 两个数组字段（条数随运行机变化，不断言）。3. 无 `error` 字段。4. `existing` 每项为字符串（MCP server 名）。
[实测] 200，`servers` / `existing` 均为数组（本机 2 / 0 项），无 `error`，与预期一致。**同 G-EXT-4 的隔离性缺口**：结果随运行机用户 MCP 配置变化，故只断言字段与元素类型，不断言条数。
[清理] 无

### [P3] 验证导入应用的空 items 是无写入的无操作分支

[Case ID] TC-EXT-L2-07-018
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/import/apply/post.ts:45`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:356`）
[前置条件] 同 TC-EXT-L2-07-014
[测试数据] `POST /import/apply`，body `{}`（缺 `items`）
[测试步骤] 1. 读 patch 文件字节。2. 发起请求。3. 读状态码与响应体。4. 回读 patch 文件字节。
[预期结果] 1. 状态码 200（该路由**没有** 400 校验分支）。2. `ok: true`、`results: []`、`restartNeeded: true`。3. `cordis.patch.yml` 逐字节不变（候选集为空，循环体不执行，不写任何 MCP 行）。
[实测] 200 + `{"ok":true,"results":[],"restartNeeded":true}`，patch 文件逐字节不变，与预期一致。**修正 G-EXT-1**：该路由确有同步返回点，缺 `items` 时是「无操作成功」而非报错；真导入分支（`items` 命中运行机候选）会写 profile，本批不碰。
[清理] 无

### [P4] 验证技能根清单形状与删除缺参被拒

[Case ID] TC-EXT-L2-07-019
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/roots/get.ts:6`、`packages/dsh-tauri-panel-extension/src/host/routes/roots/delete.ts:11`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:375`）
[前置条件] 同 TC-EXT-L2-07-001
[测试数据] 先 `GET /roots`；再 `DELETE /roots`，body `{}`；最后再 `GET /roots`
[测试步骤] 1. 读技能根清单。2. 发起缺 id 的删除。3. 读状态码与响应体。4. 回读技能根清单并比较。
[预期结果] 1. 第一次 200 且含 `roots` 数组字段、无 `error`。2. 删除返回 400 且 `error` 恰为 `id is required`。3. 回读的清单与第一次逐字段相等（被拒的删除未改动配置）。
[实测] 200 + `{roots: []}`、400 + `id is required`、回读清单深度相等，与预期一致。**本机 `roots` 恰为空数组**（新 scratch 宿主未配置技能根，根来源存于 scratch `DSH_HOME` 下的插件 state，**不像技能发现那样越出隔离**）；因该端点数据随用户配置变化，用例只断言数组形状与「拒绝后不变」，不断言条数。
[清理] 无

---

## 3. L2：客户端（真实浏览器页面，未接线）

### [P1] 验证扩展面板渲染并按顺序激活首个标签

[Case ID] TC-EXT-C-07-001
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:37`
[自动化] 未接线（客户端用例待补；G2 已消解）
[前置条件] iframe 内 dsh 界面已加载；`sidebar.panellist` 槽位可用
[测试数据] 无
[测试步骤] 1. 从面板列表打开扩展面板。2. 查询 `.dshp-extension__tabs` 与其中的 `[role="tab"]`。3. 读被激活标签的 `aria-selected`。
[预期结果] 1. tablist 存在。2. 至少包含 `skills` 与 `mcp` 两个标签。3. 恰有一个 `aria-selected="true"`，且为列表中的第一个可见标签。
[清理] 关闭面板

### [P2] 验证技能页空态与主要入口可见

[Case ID] TC-EXT-C-07-002
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/client/components/skills-tab.tsx:195`
[自动化] 未接线（客户端用例待补；G2 已消解）
[前置条件] 无用户技能
[测试数据] 无
[测试步骤] 1. 切到技能标签。2. 查询「打开技能目录」「导入仓库」「新建技能」三个按钮。3. 查询卡片列表容器。
[预期结果] 1. 三个入口均存在。2. 卡片列表为空。
[清理] 关闭面板

### [P3] [反向] 验证市场插件缺席时市场标签不出现且不报错

[Case ID] TC-EXT-C-07-003
[层级] L2（真实浏览器页面，未接线）
[类型] 异常
[追踪] `packages/dsh-tauri-panel-extension/src/client/service/market.ts:32`
[自动化] 未接线（客户端用例待补；G2 已消解）
[前置条件] 未安装提供 `market.render` 的市场插件
[测试数据] 无
[测试步骤] 1. 打开扩展面板。2. 统计 `[role="tab"]` 的文案集合。3. 收集 `pageerror`。
[预期结果] 1. 标签集合不含市场项。2. `pageerror` 为空（缺席被静默处理，不是抛错）。
[清理] 关闭面板

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P1] 验证桌面端壳层可打开扩展面板并切换标签

[Case ID] TC-EXT-L3-07-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/client/register/extension-panel.tsx:39`
[自动化] 待接线（L3 通道尚未接入；本条已按 L3 准入原则归入 L2 浏览器断言，需在内嵌 iframe 内驱动，见 `00-overview.md` G6）
[前置条件] 应用就绪；`get_dsh_plugins` 返回中包含本插件
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话并切到 iframe。2. 打开扩展面板。3. 依次点击 `skills` 与 `mcp` 标签。
[预期结果] 1. 面板容器 `.dshp-extension__tabs` 存在。2. 每次点击后对应 `[role="tabpanel"]` 从 `hidden` 变为可见，且被点标签 `aria-selected="true"`。3. 应用日志无 `dsh://plugin-error`。
[清理] `DELETE /session/<id>`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `/skills` 只读 | TC-EXT-L2-07-001 | 正向 | 清单内容随运行机用户技能目录变化，只断言结构，见 G-EXT-4 |
| `/skill` 404 | TC-EXT-L2-07-002 | 异常 | — |
| `/mcp` 结构 | TC-EXT-L2-07-003 | 正向 | — |
| `/mcp` 与 `/mcp/toggle` 缺参 | TC-EXT-L2-07-004、TC-EXT-L2-07-005 | 异常 | `/mcp` 额外断言 `cordis.patch.yml` 未被改写 |
| `/open/dir` target 白名单 | TC-EXT-L2-07-006 | 边界 | 其余 target 的 404/422 分支需要真实技能与仓库，**未覆盖** |
| `/roots` kind 校验 | TC-EXT-L2-07-007 | 异常 | — |
| `/skills/refresh` 同步目录 | TC-EXT-L2-07-010 | 正向 | 名字集合须与 `GET /skills` 一致；条数随运行机变化，见 G-EXT-4 |
| `/skill` 命中路径 | TC-EXT-L2-07-011 | 正向 | 技能名动态取自清单，不硬编码 |
| `/skill` 保存校验 | TC-EXT-L2-07-012 | 异常 | 只走校验分支；`/skill` 的 403 只读与真写入**未覆盖** |
| `/skill/policy` 缺参 | TC-EXT-L2-07-013 | 异常 | 422「运行期注册技能」分支**未覆盖**，见 G-EXT-6 |
| `/mcp` 新增校验 | TC-EXT-L2-07-014 | 异常 | 额外断言 `cordis.patch.yml` 未被改写 |
| `/mcp/check` 两类失败 | TC-EXT-L2-07-015 | 异常 | 已知 `id` 的探测会打网络，**未覆盖**，见 G-EXT-7 |
| `/mcp/copy` 缺参 | TC-EXT-L2-07-016 | 异常 | 额外断言 `cordis.patch.yml` 未被改写；命中复制**未覆盖** |
| `/import/scan` 只读 | TC-EXT-L2-07-017 | 边界 | 条数随运行机 MCP 配置变化，只断言字段与元素类型 |
| `/import/apply` 空 items | TC-EXT-L2-07-018 | 边界 | 真导入（命中候选即写 profile）**未覆盖** |
| `/roots` 只读与删除缺参 | TC-EXT-L2-07-019 | 边界 | 根条目字段形状（`id` / `live`）需真实配置技能根；`/roots` 创建成功路径**未覆盖** |
| `/host/restart` 双重拒绝 | TC-EXT-L2-07-008、TC-EXT-L2-07-009 | 异常 | 409「由壳层接管」分支只在壳层内触发，**未覆盖**；两条均由插件 handler 判决，未被上游围栏遮蔽 |
| 面板与标签 | TC-EXT-C-07-001、TC-EXT-C-07-002、TC-EXT-L3-07-001 | 正向 | 依赖浏览器驱动 / `desktop` project |
| 市场标签缺席 | TC-EXT-C-07-003 | 异常 | 依赖未安装市场插件的前置 |
| 技能写入 / 只读 403 | — | — | **未覆盖**：会改用户技能目录，留待带备份的专项批次 |

---

## 6. 缺口与假设

- **G-EXT-1（本轮修正）**：原判「`POST /skills/refresh` 与 `POST /import/apply` 无同步完成点，需轮询」**不成立**——两条都已落地为 TC-EXT-L2-07-010 / TC-EXT-L2-07-018：`refresh` 在 handler 内 `await remountProvider()` 后同步 `await skills.getCatalog()` 才返回（`packages/dsh-tauri-panel-extension/src/host/routes/skills/refresh/post.ts:8`、`packages/dsh-tauri-panel-extension/src/host/routes/skills/refresh/post.ts:9`），响应体即最终目录；`/import/apply` 缺 `items` 时是同步的无操作成功，也没有 400 校验分支。仍**未覆盖**的是 `/import/apply` 的真实副作用路径（`items` 命中运行机候选后会写 profile 的 MCP 行）。
- **G-EXT-2**：市场标签页依赖外部市场插件发布 `market.render`（`packages/dsh-tauri-panel-extension/src/client/service/market.ts:32`），本包无法自足构造。
- **G-EXT-3**：`packagedSkillsDir()` 指向的 `skills` 目录在本 checkout 内无 git 文件；随包分发技能的有无**待确认**，相关断言暂不成立。实测 `GET /skills` 返回的行全部来自运行机用户目录（`~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`，`provider: filesystem`），随包技能未出现在结果中。
- **G-EXT-4**：**scratch 隔离不覆盖技能发现**。`globalSetup` 只重定向 `DSH_HOME`，而 `skills` 服务仍扫描运行机真实用户目录，因此 `GET /skills` 的条数随开发者机器变化（本机实测 32 行）。影响：TC-EXT-L2-07-001 的「无技能」前提不可达，已改为只断言数组结构与每行 `name`；任何后续依赖技能清单内容或条数的用例都必须在断言前先过滤到 scratch 作用域内的行，否则不可复现。**判定：产品行为符合「扩展管理面板聚合本机技能」的语义，非缺陷；属 E2E 隔离性缺口。**
- **G-EXT-5**：`POST /host/restart` 的 403 实测确由插件 handler 给出（`untrusted origin`），未被上游 Host/Origin 围栏遮蔽——`isTrustedApiRequest` 仅在「`Origin` 与 `Host` 不符」或 `sec-fetch-site: cross-site` 时拒绝，故无 `Origin`（-008）与同源 `Origin`（-009）都能落到 handler。异源 `Origin` 的重启请求会先在连接门拿到 `forbidden`，该形态本批不覆盖（对照 `00-overview.md` G10）。
- **G-EXT-6**：`POST /skill/policy` 的 422 分支（`skill has no file on disk (runtime-registered)`，`packages/dsh-tauri-panel-extension/src/host/routes/skill/policy/post.ts:22`）**未覆盖**。构造它需要 `skills.get(name).path === undefined` 的运行期注册技能；本机 `GET /skills` 的 32 行全部来自 `filesystem` provider（`resourceBase.kind === 'directory'`、`dir` 齐备、`policyEditable: true`），不存在此类技能；而在同一路由上试错会对真实技能文件调用 `setPolicy` 造成写盘，故主动放弃构造，只覆盖该路由的 400 缺参分支。
- **G-EXT-7**：三条**只读/安全边界**之外的路径**未覆盖**：`POST /mcp/check` 对**已存在** `id` 的探测会真的发起 MCP 握手（网络与超时不可控）；`POST /mcp/copy` 与 `POST /import/apply` 的命中分支会写 profile；`GET /roots` 的条目字段（`id` / `live`）需要真实配置一个技能根才能观察。本批只走缺参 / 未知 id / 空 items 分支。
- **实测（批次 07 补齐）**：新增 10 条（TC-EXT-L2-07-010 ~ TC-EXT-L2-07-019）已落地并全绿，§2 共 19 条。实测与文档预期**逐字相符**的有：`/skills/refresh` 200 且名字集合与刷新前一致、`GET /skill?name=<真实名>` 200 且 `name` 回显一致 / `content` 非空、`/skill` 400 `name must be kebab-case (a-z, 0-9, dashes)`、`/skill/policy` 400 `name and enabled are required`、`/mcp` 400 `serverName must be 1-32 chars of A-Z a-z 0-9 _ -`、`/mcp/check` 400 `id is required` 与 404 `server row not found`、`/mcp/copy` 400 `id is required`、`/import/scan` 200 + `{servers, existing}`、`/import/apply` 200 + `{ok:true,results:[],restartNeeded:true}`、`/roots` 200 + `{roots:[]}` 与 `DELETE /roots` 400 `id is required`；三处 patch 文件字节比对（`/mcp`、`/mcp/copy`、`/import/apply`）均逐字节不变。**无疑似缺陷**。
- **实测修正（批次 07 补齐，非缺陷）**：`POST /mcp` 传 `{}`（`serverName` 为 `undefined`）**不会**触发 `serverName` 校验——`RegExp.test(undefined)` 先把值强转成字符串 `"undefined"`，它恰好匹配 `[\w-]{1,32}`，于是校验通过并落到 `http transport requires an http(s) url`（`packages/dsh-tauri-panel-extension/src/host/service/mcp.utils.ts:47`）。即校验器对「非字符串 `serverName`」是宽松的；TC-EXT-L2-07-014 因此固定用 `{"serverName":""}`。若要收紧，应在 `validateMcpInput` 里显式判 `typeof input.serverName === 'string'`——本批只登记，不改产品代码。
- **假设**：`SKILLS_DATA_DIR = $DSH_HOME/skills`（`packages/dsh-tauri-panel-extension/src/host/config/constants.ts:5`）；用例不直接读写该目录，只经路由观察。
- **假设**：MCP 行的落盘位置是 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`（`src/host/config/constants.ts:9` + `src/host/service/profile.ts:14`）；TC-EXT-L2-07-004 以此文件为「配置未被改写」的观测对象。
