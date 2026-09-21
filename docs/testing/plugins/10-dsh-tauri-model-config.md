# dsh-tauri-model-config：模型设置页与端点探测

> 层级：L2 插件宿主 E2E → L3 桌面端宿主 E2E
> 自动化：`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts`（§2 的 4 条 L2 用例已落地并全绿；另 1 条为不可自动化）；客户端与 L3 见各用例标注
> 前置：`pnpm build:plugins`；预设端点需要联网（未联网但已有缓存时按 `stale` 分支返回 200）
> 运行：L2 `pnpm test:e2e:plugin`；L3 见 `00-overview.md` §5.2

本插件**顶替了官方模型设置页**（通过 cordis patch 关闭 `ui-settings-models`），因此它的失败会直接表现为「用户看不到模型配置」。渐进顺序：**只读预设** → **端点探测失败** → **打开配置文件** → **设置页接管**。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| `PLUGIN_ID = 'dsh-tauri-model-config'`；设置文件名 `settings.yaml` | `packages/dsh-tauri-model-config/src/shared/constants.ts:1`、`packages/dsh-tauri-model-config/src/shared/constants.ts:4` |
| **5 条**路由：`GET`/`PUT /config/editor`、`GET /endpoint/models`、`GET /presets`、`POST /config/open`（路径前缀 `/api/desktop/dsh-tauri-model-config`） | `packages/dsh-tauri-model-config/src/host/routes/index.ts:9-13` |
| 端点/预设失败 → 502 `{ok:false,error}` | `packages/dsh-tauri-model-config/src/host/routes/endpoint/models/get.ts:14`、`packages/dsh-tauri-model-config/src/host/routes/presets/get.ts:9` |
| 预设成功 → 200 **恰六字段** `{ok,source,fetchedAt,stale,count,presets}`，`count` 为条目数 | `packages/dsh-tauri-model-config/src/host/routes/presets/get.ts:13` |
| 打开配置失败 → 500 `{ok:false,path,error}` | `packages/dsh-tauri-model-config/src/host/routes/config/open/post.ts:8` |
| 设置文件不存在时退化为打开目录（`opened:'directory'`，`path` 为 `dirname(settings.yaml)`） | `packages/dsh-tauri-model-config/src/host/service/config-file.ts:36-44` |
| 预设磁盘缓存路径与 24h TTL，失败回退过期缓存并标 `stale` | `packages/dsh-tauri-model-config/src/host/utils/paths.ts:30`、`packages/dsh-tauri-model-config/src/shared/model-presets.ts:22`、`packages/dsh-tauri-model-config/src/host/service/model-presets.ts:118` |
| 无缓存且上游失败 → `{ok:false,error}`（路由再翻成 502） | `packages/dsh-tauri-model-config/src/host/service/model-presets.ts:120` |
| 端点探测超时 15s；预设上游超时 20s | `packages/dsh-tauri-model-config/src/host/service/endpoint-models.ts:28`、`packages/dsh-tauri-model-config/src/host/service/model-presets.ts:18` |
| 客户端槽位：`settings.section`（id `models`，order 10）+ `settings.onboarding` ×2 | `packages/dsh-tauri-model-config/src/client/register/models.ts:64`、`packages/dsh-tauri-model-config/src/client/register/models.ts:75` |
| patch 关闭官方 `ui-settings-models` | `packages/dsh-tauri-model-config/cordis.patch.yml:4` |
| 无 `data-dsh-*` 标记；可用 `aria-label` / `role` / slot id | 全包 `src/client` 检索无命中 |

---

## 2. L2：宿主路由

### [P1] 验证预设端点返回固定结构

