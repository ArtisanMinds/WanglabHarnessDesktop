/** Bilingual copy for the pet settings section. */
import type { ClientContext } from 'dsh-tauri/client'
import type { LocaleKey } from '../types'
import { createExternalStore } from 'dsh-tauri/client'
import { useSyncExternalStore } from 'react'
import { PET_CLIENT_NS as NS } from '../constants'

export { PET_CLIENT_NS as NS } from '../constants'

const DICT_ZH: Record<LocaleKey, string> = {
  clear: '取消选择',
  closePet: '关闭宠物',
  create: '创建',
  createFailed: '创建宠物会话失败',
  download: '下载',
  downloadFailed: '下载宠物失败',
  downloadInvalid: '下载文件校验失败，请重试',
  downloading: '下载中',
  emptyPets: '暂无宠物',
  enable: '启用',
  enablePet: '启用宠物',
  import: '导入',
  importFailed: '导入宠物失败',
  listFailed: '读取宠物列表失败',
  loadFailed: '宠物加载失败',
  loading: '加载中…',
  market: '市场',
  marketEmpty: '暂无可下载的宠物',
  marketFailed: '宠物市场暂时无法连接',
  name: '宠物',
  noPetSelected: '未选择宠物',
  refresh: '刷新',
  retry: '重试',
  select: '选择',
  selected: '已选择',
  setPetFailed: '选择宠物失败',
  setSizeFailed: '设置宠物大小失败',
  sizeLabel: '大小',
  toggleFailed: '切换桌宠窗口失败',
  wakePet: '唤醒宠物',
}

const DICT_EN: Record<LocaleKey, string> = {
  clear: 'Clear',
  closePet: 'Close pet',
  create: 'Create',
  createFailed: 'Failed to create a pet session',
  download: 'Download',
  downloadFailed: 'Failed to download pet',
  downloadInvalid: 'Download verification failed. Please retry.',
  downloading: 'Downloading',
  emptyPets: 'No pets',
  enable: 'Enable',
  enablePet: 'Enable pet',
  import: 'Import',
  importFailed: 'Failed to import pet',
  listFailed: 'Failed to load pet list',
  loadFailed: 'Failed to load pet',
  loading: 'Loading…',
  market: 'Market',
  marketEmpty: 'No pets available',
  marketFailed: 'Pet market is unavailable',
  name: 'Pets',
  noPetSelected: 'No pet selected',
  refresh: 'Refresh',
  retry: 'Retry',
  select: 'Choose',
  selected: 'Selected',
  setPetFailed: 'Failed to select pet',
  setSizeFailed: 'Failed to set pet size',
  sizeLabel: 'Size',
  toggleFailed: 'Failed to toggle the pet window',
  wakePet: 'Wake pet',
}

let activeLocale = 'en'
const localeState = createExternalStore({ locale: activeLocale })

export function registerLocale(ctx: ClientContext): void {
  activeLocale = ctx.locale.getLocale().active
  localeState.set({ locale: activeLocale })
  ctx.locale.register(NS, 'zh', DICT_ZH)
  ctx.locale.register(NS, 'en', DICT_EN)
  ctx.locale.subscribe(() => {
    try {
      activeLocale = ctx.locale.getLocale().active
    }
    catch {
      // 插件 reload/卸载时上下文会短暂失效（inactive context），服务访问器抛错；
      // 此时无需更新本地 locale 快照，忽略本次通知避免 `locale subscriber crashed` 刷屏。
      return
    }
    localeState.set({ locale: activeLocale })
  })
}

export function subscribePetLocale(listener: () => void): () => void {
  return localeState.subscribe(listener)
}

export function usePetLocale(): Record<LocaleKey, string> {
  const locale = useSyncExternalStore(localeState.subscribe, () => localeState.getSnapshot().locale)
  return locale.toLowerCase().startsWith('en') ? DICT_EN : DICT_ZH
}

export function text(key: LocaleKey): string {
  const dict = activeLocale.toLowerCase().startsWith('en') ? DICT_EN : DICT_ZH
  return dict[key] ?? DICT_EN[key] ?? key
}
