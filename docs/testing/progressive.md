# 渐进式测试推进规则

定义桌面端与插件测试逐条补齐的协作流程与进度台账。

> **规范参考**：测试方案详见 [桌面端测试规范](../specs/desktop.test.md) 与 [插件测试规范](../specs/plugin.test.md)。
> **编号口径**：批次号 = 用例文档序号（桌面端 `00`–`01`，桌宠窗口的 4 条 L3 记在插件文档 `02` 名下；插件 `00`–`11`），与两个 `00-overview.md` §3 的清单逐行对应；不另设 `D*` / `B*` / `PP*` 别名。

---

## 1. 核心原则

1. **单批单卡**：每批仅交付**一个可观察结果**（单个用例或其最小必需基础设施），严禁超前开发。
2. **文档同步**：批内先写用例文档，再写对应测试代码，同批交付，禁止跨批漂移。
3. **独立可运行**：每批必须提供明确的运行命令，无法独立运行的批次视为不合格。
4. **审核阻塞**：单批交付后暂停推进，经人工审查与运行验证通过后，方可描述下一批。
5. **显式授权**：下一批需明确说明变更范围、代价与风险，获得同意后方可动手。
6. **零容忍推进**：当前批次失败必须原地修复，禁止带病推进；无法修复则停止并说明原因。
7. **实时记账**：状态变更需实时更新至台账，严禁滞后补记。

---

## 2. 协作流程

```
[① 提案描述] ───► [② 确认授权] ───► [③ 代码实现]
  (变更/代价/命令)     (回复 "ok")         (更新台账为「待验证」)
                                                  │
[⑤ 批次收尾] ◄─── [④ 审查与验证] ◄─────────────────┘
 ├─ 通过 ──► 标记「已验证」 ──► 进入下一个 ①
 └─ 失败 ──► 原地修复 ──► 重试 ④
```

> **注意**：提案描述必须如实评估风险与代价（如构建开销、新增依赖、影响文件及预期耗时）。

---

## 3. 状态定义

| 状态 | 含义 |
| --- | --- |
| `提案中` | 方案已提交，等待授权 |
| `已同意` | 方案已获批，开始实施 |
| `已实现` | 产物已落地，**等待审查与运行验证** |
| `已验证` | 运行验证通过，本批次关闭 |
| `已阻塞` | 存在明确阻塞条件（附详细原因），暂停推进 |

---

## 4. 进度台账

> 状态变化即时更新本节。本节由文档同步子设计（`docs/specs/09-21-测试体系整改-04-文档同步-设计.md`）**独占**维护，其余波次只上报不改。

### 4.1 桌面端 (`desktop` 车道)

| 编号 | 业务/功能模块分组 | 状态 | 详细状态说明与核心逻辑收敛 |
| --- | --- | --- | --- |
| 00 | 总览与前置 | 已验证 | 覆盖范围、环境事实、前置校验、数据目录隔离与运行命令；随范围收敛重写。app-data 目录名随 `identifier` 缩短为 `dsh-tauri`（`<home>/home/AppData/Roaming/dsh-tauri`），旧目录迁移只在 release 执行。下载缓存默认改为**跨运行共享**（`$DSH_E2E_DOWNLOAD_CACHE_DIR`，缺省 `<os.tmpdir()>/dsh-e2e-download-cache`），需要观察真实下载的用例走 `coldCache: true`（等价 `DSH_E2E_COLD_ASSEMBLY=1`）。 |
| 01 | 启动冒烟：进入下载装配 → dsh 内核启动 → 页面无报错 | 已验证 | `test/e2e/desktop/boot.e2e.ts` **1 例**（`TC-DSK-L3-01-001`）：显式 `coldCache: true` 取独占空缓存冷启动 → 过预装引导 → 断言运行时与 dsh 本体落盘、`service_url` 可用且 iframe 挂载、帧内 `#root` 渲染出内容、壳层与帧内报错收集器为空。 |
| 02 | 桌宠窗口（Tauri 原生产物） | 已验证 | `test/e2e/desktop/02-pet-window.e2e.ts` **4 例**（`TC-PET-L3-02-001`–`004`：独立窗口出现 / 未启用时不存在 / 侧栏入口切换后创建与销毁 / 尺寸越界拒绝且不改状态）。**跨文件例外**：用例文档不在本目录，而在 `docs/testing/plugins/02-dsh-tauri-pet.md` §4——按 L3 准入原则（断言对象必须是 Tauri 原生产物）保留在 `desktop` 车道。 |

