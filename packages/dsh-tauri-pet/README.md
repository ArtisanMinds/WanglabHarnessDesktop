# dsh-tauri-pet

DeepSeek Harness 的桌宠插件，在设置页提供 `Pets` 与 `Market` 两个页签，
通过 `dsh-tauri/client` 的 `invoke` 桥控制独立透明窗口。

## UI

- **Pets**：已安装宠物的选择、创建、ZIP 导入、唤醒、关闭与清除选择。
  `Create` 创建标准会话并预填生成宠物的技能命令，不自动提交。
- **Market**：按自建目录顺序提供预览、作者、下载和启用；切换页签不打断下载。
  安装完成后刷新 Pets，市场页不提供大小滑条。
- 不提供初始宠物，不携带宠物资源。升级时清除旧默认宠物和 `codex:` 选择，
  保留应用内已安装宠物、选择、尺寸和磁盘文件。
- 大小仅在 Pets 调整，范围 25%-200%，默认 100%。
- 关闭会持久化 `enabled=false` 并销毁窗口，重启后保持关闭。
  窗口创建和销毁在主线程之外串行执行，读取最新设置以处理快速开关。
- 侧栏高亮要求已选择、启用、可见并完成媒体解码。失败会关闭窗口并显示错误，
  唤醒可重试；旧渲染代的迟到回调不能重新点亮图标。

## Resources

宠物统一安装在 `${DSH_HOME:-$HOME/.dsh}/pets`，只接受 `source: 'chat'`，
不扫描其他应用的目录。支持 v1（8x9）与 v2（8x11）精灵图 ZIP，
缺少版本字段时根据图集尺寸识别。每帧比例来自实际图片尺寸。

市场目录为 `https://seuwanglab.com/downloads/wanglab-harness/pets/catalog.json`。
下载在 Rust 后台完成，并核对 SHA-256、路径和资源格式后安装。
`src-tauri/resources/preset-pets.json` 保持空清单；保留上游远端预设协议，
其条目可直接交给 `dsh-pet-component`，无需旧版预设安装命令。

渲染由 `dsh-pet-component` 完成，媒体成功或失败回调携带当前 `render_id`。
本地精灵图关闭组件缓存，避免损坏资源重试时读回旧数据。
`skills/hatch-dsh-pet/SKILL.md` 经 `cordis.patch.yml` 挂载，
保留独立 provider 与 `includeDefaultRoots: false`。

## Session Events

host 订阅 `session/event`、`agent/status`、`session/disposed`，
投影为展示状态后经 `/api/dsh-pet/session-stream` 下发。
Rust 在宠物媒体就绪后开始订阅，确保新窗口能够接收初始快照；
关闭时停止流。前端清理会话、计时器和气泡，重新唤醒从新快照恢复。

## Bridge Commands

| Command | Behavior |
| --- | --- |
| `get_pet_status` | Selection, enabled, visible, size, readiness, error, render generation and revision |
| `report_pet_render` | Only the pet WebView may report the current render result |
| `set_pet_enabled` | Persist enablement and create or destroy the window |
| `set_active_pet` | Validate selection; an empty ID clears and disables the pet |
| `set_pet_size` | Persist a size between 25% and 200% |
| `list_pets` / `get_pet_asset` | Read application pets and validated sprite data |
| `import_pet` | Import a v1/v2 sprite ZIP into the application directory |
| `list_pet_market` | Read the self-hosted catalog and local installation state |
| `download_market_pet` / `get_market_pet_progress` | Install in the background and report progress |
| `list_preset_pets` | Read the remote preset catalog, empty by default |

`pet://status` 同时通知宠物和主窗口；主窗口通过 `dsh://pet:status`
转发到直接嵌入的 iframe。客户端按 `revision` 忽略迟到应答。

## Checks

```sh
pnpm --filter dsh-tauri-pet typecheck
pnpm --filter dsh-tauri-pet build
pnpm exec eslint packages/dsh-tauri-pet/src/client --max-warnings=0
pnpm exec vitest run packages/dsh-tauri-pet src/pet test/pet-window-lifecycle.test.ts
```
