# 核心版本管理：错误码与回滚矩阵

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/25-core-error-matrix.e2e.ts`（待建立）
> 前置：`14-core-management.md` 通过；配置对话框可打开在「核心」面板
> 运行：`vitest --project desktop -- test/e2e/desktop/25-core-error-matrix.e2e.ts`（待配置，见 G2）

本文件把 `version.rs` 与 `local.rs` 的错误码逐条映射为可观察结果，重点在**切换失败必须回滚**：目录互换第二步失败时激活位要还原，而不是留下半切换的核心。列表渲染与入口可见性归 `14-core-management.md`。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 全部 `CORE_*` 错误码定义 | `src-tauri/src/service/core/version.rs:339`、`:354`、`:360`、`:371`、`:380`、`:390`、`:409`、`:455`、`:463`、`:474`、`:512`、`:514`、`:530`、`:531`、`:542`、`:552`、`:560`、`:564`、`:574` |
| 本地核心三个错误码与输出尾部（末 12 行非空） | `src-tauri/src/service/core/local.rs:274`、`:322`、`:339`（尾部逻辑 `:324`） |
| 转换锁 15 秒超时 `CORE_TRANSITION_TIMEOUT` | `src-tauri/src/service/workflow/process.rs:127`、`:135` |
| `CORE_LOCAL_UNSUPPORTED` 亦作为降级告警日志 | `src-tauri/src/service/core/source.rs:107` |
| 切换前停服与孤儿进程清扫 | `src-tauri/src/service/core/version.rs:330`、`:421` |
| 整个切换持有转换锁（与 launch 共用） | `src-tauri/src/service/core/version.rs:347`、`:404`；`src-tauri/src/service/workflow/process.rs:116` |
| `switch_app_version` 备份、互换与回滚 | `src-tauri/src/service/core/version.rs:443` |
| 下载幂等：`dest.exists()` 直接返回版本行 | `src-tauri/src/service/core/version.rs:500`、`:594` |
| 卸载守卫与删除失败 | `src-tauri/src/service/core/version.rs:550` |
| `local_core_uses_pnpm` 布局判定 | `src-tauri/src/service/core/local.rs:247` |
| 更新命令、Windows `CREATE_NO_WINDOW` 与版本回读 | `src-tauri/src/service/core/local.rs:281`、`:314`、`:342` |
| 核心行字段（camelCase）与 `get_cores` 命令 | `src-tauri/src/service/core/source.rs:43`；`src-tauri/src/bridge/core.rs:12` |
| issue #596：低于基线的本地核心被拒并回退预打包，`active_core` 不改写 | `src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107` |
| 核心面板的标记、下载/卸载/更新入口条件 | `src/ui/config/core.tsx:92`、`:113`、`:416`、`:432` |

---

## 2. 切换与回滚

### [P1] 验证成功切换后目录互换与来源标记同步

[Case ID] TC-DSK-L3-25-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/core/version.rs:443`、`:404`、`:421`
[自动化] 待接线（`test/e2e/desktop/25-core-error-matrix.e2e.ts`）
[前置条件] 已下载 tag 为 `dsh-<v2>` 的槽位；当前激活核心为另一版本
[测试数据] 目标 tag `dsh-<v2>`
[测试步骤] 1. 记录切换前 `dependencies/dsh` 对应的版本与 `dependencies/dsh-<v1>` 的存在性。2. 切换到 `app-dsh-<v2>`。3. 读取 `get_cores` 中 `active` 为真的行与磁盘槽位。
[预期结果] 1. 记录成功。2. 切换返回成功。3. `dependencies/dsh` 内容为 `v2`；原激活版本落在 `dsh-<v1>` 槽位；`active` 行 `source` 为 `app`、`tag` 为 `dsh-<v2>`。
[清理] 切回原核心；按需卸载新增槽位

### [P3] [反向] 验证备份清理失败即中止，不动激活位

