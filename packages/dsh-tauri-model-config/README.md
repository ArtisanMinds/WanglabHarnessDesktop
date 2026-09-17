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

三条通道，先直连再回退（前两条与参考实现 `dsh-llm-capabilities` 的顺序一致）：

1. **宿主直连** `GET /endpoint/models`：宿主按 `settings` 服务里的 profile 解析端点与凭据，请求
   `{baseURL}/models` 并归一化容量。官方发现通道会把清单收窄，容量字段只有端点原始清单里才有。
2. **官方发现通道** `remote.llm.discoverModels(settingsNs, probe)`：覆盖端点地址不在用户设置里的提供方
   （例如内置 DeepSeek 官方路由，它的地址只有适配器自己知道）。
3. **模型能力表** `GET /presets`：端点清单只说容量，不说模态与档位，图片与思考能力来自 LiteLLM 的
   模型价目/容量表——首选其代理的公开接口 `GET /public/litellm_model_cost_map`（Swagger 里声明为
   公开端点，无需密钥），不可达时回退到该接口背后的原始数据集（GitHub raw，与
   <https://models.litellm.ai/> 同源，MIT）。表**不进仓库**：宿主在第一次需要时下载，
   压成 `模型 id → [支持图片, 支持思考, 最大输入, 最大输出]` 后缓存在
   `$DSH_HOME/dsh-tauri-model-config/model-presets.json`，一天内直接用缓存；上游不可达时先用过期缓存，
   完全没有缓存时退回家族规则（`claude` / `gemini` / `grok-N` / `-vl` / `-vision` / `-omni` /
   `glm-Nv` / `glm-4.5+` / `seed-1.6+` / `-thinking` / `r1` / `qwq` / `minimax-m1|m2` / `qwen3` / `o1-o9`）。

   为什么是全量取一次：该接口按模型查询是做不到的——`/models/{model_id}` 需要密钥，且回答的是
   「这个模型在本代理上是否部署」，公开实例上任何厂商 id 都是 404；能力事实只存在于整张表里，
   而这张表只提供全量。于是宿主一天取一次（约 1 MB），客户端只收到压好的 72 KB 表。

请求事实全部来自表单当前显示的值（`provider` / `baseURL` / `api`，以及已输入未保存的 `apiKey`），
插件不认识任何具体部署；凭据只在宿主侧解析，响应里从不回显，也不进 URL。

并入草稿时的优先级：

- 容量以端点披露为准；端点什么都没说时用能力表的值，已有值永不被能力表覆盖。
- 图片与思考先看能力表，表没给出「能」的结论时由家族规则按命名补一条（只做加法，不做减法：
  把模型误判成只能读文字会让用户发不出图片，代价比多勾一个开关大）。
- **单行「获取配置」**：只补空缺字段，不覆盖已有值。
- **「自动配置所有模型」**：按按钮语义重新配置，端点披露的容量会覆盖行内旧值；端点没披露的字段保持不动。

两条路径都会给出「已写入 N 个 / M 个未被端点披露」的结果行。

## 宿主路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/desktop/dsh-tauri-model-config/endpoint/models` | 读取提供方端点的 `/models` 清单并归一化容量 |
| GET | `/api/desktop/dsh-tauri-model-config/presets` | 取模型能力表（`force=true` 忽略缓存有效期） |
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
- 图片能力既不在官方发现通道的返回里，也没有跨厂商的端点字段：它来自模型能力表，表里没有的靠家族规则。两者都是社区口径的近似值，用户随时可以在高级区改；单行「获取配置」也不会覆盖手写值。
- 能力表需要一次网络请求（约 1 MB，落盘后一天内不再请求）。离线且从未下载过时，只剩家族规则能补图片/思考，容量仍由端点清单提供。
- 档位只提供官方词表内的勾选，线值固定等于档位名；端点要求特殊线值时改设置文档即可。
