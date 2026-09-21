# dsh-tauri-session：会话归档资源与工作区菜单补丁

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：`test/e2e/plugins/04-dsh-tauri-session.e2e.ts`（本文件 §2 的 9 条 L2 用例已落地并全绿）；客户端与 L3 见各用例标注
> 前置：`pnpm build:plugins`；L3 另需 debug 二进制 + 空闲端口
> 运行：L2 `pnpm test:e2e:plugin`；L3 见 `00-overview.md` §5.2

本插件是**方法矩阵最复杂**的路由面：9 条 `(方法, 路径)` 收敛为 5 条注册行，且 `DELETE` 也要求 JSON 请求体——这一点与常规 REST 直觉相反，是本文件的主要负向考点。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-session'`；分区 order 220 | `packages/dsh-tauri-session/src/shared/constants.ts:4`、`packages/dsh-tauri-session/src/shared/constants.ts:7` |
| 5 条注册行 / 9 条 `(方法,路径)` | `packages/dsh-tauri-session/src/host/routes/index.ts:19`、`packages/dsh-tauri-session/src/host/routes/index.ts:23`、`packages/dsh-tauri-session/src/host/routes/index.ts:26`、`packages/dsh-tauri-session/src/host/routes/index.ts:29`、`packages/dsh-tauri-session/src/host/routes/index.ts:30` |
| `GET /session/archive` 直接回读账本 | `packages/dsh-tauri-session/src/host/routes/session/archive/get.ts:5` |
| `POST`/`DELETE /session/archive` 空 id → 400 `invalid-session-id` | `packages/dsh-tauri-session/src/host/routes/session/archive/post.ts:8`、`packages/dsh-tauri-session/src/host/routes/session/archive/delete.ts:8` |
| `POST`/`DELETE …/archive/clear` 共用同一处理器 | `packages/dsh-tauri-session/src/host/routes/index.ts:23` |
| 空归档集合执行永久删除会抛 `缺少 sessionIds`（该文案只进宿主日志，不下发客户端） | `packages/dsh-tauri-session/src/host/service/archive.ts:62` |
| `POST`/`DELETE …/archive/restore` 缺 id → 400；未知 id → 200 `{ ok: true }` | `packages/dsh-tauri-session/src/host/routes/session/archive/restore/post.ts:8`、`packages/dsh-tauri-session/src/host/service/ledger.ts:52` |
| 工作区批量入参空 → 400 `invalid-session-ids`；含非字符串项则被 `map(String)` 强转后转发 | `packages/dsh-tauri-session/src/host/routes/session/workspace/archive/post.ts:7`、`packages/dsh-tauri-session/src/host/routes/session/workspace/archive/post.ts:10` |
| `open/path` 失败 → 400（`session-directory-not-found` / `not-a-directory`） | `packages/dsh-tauri-session/src/host/routes/session/open/path/post.ts:14`、`packages/dsh-tauri-session/src/host/service/session.ts:55` |
| 客户端分区 id `dsh-tauri-session-archive`；仅注册 `settings.section` | `packages/dsh-tauri-session/src/client/constants/index.ts:7`、`packages/dsh-tauri-session/src/client/register/archive-section.ts:18` |
| 工作区菜单补丁标记 | `packages/dsh-tauri-session/src/client/constants/index.ts:31`、`packages/dsh-tauri-session/src/client/constants/index.ts:32` |
| 补丁识别官方项依赖中文/英文文案与 `[class*="itemWrap"]` | `packages/dsh-tauri-session/src/client/constants/index.ts:22`、`packages/dsh-tauri-session/src/client/register/workspace-patch.utils.ts:57` |
| 无 Tauri 桥；禁用官方 `ui-settings-unarchive-sessions` 后由本插件顶替 | `packages/dsh-tauri-session/src/client/apis/index.ts:11`、`packages/dsh-tauri-session/cordis.patch.yml:3` |

---

## 2. L2：宿主路由

### [P1] 验证归档清单在干净环境返回空集合与固定形状