[Case ID] TC-DSK-L3-25-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/core/version.rs:455`、`:443`
[自动化] 待接线（`test/e2e/desktop/25-core-error-matrix.e2e.ts`）
[前置条件] 当前激活版本有 tag 记录；同名残留备份槽位存在且无法删除
[测试数据] 备份槽位名 = 当前激活版本记录的 tag；制造不可删条件：占用备份目录句柄或改权限
[测试步骤] 1. 记录激活核心版本与激活目录内容。2. 制造备份槽位不可删条件。3. 切换到另一已下载 tag。4. 读取错误与激活目录内容。
[预期结果] 1. 记录成功。2. 条件已就绪。3. 返回 `CORE_SWITCH_FAILED: cannot clean old backup`，在重命名激活目录之前中止。4. 激活目录与记录值逐项一致，未被改名或破坏。
[清理] 解除占用或恢复权限；删除残留备份槽位

---

## 3. 下载、卸载与来源回退

### [P3] [反向] 验证低于基线的本地核心被拒且不改写 active_core

[Case ID] TC-DSK-L3-25-010
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107`
[自动化] 待接线（`test/e2e/desktop/25-core-error-matrix.e2e.ts`）
[前置条件] 已安装低于内置插件基线的本地 CLI 核心；记录 store 中 `active_core` 原值
[测试数据] 低于 `recommended` 基线的本地 dsh 版本
[测试步骤] 1. 调用切换到 `local`。2. 读取返回错误文本。3. 读取 store 中的 `active_core`。4. 调用 `get_cores` 读取本地行与激活行。
[预期结果] 1. 返回 `CORE_LOCAL_UNSUPPORTED`。2. 消息给出本地版本与基线版本，并提示 `npm install -g @deepseek-ai/dsh@latest` 或保留内置版本。3. `active_core` 与记录值逐字一致，未被改写。4. 激活行为预打包核心；本地行仍被列出，不作为激活来源。
[清理] 卸载或升级本地核心；重启服务

## 4. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-25-001` | 验证非法 id 与不可用目标的错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-002` | 验证下载幂等：已存在槽位不再联网 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-004` | 验证目录互换失败时回滚到原激活版本 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-006` | 验证切换前先停服并清扫孤儿进程 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-007` | 验证转换锁超时返回专用错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-008` | 验证下载链路的分阶段错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-009` | 验证卸载守卫与删除失败 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-011` | 验证更新本地核心的可观察结果 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-012` | 验证按全局布局选择 pnpm 或 npm 更新 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-013` | 验证核心行字段与标记语义 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-25-014` | 验证切换后激活核心消失的错误码 | 纯逻辑断言，下沉单元测试层 |

---

## 5. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/service/core/version.rs:443`、`:404`、`:421`` | `TC-DSK-L3-25-003` | 正向 |
| ``src-tauri/src/service/core/version.rs:455`、`:443`` | `TC-DSK-L3-25-005` | 异常 |
| ``src-tauri/src/service/core/version.rs:360`；`src-tauri/src/service/core/source.rs:107`` | `TC-DSK-L3-25-010` | 异常 |

---

## 6. 缺口与假设

- **G-D25-1**：`CORE_APP_NOT_FOUND: bundled core is not installed`（`version.rs:371`）需要移除或改名随包核心二进制才能触发，本文件未为它安排 Case。
- **G-D25-2**：回滚类用例（211、212、216）需要制造重命名或删除失败。Windows 上的可靠手段是占用目录句柄；权限手段需管理员。接线时优先用句柄占用。
- **G-D25-3**：TC-DSK-L3-25-007 需要人为持有转换锁超过 15 秒，当前无外部注入点，需测试编排层配合或增加诊断命令。
- **G-D25-4**：TC-DSK-L3-25-003、211 的早退分支「当前激活 tag 与目标 tag 相同 → 只改来源标记」（`version.rs:413`）未单独覆盖；同版本 local → app 的来源改写属该分支。
- **G-D25-5**：卸载前停服失败只记警告不阻断（`version.rs:568`），意味着删除可能在被占用目录上退化；该降级路径未验证。
- **G-D25-6**：`CORE_LOCAL_UNSUPPORTED` 在 `source.rs:107` 同时以一次性降级警告日志出现（仅告警一次）。日志侧断言当前无出口，217 只断言命令返回值与 `active_core`。
- **假设**：核心切换的成功路径不负责重启服务，重启由前端触发；本文件在切换类用例中只断言目录与设置，不重复断言服务恢复（归 `07-harness-lifecycle.md` 与 `14-core-management.md`）。
