# 通知与下载

> 层级：L3（真实 Tauri 窗口）
> 自动化：`test/e2e/desktop/18-notification-download.e2e.ts`（待建立）
> 前置：`06-harness-embed.md` 通过；应用处于 `ready`
> 运行：`vitest --project desktop -- test/e2e/desktop/18-notification-download.e2e.ts`（待配置，见 G2）

三条桥都发生在 **iframe → 宿主**方向：原生通知、下载完成提示、剪贴板图片回退（Linux/WebKitGTK 下 iframe 的 paste 事件拿不到图片，走原生通路）。系统表面的实际呈现无法在页面内断言，因此多数用例止于「桥接层成功返回」。

---

## 1. 事实基线

| 事实 | 位置 |
| --- | --- |
| 通知桥 `dsh://native-notification` → `show_native_notification` | `src/layout/components/iframe.tsx:88-92`、`:130-140` |
| 通知载荷字段 `title`/`body`/`tag`/`sessionId`/`requireInteraction` | `src/layout/components/iframe.tsx:28-46`、`:131-138` |
| 通知权限在页面加载时注册（Windows 走 `on_page_load`） | `src-tauri/src/desktop/window.rs:109-138` |
| 通知点击 → 宿主向 iframe 发 `dsh://focus-session` | `src/layout/components/iframe.tsx:80-84`、`:177-184` |
| 下载接管与重名处理 `unique_download_path` | `src-tauri/src/desktop/window.rs:39-45`；`src-tauri/src/config/utils.rs:29` |
| 下载完成事件 `harness-download-finished` | `src-tauri/src/desktop/window.rs:46-61` |
| 外壳订阅并弹 toast（成功/失败分支） | `src/layout/index.tsx:94-126` |
| 成功且路径非空时提供「在文件夹中显示」 | `src/layout/index.tsx:109-121` |
| 「在文件夹中显示」→ `reveal_in_folder` | `src/layout/index.tsx:116` |
| 新下载完成时关闭上一条同源 toast | `src/layout/index.tsx:97-98`、`:122-124` |
| 剪贴板图片桥 `dsh://clipboard-image:read` → `read_clipboard_image` | `src/layout/components/iframe.tsx:98-101`、`:156-169` |
| 回包 `source: 'dsh://clipboard-image:reply'` | `src/layout/components/iframe.tsx:160-162` |
| 打开外部链接（`window.open` / `target=_blank`） | `src-tauri/src/desktop/window.rs:22-35` |

---

## 2. 通知

### [P1] 验证通知桥转发到原生通知命令

[Case ID] TC-DSK-L3-18-001
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/components/iframe.tsx:88-92`、`:130-140`；`src-tauri/src/desktop/window.rs:110-138`
[自动化] 待接线（`test/e2e/desktop/18-notification-download.e2e.ts`）
[前置条件] 应用处于 `ready`；通知权限已在页面加载时注册
[测试数据] 桥消息 `{ type: 'dsh://native-notification', title, body, tag, sessionId, requireInteraction }`
[测试步骤] 1. 由 iframe 侧发出通知桥消息。2. 等待宿主处理。3. 读取控制台错误收集器。
[预期结果] 1. 消息发出成功。2. `show_native_notification` 成功返回。3. 收集器为空（无命令失败错误）。
[清理] 关闭系统通知（若可行）；`DELETE /session/<id>`

---

## 3. 下载

### [P2] 验证下载完成后弹出已保存提示并显示路径

[Case ID] TC-DSK-L3-18-003
[层级] L3（真实 Tauri 窗口）
[类型] 正向
[追踪] `src/layout/index.tsx:94-126`；`src-tauri/src/desktop/window.rs:39-61`
[自动化] 待接线（同上）
[前置条件] 应用处于 `ready`；可从 iframe 内触发一次下载
[测试数据] 选择器 `dsh-toast-download`、`dsh-toast-download-path`、`dsh-toast-download-action`
[测试步骤] 1. 触发一次下载。2. 等待下载完成事件。3. 读取提示节点、路径文本与操作入口。4. 比对路径与磁盘实际文件。
[预期结果] 1. 下载被触发。2. 完成事件到达。3. 出现「已保存」提示；路径文本包含实际落盘绝对路径；存在「在文件夹中显示」入口。4. 该路径上确实存在文件。
[清理] 删除下载的文件；关闭提示；`DELETE /session/<id>`

### [P3] [反向] 验证下载失败时提示失败且无打开文件夹入口

[Case ID] TC-DSK-L3-18-004
[层级] L3（真实 Tauri 窗口）
[类型] 异常
[追踪] `src/layout/index.tsx:100-121`
[自动化] 待接线（同上）
[前置条件] 构造下载失败（如不可达的下载地址）
[测试数据] 选择器 `dsh-toast-download`、`dsh-toast-download-action`
[测试步骤] 1. 触发下载并等待失败。2. 读取提示文案。3. 读取操作入口存在性。
[预期结果] 1. 失败返回。2. 提示为「下载失败」语义。3. 操作入口不存在（不提供指向空路径的入口）。
[清理] 关闭提示；`DELETE /session/<id>`

---

## 4. 选择器契约（待补）

| `data-testid` | 元素 | 状态 |
| --- | --- | --- |
| `dsh-toast-download` | 下载完成/失败提示 | 待补 |
| `dsh-toast-download-path` | 提示中的落盘路径 | 待补 |
| `dsh-toast-download-action` | 「在文件夹中显示」按钮 | 待补 |

---

## 5. 单元测试层（已从 L3 E2E 裁剪）

本文件下列条目的断言对象是纯逻辑（函数/时序/协议），不需要真实窗口；已从 L3 E2E 台账裁出，保留记录以便由单元测试承接。

| Case ID | 用例 | 裁剪原因 |
| --- | --- | --- |
| `TC-DSK-L3-18-005` | 验证重名文件自动追加序号 | 纯逻辑断言，下沉单元测试层 |

---

## 6. 追踪矩阵

| 实现位置 | 覆盖 Case ID | 类型 |
| --- | --- | --- |
| ``src/layout/components/iframe.tsx:88-92`、`:130-140`；`src-tauri/src/desktop/window.rs:110-138`` | `TC-DSK-L3-18-001` | 正向 |
| ``src/layout/index.tsx:94-126`；`src-tauri/src/desktop/window.rs:39-61`` | `TC-DSK-L3-18-003` | 正向 |
| ``src/layout/index.tsx:100-121`` | `TC-DSK-L3-18-004` | 异常 |

---

## 7. 缺口与假设

- **G-D18-1**：系统通知与文件管理器的实际呈现无法通过 WebDriver 断言（`00-overview.md` G9）。TC-DSK-L3-18-001 只证明桥接层与命令调用成功；**「用户真的看到通知」未被证明**。
- **G-D18-2**：TC-DSK-L3-18-003 需要「从 iframe 内触发下载」。若 iframe 内无稳定的下载入口，接线时需引入一个测试用的下载链接，并注明这是对真实下载路径的替身。
- **G-D18-3**：`on_new_window`（外部链接接管）是安全边界（只放行 http/https），**未覆盖**。该分支可通过 iframe 内 `window.open('javascript:...')` 构造，属高价值补充项。
- **G-D18-4**：剪贴板图片回退主要为 Linux/WebKitGTK 设计（`iframe.tsx:97-98`），在 Windows 上该路径不会被真实触发。接线时需按平台决定是否跳过。
- **假设**：下载默认保存到系统下载目录（`window.rs:39-44` 的 `destination`）；本文件按该目录读取与清理文件。
