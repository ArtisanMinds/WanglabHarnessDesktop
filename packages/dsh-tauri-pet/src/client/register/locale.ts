import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { PET_CLIENT_NS as NS } from '../constants'
import { DICT_EN, DICT_ZH } from '../locales'
import { store } from '../store'

/**
 * register/locale.ts — 桌宠双语文案的注册与活跃语言同步。
 *
 * 旧实现把「活跃语言」放在模块级变量 + createExternalStore，组件用
 * useSyncExternalStore 订阅；现在语言快照进 `store.locale`（valtio-define），
 * 注册与订阅统一交给 defineRegister 的控制器（卸载即退订）。
 */
export const localeFeature = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(ctx.locale.register(NS, 'zh', DICT_ZH))
  controller.add(ctx.locale.register(NS, 'en', DICT_EN))
  store.locale.setActive(ctx.locale.getLocale().active)
  controller.add(ctx.locale.subscribe(() => {
    try {
      store.locale.setActive(ctx.locale.getLocale().active)
    }
    catch {
      // 插件 reload/卸载时上下文会短暂失效（inactive context），服务访问器抛错；
      // 此时无需更新本地 locale 快照，忽略本次通知避免 `locale subscriber crashed` 刷屏。
    }
  }))
})
