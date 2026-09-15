/** Bilingual copy for the pet settings section. */
import type { LocaleKey } from '../types'
import { useStore } from 'dsh-tauri/client'
import { store } from '../store'

export { PET_CLIENT_NS as NS } from '../constants'

export const DICT_ZH: Record<LocaleKey, string> = {
  clear: '取消选择',
  clearFailed: '取消选择失败',
  closePet: '关闭宠物',
  create: '创建',
  createFailed: '创建宠物会话失败',
  emptyImported: '尚未导入宠物，点击右上角「导入」添加 .zip 资源包',
  enable: '启用',
  enablePet: '启用宠物',
  import: '导入',
  importFailed: '导入宠物失败',
  listFailed: '读取宠物列表失败',
  loading: '加载中…',
  name: '宠物',
  select: '选择',
  setPetFailed: '选择宠物失败',
  setSizeFailed: '设置宠物大小失败',
  sizeHint: '调整桌宠窗口的显示大小（50–200%）',
  sizeLabel: '大小',
  tabCodexDesc: '从 Codex 或压缩包中导入 Codex 宠物（支持 .zip 文件）',
  tabInstalledDesc: '宠物会管理对话串，并突出显示需要关注的事项',
  toggleFailed: '切换桌宠开关失败',
}

export const DICT_EN: Record<LocaleKey, string> = {
  clear: 'Clear selection',
  clearFailed: 'Failed to clear pet selection',
  closePet: 'Close pet',
  create: 'Create',
  createFailed: 'Failed to create a pet session',
  emptyImported: 'No pets imported yet. Click “Import” to add a .zip package',
  enable: 'Enable',
  enablePet: 'Enable pet',
  import: 'Import',
  importFailed: 'Failed to import pet',
  listFailed: 'Failed to load pet list',
  loading: 'Loading…',
  name: 'Pets',
  select: 'Choose',
  setPetFailed: 'Failed to select pet',
  setSizeFailed: 'Failed to set pet size',
  sizeHint: 'Adjust the pet window size (50–200%)',
  sizeLabel: 'Size',
  tabCodexDesc: 'Import Codex pets from Codex or archives (.zip files supported)',
  tabInstalledDesc: 'Pets manage your conversation threads and highlight items that need attention',
  toggleFailed: 'Failed to toggle the pet',
}

/**
 * 组件内订阅活跃语言：`rev` 前进即重渲染，`text()` 随之按新 locale 取词。
 * 语言快照与变更订阅见 store/modules/locale.ts 与 register/locale.ts。
 */
export function usePetLocale(): void {
  useStore(store.locale)
}

export function text(key: LocaleKey): string {
  const dict = store.locale.$state.active.toLowerCase().startsWith('en') ? DICT_EN : DICT_ZH
  return dict[key] ?? DICT_EN[key] ?? key
}
