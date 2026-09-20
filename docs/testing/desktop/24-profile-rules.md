# 档案名称规则、初始化形态与隔离性

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/24-profile-rules.e2e.ts`（待建立）
> 前置：`05-profile.md` 通过；配置对话框可打开在「档案」面板
> 运行：`vitest --project desktop -- test/e2e/desktop/24-profile-rules.e2e.ts`（待配置，见 G2）

本文件只覆盖**后端规则面**：名称规范化、创建与克隆的校验顺序及错误码、初始化落盘的四个文件、以及档案之间的隔离边界。界面呈现与写操作反馈归 `05-profile.md`，此处不重复断言。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 规范化 `normalize_profile_id`：小写 → 仅保留 ASCII 字母数字 → ` `/`-`/`_` 记为待插入分隔符、连续分隔符合并为一个 `-`、仅在输出非空时插入 → 其余字符丢弃 → 去首尾 `-` | `src-tauri/src/service/profile/mod.rs:289` |
| 规范化断言样本 `My Work Space`/`  dev--stage  `/`中文档案`/`a_b-c` | `src-tauri/src/service/profile/mod.rs:1043` |
| `create` 五项校验顺序与错误码（空名 → 规范化为空 → 长度 → 保留名 → 目录已存在） | `src-tauri/src/service/profile/mod.rs:308` |
| 唯一保留名 `web`；64 上限比较的是规范化后的 id | `src-tauri/src/service/profile/mod.rs:42`、`:320` |
| 引导档案 `tauri`、安全档案 `safe`（`create` 不拦截） | `src-tauri/src/service/profile/mod.rs:51`、`:59` |
| `clone_with_root` 对显式名走同一套五项校验（含 64 上限与 `web` 保留） | `src-tauri/src/service/profile/mod.rs:569` |
| 新档案初始化写入 4 个文件 | `src-tauri/src/service/profile/mod.rs:879` |
| 清单来源 `web_profile_manifest` | `src-tauri/src/service/profile/mod.rs:707` |
| `cordis.patch.yml` / `pnpm-workspace.yaml` / `.npmrc` 内容 | `src-tauri/src/service/profile/mod.rs:888` |
| 写权限预检 `perm::ensure_dir_writable(dir, "PROFILE_MKDIR")` 先于落盘 | `src-tauri/src/service/profile/mod.rs:884` |
| 半初始化目录的核心 web 层自愈 `ensure_profile_core_bundles` | `src-tauri/src/service/profile/mod.rs:732` |
| `create` 的目录判存（已存在即 `PROFILE_EXISTS`，不幂等） | `src-tauri/src/service/profile/mod.rs:324` |
| 档案目录 `$DSH_HOME/profiles/<id>`（测试中为 `$E2E_HOME/home/.dsh.dev/profiles/<id>`，见 `00-overview.md` §5.3） | `src-tauri/src/service/profile/mod.rs:99` |
| 启动与插件操作按 `active_profile` 解析该目录 | `src-tauri/src/service/plugin/installed.rs:37` |
| 列表行字段 `id`/`name`/`default`/`active` 与命令注册 | `src-tauri/src/service/profile/mod.rs:85`；`src-tauri/src/bridge/profile.rs:11`；`src-tauri/src/desktop/builder.rs:901` |
| 展示名 `manifest_display_name`（去 `dsh-profile-` 前缀、回落 id、首字母大写） | `src-tauri/src/service/profile/mod.rs:224`、`:1104` |
| 列表跳过点目录与 `node_modules`；`web` 目录缺失时合成行 | `src-tauri/src/service/profile/mod.rs:254` |
| 排序：默认档案在前，其余按 id 字典序 | `src-tauri/src/service/profile/mod.rs:283` |
| `active_profile` 回退 `web`（空值/等于 `web`/目录缺失） | `src-tauri/src/service/profile/mod.rs:211` |
| `set_active` 错误码 | `src-tauri/src/service/profile/mod.rs:337` |
| `remove` 删除守卫 | `src-tauri/src/service/profile/mod.rs:532` |
| home 层 `$DSH_HOME/cordis.patch.yml` 作用于所有档案（含安全档案）；测试路径同受 §5.3 约束 | `src-tauri/src/bridge/lifecycle.rs:349` |
| 档案面板列表、active 标记与克隆对话框 | `src/ui/config/profile.tsx:254`、`:285`、`:104` |

---

## 2. 名称规范化

### [P1] 验证规范化折叠分隔符并保留 ASCII 字母数字

[Case ID] TC-DSK-L3-24-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/profile/mod.rs:289`；`src-tauri/src/service/profile/mod.rs:1043`
[自动化] 待接线（`test/e2e/desktop/24-profile-rules.e2e.ts`）
[前置条件] 配置对话框打开在「档案」面板；`$E2E_HOME/home/.dsh.dev/profiles` 可写（§5.3）
[测试数据] 名称 `My Work Space`、`  dev--stage  `、`a_b-c`
[测试步骤] 1. 依次用三个名称新建档案。2. 每次创建后读取 `get_profiles` 返回行的 `id`。3. 复查 `profiles/` 下的目录名。
[预期结果] 1. 三次创建均成功返回。2. 对应 `id` 依次为 `my-work-space`、`dev-stage`、`a-b-c`。3. 目录名与 `id` 一致：小写、连续分隔符合并为一个 `-`、首尾 `-` 被去除。
[清理] 删除本用例新建的三个档案目录；`DELETE /session/<id>`

---

## 3. 初始化形态与幂等

### [P1] 验证新档案落盘为四个文件且形态固定