[Case ID] TC-MC-L2-10-001
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/host/routes/presets/get.ts:13`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:76`）
[前置条件] 用例内按被测实现的缓存格式向 scratch `DSH_HOME/dsh-tauri-model-config/model-presets.json` 种一份 24h TTL 内的新鲜载荷（`{source, fetchedAt, presets}`，每行四元数组）
[测试数据] `GET /api/desktop/dsh-tauri-model-config/presets`
[测试步骤] 1. 种缓存。2. 发起请求。3. 读状态码与响应体字段。4. 比对 `count` 与 `presets` 条目数。
[预期结果] 1. 状态码 200。2. 响应体**恰为** `ok`、`source`、`fetchedAt`、`stale`、`count`、`presets` 六个字段（集合等值，多字段即失败）。3. `ok` 恰为 `true`、`source` 为非空上游 URL、`fetchedAt` 可解析为时间、`stale` 为布尔、`count` 为数字。4. `presets` 非空且 `count` 等于其条目数，每条目为四元数组。
[核查说明] **按实测改写（G-MC-9）**：原前置假定「共享宿主已在联网下抓过一次，24h TTL 缓存使后续请求稳定 200」，但 scratch `DSH_HOME` 每次运行都是全新的——上游不可达时既无内存也无磁盘缓存，实测全车道下该断言退化成 502（单文件跑则可能 200），断言随机器/网络漂移。改为用例自种缓存后，本用例验证的是**响应契约本身**且与外网解耦，确定性成立。
[清理] 无

### [P3] [反向] 验证断网且无缓存时预设返回 502

[Case ID] TC-MC-L2-10-002
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-model-config/src/host/service/model-presets.ts:120`
[自动化] 待补 / **本 worktree 不可自动化**（需构造「无缓存 + 上游不可达」；见 §6 G-MC-4）
[前置条件] scratch `DSH_HOME` 下不存在 `dsh-tauri-model-config/model-presets.json`，且外部网络不可达
[测试数据] `GET /presets?force=true`
[测试步骤] 1. 发起请求。2. 读状态码与响应体。
[预期结果] 1. 状态码 502。2. 响应体 `ok` 为 false 且 `error` 为非空字符串。3. 未写入新的缓存文件。
[清理] 恢复网络

<!-- 该条刻意不写 it()：`?force=true` 的走向取决于运行机当时能否连上公网，「无缓存 + 上游不可达」
     无法在 E2E 里确定性构造（G-MC-9 记录了离线时该分支确实被观测到）。写进去就是随网络漂移的用例。
     不写恒绿/伪造断网的用例。 -->

### [P3] [反向] 验证端点探测缺少可用 endpoint 时返回 502

[Case ID] TC-MC-L2-10-003
[层级] L2（真实 dsh 进程）
[类型] 异常
[追踪] `packages/dsh-tauri-model-config/src/host/service/endpoint-models.ts:77`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:113`）
[前置条件] scratch `DSH_HOME/settings.yaml` 中无模型端点配置
[测试数据] `GET /endpoint/models?ns=nope`（**实测修正**：`?ns=` 空串不走 502 分支，见 §6）
[测试步骤] 1. 发起请求。2. 读状态码与响应体。3. 检索响应体与 `set-cookie` 中的密钥字段名。
[预期结果] 1. 状态码 502。2. 响应体 `ok` 为 false，`error` 非空。3. 响应体与响应头内**均不含** `apiKey`、`api_key`、`key`、`token` 任一子串（不回显凭据）。
[清理] 无

### [P2] 验证打开配置文件端点返回路径与打开方式

[Case ID] TC-MC-L2-10-004
[层级] L2（真实 dsh 进程）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/host/routes/config/open/post.ts:12`
[自动化] 是（会拉起系统文件管理器，仅限受控环境）（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:128`）
[前置条件] 同 TC-MC-L2-10-003；已知本用例会真实拉起系统文件管理器（§6 G-MC-5）
[测试数据] `POST /config/open`（无 body）
[测试步骤] 1. 发起请求。2. 读状态码与响应体。3. 比对 `path` 与 `inject('dshHome')` 的从属关系。
[预期结果] 1. 状态码 200。2. 响应体含 `ok: true`、`path`（绝对路径，位于 scratch `DSH_HOME` 之下）、`opened` 且取值为 `file` 或 `directory` 之一。
[清理] 关闭被拉起的文件管理器（人工）

### [P4] 验证设置文件缺失时退回打开目录

