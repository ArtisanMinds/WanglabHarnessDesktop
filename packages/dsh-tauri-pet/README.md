# dsh-tauri-pet

DeepSeek Harness 的桌宠插件。它在设置页提供 `Pets` 与 `Market` 两个页签，
并通过 `dsh-tauri` 的 Tauri invoke 桥控制独立的透明、置顶、无边框桌宠窗口。

## UI

- **Pets**：显示预设宠物（`resources/preset-pets.json` 清单，下载到
  `~/.dsh/pets/<id>` 后启用）以及 Chat 来源的宠物卡片；工具栏提供
  **Create**、**Import** 和 **Wake pet / Collapse pet**。`Create` 创建标准会话并只预填
  `/hatch-dsh-pet 根据你对我的了解，养一只宠物`，不会自动提交。
- **Market**：首次打开时读取自建公网目录，提供预览、作者、下载和启用；
  下载完成后刷新 Pets 列表。市场页不显示大小滑条，切换页签不打断下载。
- 不提供初始预设宠物，首次启动保持未选择。升级时清除旧的
  `maid-deepseek-whale` 初始选择和 `codex:` 选择，不删除磁盘资源；
  保留应用自己已安装宠物的选择。
- 自定义宠物和预设宠物的选择都会校验资源并唤醒窗口。未选择时禁用唤醒按钮。
- 预设宠物媒体（WebM / GIF / config.jsonc）不再随本包内置：用户在设置页
  「下载」后安装到 `~/.dsh/pets/<id>`，桌宠窗口按 `config.jsonc` 的动画池
  （动画名 = webm 文件名主名）直接播放下载产物，无运行时回退。
- 宠物大小滑条仅在 Pets 页显示，范围 25%-200%，步长 5%，默认 100%。侧栏绿色圆点要求 `enabled`、`visible`
  和媒体解码确认 `ready` 同时成立。加载失败会收起透明窗口并在设置页显示原因；
  再次唤醒会重新加载。临时收起不改变持久化的 `enabled`。

## 文件来源与技能

宠物统一安装在 `${DSH_HOME:-$HOME/.dsh}/pets`，通过
`list_pets({ source: 'chat' })` 读取。桌宠功能不扫描或导入到 `$HOME/.codex/pets`，
旧调用的 `codex` 来源会被拒绝，未指定导入来源时使用 `chat`。
市场目录为 `https://seuwanglab.com/downloads/wanglab-harness/pets/catalog.json`，
安装器只包含界面和目录地址，不携带宠物资源包。支持 v1（8x9）与 v2（8x11）
精灵图 `.zip` 包，无版本字段时按图集尺寸识别。
预设宠物清单（`src-tauri/resources/preset-pets.json`）登记远端仓库
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
| `set_pet_size` | 持久化 25%-200% 的大小 |
| `list_pets` | 仅接受 `source: 'chat'`，列出应用自己的宠物 |
| `get_pet_asset` | 获取指定宠物的完整 v1/v2 spritesheet data URL |
| `list_pet_market` | 按目录原有顺序列出市场宠物及本机安装状态 |
| `download_market_pet` | 后台下载、校验并安装市场宠物 |
| `get_market_pet_progress` | 查询市场宠物下载进度 |
| `list_preset_pets` | 列出预设宠物清单（含安装状态） |
| `download_preset_pet` | 后台下载并安装预设宠物 |
| `get_preset_download_progress` | 轮询预设宠物下载/解压进度 |
| `get_preset_pet_config` | 读取已安装预设的 `config.jsonc`（dsh-pet 协议，校验后返回） |
| `get_preset_pet_assets` | 列出已安装预设的 WebM URL manifest（dsh-pet 协议按需流式提供） |
| `import_pet` | 导入 v1/v2 精灵图 `.zip` 资源包到应用自己的宠物目录 |
| `push_pet_session` | 转发原始会话快照，宠物 WebView 据此显示活动状态 |

完整客户端桥实现见 `src/client/service/pet.ts`；它调用
`dsh-tauri/client` 的 `invokeBridgedTauri`。设置卡片直接使用预设清单的浏览图
URL 作为缩略图。

`pet://status` 同时通知宠物和主窗口；主窗口通过 `dsh://pet:status` 向直接
嵌入的 Harness iframe 推送状态。客户端按 `revision` 忽略迟到应答，后端按
`render_id` 拒绝上一次唤醒的加载回调，避免旧请求重新点亮图标。

The settings page contains only Pets and Market. Pets lists the application's installed
pets and provides creation, ZIP import, selection, wake/hide, and a 25%-200% size slider.
Market loads the self-hosted catalog on demand and has no size slider. Pet assets are
downloaded separately and are not bundled with Desktop. Both v1 and v2 spritesheets work.
The app never reads Codex pet directories; upgrades clear old `codex:` selections while
preserving application pets and leaving files untouched. There is no default pet.
The sidebar indicator requires successful media decoding. Load failures hide the window
and appear in settings; waking retries loading.

## Build and checks

```sh
pnpm --filter dsh-tauri-pet typecheck
pnpm --filter dsh-tauri-pet build
pnpm exec eslint packages/dsh-tauri-pet/src/client --max-warnings=0
pnpm exec vitest run packages/dsh-tauri-pet/src/host/reducer.test.ts
```