[Case ID] TC-SESS-L2-04-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-session/src/host/routes/session/archive/get.ts:5`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:68`）
[前置条件] scratch `DSH_HOME` 全新（无历史归档）
[测试数据] `GET /api/desktop/dsh-tauri-session/session/archive`
[测试步骤] 1. 发起请求。2. 读状态码与响应体 JSON。
[预期结果] 1. 状态码 200。2. 响应体恰为 `{ "archivedSessionIds": [], "meta": {} }`（两字段都存在，不允许省略 `meta`）。
[清理] 无

### [P3] [反向] 验证归档写入缺 sessionId 返回 400

[Case ID] TC-SESS-L2-04-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-session/src/host/routes/session/archive/post.ts:8`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:80`）
[前置条件] 同 TC-SESS-L2-04-001
[测试数据] `POST` 同路径，body `{}`；再以 `{ "sessionId": 123 }` 重复一次
[测试步骤] 1. 两次发起请求。2. 读状态码与响应体。
[预期结果] 1. 两次均 400。2. 响应体均为 `{ ok: false, error: 'invalid-session-id' }`（非字符串同样被拒）。3. `GET` 清单仍为空（未产生副作用）。
[清理] 无

### [P3] [反向] 验证 DELETE 也按 JSON 读体，缺参同样 400

[Case ID] TC-SESS-L2-04-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-session/src/host/routes/session/archive/delete.ts:6`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:100`）
[前置条件] 同 TC-SESS-L2-04-001
[测试数据] `DELETE` 同路径，无 body
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400（不是 204 也不是 405）。2. 响应体 `{ ok: false, error: 'invalid-session-id' }`。
[清理] 无

### [P4] 验证空归档集合下执行「清空」的当前行为

[Case ID] TC-SESS-L2-04-004
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-session/src/host/service/archive.ts:62`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:107`）
[前置条件] 归档集合为空（全新 scratch）
[测试数据] 对 `/session/archive/clear` 分别发起 `POST` 与 `DELETE`
[测试步骤] 1. 发起 `POST`，读状态码与响应体。2. 发起 `DELETE`，读状态码与响应体。
[预期结果] 1. 当前实现两者均返回 500，响应体为宿主未处理异常的标准载荷 `{"status":500,"unhandled":true,"message":"HTTPError"}`。2. 抛出的领域文案 `缺少 sessionIds` 只出现在宿主日志，**不下发客户端**（实测修正，见 G-SESS-4）。3. `GET` 清单仍为空。
[清理] 无

### [P3] [反向] 验证工作区批量归档缺 ids 返回 400

[Case ID] TC-SESS-L2-04-005
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-session/src/host/routes/session/workspace/archive/post.ts:10`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:123`）
[前置条件] 同 TC-SESS-L2-04-001
[测试数据] `POST /session/workspace/archive`，body `{}` 与 `{ "sessionIds": [] }`
[测试步骤] 1. 两次发起请求。2. 读状态码与响应体。
[预期结果] 1. 两次均 400。2. 响应体 `{ ok: false, error: 'invalid-session-ids' }`。
[清理] 无

### [P3] [反向] 验证打开不存在会话的目录返回领域错误

