# DeepSeek Harness Desktop

基于 [Tauri 2](https://tauri.app/) 的桌面应用，参考
[n8n-desktop](https://github.com/tangtao646/n8n-desktop) 的「一键安装 + 本地运行 + 内嵌 Web 界面」
模式，将 [DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness)
打包为跨平台桌面应用：**无需手动安装 Node.js、无需 pnpm、无需 Docker**。

> 状态：开发预览。上游 `dsh` 仍在快速迭代，会有破坏性变更；本项目同步跟随。

## 功能

- **一键安装**：首次启动自动下载 Node.js 运行时与打包好的 Harness 发行版
- **本地运行**：`dsh web` 服务运行在 `127.0.0.1:3080`，数据完全保存在本机
- **隐私默认**：隔离的 `$DSH_HOME`，默认关闭遥测（`DSH_TELEMETRY_DISABLED=1`）
- **跨平台**：Windows / macOS / Linux
- **侧边栏**：版本信息、服务地址、端口与自启动设置、服务日志、重启/停止/浏览器打开等
- **中英双语**：界面支持中文与 English

## 依赖关系

| 仓库 | 作用 |
| --- | --- |
| [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | 上游 `dsh`（CLI + Web UI + 插件架构） |
| [deepseek-harness-pkg](https://github.com/hairyf/deepseek-harness-pkg) | 打包好的 Harness 发行版（下载源，见 [PKG-CONTRACT](docs/PKG-CONTRACT.md)） |

## 系统要求

- Windows 10+（64 位）
- macOS 10.15+
- Linux（支持 AppImage 的主流发行版）
- 首次运行需要网络（下载 Node.js 与 Harness 发行包，约几百 MB）

Node.js 运行时要求：**v22.15.0+ 或 v23.8.0+**（应用默认捆绑 `v22.22.0` LTS）。

## 开发与构建

### 环境要求

- Node.js 20+
- Rust 1.77+
- pnpm 9+
- 平台编译工具链（Windows: MSVC + WebView2；macOS: Xcode CLT；Linux: WebKit2GTK）

### 本地开发

```bash
git clone <your-fork>/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm tauri dev
```

### 构建安装包

```bash
pnpm tauri build
```

### 重新生成图标

```bash
pnpm icons
```

## 数据目录

数据目录由 Tauri 的 bundle identifier（`io.github.hairyf.deepseek-harness-desktop`）决定：

- Windows：`%APPDATA%\io.github.hairyf.deepseek-harness-desktop\`
- macOS：`~/Library/Application Support/io.github.hairyf.deepseek-harness-desktop/`
- Linux：`~/.local/share/io.github.hairyf.deepseek-harness-desktop/`

包含：

- `runtime/`：Node.js 运行时
- `dsh-core/`：Harness 发行版
- `dsh-home/`：Harness 用户数据（`$DSH_HOME`，含 profile、会话、设置）
- `logs/`：应用与 dsh 服务日志
- `config/`：桌面端配置（端口、自启动）

## 安全声明

- 本项目仅用于个人学习、研究、测试；请勿用于商业用途
- `dsh` 是一个**具备本地代码执行能力的 agent**，请只在可信、隔离的环境中运行，
  不要从未知来源导入不受信任的配置/插件
- 开发者不对因使用本项目导致的任何数据丢失或安全问题负责

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — 上游项目
- [n8n-desktop](https://github.com/tangtao646/n8n-desktop) — 参考实现
- [Tauri](https://tauri.app/) — 桌面框架

## License

MIT，见 [LICENSE](LICENSE)。