[Case ID] TC-MC-L2-10-005
[层级] L2（真实 dsh 进程）
[类型] 边界
[追踪] `packages/dsh-tauri-model-config/src/host/service/config-file.ts:36-44`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:145`）
[前置条件] scratch `DSH_HOME/settings.yaml` **不存在**：用例内**先显式删除**再断言（同车道的浏览器用例确认「内测声明」会把它写出来，共享 scratch `DSH_HOME` 不再保证「缺失」这一初始态，见 G-MC-9）
[测试数据] `POST /config/open`（无 body）
[测试步骤] 1. 删除 `settings.yaml` 并断言其不存在。2. 发起请求。3. 读 `opened` 与 `path` 字段。
[预期结果] 1. 状态码 200。2. `opened` 恰为 `directory`。3. `path` 恰为 scratch `DSH_HOME` 目录本身（`dirname(settings.yaml)`）。
[清理] 关闭被拉起的文件管理器（人工）

---

## 3. L2：客户端（真实浏览器页面）

> 本组由 `test/e2e/support/browser.ts` 驱动：真实 Chromium + 同源嵌入文档 + `globalSetup` 的会话 Cookie。
> **L3 收敛**：原 §4 的 `TC-MC-L3-10-001` 断言的是模型分区 / 提供商卡片 / 页脚——全是嵌在 dsh iframe 内部的
> DOM，不是 Tauri 原生产物，故**降级为浏览器断言**并已落地（见 `TC-MC-C-10-003` 的成功路径同源覆盖），
> 本文件不再占用 `desktop` 车道。

### [P1] 验证模型设置分区由本插件接管

[Case ID] TC-MC-C-10-001
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/client/register/models.ts:64`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:176`）
[前置条件] iframe 内 dsh 界面已加载；cordis patch 已应用
[测试数据] 无
[测试步骤] 1. 打开设置。2. 读设置导航标签集合。3. 点开「模型」分区。4. 读分区内容文本与错误条。
[预期结果] 1. 导航里存在「模型」。2. 「模型」分区**恰好 1 个**（官方 `ui-settings-models` 已被 patch 关闭）。3. 点开后分区内容非空且含「提供商/模型」字样。4. 无应用级错误。
[核查说明] 注册 id `models` 与 order `10` **不出现在 DOM 里**（导航只渲染 `label`，见 G-MC-6），故「排在首位」不以序号断言，改以「唯一 + 内容落到本插件模型页」断言。
[清理] 关闭设置

### [P2] 验证官方提供商引导弹层由本插件的 onboarding 槽位渲染且可收起

[Case ID] TC-MC-C-10-002
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/client/register/models.ts:75`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:205`；**按实测改写**，见 G-MC-7）
[前置条件] 全新 scratch profile（无 DeepSeek 凭据），iframe 内 dsh 界面已加载
[测试数据] 无
[测试步骤] 1. 新建内嵌 dsh 页面且**不预先关弹层**。2. 等「带输入控件的 API Key 引导弹层」——先到的「内测声明」没有输入控件，被逐个关掉。3. 读弹层文本、输入控件数与错误条。4. 点引导弹层的取消项。
[预期结果] 1. 出现带凭据输入的 API Key 引导弹层（`[role="dialog"][aria-modal="true"]`）。2. 弹层内渲染出官方 DeepSeek 提供商卡片。3. 至少一个可输入字段。4. 无错误条、无应用级错误。5. 点取消项后弹层收起（`complete()` 生效，弹层数归零）。
[核查说明] 原设计要求按注册 id `welcome-notice` / `deepseek-official` 定位两行 **onboarding** 并断言顺序；实测 `[data-slot="settings.onboarding"]` 在设置对话框 DOM 里 **0 命中**——该槽位的组件是**首屏阻塞弹层形态**（`OnboardingModal` 把 `Modal.onClose` 写成空实现，点遮罩/按 Esc 都关不掉，只有点正向按钮才 `complete()`），且关闭状态按帧内页面加载判定、不落盘。本轮按可观察事实改写为「弹层出现 → 内容正确 → 取消项可收起」三段正向断言；两行注册项的顺序断言留待专项（见 G-MC-7）。
[清理] 关闭页面

### [P3] [反向] 验证预设获取失败时模型页仍可交互

[Case ID] TC-MC-C-10-003
[层级] L2（真实浏览器页面）
[类型] 异常
[追踪] `packages/dsh-tauri-model-config/src/client/models/ModelsSection.tsx:306`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:267`；**断言面按实测收窄**，见 G-MC-8）
[前置条件] 用 Playwright 路由桩把 `/presets` 改成 502
[测试数据] 桩体 `{"ok":false,"error":"e2e-stubbed-upstream-failure"}`
[测试步骤] 1. 装桩并断言它真的被请求（计数 > 0）。2. 打开设置并点开「模型」。3. 读分区文本、按钮数、输入框数与错误条。4. 收集应用级错误。
[预期结果] 1. 桩被命中（否则本条空转）。2. 页面其余部分仍渲染（非整页崩溃）且保留可交互入口与可编辑字段。3. 不出现 `entry.error` 级错误条。4. **无未捕获异常**（允许浏览器对 502 响应留一条 console 记录）。
[清理] 关闭设置