[Case ID] TC-SESS-L2-04-006
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-session/src/host/routes/session/open/path/post.ts:14`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:141`）
[前置条件] 同 TC-SESS-L2-04-001；系统文件管理器动作不会真正执行（目录不存在）
[测试数据] `POST /session/open/path`，body `{ "sessionId": "does-not-exist" }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 400。2. 响应体 `{ ok: false, error: 'session-directory-not-found' }`。3. 不产生系统打开动作。
[清理] 无

### [P4] 验证五条注册行的方法矩阵互不相同

[Case ID] TC-SESS-L2-04-007
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-session/src/host/routes/index.ts:19`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:152`）
[前置条件] 同 TC-SESS-L2-04-001
[测试数据] 对 `/session/archive`、`/session/archive/clear`、`/session/workspace/archive`、`/session/archive/restore`、`/session/open/path` 各发一次 `OPTIONS`
[测试步骤] 1. 逐一 `OPTIONS`。2. 读每条响应的 `allow` 头。
[预期结果] 1. `/session/archive` 的 `allow` 含 `GET`、`HEAD`、`POST`、`DELETE`。2. `/session/archive/clear` 与 `/session/workspace/archive` 含 `POST`、`DELETE` 而不含 `GET`。3. `/session/archive/restore` 与 `/session/open/path` 只含 `POST`（HEAD 不适用）。4. 每条都含 `OPTIONS` 且状态码 204。
[清理] 无

### [P3] [反向] 验证取消归档缺 sessionId 返回 400 且未知 id 幂等成功

[Case ID] TC-SESS-L2-04-008
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-session/src/host/routes/session/archive/restore/post.ts:8`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:168`）
[前置条件] 归档集合为空（全新 scratch）
[测试数据] `POST /session/archive/restore`，body `{}`；再以 `{ "sessionId": "does-not-exist" }` 重复一次
[测试步骤] 1. 两次发起请求。2. 读状态码与响应体。3. `GET` 回读归档清单。
[预期结果] 1. 缺 `sessionId` → 400 + `{ ok: false, error: 'invalid-session-id' }`。2. 未归档的 id → **200** + `{ ok: true }`（实测修正：`ledger.remove` 对不在归档集合中的 id 为空操作——`difference(archived, ids)` 长度不变即不写状态，所以既不是 400 也不是 500）。3. `GET` 清单仍为空且 `meta` 为 `{}`。
[清理] 无

### [P4] [反向] 验证工作区批量归档对非字符串 id 的当前行为

[Case ID] TC-SESS-L2-04-009
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-session/src/host/routes/session/workspace/archive/post.ts:7`
[自动化] 是（`test/e2e/plugins/04-dsh-tauri-session.e2e.ts:188`）
[前置条件] 归档集合为空（全新 scratch）
[测试数据] `POST /session/workspace/archive`，body `{ "sessionIds": [123] }`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。3. `GET` 回读归档清单。
[预期结果] 1. 状态码 **500**（不是 400）。2. 响应体为宿主未处理异常的标准载荷 `{"status":500,"unhandled":true,"message":"HTTPError"}`。3. 机制：`map(String)` 把 `123` 强转成 `'123'`，`length === 0` 的入参校验被绕过，请求被转发到 `archive.archiveWorkspace(['123'])`，宿主 `archiveSession` 以 `WorkspaceUnknownSessionError: cannot archive session '123': live sessions and session persistence hold no such session` 拒绝（实测修正，见 G-SESS-5）。4. `GET` 清单仍为空。
[清理] 无

---

## 3. L2：客户端（真实浏览器页面，未接线）

### [P1] 验证设置分区出现「已归档会话」页面

[Case ID] TC-SESS-C-04-001
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-session/src/client/register/archive-section.ts:18`
[自动化] 未接线（`00-overview.md` G2）
[前置条件] iframe 内 dsh 界面已加载；官方 `ui-settings-unarchive-sessions` 已被 patch 关闭
[测试数据] 无
[测试步骤] 1. 等待槽位注册完成。2. 断言 id 为 `dsh-tauri-session-archive` 的分区存在。3. 断言同 id 的分区只有 1 个。4. 收集 `pageerror`。
[预期结果] 1. 分区存在且唯一（patch 生效则官方分区不出现）。2. 分区内可见搜索框与空态容器。3. `pageerror` 为空。
[清理] 关闭页面

### [P2] 验证工作区菜单被插入归档入口

[Case ID] TC-SESS-C-04-002
[层级] L2（真实浏览器页面，未接线）
[类型] 正向
[追踪] `packages/dsh-tauri-session/src/client/register/workspace-patch.tsx:87`
[自动化] 未接线（G2）
[前置条件] 页面存在工作区行的「…」按钮与官方「删除工作区」菜单项
[测试数据] 点击工作区行的「…」按钮
[测试步骤] 1. 打开菜单。2. 查询 `[data-dsh-tauri-session-archive-menu-patched="1"]`。3. 查询其内 `[data-dsh-tauri-session-archive-item]`。
[预期结果] 1. 菜单容器带补丁标记。2. 存在恰好 1 个归档项，且位置在官方「删除工作区」项之前。
[清理] 关闭菜单

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P2] 验证桌面端设置对话框内可打开归档面板

[Case ID] TC-SESS-L3-04-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-session/src/client/register/archive-section.ts:18`
[自动化] 待接线（L3 通道尚未接入）
[前置条件] 应用就绪；iframe 内 dsh 界面加载完成
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话。2. 切到 iframe 并打开设置。3. 定位 id `dsh-tauri-session-archive` 的分区并读其标题。
[预期结果] 1. 分区存在。2. 标题文案为 `已归档会话`（中文 locale）。3. 面板内出现空态容器而非错误条。
[清理] `DELETE /session/<id>`

