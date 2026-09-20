# 插件管理面板

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/09-plugin-panel.e2e.ts`（待建立）
> 前置：`07-harness-lifecycle.md` 通过；配置对话框可打开在「插件」面板
> 运行：`vitest --project desktop -- test/e2e/desktop/09-plugin-panel.e2e.ts`（待配置，见 G2）

插件面板是「插件出问题时」的修复入口，同时承担禁用/启用/快照/还原/卸载。**所有写操作都会停掉并重新拉起服务**，因此每条写用例都必须独立复位到「服务健康 + 面板已打开」。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 列表真值来自 `get_dsh_plugins` 查询（与导航栏、配置角标共用缓存） | `src/ui/config/plugin.tsx:58-61` |
| 打开面板补一次 `refresh_plugin_updates`，插件变更时重探 | `src/ui/config/plugin.tsx:65-73` |
| 内置项排在列表前部 | `src/ui/config/plugin.tsx:427` |
| 标记：`内置`/`已禁用`/`配置覆盖禁用`/`预设`/版本号 | `src/ui/config/plugin.tsx:459-485` |
| 升级入口仅在 `updateAvailable \|\| error != null` 时渲染 | `src/ui/config/plugin.tsx:496-516` |
| 禁用入口仅在非内置且未禁用且无配置覆盖时渲染 | `src/ui/config/plugin.tsx:533-544` |
| 启用入口在配置覆盖禁用或桌面禁用清单时渲染 | `src/ui/config/plugin.tsx:519-532` |
| 快照入口对全部非内置插件常驻；还原/删除快照仅在有快照时渲染 | `src/ui/config/plugin.tsx:545-583` |
| 卸载前弹危险确认框，取消即中止 | `src/ui/config/plugin.tsx:197-215` |
| 配置覆盖禁用时启用前弹警告确认框 | `src/ui/config/plugin.tsx:248-271` |
| 快照已存在时覆盖前弹警告确认框 | `src/ui/config/plugin.tsx:286-307` |
| 写操作后统一 `store.harness.restart()` | `src/ui/config/plugin.tsx:190-194`、`:223-227`、`:242-245`、`:280-283` |
| 行内操作单例守卫 `busy` | `src/ui/config/plugin.tsx:82`、`:180-182` |
| 异常图标 + Tooltip 展示 `error.message` | `src/ui/config/plugin.tsx:433-455` |
| 空态 `Empty` | `src/ui/config/plugin.tsx:420-425` |
| 异常插件运行期上报入口 | `src/layout/components/iframe.tsx:142-154` |

---

## 2. 列表与标记

### [P1] 验证插件面板列出插件并标注内置项

[Case ID] TC-DSK-L3-09-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/plugin.tsx:58-61`、`:427-486`
[自动化] 待接线（`test/e2e/desktop/09-plugin-panel.e2e.ts`）
[前置条件] 应用处于 `ready`；已安装至少 1 个内置插件与 1 个非内置插件
[测试数据] 选择器 `dsh-plugin-row`、`dsh-plugin-row-builtin`
[测试步骤] 1. 打开「插件」面板。2. 读取插件行数量与名称。3. 读取带「内置」标记的行及其位置。
[预期结果] 1. 面板渲染完成。2. 行数量与 `get_dsh_plugins` 返回数量一致。3. 带「内置」标记的行与后端 `internal == true` 的条目一一对应，且内置项排在列表前部。
[清理] 关闭对话框；`DELETE /session/<id>`

---

## 3. 写操作

### [P2] 验证插件操作后服务被重新拉起

[Case ID] TC-DSK-L3-09-006
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/ui/config/plugin.tsx:190-194`、`:223-227`
[自动化] 待接线（同上）
[前置条件] 服务健康；存在可禁用插件
[测试数据] 无
[测试步骤] 1. 记录当前服务地址。2. 执行一次禁用操作。3. 等待收敛。4. 读取连接状态与服务地址。
[预期结果] 1. 记录成功。2. 操作完成。3. 收敛完成。4. 连接状态为运行中，服务地址与记录值一致（不残留「服务已死但界面显示运行中」）。
[清理] 恢复插件状态；关闭对话框；`DELETE /session/<id>`

### [P3] 验证卸载需确认且取消不生效

[Case ID] TC-DSK-L3-09-007
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/ui/config/plugin.tsx:197-228`
[自动化] 待接线（同上）
[前置条件] 存在非内置插件；服务健康
[测试数据] 选择器 `dsh-plugin-uninstall`；确认框取消按钮
[测试步骤] 1. 记录插件列表。2. 点击某非内置插件的「卸载」。3. 在确认框中取消。4. 等待稳定后再次读取插件列表。
[预期结果] 1. 记录成功。2. 确认框出现（危险语义）。3. 确认框关闭。4. 列表与记录一致（插件仍在，服务未被重启）。
[清理] 关闭对话框；`DELETE /session/<id>`

---

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-plugin-row` | 单个插件行 | 待补 |
| `dsh-plugin-row-builtin` | 「内置」标记 | 待补 |
| `dsh-plugin-row-disabled-badge` | 「已禁用」标签 | 待补 |
| `dsh-plugin-patch-disabled-badge` | 「配置覆盖禁用」标签 | 待补 |
| `dsh-plugin-abnormal` | 异常危险图标按钮 | 待补 |
| `dsh-plugin-upgrade` | 「升级」Chip | 待补 |
| `dsh-plugin-disable` | 「禁用」Chip | 待补 |
| `dsh-plugin-enable` | 「启用」Chip | 待补 |
| `dsh-plugin-snapshot` | 「快照」Chip | 待补 |
| `dsh-plugin-restore` | 「还原」Chip | 待补 |
| `dsh-plugin-delete-snapshot` | 「删除快照」Chip | 待补 |
| `dsh-plugin-uninstall` | 「卸载」Chip | 待补 |
| `dsh-plugin-empty` | 空态 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-09-003` | 验证仅在有更新或异常时显示升级入口（条件计算） | 纯逻辑断言，下沉单元测试层 |
| `TC-DSK-L3-09-004` | 验证操作进行中同一时间仅允许一项（单例约束） | 纯逻辑断言，下沉单元测试层 |

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/ui/config/plugin.tsx:58-61`、`:427-486`` | `TC-DSK-L3-09-001` | 正向 |
| ``src/ui/config/plugin.tsx:190-194`、`:223-227`` | `TC-DSK-L3-09-006` | 正向 |
| ``src/ui/config/plugin.tsx:197-228`` | `TC-DSK-L3-09-007` | 异常 |

---

## 7. 缺口与假设

- **G-D09-1**：本文件的写操作用例**全部会重启服务**，彼此强耦合。按 `progressive.md` 的「单批单卡」，接线时应一个用例一个批次推进，且每条用例自带「恢复插件状态 + 等待服务健康」的清理步骤。
- **G-D09-2**：多条成功路径未覆盖（卸载成功、还原成功、删除快照成功），原因是它们会不可逆地改变插件集合，破坏其他用例前置。需要独立的可写档案夹具（对应 `00-overview.md` G8）后再补。
- **G-D09-3**：`refresh_plugin_updates` 依赖 GitHub 探测（Rust 侧 30 分钟缓存）。「仅在有更新或异常时显示升级入口」这类条件渲染断言依赖「有更新」的插件，离线环境下不可达，已从 L3 台账裁剪。
- **假设**：插件操作后服务一定会被后端停止，因此前端在 `finally` 中统一 `restart()`（`plugin.tsx:190-194`）；`TC-DSK-L3-09-006` 正是对这一行为的断言。
