# dsh-tauri-pet

DeepSeek Harness 的桌宠插件。它在设置页提供 `Pets` 与 `Codex` 两个页签，
并通过 `dsh-tauri` 的 Tauri invoke 桥控制独立的透明、置顶、无边框桌宠窗口。

## UI

- **Pets**：显示预设宠物（`resources/preset-pets.json` 清单，下载到
  `~/.dsh/pets/<id>` 后启用）以及 Chat 来源的宠物卡片；工具栏提供
  **Create** 和 **Wake pet / Collapse pet**。`Create` 创建标准会话并只预填
  `/hatch-dsh-pet 根据你对我的了解，养一只宠物`，不会自动提交。
- **Codex**：显示 Codex 来源（`~/.codex/pets`）的宠物卡片；工具栏只有
  **Import**（导入 `.zip` 资源包）和 **Wake pet / Collapse pet**。
- Wanglab 0.2.3 不提供初始预设宠物，首次启动保持未选择。升级时清除旧的
  `maid-deepseek-whale` 初始选择，不删除磁盘资源，也不改变自定义宠物选择。
- 自定义宠物和预设宠物的选择都会校验资源并唤醒窗口。未选择时禁用唤醒按钮。
- 预设宠物媒体（WebM / GIF / config.jsonc）不再随本包内置：用户在设置页
  「下载」后安装到 `~/.dsh/pets/<id>`，桌宠窗口按 `config.jsonc` 的动画池
  （动画名 = webm 文件名主名）直接播放下载产物，无运行时回退。
- 宠物大小滑条保持 50–200%，默认 100%。侧栏绿色圆点要求 `enabled`、`visible`
  和媒体解码确认 `ready` 同时成立。加载失败会收起透明窗口并在设置页显示原因；
  再次唤醒会重新加载。临时收起不改变持久化的 `enabled`。

## 文件来源与技能

Chat 宠物安装在 `${DSH_HOME:-$HOME/.dsh}/pets`，Codex 宠物安装在
`$HOME/.codex/pets`，两个来源通过 `list_pets({ source: 'chat' | 'codex' })`
严格分开。预设宠物清单（`src-tauri/resources/preset-pets.json`）登记远端仓库
与资源子目录，下载解压后只保留 `assets` 前缀下的条目。`skills/hatch-dsh-pet/SKILL.md`
由 `cordis.patch.yml` 组合进 `@deepseek-ai/dsh-skill-filesystem`，并使用
`providerName: dsh-tauri-pet` 与 `includeDefaultRoots: false`，避免覆盖其他
skill provider 或默认根目录。

## Bridge commands

| command | 说明 |
| --- | --- |
| `get_pet_status` | 查询 `enabled`、`visible`、`active_pet`、`pet_size`、`ready`、`error`、`render_id` 与 `revision` |
| `report_pet_render` | 仅宠物 WebView 可报告当前 `render_id` 的媒体加载结果，iframe 不可调用 |
| `set_pet_enabled` | 持久化首次启用；启用时显示窗口 |
| `show_pet` / `hide_pet` | 只改变窗口可见性，不改变持久化 enabled |
| `set_active_pet` | 校验本机资源后持久化选择的宠物 id |
| `set_pet_size` | 持久化 50–200% 的大小 |
| `list_pets` | 按 `source` 列出 Chat 或 Codex 宠物 |
| `get_pet_asset` | 获取指定宠物的完整 8×11 spritesheet data URL |
| `list_preset_pets` | 列出预设宠物清单（含安装状态） |
| `download_preset_pet` | 后台下载并安装预设宠物 |
| `get_preset_download_progress` | 轮询预设宠物下载/解压进度 |
| `get_preset_pet_config` | 读取已安装预设的 `config.jsonc`（dsh-pet 协议，校验后返回） |
| `get_preset_pet_assets` | 列出已安装预设的 WebM URL manifest（dsh-pet 协议按需流式提供） |
| `import_pet` | 导入 Codex `.zip` 资源包 |
| `push_pet_session` | 转发原始会话快照，宠物 WebView 据此显示活动状态 |

完整客户端桥实现见 `src/client/service/pet.ts`；它调用
`dsh-tauri/client` 的 `invokeBridgedTauri`。设置卡片直接使用预设清单的浏览图
URL 作为缩略图。

`pet://status` 同时通知宠物和主窗口；主窗口通过 `dsh://pet:status` 向直接
嵌入的 Harness iframe 推送状态。客户端按 `revision` 忽略迟到应答，后端按
`render_id` 拒绝上一次唤醒的加载回调，避免旧请求重新点亮图标。

Wanglab 0.2.3 ships without a default pet. Custom pets remain selectable, and choosing
one validates its files and wakes the window. The sidebar indicator requires successful
media decoding. Load failures hide the window and appear in settings; waking retries loading.

## Build and checks

```sh
pnpm --filter dsh-tauri-pet typecheck
pnpm --filter dsh-tauri-pet build
pnpm exec eslint packages/dsh-tauri-pet/src/client --max-warnings=0
pnpm exec vitest run packages/dsh-tauri-pet/src/client/utils/activity.test.ts
```