### [P4] [反向] 验证点击克隆出的归档项不会触发官方删除动作

[Case ID] TC-SESS-L3-04-002
[层级] L3（真实 Tauri 窗口）
[类型] 边界
[追踪] `packages/dsh-tauri-session/src/client/register/workspace-patch.tsx:125`
[自动化] 待接线（L3 通道尚未接入）
[前置条件] 存在至少 1 个真实工作区；已打开其「…」菜单
[测试数据] 点击 `[data-dsh-tauri-session-archive-item]`
[测试步骤] 1. 记录点击前工作区数量。2. 点击归档项。3. 关闭弹出的确认对话框。4. 重新读取工作区数量。
[预期结果] 1. 官方菜单关闭且未触发「删除工作区」。2. 工作区数量不变（未删除）。3. 归档项点击后 `session/archive` 清单增加对应 id。
[清理] 取消归档并删除 scratch 状态

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `get.ts:5` 清单形状 | TC-SESS-L2-04-001 | 正向 | — |
| `post.ts:8` / `delete.ts:8` 入参校验 | TC-SESS-L2-04-002、TC-SESS-L2-04-003 | 异常 | — |
| `archive.ts:62` 空集合清理 | TC-SESS-L2-04-004 | 边界 | 当前行为与「幂等」直觉冲突，待产品确认 |
| `workspace/archive/post.ts:10` | TC-SESS-L2-04-005 | 异常 | — |
| `workspace/archive/post.ts:7` 非字符串项强转 | TC-SESS-L2-04-009 | 边界 | 实测为 500 未处理异常而非 400，**疑似缺陷**（G-SESS-5） |
| `restore/post.ts:8` 入参校验与未知 id | TC-SESS-L2-04-008 | 异常 | 未归档 id 实测 200 幂等成功；「归档→恢复」的真实历史态流转仍缺，见 G-SESS-2 |
| `open/path/post.ts:14` | TC-SESS-L2-04-006 | 异常 | `not-a-directory` 分支需要真实存在但非目录的路径，**未覆盖** |
| `routes/index.ts:19` 方法矩阵 | TC-SESS-L2-04-007 | 边界 | 与 `01-dsh-host-and-core-contract.md` 的 405 用例不重复（此处只验 `allow` 集合） |
| 分区注册 | TC-SESS-C-04-001、TC-SESS-L3-04-001 | 正向 | 依赖浏览器驱动 / `desktop` project |
| 工作区菜单补丁 | TC-SESS-C-04-002、TC-SESS-L3-04-002 | 正向 / 边界 | 依赖真实工作区数据 |
| `restore` 与 `clear` 的历史态流转 | TC-SESS-L2-04-008（仅入参/未知 id 侧） | 异常 | **未覆盖**：归档→恢复→删除的完整流转需要宿主会话生命周期配合，见 G-SESS-2 |

---

## 6. 缺口与假设

