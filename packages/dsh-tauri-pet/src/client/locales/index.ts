/**
 * locales/index.ts — 本插件自有文案（桌宠开关、选择宠物、提示）。
 * 走 locale 服务的非类型化注册面（register(ns, locale, dict)），zh/en 双语齐备，
 * 语言自动跟随宿主 UI；`text()` 支持 `{name}` 插值。
 */
import type { ClientContext } from 'dsh-tauri/client'
import type { LocaleKey } from '../types'
import { PET_CLIENT_NS as NS } from '../constants'

export { PET_CLIENT_NS as NS } from '../constants'

/** zh 字典（键集合的权威）。 */
const DICT_ZH: Record<LocaleKey, string> = {
  name: '桌宠',
  enable: '启用',
  disable: '停用',
  enabled: '已启用',
  disabled: '已停用',
  close: '关闭',
  selectPet: '选择宠物',
  show: '显示',
  hide: '隐藏',
  chooseCodex: 'Codex',
  import: '导入',
  pets: '宠物',
  petWindowHint: '桌宠会以独立透明窗口显示在桌面一角',
  enabledHint: '桌宠已启用，正在桌面显示',
  disabledHint: '桌宠未启用',
  loadFailed: '读取桌宠状态失败',
  setEnabledFailed: '切换桌宠状态失败',
  setPetFailed: '选择宠物失败',
}

/** en 字典，与 zh 键集完全一致。 */
const DICT_EN: Record<LocaleKey, string> = {
  name: 'Pet',
  enable: 'Enable',
  disable: 'Disable',
  enabled: 'Enabled',
  disabled: 'Disabled',
  close: 'Close',
  selectPet: 'Select pet',
  show: 'Show',
  hide: 'Hide',
  chooseCodex: 'Codex',
  import: 'Import',
  pets: 'Pets',
  petWindowHint: 'The pet shows in a separate transparent window on the desktop',
  enabledHint: 'Pet enabled, showing on the desktop',
  disabledHint: 'Pet disabled',
  loadFailed: 'Failed to load pet status',
  setEnabledFailed: 'Failed to toggle pet status',
  setPetFailed: 'Failed to select pet',
}

/** 活跃语言 id（module 级缓存，apply 时初始化并由订阅推进）。 */
let activeLocale = 'en'

/**
 * 在 apply 里安装：注册双语字典，并桥接 locale 变更到 module 级缓存。
 * @param ctx - 客户端根上下文（须已注入 locale 服务）。
 */
export function installLocale(ctx: ClientContext): void {
  activeLocale = ctx.locale.getLocale().active
  ctx.locale.register(NS, 'zh', DICT_ZH)
  ctx.locale.register(NS, 'en', DICT_EN)
  ctx.locale.subscribe(() => {
    activeLocale = ctx.locale.getLocale().active
  })
}

/**
 * 按当前活跃语言取一条文案，并做 `{name}` 插值。
 * @param key - 文案键。
 * @param values - 插值表。
 */
export function text(key: LocaleKey, values: Record<string, string | number> = {}): string {
  const dict = activeLocale === 'en' ? DICT_EN : DICT_ZH
  return (dict[key] || DICT_EN[key] || key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''))
}