[Case ID] TC-DSK-L3-24-007
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/profile/mod.rs:879`、`:707`、`:888`
[自动化] 待接线（`test/e2e/desktop/24-profile-rules.e2e.ts`）
[前置条件] 配置对话框打开在「档案」面板；`profiles/init-check` 不存在
[测试数据] 名称 `init-check`
[测试步骤] 1. 新建档案 `init-check`。2. 读取该档案目录下的文件清单。3. 读取 `package.json` 的 `name`/`private`/`dependencies`/`dsh.profile.bundles`。4. 读取 `cordis.patch.yml`、`pnpm-workspace.yaml`、`.npmrc`。
[预期结果] 1. 创建成功。2. 目录下恰含 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml`、`.npmrc`。3. `name` 为 `dsh-profile-init-check`；`private` 为 `true`；`dependencies` 为空对象；`dsh.profile.bundles` 为 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`。4. `cordis.patch.yml` 为 3 行注释加 `[]`；`pnpm-workspace.yaml` 含 `packages`、`nodeLinker: hoisted`、`autoInstallPeers: false`、`minimumReleaseAgeExclude: zod@4.4.3`；`.npmrc` 含 `confirmModulesPurge=false`。
[清理] 删除档案目录；`DELETE /session/<id>`

---

## 4. 隔离性与回退

### [P1] 验证各档案独立持有元数据与依赖目录

[Case ID] TC-DSK-L3-24-010
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src-tauri/src/service/profile/mod.rs:99`；`src-tauri/src/service/plugin/installed.rs:37`
[自动化] 待接线（`test/e2e/desktop/24-profile-rules.e2e.ts`）
[前置条件] 配置对话框打开在「档案」面板；网络或本地包源可用
[测试数据] 档案 `iso-a`、`iso-b`；同一个插件包
[测试步骤] 1. 新建 `iso-a` 与 `iso-b`。2. 在 `iso-a` 下安装该插件后读取两个档案的 `package.json` 与 `node_modules`。3. 在 `iso-a` 为活动档案时记录插件操作解析到的目录，切到 `iso-b` 后重复。
[预期结果] 1. 两个档案目录均创建成功。2. 依赖条目只出现在 `iso-a` 的 `package.json` 与 `node_modules` 中，`iso-b` 不受影响。3. 解析目录分别为 `$E2E_HOME/home/.dsh.dev/profiles/iso-a` 与 `.../profiles/iso-b`，由 `active_profile` 决定。
[清理] 删除两个档案目录；`DELETE /session/<id>`

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-24-002` | 验证非字母数字字符被丢弃而非转为 `-` | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-003` | 验证空名与规范化后为空的名称返回不同错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-004` | 验证 64 字符上限按规范化结果比较 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-005` | 验证保留名与已存在目录不会被静默重建 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-006` | 验证只有 `web` 被保留，引导与安全档案名不被拦截 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-008` | 验证重复初始化幂等且不覆盖用户编辑 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-009` | 验证半初始化目录被补齐核心层，不可写目录在预检阶段报错 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-011` | 验证活动档案回退与删除守卫的错误码 | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-24-012` | 验证 home 层补丁跨档案生效 | 纯逻辑断言，下沉单元测试层 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src-tauri/src/service/profile/mod.rs:289`；`src-tauri/src/service/profile/mod.rs:1043`` | `TC-DSK-L3-24-001` | 正向 |
| ``src-tauri/src/service/profile/mod.rs:879`、`:707`、`:888`` | `TC-DSK-L3-24-007` | 正向 |
| ``src-tauri/src/service/profile/mod.rs:99`；`src-tauri/src/service/plugin/installed.rs:37`` | `TC-DSK-L3-24-010` | 正向 |

---

## 7. 缺口与假设

- **G-D24-1**：本文件全部用例经命令层（`create_profile` / `set_active_profile` / `get_profiles` / 克隆）与磁盘状态断言；界面呈现与提示文案归 `05-profile.md`，不重复断言。
- **G-D24-2**：`create` 不拦截 `tauri`（`mod.rs:51`）与 `safe`（`mod.rs:59`），用户可占用引导与安全档案名。被占用后引导流程与安全模式的实际行为未验证，属已知边界。
- **G-D24-3**：TC-DSK-L3-24-010 的「插件操作解析到哪个目录」当前无只读出口，接线时需借安装产物或日志间接断言。
- **G-D24-4**：列表的展示名（`mod.rs:224`、`:1104`）、跳过点目录与 `node_modules`、`web` 目录缺失时的合成行、默认优先排序（`mod.rs:254`、`:283`）不在本文件 12 个 Case 内。
- **G-D24-5**：TC-DSK-L3-24-009 需构造不可写目录（改属主/权限），Windows 上需管理员；接线时按平台选择可用手段。
- **假设**：本文件全部路径均在 `$E2E_HOME` 之下（`00-overview.md` §5.3）。文中 `$DSH_HOME/profiles/<id>` 指 `$E2E_HOME/home/.dsh.dev/profiles/<id>`（debug）。**不得**依赖设置 `DSH_HOME` 来隔离——debug 构建恒用 `<home>/.dsh.dev` 并忽略 `DSH_HOME`（`src-tauri/src/config/runtime.rs:471-485`），隔离只能靠重定向 `USERPROFILE`/`HOME`；`web`、`tauri`、`safe` 档案不得由用例创建或删除。
- **G-D24-6**：本文件是**破坏性最强**的一批用例（新建/删除档案、改写 home 层补丁）。所有用例必须在重定向后的 `$E2E_HOME/home/.dsh.dev` 内运行；在脚手架实现 §5.3 的重定向与失败关闭校验之前**不得执行**。