- **G-SESS-1**：`client/constants/index.ts:18` 与 `:19` 的 `SIDEBAR_ATTACH_POLL_MS` / `SIDEBAR_ATTACH_MAX_TRIES` 在 `src` 内零引用，疑为死常量。**不影响用例**，但清理后需复核本文件是否引用。
- **G-SESS-2**：归档→恢复→删除的完整历史态流转需要宿主真实会话配合（`archive.restore` 依赖 `workspaceRegistry`）。当前 scratch 宿主无会话数据，**未覆盖**；本次仅补齐了 `restore` 的入参校验与「未知 id」这一未触及分支（TC-SESS-L2-04-008，实测：缺参 400 `invalid-session-id`，未知 id 200 `{ ok: true }`）。剩余流转仍建议后续以「宿主 API 造一条会话」的方式补齐。
- **G-SESS-3**：工作区菜单补丁依赖官方中文/英文文案与 `[class*="itemWrap"]` 结构（`workspace-patch.utils.ts:57`）。宿主 UI 改版时补丁会静默不插入，因此 TC-SESS-C-04-002 的失败信息必须包含「菜单容器未带补丁标记」而非笼统超时。
- **G-SESS-4**：**实测修正 + 待确认期望**——在空归档集合上执行 `/session/archive/clear`（`POST` 与 `DELETE` 共用 `clearSessionArchive`），实测两者均返回 **500**，响应体为 `{"status":500,"unhandled":true,"message":"HTTPError"}`（宿主未处理异常的标准载荷）。原文档预期「错误信息含 `缺少 sessionIds`」**不成立**：该文案是 `permanentlyDelete` 抛出的 `Error('缺少 sessionIds')`（`packages/dsh-tauri-session/src/host/service/archive.ts:62`），而宿主把未处理异常统一序列化为 `HTTPError`，领域文案只落宿主日志（实测日志栈：`permanentlyDelete` → `Object.deleteAll`，`packages/dsh-tauri-session/dist/index.js:271` / `:259`）。TC-SESS-L2-04-004 已按实测行为固化，**疑似缺陷 / 待产品确认**：空集合清空是否应改为幂等返回 `{ ok: true }`，并确认 500 是否应改用可读的领域错误载荷；若判定为缺陷则同时补缺陷单，确认后本条期望与断言同步更新。
- **G-SESS-5**：**实测修正 + 疑似缺陷**——`POST /session/workspace/archive` 传 `{ "sessionIds": [123] }`（含非字符串项）时，实测返回 **500** + `{"status":500,"unhandled":true,"message":"HTTPError"}`，**不是**文档原先预期的 400 `invalid-session-ids`。机制：`packages/dsh-tauri-session/src/host/routes/session/workspace/archive/post.ts:7` 用 `body.sessionIds.map(String).filter(Boolean)` 做归一化，`123` 被强转成 `'123'`，于是 `:10` 的 `sessionIds.length === 0` 校验被绕过，请求进入 `archive.archiveWorkspace(['123'])`（`packages/dsh-tauri-session/src/host/service/archive.ts:20`）→ `ledger.save` → 宿主 `archiveSession`，被宿主以 `WorkspaceUnknownSessionError: cannot archive session '123': live sessions and session persistence hold no such session` 拒绝（宿主日志原文）。即：**类型错误被静默强转，最终以 500 未处理异常的形式暴露**，既不是明确的 400 入参错误，也不是可读的领域错误。TC-SESS-L2-04-009 已按实测 500 固化，**疑似缺陷 / 待产品确认**：是否应改为「非字符串项一律 400 `invalid-session-ids`」（与 `archive/post.ts:8` 的 `typeof body?.sessionId === 'string'` 严格校验对齐），或至少把宿主的未知会话错误转成可读的 4xx 领域载荷。
- **假设**：`POST /session/archive` 对**不存在的** sessionId 的行为由宿主 `archiveSession` 决定（`archive.ts:13`），本套用例不断言该分支。`restore` 对未知 id 的行为已实测（200 `{ ok: true }`，见 TC-SESS-L2-04-008）；两者不对称的根因是 `ledger.remove` 走 `difference` 空操作，而 `ledger.save` 直接把 id 交给宿主校验。
- **实测基线**：`node node_modules/vitest/vitest.mjs --project plugin --run test/e2e/plugins/03-dsh-tauri-rightclick.e2e.ts test/e2e/plugins/04-dsh-tauri-session.e2e.ts test/e2e/plugins/05-dsh-tauri-worktree.e2e.ts` → **Test Files 3 passed（3）/ Tests 21 passed（21）**，其中本文件 **9 passed / 0 failed**（复用 `globalSetup` 共享宿主，全部产品可见插件已挂载，核心 `0.1.5-rc.2`）。