### [P2] 验证模型页渲染提供商卡片与页脚操作区

[Case ID] TC-MC-C-10-004
[层级] L2（真实浏览器页面）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/client/models/ModelsSection.tsx`
[自动化] 是（`test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts:234`）
[前置条件] iframe 内 dsh 界面已加载；模型分区可打开
[测试数据] 无
[测试步骤] 1. 打开设置并点开「模型」。2. 读分区文本、卡片/提供商/装配类元素数、按钮数、错误条与导航标签。
[预期结果] 1. 分区文本非空。2. 渲染出提供商卡片（或以「暂无/添加」等明确空态文案表达）。3. 页脚操作区至少有可交互按钮。4. 预设可用时无错误条。5. 同 id 分区不得重复（patch 生效守卫）。6. 无应用级错误。
[清理] 关闭设置

---

## 4. L3：桌面端宿主（真实 Tauri 窗口）

### [P1] 验证桌面端可打开模型设置页并看到提供商卡片

[Case ID] TC-MC-L3-10-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `packages/dsh-tauri-model-config/src/client/register/models.ts:64`
[自动化] 待接线（`desktop` project 未配置，`00-overview.md` G4）
[前置条件] 应用就绪；`<DSH_E2E_HOME>/home/.dsh.dev/settings.yaml` 存在（或允许首次生成）
[测试数据] 无
[测试步骤] 1. 建 WebDriver 会话并切到 iframe。2. 打开设置并进入模型分区。3. 查询模型卡片与页脚区域。
[预期结果] 1. 模型分区可见。2. `settings.models.provider-card` 槽位至少渲染 1 张卡片（或明确的空态）。3. `settings.models.footer` 槽位渲染页脚操作区。4. 应用日志无 `dsh://plugin-error`。
[清理] `DELETE /session/<id>`

---

## 5. 追踪矩阵

| 来源 | 覆盖 Case ID | 覆盖类型 | 缺口备注 |
| --- | --- | --- | --- |
| `/presets` 成功结构 | TC-MC-L2-10-001 | 正向 | 实测六字段恰为 `count,fetchedAt,ok,presets,source,stale`，`count=1574`；缓存使该条不再依赖当次网络 |
| 无缓存 + 断网 → 502 | TC-MC-L2-10-002 | 异常 | **不可自动化**：`?force=true` 的走向取决于运行机当时能否连公网，「无缓存 + 上游不可达」无法确定性构造（离线时该分支已被观测到，见 G-MC-9） |
| `/endpoint/models` 无 endpoint → 502 | TC-MC-L2-10-003 | 异常 | 实测 `?ns=nope` → 502；`?ns=` 空串 → 500 未处理 HTTPError，已改写测试数据 |
| `/config/open` 成功 | TC-MC-L2-10-004 | 正向 | 有真实系统副作用（拉起 explorer，G-MC-5） |
| 文件缺失 → directory | TC-MC-L2-10-005 | 边界 | 前置由用例自建（先删除 `settings.yaml`）；实测 `opened='directory'`、`path===DSH_HOME`（G-MC-9） |
| 分区接管 | TC-MC-C-10-001、TC-MC-L3-10-001 | 正向 | 均已落地：`-C-10-001` 在浏览器层；`-L3-10-001` 按 L3 收敛原则并入同一条断言面 |
| 引导槽位 | TC-MC-C-10-002 | 正向 | 已落地为「同槽位的官方提供商卡片」（两行 onboarding 不在设置对话框 DOM 里，见 G-MC-7） |
| 失败可见性 | TC-MC-C-10-003 | 异常 | 已落地：桩化 `/presets` → 502，断言「仍可交互 + 无未捕获异常」（见 G-MC-8） |
| 模型页正向渲染 | TC-MC-C-10-004 | 正向 | 已落地：提供商卡片（或明确空态）+ 页脚操作区 + 同 id 分区唯一；本条对应 `it('验证模型页渲染提供商卡片与页脚操作区')`，补登记以维持文档↔`it()` 1:1 |
| `GET`/`PUT /config/editor`、编辑器偏好读写 | — | — | **未覆盖**：属于「偏好读写」而非本批的模型配置主链；两路由已登记进 §1 基线 |
| 端点探测成功（真实 provider） | — | — | **未覆盖**：需要真实 API Key 与外部服务 |
| `stale: true` 回退 | — | — | **未覆盖**：需要「先有缓存、后断网」的两段式构造 |

