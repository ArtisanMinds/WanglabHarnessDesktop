/**
 * locales/index.ts — 本插件自有文案（设置页页签/工具栏/宠物卡片/大小滑条/错误）。
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
  selectPet: '选择宠物',
  refresh: '刷新',
  create: '创建',
  createHint: '创建宠物即将支持',
  wakePet: '唤醒宠物',
  collapsePet: '收起宠物',
  import: '导入',
  imported: '已导入',
  selected: '已选',
  select: '选择',
  tabInstalledDesc: '宠物会管理对话串，并突出显示需要关注的事项',
  tabCodexDesc: '从 Codex 或压缩包中导入 Codex 宠物（支持 .zip 文件）',
  petNameDsh: '猫咪小助手',
  petNameCodex: '柴犬阿黄',
  petDescDsh: '一个聪明友好的虚拟宠物，协助您高效处理日常工作与对话串。',
  petDescCodex: '忠诚、活泼，能够随时提醒您关注重要事务。',
  emptyImported: '尚未导入宠物，点击右上角「导入」添加 .zip 资源包',
  importFailed: '导入宠物失败',
  listFailed: '读取宠物列表失败',
  toggleFailed: '切换桌宠窗口失败',
  setPetFailed: '选择宠物失败',
  setSizeFailed: '设置宠物大小失败',
  sizeLabel: '宠物大小',
  sizeHint: '拖动滑杆实时调整宠物大小（50%–200%）',
}

/** en 字典，与 zh 键集完全一致。 */
const DICT_EN: Record<LocaleKey, string> = {
  name: 'Pet',
  selectPet: 'Select pet',
  refresh: 'Refresh',
  create: 'Create',
  createHint: 'Creating pets is coming soon',
  wakePet: 'Wake pet',
  collapsePet: 'Collapse pet',
  import: 'Import',
  imported: 'Imported',
  selected: 'Selected',
  select: 'Choose',
  tabInstalledDesc: 'Pets manage your conversation threads and highlight items that need attention',
  tabCodexDesc: 'Import Codex pets from Codex or archives (.zip files supported)',
  petNameDsh: 'Kitty Assistant',
  petNameCodex: 'Shiba Ahuang',
  petDescDsh: 'A smart, friendly virtual pet that helps you handle daily work and threads efficiently.',
  petDescCodex: 'Loyal and lively, always ready to remind you of what matters.',
  emptyImported: 'No pets imported yet. Click "Import" in the top right to add a .zip package',
  importFailed: 'Failed to import pet',
  listFailed: 'Failed to load pet list',
  toggleFailed: 'Failed to toggle the pet window',
  setPetFailed: 'Failed to select pet',
  setSizeFailed: 'Failed to set pet size',
  sizeLabel: 'Pet size',
  sizeHint: 'Drag the slider to resize the pet in real time (50%–200%)',
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
