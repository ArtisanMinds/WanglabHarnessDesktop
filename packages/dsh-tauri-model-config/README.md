# dsh-tauri-model-config

内置插件：接管 DSH 的「模型」设置页，在官方页面的基础上补齐官方不支持的配置项，并接入 Rapid-MLX 自动配置。

## 为什么是 fork

官方没有为模型配置页提供任何插槽，页内也没有可扩展点；在复杂表单上打 DOM 补丁会随官方改版直接失效。
因此本插件**完整 fork 官方模型配置页**，注册同一个 `settings.section/models` 声明，并在
`cordis.patch.yml` 里关掉官方入口 `ui-settings-models`——两者声明的槽位互斥，不能同时开启。

- 上游：`@deepseek-ai/dsh-client-ui-settings-models`（`deepseek-ai/deepseek-harness`，`packages/client/ui-settings-models`，tag `dsh-v0.1.5-rc.1`）
- 落点：`src/client/models/`（逐文件对应上游 `src/client/`，行为保持一致）
- 本地改动：`ModelListEditor`（图片开关、获取配置、自动配置）、`ModelsSection`（打开配置文件）、`styles.ts`（三处样式覆盖）、`locales.ts`（新增文案键）
- 上游注释已按仓库规范精简；`styles.ts` 是 `ModelsSection.module.css` 等的哈希化产物，类名前缀与官方一致（`zGbnIq_*` 等）

同步上游时的步骤：以同一 tag 重新取源 → 覆盖 `src/client/models/` 中未被本地改动的文件 → 重放上述四类改动。

## 新增能力

| 位置 | 能力 |
| --- | --- |
| 面板标题右侧（`.zGbnIq_title`） | **打开配置文件**：用系统默认程序打开 `$DSH_HOME/settings.yaml`；文件尚未创建时改为打开它所在目录 |
| 单个模型行（`.zGbnIq_modelRow`） | **获取配置**：仅在该条目只有 `id`/`name`/`description` 时出现，按 `id` 从端点读取该模型的配置 |
| 模型目录标题（`.zGbnIq_modelCatalogHeading`） | 追加 `flex: 1`（按钮集中到右侧），并在右侧加入 **自动配置所有模型**：对列表内每个模型执行同样的读取 |
| 单个模型高级区（`.zGbnIq_modelAdvanced`） | **支持图片输入** 开关：写入/清除 `input` 声明 |

## 自动配置的数据来源

宿主侧代理 `GET {baseURL}/models`（默认 `http://localhost:8000/v1`）。走宿主而不是浏览器是必须的：
内核 Web 源与模型端点不同源，而 Rapid-MLX 不带 CORS 头。

字段口径与官方 Rapid-MLX 适配器（`raullenchai/rapid-mlx-dsh-provider`）一致：

| 端点字段 | 写入的设置字段 | 说明 |
| --- | --- | --- |
| `max_model_len` → `context_window` → `context_length` → `max_input_tokens` → `limit.context` | `contextWindow` | 优先取按本机内存拟合的上限，旧服务端缺该字段时回落到原生窗口 |
| `max_output_tokens` / `max_tokens` / `max_completion_tokens` / `limit.output` | `maxTokens` | 端点没披露则留空 |
| `capabilities` 含 `vision` | `input: ['text', 'image']` | `capabilities` 缺席表示服务端没回答，此时不写 `input`，绝不臆测 |
| `capabilities` 不含 `vision` | `input: ['text']` | |

**只补空缺字段**：已有值不会被覆盖——自动配置是「配置」而不是「重置」。

## 宿主路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/desktop/dsh-tauri-model-config/rapid-mlx/models` | 代理模型端点清单，返回归一化后的条目（`baseURL` 查询参数可选） |
| POST | `/api/desktop/dsh-tauri-model-config/config/open` | 用系统默认程序打开模型配置文件 |

## 已知约束

- 模型配置文件按 `$DSH_HOME`（非空白）→ `~/.dsh` 解析后取 `settings.yaml`，与官方 `resolveDshHome` 及桌面壳一致；如果 profile 的 `cordis.yml` 为 `settings-file` 配了自定义 `path`，这里无法感知。
- 文件不存在时打开的是它所在的目录，而不是替用户创建一个空文档。
