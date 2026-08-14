# 架构说明

`deepseek-harness-desktop` 是一个 Tauri 2 桌面应用，参考
[tangtao646/n8n-desktop](https://github.com/tangtao646/n8n-desktop) 的「自动下载依赖 +
本地进程 + 内嵌 Web 界面」模式，把 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
包装成无需手动安装 Node.js 的本地桌面体验。

## 组件

```text
┌────────────────────────────────────────────────┐
│ Tauri WebView (React 前端)                     │
│  状态机 → 下载进度 → 就绪后 iframe 加载 dsh UI  │
│  侧边栏：版本/地址/日志/设置/操作               │
└───────────────▲────────────────────────────────┘
                │ invoke 命令 + 事件
┌───────────────┴────────────────────────────────┐
│ Tauri Rust 后端                                │
│  installer  : 下载并校验 dsh-core zip          │
│  manager    : Node 运行时 + dsh 进程管理       │
│  downloader : 带进度的下载与解压               │
│  health     : 127.0.0.1:3080 健康检查          │
└───────┬──────────────────────┬─────────────────┘
        │                      │
   <app-data>/runtime      <app-data>/dsh-core
   (Node.js v22.22.0)      (@hairyf/... zip 解压)
        │                      │
        └──────────┬───────────┘
                   ▼
        dsh --profile web --host 127.0.0.1 --port 3080
                   │  DSH_HOME=<app-data>/dsh-home
                   ▼
        http://127.0.0.1:3080/  ← iframe
```

## 启动流程

1. 检查/下载 Node.js 运行时（`nodejs.org`，失败回退 `npmmirror`）；
2. 检查/下载 `dsh-core-<os>-<arch>.zip`（GitHub Release，SHA-256 校验）；
3. 解压到 `<app-data>/dsh-core`；
4. 以隔离的 `$DSH_HOME` 启动 `dsh --profile web`；
5. 轮询健康检查，就绪后在前端 iframe 中加载 UI。

## 数据目录

- Windows：`%APPDATA%\io.github.hairyf.deepseek-harness-desktop\`
- macOS：`~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/`
- Linux：`~/.local/share/io.github.hairyf.deepseek-harness-desktop/`

包含：`runtime/`（Node.js）、`dsh-core/`（harness 发行版）、`dsh-home/`（harness 用户数据）、
`logs/`、`config/`。

## 目录说明

```text
src/                    React 前端（状态机、侧边栏、i18n）
src-tauri/src/api/      Rust 命令与 harness 生命周期
src-tauri/src/services/ 下载器与进程管理器
docs/PKG-CONTRACT.md    deepseek-harness-pkg 发布契约
scripts/gen-icons.mjs   图标生成（纯 Node）
```
