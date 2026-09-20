# 更新

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/16-update.e2e.ts`（待建立）
> 前置：`02-shell-navigation.md` 通过
> 运行：`vitest --project desktop -- test/e2e/desktop/16-update.e2e.ts`（待配置，见 G2）

桌面端自更新有两条独立链路：**应用自身更新**（`desktopUpdater`，低频轮询 + 导航栏 chip）与**核心更新**（`harnessUpdater`，toast 提示）。本文件覆盖检测、提示、对话框与破坏性更改确认。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 应用更新轮询间隔 10 分钟，启动即检查一次 | `src/layout/index.tsx:21`、`:85-89` |
| 轮询失败一律静默（不打扰用户） | `src/layout/index.tsx:86` |
| 「更新可用」chip 紧跟「帮助」右侧，三平台均显示 | `src/layout/components/navbar.tsx:529-542` |
| 「帮助 → 检查更新」：有更新才弹框，无更新提示「已是最新」 | `src/layout/components/navbar.tsx:283-295` |
| 检查失败 → 危险提示「检查失败」（不冒充「已是最新」） | `src/layout/components/navbar.tsx:291-294` |
| 更新对话框 `DesktopUpdateDialog` | `src/ui/dialog/update.tsx`；`src/layout/components/navbar.tsx:278-280` |
| 「检查更新」项内的新版本标记 | `src/layout/components/navbar.tsx:484-489` |
| 核心更新提示由 `harnessUpdater.showToast` 触发，仅提示不打断 | `src/layout/index.tsx:128-133` |
| 「立即更新」先过破坏性更改确认，取消即中止 | `src/layout/index.tsx:135-141`；`src/ui/config/hooks/use-core-breaking-confirm.tsx` |
| 「应用」面板核心版本旁的新版本链接 | `src/ui/config/debug.tsx:260-269` |
| 下载完成事件 `harness-download-finished` 由外壳订阅 | `src/layout/index.tsx:94-126` |

---

## 2. 检测与提示

### [P1] 验证发现新版本时导航栏出现更新入口

[Case ID] TC-DSK-L3-16-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:532-542`；`src/layout/index.tsx:88-89`
[自动化] 待接线（`test/e2e/desktop/16-update.e2e.ts`）
[前置条件] 已构造「存在更高版本」的更新检查结果；联网
[测试数据] 选择器 `dsh-navbar-update-chip`
[测试步骤] 1. 触发一次更新检查。2. 等待检查结果写入。3. 读取导航栏更新入口存在性与文案。
[预期结果] 1. 检查被触发。2. 结果写入完成。3. 更新入口存在且文案为「有可用更新」语义。
[清理] 清除构造的更新结果；`DELETE /session/<id>`

### [P2] 验证点击更新入口打开更新对话框

[Case ID] TC-DSK-L3-16-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/navbar.tsx:278-280`、`:532-540`
[自动化] 待接线（同上）
[前置条件] TC-DSK-L3-16-001 通过（更新入口存在）
[测试数据] 选择器 `dsh-navbar-update-chip`、`dsh-update-dialog`
[测试步骤] 1. 点击更新入口。2. 读取更新对话框可见性与版本信息。
[预期结果] 1. 点击被接受。2. 对话框可见，包含目标版本号与下载/安装状态信息。
[清理] 关闭对话框；`DELETE /session/<id>`

---

## 3. 失败与破坏性更改

### [P3] [反向] 验证检查更新失败时提示失败而非已是最新

[Case ID] TC-DSK-L3-16-005
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/components/navbar.tsx:291-294`
[自动化] 待接线（同上）
[前置条件] 构造更新检查失败（如不可达的更新源）
[测试数据] 菜单项 `check-update`
[测试步骤] 1. 点击「检查更新」。2. 等待失败返回。3. 读取提示文案与语义。
[预期结果] 1. 点击被接受。2. 失败在超时内返回。3. 提示为「检查失败」语义且为危险样式；不出现「已是最新」。
[清理] 恢复更新源；`DELETE /session/<id>`

---

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-navbar-update-chip` | 「更新可用」Chip | 待补 |
| `dsh-navbar-menu-help-new-version` | 「检查更新」项内的新版本标记 | 待补 |
| `dsh-update-dialog` | 更新对话框根节点 | 待补 |
| `dsh-update-dialog-install` | 「立即更新」按钮 | 待补 |
| `dsh-config-dsh-version-new` | 「应用」面板新版本链接 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-16-007` | 验证后台轮询失败不影响其他功能 | 纯逻辑断言，下沉单元测试层 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/navbar.tsx:532-542`；`src/layout/index.tsx:88-89`` | `TC-DSK-L3-16-001` | 正向 |
| ``src/layout/components/navbar.tsx:278-280`、`:532-540`` | `TC-DSK-L3-16-003` | 正向 |
| ``src/layout/components/navbar.tsx:291-294`` | `TC-DSK-L3-16-005` | 异常 |

---

## 7. 缺口与假设

- **G-D16-1**：本文件的多数用例需要「可控的更新结果」（有更高版本 / 无更高版本 / 检查失败）。当前无测试替身更新源，接线时需引入（例如指向本地 HTTP 服务），否则 `TC-DSK-L3-16-001` 不可达。
- **G-D16-2**：真实更新检查会触发 GitHub 未认证限流（60 次/小时/IP，见 `src/layout/index.tsx:20-21`）。测试**不得**依赖真实 GitHub，必须使用替身源。
- **G-D16-3**：破坏性更改确认只覆盖「取消中止」。确认后继续执行更新会替换核心并重启服务，破坏性极强，**未覆盖**。
- **G-D16-4**：`harness-download-finished` 的下载完成提示归 `18`，本文件不重复。
- **假设**：`desktopUpdater.check()` 返回非空即表示「有更新」；返回空或抛错分别对应「无更新」与「检查失败」（`navbar.tsx:283-295`）。
