/**
 * client/modules/reause.ts — `@reause/core` 的唯一出口。
 *
 * 依赖收敛（与 unstorage / hookable / ofetch / valtio-define 同一条规则）：
 * 插件的 client bundle 是 ModuleLoader 里的 CJS 工厂，模块表只认识平台种子词
 * （react / @deepseek-ai/*）与已加载的链接模块（dsh-tauri/client）。若各插件直接
 * `import { useEventListener } from '@reause/core'`，产物会发出模块表查不到的
 * require（"missed the module table"）。因此 reause 只在这里被 import 一次、
 * 随 dsh-tauri/client 内联，插件一律 `from 'dsh-tauri/client'` 取用。
 *
 * 用 `export *`（而非挑选清单）的理由：reause 是纯 tree-shakable 的 hooks 库，
 * 只有真正被插件用到的 hook 才会进入最终产物；挑选手工清单会让「插件想用一个
 * 常见 hook」变成一次跨包改动，收益为零。
 */
export * from '@reause/core'