---

## 6. 缺口与假设

- **实测结论（L2 4/5 条全绿）**：`GET /presets` → 200，响应体键集合恰为 `[count,fetchedAt,ok,presets,source,stale]`，`stale:false`，`count=1574 === presets` 条目数，`source=https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`；`GET /endpoint/models?ns=nope` → 502 `{"ok":false,"error":"settings namespace \"nope\" names no endpoint to read"}`；`POST /config/open` → 200 `{"ok":true,"path":"C:\\Users\\<user>\\AppData\\Local\\Temp\\dsh-e2e-dsh-tauri-pet-<ts>","opened":"directory"}`，`path` 即 scratch `DSH_HOME` 本身。四条均**与预期一致**，无需修正预期。
- **§1 基线修正**：文档原写「3 条路由」（`routes/index.ts:6`），实测注册 **5 条**（`packages/dsh-tauri-model-config/src/host/routes/index.ts:9-13`），遗漏 `GET`/`PUT /config/editor`；两条路由本批未写用例，已在 §5 登记为缺口。
- **G-MC-4（实测修正）**：TC-MC-L2-10-002 在 L2 **不可自动化**，故**不写 `it()`**。原因是双层叠加：(1) E2E 无「断网」构造能力；(2) 即便断网，globalSetup 的联网共享宿主已把预设写入内存与磁盘缓存（`packages/dsh-tauri-model-config/src/host/service/model-presets.ts:105-108`），任何带 `?force=true` 的后续请求在上游失败时都走 `model-presets.ts:118-119` 的 `stale:true` **200** 分支，永远到不了 `model-presets.ts:120` 的 502。该分支需移动网络命名空间或 L1 单测（`packages/dsh-tauri-model-config/src/host/service/`）覆盖，本批按可写条数记 4/5，批次 10 的 L2 实际条数为 4。
- **实测修正（未处理的空命名空间）**：TC-MC-L2-10-003 的测试数据由 `?ns=` 改为 `?ns=nope`。实测 `GET /endpoint/models?ns=` → **500** `{"status":500,"unhandled":true,"message":"HTTPError"}`：空串进入 `settings.get('')` 抛出未处理异常，不是「命名空间无 endpoint」的 502 分支。用例保留 502 这一设计意图原样，仅把可稳定复现的输入固定为不存在的命名空间；空串返回 500 属宿主未处理分支，登记为缺陷线索（**不**断言 500，避免把缺陷固化为契约）。
- **G-MC-5（真实系统副作用）**：TC-MC-L2-10-004 / 005 会在 Windows 上真实拉起 `explorer`（`packages/dsh-tauri/src/host/utils/open.ts:27-42`，`openDirectory` 对 win32 spawn `explorer <反斜杠路径>`）。实测两次请求各拉起一次资源管理器窗口。仅在受控环境执行；用例无法（也不应）自动关闭该窗口。
- **实测（前置修正）**：宿主首次启动本身**不**代生成 `settings.yaml`（单文件运行多次均为 `false`），但**同车道的浏览器用例会把「内测声明」的确认落盘**，共享 scratch `DSH_HOME` 因此不再是初始态。TC-MC-L2-10-005 改为**用例内先删除再断言**，不再依赖运行顺序。
- **G-MC-1**：服务端**从不回显密钥**（`packages/dsh-tauri-model-config/src/host/service/endpoint-models.ts:38`）。TC-MC-L2-10-003 因此显式断言响应体与 `set-cookie` 均不含 `apiKey`/`api_key`/`key`/`token` 子串——这是一条安全回归断言，不是业务断言。
- **G-MC-2**：客户端无可用的 `data-*` 标记（全包无命中），L3 断言只能依赖 slot id、`aria-label` 与 `role`。若后续按 `desktop.test.md` §5 补 `data-testid`，本文件选择器同步更新。
- **G-MC-3**：slot 互斥依赖 patch 生效（`packages/dsh-tauri-model-config/cordis.patch.yml:4`）。若 E2E 环境未应用 patch，会出现同 id 分区重复——TC-MC-C-10-001 的「恰好 1 个」断言即为该风险的守卫。
- **G-MC-6（实测，上游 DOM 事实）**：设置分区的注册 id（`models`）**不出现在 DOM 里**——`SettingsSidebar` 只渲染 `label`（`packages/dsh-tauri-ui/src/client/components/sidebar.tsx:113-127`）。因此 TC-MC-C-10-001 改为「导航标签 `模型` 唯一 + 点开后内容落到本插件模型页」，不断言 id 与 order 序号；`order: 10` 的排序语义由 `dsh-tauri-ui` 的槽位投影负责，属上游行为，**未覆盖**。
- **G-MC-7（实测，断言面改写）**：原设计要求 `TC-MC-C-10-002` 按注册 id `welcome-notice` / `deepseek-official` 定位两行 onboarding，并断言 `order -100 < 0`。实测这两行**不在设置对话框 DOM 里**（设置侧栏打开后 `[id="welcome-notice"]` 与 `[id="deepseek-official"]` 均 0 命中），其形态是首屏弹层（harness 已按模态逐个关掉首个），余下状态取决于 `welcomeNoticeVersion` 未读标记与弹层生命周期。本轮改用**同一槽位**（`settings.onboarding`）上的官方 DeepSeek 提供商卡片作为可观察正向产物：槽位存在、卡片含 API 密钥字段与打开配置文件入口、至少一个输入框。两行的存在性与顺序断言留待「onboarding 生命周期」专项批次，**登记于此不静默丢弃**。
- **G-MC-8（实测，断言面收窄）**：`TC-MC-C-10-003` 原设计断言桩化 502 后出现 `role="alert"` 错误条。实测模型页的 `role="alert"` 只对 `entry.error` 渲染（`packages/dsh-tauri-model-config/src/client/models/ModelsSection.tsx:306`），预设表加载失败**不会**触发它；同时浏览器对 502 响应会留下一条 `Failed to load resource` 的 `console.error`（属浏览器行为，不是插件未捕获异常）。因此本轮按可观察事实收窄为「桩被命中 + 页面仍渲染且可交互 + 无 `entry.error` 级错误条 + 无未捕获异常（`PAGEERROR`）」。预设失败的用户可见提示形态属**未覆盖**，需先确认 `ModelsSection` 对 `presets.status !== 'ok'` 的实际呈现。
- **G-MC-9（实测，环境解耦）**：两条 L2 用例原先都建立在「scratch `DSH_HOME` 保持初始态」之上，全车道运行时均被证伪：① `TC-MC-L2-10-001` 依赖公网上游，离线且无缓存时退化为 502（单文件跑 200、全车道跑 502，断言随网络漂移）——改为**用例自种 24h TTL 缓存**（`$DSH_HOME/dsh-tauri-model-config/model-presets.json`），验证响应契约且与外网解耦；② `TC-MC-L2-10-005` 的「`settings.yaml` 不存在」被同车道浏览器用例（确认「内测声明」）破坏——改为**用例内先删除**再断言。二者都未放宽断言，只是把前置从「环境恰好如此」改成「用例自建」。
- **假设**：`$DSH_HOME` 在 scratch 宿主内指向临时目录（`packages/dsh-tauri/src/host/config/constants.ts:5`），因此配置文件断言天然隔离。
