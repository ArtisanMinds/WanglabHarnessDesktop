# dsh-tauri-model-config

内置插件：接管 DSH 的「模型」设置页，在官方页面的基础上补齐官方不支持的配置项（上下文、图片输入、思考模式），并让模型上限可以从提供方端点直接读取。

## 为什么是 fork

官方没有为模型配置页提供任何插槽，页内也没有可扩展点；在复杂表单上打 DOM 补丁会随官方改版直接失效。
因此本插件**完整 fork 官方模型配置页**，注册同一个 `settings.section/models` 声明，并在
`cordis.patch.yml` 里关掉官方入口 `ui-settings-models`——两者声明的槽位互斥，不能同时开启。

- 上游：`@deepseek-ai/dsh-client-ui-settings-models`（`deepseek-ai/deepseek-harness`，`packages/client/ui-settings-models`，tag `dsh-v0.1.5-rc.1`）
- 落点：`src/client/models/`（逐文件对应上游 `src/client/`，行为保持一致）
- 本地改动：`ModelListEditor` / `DeepSeekModelsEditor`（新增能力）、`ModelsSection`（打开配置文件）、`styles.ts`（样式覆盖）、`locales.ts`（新增文案键）
- 上游注释已按仓库规范精简；`styles.ts` 是 `ModelsSection.module.css` 等的哈希化产物，类名前缀与官方一致（`zGbnIq_*` 等）

同步上游时的步骤：以同一 tag 重新取源 → 覆盖 `src/client/models/` 中未被本地改动的文件 → 重放上述改动。

## 新增能力

| 位置 | 能力 |
| --- | --- |
| 面板标题右侧（`.zGbnIq_title`） | **打开配置文件**：用系统默认程序打开 `$DSH_HOME/settings.yaml`；文件尚未创建时改为打开它所在目录 |
| 单个模型行（`.zGbnIq_modelRow`） | **获取配置**：仅在该条目只有 `id`/`name`/`description` 时出现，按 `id` 从提供方端点读取该模型的上下文与输出上限 |
| 模型目录标题（`.zGbnIq_modelCatalogHeading`） | 追加 `flex: 1`（按钮集中到右侧），并在右侧加入 **自动配置所有模型**；pi-ai 提供方与官方 DeepSeek 模型目录都有这个入口 |
| 单个模型高级区（`.zGbnIq_modelAdvanced`） | **支持图片输入** 开关 → `input` 声明；**思考模式** 开关 → `reasoningEfforts` 声明，打开后可按档位勾选 |

高级区里的开关统一由 `.zGbnIq_modelSwitchRow` 包裹（`display: flex` + `height: 32px` + 垂直居中），与相邻的 32px 文本输入框对齐。

## 配置从哪里来

两条通道，先直连再回退（与参考实现 `dsh-llm-capabilities` 的顺序一致）：

1. **宿主直连** `GET /endpoint/models`：宿主按 `settings` 服务里的 profile 解析端点与凭据，请求
   `{baseURL}/models` 并归一化容量。官方发现通道会把清单收窄，容量字段只有端点原始清单里才有。
2. **官方发现通道** `remote.llm.discoverModels(settingsNs, probe)`：覆盖端点地址不在用户设置里的提供方
   （例如内置 DeepSeek 官方路由，它的地址只有适配器自己知道）。

请求事实全部来自表单当前显示的值（`provider` / `baseURL` / `api`，以及已输入未保存的 `apiKey`），
插件不认识任何具体部署；凭据只在宿主侧解析，响应里从不回显，也不进 URL。

- **单行「获取配置」**：只补空缺字段，不覆盖已有值。
- **「自动配置所有模型」**：按按钮语义重新配置，端点披露的容量会覆盖行内旧值；端点没披露的字段保持不动。

两条路径都会给出「已写入 N 个 / M 个未被端点披露」的结果行。

## 宿主路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/desktop/dsh-tauri-model-config/endpoint/models` | 读取提供方端点的 `/models` 清单并归一化容量 |
| POST | `/api/desktop/dsh-tauri-model-config/config/open` | 用系统默认程序打开模型配置文件 |

已接入 `genapi.config.ts`，客户端 `apis/` 为生成产物。

## 思考模式

**思考模式** 开关打开时保留该行已有档位，没有则给默认的 `{ off: null, low: 'low', medium: 'medium', high: 'high' }`
（与官方 pi-ai 目录给自建路由的默认档位、参考实现 `dsh-llm-capabilities` 的 `DEFAULT_REASONING_EFFORTS` 一致）；
打开后出现 `off` 到 `max` 的**档位勾选项**（`off, minimal, low, medium, high, xhigh, max`），
勾上即写入该档位、取消即移除；取消到空表时写 `false`（显式「不支持思考」），因为空表会被 schema 判为非法声明。

键是档位，值是分发给端点时使用的线值（只有 `off` 允许为空）。需要为某个模型改线值时，直接在设置文档里改这一项。

开关只表达两种**显式声明**：`false`（不支持）与档位对象（支持）。`reasoningEfforts` 缺席表示「继承默认」，
此时开关读为关，与图片开关同一口径。

## 已知约束

- 模型配置文件按 `$DSH_HOME`（非空白）→ `~/.dsh` 解析后取 `settings.yaml`，与官方 `resolveDshHome` 及桌面壳一致；如果 profile 的 `cordis.yml` 为 `settings-file` 配了自定义 `path`，这里无法感知。
- 文件不存在时打开的是它所在的目录，而不是替用户创建一个空文档。
- 图片能力既不在官方发现通道的返回里，也没有跨厂商的端点字段，因此只由手动开关声明，不做猜测。
- 档位只提供官方词表内的勾选，线值固定等于档位名；端点要求特殊线值时改设置文档即可。