`desktop` 车道结构计数（由各文件 `it()` 与 `vitest.desktop.config.ts` 的 `include` 得出）：**2 files / 5 tests**。本轮未重跑该车道（需 debug 二进制与真实 Tauri 窗口，且本机可能已有桌面实例占用 WebDriver 4445）。

### 4.2 插件 (`docs/testing/plugins/`)

| 批次 | 用例 / 基础设施 | 对应文档 | `[Case ID]` | `[自动化] 是` | 状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | 总览、前置与追踪矩阵 | `00-overview.md` | — | — | 已验证 | 不承载用例本体；已按当前实现刷新事实表、缺口与文件命名规则（测试文件与用例文档同名同序号）。G2（未装 playwright）与 G4（`desktop` project 未配置）均已消解，新增 G10 跨源遮蔽、G11 依赖会话的浏览器用例无法真跑。 |
| 01 | 编排骨架与共享路由契约 | `01-dsh-host-and-core-contract.md` | 12 | 12 | 已验证 | `test/e2e/plugins/01-dsh-host-and-core-contract.e2e.ts` 12 例全绿（编排骨架 6 + 共享路由契约 6）；编排新增导出 `assertMountRegistered` / `scaffoldDshProfile`；**共享宿主默认挂载全部产品可见插件**，`02`–`09` 的 L2 段复用同一进程；跨源 403 期望值按实测修正（上游围栏 `forbidden`，路由层 `cross-origin-request` 在 L2 不可达，由 L1 覆盖）。 |
| 02 | `dsh-tauri-pet`（SSE → 客户端 → 桌面端窗口） | `02-dsh-tauri-pet.md` | 14 | 13 | 已验证 | L2 段 5 例 + 浏览器段 4 例在 `test/e2e/plugins/02-dsh-tauri-pet.e2e.ts`（9 例），4 条 Tauri 原生窗口用例在 `test/e2e/desktop/02-pet-window.e2e.ts`（跨文件例外）；实测第 2 帧心跳 15.01–15.02s、重连首个响应块即就绪。G-PET-9（侧栏入口 30s 内未翻转 `aria-pressed`）、G-PET-10（`set_pet_size` 越界返回 `PET_SIZE_OUT_OF_RANGE` 而非夹紧）记录在案。 |
| 03 | `dsh-tauri-rightclick` | `03-dsh-tauri-rightclick.md` | 12 | 5 | 已验证 | 5 例全绿（415 `unsupported-media-type` / `invalid-url` ×4 / `invalid-path` ×3 / `not-a-directory`）；正向 200 会真的拉起本机浏览器，改为手工执行（G-RC-4）。 |
| 04 | `dsh-tauri-session` | `04-dsh-tauri-session.md` | 13 | 9 | 已验证 | 9 例全绿（归档清单形状、缺参 400、DELETE 也按 JSON 读体、空集合清空现状、workspace 缺 ids、open/path 领域错误、5 条注册行的 `allow` 矩阵）；G-SESS-4 记录「空集合清空落到宿主未处理异常载荷 `{status:500,unhandled:true,message:'HTTPError'}`」为疑似缺陷。 |
| 05 | `dsh-tauri-worktree` | `05-dsh-tauri-worktree.md` | 11 | 7 | 已验证 | 7 例全绿（bindings 形状、未绑定回落 `local`、两处缺参 400、删除幂等失败体 200、checkouts 未绑定 400）；`-006` 实测失败体只有 `{error}` 无 `ok`，文档预期按实测收紧；G-WT-4 固化为疑似缺陷、G-WT-5 记录「未创建目录」以回读 `GET /bindings` 为空替代。；新增 §3.1 四条 L1 用例（`TC-WT-U-05-001`–`004`）覆盖 `#648` 的「`isGit` 三态可见性 + 发送拦截同条件」回归，`unit` project 17 例全绿；`TC-WT-C-05-004`（创建失败回落 `local`）待接线 |
| 06 | `dsh-tauri-ui` | `06-dsh-tauri-ui.md` | 12 | 6 | 已验证 | 6 例全绿。原 §4 两条 `-L3-*`（设置侧栏、触发器、Rail 形态）断言对象是 dsh iframe 内部 DOM，按 L3 准入原则**降级为浏览器断言**并已落地（`TC-UI-C-06-001` / `-002`）；运行中 / 已结束两条需真实会话，保持待补（G9 / G-UI-4）。 |
| 07 | `dsh-tauri-panel-extension` | `07-dsh-tauri-panel-extension.md` | 23 | 19 | 已验证 | 19 例全绿。G-EXT-4 记录 skills 发现**不受 scratch `DSH_HOME` 隔离**（读到运行机真实用户技能目录，属 E2E 隔离性缺口而非产品缺陷，故计数与内容不作断言）；G-EXT-5 记录无 `Origin` 时连接门放行、403 由插件自身给出。 |
| 08 | `dsh-tauri-panel-scheduler` | `08-dsh-tauri-panel-scheduler.md` | 15 | 11 | 已验证 | 11 例全绿（空清单、创建 + `crons/tasks` 账本一致性 + 自清理、三类缺参 400、删除两类文案、`run` 未知任务、history 两类文案、`options` 形状）；`-003` 预期按实测收紧为逐字文案；真实执行（`run_now`）需模型与网络，不在本批。 |
| 09 | `dsh-tauri-turnrewind` | `09-dsh-tauri-turnrewind.md` | 7 | 3 | 已验证 | 3 例全绿（两端点缺参 400 且零落盘、未知会话摘要 404、两条路径 `allow` 恰为 `GET/HEAD/OPTIONS`）；`/live` 对未知会话的语义按 G-REW-1 仍不写用例；G-REW-4 的两条过期源码注释（`summary/get.ts:2`、`live/get.ts:2`）已修正。 |
| 10 | `dsh-tauri-model-config` | `10-dsh-tauri-model-config.md` | 10 | 8 | 已验证 | `test/e2e/plugins/10-dsh-tauri-model-config.e2e.ts` 8 例全绿（`GET`/`PUT /config/editor`、`GET /endpoint/models`、`GET /presets`、`POST /config/open` 的响应形状与错误面）；`GET /presets` 实测 `count=1574`、恰六字段，`?ns=nope` → 502，`?ns=` 空串 → 500 未处理载荷（登记为缺陷线索）；`TC-MC-L2-10-002` 不可自动化，刻意不写 `it()`。 |
| 11 | `dsh-tauri-connection` | `11-dsh-tauri-connection.md` | 3 | 3 | 已验证 | `test/e2e/plugins/11-dsh-tauri-connection.e2e.ts` 3 例全绿（内嵌模式鉴权闸门覆写与 `<iframe>` reload 链路）；与 `09` 一起构成本轮新增批次。 |

**合计**：`01`–`11` 共 **11 个用例文件**，`[Case ID]` **132** 条、`[自动化] 是` **96** 条；`[自动化] 是` 与代码 `it()` **逐文件相等**（96 = `plugin` 车道 92 + `desktop` 车道 4），其余为手工执行 / 待接线条目。逐文件明细见 [`plugins/00-overview.md`](./plugins/00-overview.md) §7.1 追踪矩阵。

**本轮实测（插件车道）**：`node node_modules/vitest/vitest.mjs run --project plugin` = **11 files / 92 tests**，连续 5 次全绿。运行前必须已有 `pnpm build:plugins` 的产物，且本机需已装配可解析的 dsh 宿主；`plugin` project 的 `fileParallelism: false`，`globalSetup` 只起 3 次宿主。不要在交互式终端直接跑 `pnpm test:e2e:plugin`（脚本不带 `run`，会进 watch 挂住），用 `-- --run` 或 `node node_modules/vitest/vitest.mjs run --project plugin`。

---

## 5. 变更历史

变更历史已迁出为独立文件：[history.md](./history.md)（各批次的实现、加固、范围收敛与文档迁移记录）。
