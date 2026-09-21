/**
 * client/locales/index.ts — 本插件界面文案（zh / en 双语）。
 *
 * 一个包只声明一次：命名空间 + 双语词典 → `locale.text` / `locale.useLocale` /
 * `locale.registerLocale`。活跃语言是唯一可变事实，收敛在底座共享的 store 里，
 * 插件不再自建 locale 管理器或 revision store。
 */

import type { LocaleKey } from '../types'
import { defineLocale } from 'dsh-tauri/client'
import { PLUGIN_ID } from '../constants'

/** zh 字典（键集合的权威）。 */
const zh = {
  fileButton: '文件',
  editedOne: '已编辑 {name}',
  editedMany: '已编辑 {count} 个文件',
  review: '审核',
  viewChanges: '查看更改',
  moreFiles: '再显示 {count} 个文件',
  collapseFiles: '收起文件',
  runningChanged: '{count} 个文件已更改',
  binary: '二进制',
  unavailableTitle: '变更不可用',
  unavailableReason: '原因：{reason}',
  expiredReason: '该轮的快照已被回收（超出保留范围，或快照仓因超限被重建），没有可用的变更明细。',
  gitUnavailableReason: '未找到 git 可执行文件，请先安装 Git 并使其在 PATH 中可用。',
  snapshotFailedReason: '该轮的快照没能生成（捕获或统计过程失败），因此没有可用的变更明细。',
  unsafePathReason: '目标路径上有符号链接或非空目录，出于安全考虑已跳过。',
  workspaceBusyReason: '该工作区正被另一个 DSH 进程占用（它正在同一个工作区里捕获变更），请稍后重试。',
  workspaceChangedReason: '该轮期间工作区被切换了提交（新建工作树或检出），改动无法归属到这一轮，已跳过。',
  skippedOversized: '{count} 个超大文件未纳入快照',
  skippedNestedRepos: '{count} 个嵌套仓库已跳过，其内部文件未纳入快照',
  openFile: '打开 {name}',
} as const satisfies Record<LocaleKey, string>

/** en 字典，与 zh 键集完全一致（locale 运行时强制双语平衡）。 */
const en: Record<LocaleKey, string> = {
  fileButton: 'Files',
  editedOne: 'Edited {name}',
  editedMany: 'Edited {count} files',
  review: 'Review',
  viewChanges: 'View changes',
  moreFiles: 'Show {count} more files',
  collapseFiles: 'Collapse files',
  runningChanged: '{count} file(s) changed',
  binary: 'binary',
  unavailableTitle: 'Changes unavailable',
  unavailableReason: 'Reason: {reason}',
  expiredReason: 'This turn’s snapshot has been reclaimed (beyond the retention window, or the snapshot repository was rebuilt after exceeding its size limit), so no change details are available.',
  gitUnavailableReason: 'The git executable was not found. Install Git and make it available on PATH.',
  snapshotFailedReason: 'No snapshot could be produced for this turn (the capture or the diff failed), so no change details are available.',
  unsafePathReason: 'A symbolic link or a non-empty directory sits on the target path, so it was skipped for safety.',
  workspaceBusyReason: 'Another DSH process is currently working in this workspace (capturing changes there). Try again in a moment.',
  workspaceChangedReason: 'The workspace was switched to a different commit during this turn (a new worktree or a checkout), so the changes cannot be attributed to this turn and were skipped.',
  skippedOversized: '{count} oversized file(s) were not captured',
  skippedNestedRepos: '{count} nested repository/repositories skipped — their contents were not captured',
  openFile: 'Open {name}',
}

export const locale = defineLocale(PLUGIN_ID, { zh, en })
