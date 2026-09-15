/**
 * host/service/skill-catalog.ts — 技能目录投影（领域逻辑，不是请求级助手）。
 *
 * 把宿主 skills 注册表报告的 SkillSummary 投影成设置页看到的行：附加可编辑/
 * 可删除判定、磁盘目录与所属仓库元数据；并提供注册仓库的行视图。路由处理器
 * 只做「读参 → 调本文件 → 组织响应」，不在此重复状态码与响应形状。
 */

import type { HostSkill, PanelExtensionHost, SkillRepositoryMetadata } from '../types'
import type { SkillRootEntry } from './skill-root'
import { isAbsolute, relative, resolve, sep } from 'pathe'
import { rootExists } from './repos'
import { getSkillRoots, skillsRootDir } from './skill-root'

/** One catalog skill as the browser sees it (edit flags and repository metadata added). */
export type SkillRow = HostSkill & {
  editable: boolean
  removable: boolean
  dir?: string
  policyEditable: boolean
  /** Registered root containing this skill, if any. */
  repository?: SkillRepositoryMetadata
}

/** One registered repository plus a liveness flag (roots can go stale). */
export function toRootView(entry: SkillRootEntry): SkillRootEntry & { live: boolean } {
  return { ...entry, live: entry.roots.every(root => rootExists(root)) }
}

/**
 * A 'custom' skill is writable only when its folder sits inside a root this
 * plugin manages: the materialized repositories under the plugin state dir,
 * or a registered local root. Vendored skills shipped inside the plugin
 * package (under node_modules) are custom-sourced too but stay read-only —
 * edits there would die with the next plugin update.
 */
async function customSkillWritable(dir: string): Promise<boolean> {
  const state = skillsRootDir()
  if (dir === state || dir.startsWith(state + sep))
    return true
  return (await getSkillRoots()).some(entry =>
    entry.roots.some(root => dir === root || dir.startsWith(root + sep)))
}

/** Whether the save route may write this catalog row back to disk. */
export async function skillWritable(skill: HostSkill, dir: string | undefined): Promise<boolean> {
  if (dir === undefined)
    return false
  if (skill.source === 'user-dsh')
    return true
  return skill.source === 'custom' && await customSkillWritable(dir)
}

function pathWithin(path: string, parent: string): boolean {
  const child = resolve(path)
  const root = resolve(parent)
  const nested = relative(root, child)
  return nested === '' || (!nested.startsWith(`..${sep}`) && nested !== '..' && !isAbsolute(nested))
}

/** Match a catalog row to the registered root that contributed its directory. */
function repositoryForSkill(
  skill: HostSkill,
  entries: SkillRootEntry[],
): SkillRepositoryMetadata | undefined {
  const dir = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : undefined
  if (dir === undefined)
    return undefined
  const entry = entries.find(candidate => candidate.roots.some(root => pathWithin(dir, root)))
  if (entry === undefined)
    return undefined
  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    ...(entry.kind === 'git' && entry.url !== undefined ? { githubUrl: entry.url } : {}),
  }
}

async function toSkillRow(skill: HostSkill, entries: SkillRootEntry[]): Promise<SkillRow> {
  const dir = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : undefined
  const repository = repositoryForSkill(skill, entries)
  return {
    ...skill,
    editable: await skillWritable(skill, dir),
    removable: skill.source === 'user-dsh',
    ...(dir !== undefined ? { dir } : {}),
    policyEditable: dir !== undefined,
    ...(repository !== undefined ? { repository } : {}),
  }
}

/** Repository skills are first; groups retain the registry's stable order. */
function sortSkillRows(rows: SkillRow[]): SkillRow[] {
  return rows.map((row, index) => ({ row, index }))
    .sort((left, right) => Number(right.row.repository !== undefined) - Number(left.row.repository !== undefined) || left.index - right.index)
    .map(item => item.row)
}

/** Collect the current catalog from the registry and shape it into rows. */
export async function listSkillRows(host: PanelExtensionHost): Promise<SkillRow[]> {
  const skills = await host.skills.list()
  const entries = await getSkillRoots()
  return sortSkillRows(await Promise.all(skills.map(skill => toSkillRow(skill, entries))))
}
