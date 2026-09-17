# dsh-tauri-model-config

内置插件：接管 DSH 的「模型」设置页，在官方页面的基础上补齐官方不支持的配置项，并让模型上限可以从提供方端点直接读取。

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
| 单个模型行（`.zGbnIq_modelRow`） | **获取配置**：仅在该条目只有 `id`/`name`/`description` 时出现，按 `id` 从提供方端点读取该模型的上下文与输出上限 |
| 模型目录标题（`.zGbnIq_modelCatalogHeading`） | 追加 `flex: 1`（按钮集中到右侧），并在右侧加入 **自动配置所有模型**：对列表内每个模型执行同样的读取 |
| 单个模型高级区（`.zGbnIq_modelAdvanced`） | **支持图片输入** 开关：写入/清除 `input` 声明；**思考模式** 开关：写入/清除 `reasoningEfforts` 声明 |

高级区里的开关统一由 `.zGbnIq_modelSwitchRow` 包裹（`display: flex` + `height: 32px` + 垂直居中），与相邻的 32px 文本输入框对齐。

## 配置从哪里来

与官方页面已有的「获取模型」按钮走**同一个通道**：`remote.llm.discoverModels(settingsNs, probe)`。

`probe` 就是表单当前显示的端点事实（`provider` / `baseURL` / `api`，以及已输入但尚未保存的 `apiKey`），
因此对自建端点、网关、本地推理服务一视同仁——插件不认识任何具体部署，也不为此新增宿主路由或对端点做额外假设。
凭据走类型化参数交给宿主解析，不会出现在 URL 里。这与 `dsh-llm-capabilities`、`dsh-thinking-effort` 的取数方式一致：
能用官方发现通道回答的（容量）就不自己发请求；官方通道不提供的（视觉能力）由用户用手动开关声明。

**只补空缺字段**：`contextWindow` / `maxTokens` 只在条目为空时写入，已有值不会被一次点击抹掉——这是「配置」而不是「重置」。
端点没有披露的条目留在原地，并在界面上给出计数与未披露数量。

## 宿主路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| POST | `/api/desktop/dsh-tauri-model-config/config/open` | 用系统默认程序打开模型配置文件 |

已接入 `genapi.config.ts`，客户端 `apis/` 为生成产物。

## 思考模式

**思考模式** 开关写入 `reasoningEfforts`：打开时声明 `{ off: null, low: 'low', medium: 'medium', high: 'high' }`，
关闭时写入 `false`（显式「不支持思考」）。这组档位与官方 pi-ai 目录给自建路由的默认档位、
以及参考实现 `dsh-llm-capabilities` 的 `DEFAULT_REASONING_EFFORTS` 一致——键是档位，值是分发给端点时使用的线值，
只有 `off` 允许为空。需要为某个模型改线值时，直接在设置文档里改这一项即可。

开关只表达两种**显式声明**：`false`（不支持）与档位对象（支持）。`reasoningEfforts` 缺席表示「继承默认」，
此时开关读为关，与图片开关同一口径。只声明 `off` 的条目在 schema 校验里本就不合法，同样读为关。

## 已知约束

- 模型配置文件按 `$DSH_HOME`（非空白）→ `~/.dsh` 解析后取 `settings.yaml`，与官方 `resolveDshHome` 及桌面壳一致；如果 profile 的 `cordis.yml` 为 `settings-file` 配了自定义 `path`，这里无法感知。
- 文件不存在时打开的是它所在的目录，而不是替用户创建一个空文档。
- 图片能力不在官方发现通道的返回里（`LlmDiscoveredModel` 只有 id / name / 容量），因此由手动开关声明，不做猜测。
