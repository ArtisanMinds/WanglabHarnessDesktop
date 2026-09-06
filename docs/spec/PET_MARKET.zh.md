# 宠物市场

市场页内联在内置的 `dsh-tauri-pet` React/TypeScript 插件中，沿用 Desktop 的主题和语言。安装包仅包含界面及目录地址，不携带宠物素材、预览图或资源包。没有默认宠物，启动时不请求市场目录。

目录地址：`https://seuwanglab.com/downloads/wanglab-harness/pets/catalog.json`

打开市场后，通过原生桥读取目录。点击下载会校验资源包的大小和 SHA-256，再原子安装到 `$DSH_HOME/pets/<id>`，保留已有宠物。离开设置页后下载继续，再次打开市场可恢复进度。启用操作复用现有的渲染状态确认机制。

支持两种精灵图：v1 为 8 列 9 行，v2 为 8 列 11 行。无版本标记的原始资源包根据图片尺寸识别。卡片显示原作者姓名，下载包保留作者信息和许可文件。

## 维护下载库

`marketplace/pets/sources.json` 中的条目顺序即市场顺序，不按热度或日期排序。准备服务器文件需要 Node.js 22+、`unzip`、`zip` 及支持 `libwebp_anim` 的 FFmpeg，在仓库目录执行：

```bash
node scripts/prepare-pet-market.mjs
```

源文件缓存在 `../release-packages/pet-market-source`。生成的目录、资源包、动态预览及 `SHA256SUMS` 位于 `../release-packages/site-staging-pets`，均在代码仓库和安装器资源目录之外。审核新的上游素材版本时，应一并更新缓存中的原始 ZIP 和元数据。

服务器只需通过 HTTPS 提供生成的 `downloads/wanglab-harness/pets` 静态目录。资源路径包含内容版本，先上传并校验资源，最后备份并原子替换 `catalog.json`。保留旧资源版本，以兼容缓存了旧目录的客户端。现有静态下载配置即可使用，不需要新增 API 服务。

目录使用 schema version 1，类型定义见 `src-tauri/src/bridge/pet_market.rs`。资源地址限定为本站 `/downloads/wanglab-harness/pets/` 路径下的 HTTPS 地址。JSON 最大 1 MiB，资源包最大 32 MiB，原生目录缓存五分钟。刷新按钮可绕过缓存。

## 验证

执行仓库的 lint、类型检查、测试和构建。Windows 流水线还会验证升级后的启动状态，以及原生窗口中的 v1/v2 宠物渲染。使用 Rust 安装器验证四个原始包及适配包：

```bash
WANGLAB_PET_FIXTURES="$(realpath ../release-packages)" \
  cargo test --manifest-path src-tauri/Cargo.toml --lib \
  market_original_and_adapted_packages_install -- --ignored --nocapture
```
