# dsh-tauri-panel-extension：扩展管理面板（技能 / MCP / 市场）

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts`（§2 的 9 条 L2 已全部落地并实测通过）；客户端与 L3 见各用例标注
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
| 宿主重启：403 `untrusted origin`、409 由壳层接管 | `packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:18`、`packages/dsh-tauri-panel-extension/src/host/routes/host/restart/post.ts:24` |
| 面板：`definePanel` order 20，落 `sidebar.panellist` + `main` | `packages/dsh-tauri-panel-extension/src/client/register/extension-panel.tsx:39` |
| 标签页 market / skills / mcp，`role="tab"` + `aria-selected` | `packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:30`、`packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:54` |
| 输入区预填槽位 `conversation.input.left`（id `.skill-prefill`） | `packages/dsh-tauri-panel-extension/src/client/constants/index.ts:10` |

---

## 2. L2：宿主路由

> 实测命令：`pnpm vitest run --project plugin test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts`。
> 复用 `globalSetup` 的共享宿主（`also` 默认已挂载本插件），不另起进程；实测 9/9 通过。
> 断言面：HTTP 状态码、响应字节，以及 scratch profile 下 `cordis.patch.yml` 的字节。

### [P1] 验证技能清单返回 skills 数组且不含 error

[Case ID] TC-EXT-L2-07-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/host/routes/skills/get.ts:6`
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:60`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:71`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:80`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:91`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:109`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:122`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:136`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:150`）
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
[自动化] 是（`test/e2e/plugins/07-dsh-tauri-panel-extension.e2e.ts:170`）
[前置条件] 同 TC-EXT-L2-07-008
[测试数据] 同源 `Origin`（`new URL(inject('dshBaseUrl')).origin`，与 `Host` 一致）+ `x-forwarded-for: 10.0.0.1`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 403。2. 响应体 `error` 恰为 `untrusted origin`（转发头视为不可信）。
[实测] 403 + `untrusted origin`。同源 `Origin` 通过连接门与路由层 `isCrossOrigin`，拒绝确由插件 handler 的转发头判据给出，与预期一致。
[清理] 无

---

## 3. L2：客户端（真实浏览器页面，未接线）

### [P1] 验证扩展面板渲染并按顺序激活首个标签

[Case ID] TC-EXT-C-07-001
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-panel-extension/src/client/components/extension-panel.tsx:37`
[自动化] 未接线（`00-overview.md` G2）
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
[自动化] 未接线（G2）
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
[自动化] 未接线（G2）
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
[自动化] 待接线（L3 通道尚未接入：需真实 Tauri 窗口并在内嵌 iframe 内驱动，`00-overview.md` G6；`desktop` project 已配置，见该文 G4）
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
| `/host/restart` 双重拒绝 | TC-EXT-L2-07-008、TC-EXT-L2-07-009 | 异常 | 409「由壳层接管」分支只在壳层内触发，**未覆盖**；两条均由插件 handler 判决，未被上游围栏遮蔽 |
| 面板与标签 | TC-EXT-C-07-001、TC-EXT-C-07-002、TC-EXT-L3-07-001 | 正向 | 依赖浏览器驱动 / `desktop` project |
| 市场标签缺席 | TC-EXT-C-07-003 | 异常 | 依赖未安装市场插件的前置 |
| 技能写入 / 只读 403 / 422 | — | — | **未覆盖**：会改用户技能目录，留待带备份的专项批次 |

---

## 6. 缺口与假设

- **G-EXT-1**：`POST /skills/refresh` 与 `POST /import/apply` 无同步完成点（provider remount 是异步的），E2E 需轮询 `GET /skills` 直到稳定；本文件不覆盖这两条。
- **G-EXT-2**：市场标签页依赖外部市场插件发布 `market.render`（`packages/dsh-tauri-panel-extension/src/client/service/market.ts:32`），本包无法自足构造。
- **G-EXT-3**：`packagedSkillsDir()` 指向的 `skills` 目录在本 checkout 内无 git 文件；随包分发技能的有无**待确认**，相关断言暂不成立。实测 `GET /skills` 返回的行全部来自运行机用户目录（`~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`，`provider: filesystem`），随包技能未出现在结果中。
- **G-EXT-4**：**scratch 隔离不覆盖技能发现**。`globalSetup` 只重定向 `DSH_HOME`，而 `skills` 服务仍扫描运行机真实用户目录，因此 `GET /skills` 的条数随开发者机器变化（本机实测 32 行）。影响：TC-EXT-L2-07-001 的「无技能」前提不可达，已改为只断言数组结构与每行 `name`；任何后续依赖技能清单内容或条数的用例都必须在断言前先过滤到 scratch 作用域内的行，否则不可复现。**判定：产品行为符合「扩展管理面板聚合本机技能」的语义，非缺陷；属 E2E 隔离性缺口。**
- **G-EXT-5**：`POST /host/restart` 的 403 实测确由插件 handler 给出（`untrusted origin`），未被上游 Host/Origin 围栏遮蔽——`isTrustedApiRequest` 仅在「`Origin` 与 `Host` 不符」或 `sec-fetch-site: cross-site` 时拒绝，故无 `Origin`（-008）与同源 `Origin`（-009）都能落到 handler。异源 `Origin` 的重启请求会先在连接门拿到 `forbidden`，该形态本批不覆盖（对照 `00-overview.md` G10）。
- **假设**：`SKILLS_DATA_DIR = $DSH_HOME/skills`（`packages/dsh-tauri-panel-extension/src/host/config/constants.ts:5`）；用例不直接读写该目录，只经路由观察。
- **假设**：MCP 行的落盘位置是 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`（`src/host/config/constants.ts:9` + `src/host/service/profile.ts:14`）；TC-EXT-L2-07-004 以此文件为「配置未被改写」的观测对象。
