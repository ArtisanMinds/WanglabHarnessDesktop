import type { TestProject } from 'vitest/node'
import process from 'node:process'
import { startDshHost } from './support/dsh-host'

/**
 * e2e project 的 globalSetup：起一次真实 dsh web 宿主，把地址 provide 给用例。
 *
 * globalSetup 跑在测试 worker 之外、且早于它们创建，所以这里定义的变量用例读不到；
 * 地址一律经 `project.provide()` 下传，用例用 `inject('dshBaseUrl')` 取。
 *
 * 被挂载的插件由 `DSH_E2E_PLUGIN`（默认 `dsh-tauri-pet`）与 `DSH_E2E_ALSO` 指定。
 * `also` 的默认值覆盖插件路由用例需要的三个代表包：`dsh-tauri`（核心桥）、
 * `dsh-tauri-pet`（只声明 GET 的代表路由）、`dsh-tauri-rightclick`（只声明 POST 的代表路由）。
 * 这样多数用例都能复用这一个宿主，不必各自再起一个——每次起宿主都会多一个进程与一行日志。
 */

declare module 'vitest' {
  export interface ProvidedContext {
    /** dsh web 的裸 origin（`http://127.0.0.1:<port>`），用于宿主路由的 HTTP 断言。 */
    dshBaseUrl: string
    /** 带一次性 token 的就绪 URL（仅用于观测；已由编排换成 Cookie）。 */
    dshUrl: string
    /**
     * 浏览器会话 Cookie（`name=value`）。`/api/**` 要求它：
     * 根路径的 `?token=` 交换是唯一的取用途径，query token 与 Authorization 头都不被接受。
     */
    dshCookie: string
    /** 本次运行独占的 DSH_HOME（调试与断言落盘用）。 */
    dshHome: string
    /** 已挂载的包名。 */
    dshMounted: string[]
  }
}

/** 共享宿主的默认附加挂载：核心桥 + 只声明 GET 与只声明 POST 的两个代表路由提供方。 */
const DEFAULT_ALSO = 'dsh-tauri,dsh-tauri-rightclick'

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const plugin = process.env.DSH_E2E_PLUGIN ?? 'dsh-tauri-pet'
  const also = (process.env.DSH_E2E_ALSO ?? DEFAULT_ALSO).split(',').map(item => item.trim()).filter(Boolean)
  const host = await startDshHost({ plugin, also, keepHome: process.env.DSH_E2E_KEEP_HOME === '1' })

  project.provide('dshBaseUrl', host.baseUrl)
  project.provide('dshUrl', host.url)
  project.provide('dshCookie', host.cookie)
  project.provide('dshHome', host.home)
  project.provide('dshMounted', [...host.mounted])

  return async () => {
    await host.stop()
  }
}
