# dsh-tauri-pet

DeepSeek Harness 桌宠插件：在 dsh 界面右下角提供一个自包含的桌宠浮控件，
开关外置透明桌宠窗口、显示/隐藏窗口、从候选中选择桌宠（Codex / Deepseek）。

桌宠窗口由桌面端（`src-tauri`）经 `pet.html` 渲染为一个**独立透明、置顶、无边框、
跳过任务栏**的 Webview（label `pet`），悬于普通窗口之上。本插件的所有命令都经
`dsh-tauri` 的 **invoke 桥**调用：iframe 内的 dsh 界面把 command 以 postMessage
上报到主 webview 监听器，由宿主调用 `@tauri-apps/api/core` 的 `invoke` 并把结果
回传。

## 能力

- **开关控制**：一键启用/停用桌宠（`set_pet_enabled`，同步外置窗口显示）。
- **设置新增选项**：显示/隐藏宠物窗口（`show_pet` / `hide_pet`）、从内置候选
  选择桌宠（`set_active_pet`，可扩展 `.zip` 导入）。
- **设置页面**：展开的卡片即为「宠物」设置小页（右下角胶囊按钮 → 展开面板）。

## 桥协议

| command | 方向 | 说明 |
| --- | --- | --- |
| `get_pet_status` | r | 查询 enabled + active_pet |
| `set_pet_enabled` | rw | 启用/停用 |
| `set_active_pet` | rw | 选择桌宠 |
| `show_pet` / `hide_pet` | rw | 显示/隐藏窗口 |

客户端侧桥实现见 `packages/dsh-tauri/src/client/service/invoke.ts`（
`invokeBridgedTauri`）；宿主监听器见 `src/hooks/use-iframe-invoke.ts`。

## 构建

```sh
pnpm --filter dsh-tauri-pet typecheck
pnpm --filter dsh-tauri-pet build
```