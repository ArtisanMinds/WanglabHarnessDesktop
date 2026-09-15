/**
 * routes/open/post.ts — POST /open：在系统文件管理器里打开技能 / 仓库目录。
 *
 * 目标一律服务端解析（用户技能根、插件状态根、某技能所在目录、某注册仓库目录）；
 * 浏览器从不提供原始路径，因此无法被改造成任意目录打开。方法限制 / 连接鉴权 /
 * 回环与跨源 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import type { PanelExtensionHost } from '../../types'
import { mkdirSync } from 'node:fs'
import { defineEventHandler, dshContextOf, readBody } from 'dsh-tauri'
import { openDirectory } from '../../service/opener'
import { getSkillRoots, skillsRootDir } from '../../service/skill-root'
import { userSkillsDir } from '../../service/skills'

/** 打开请求体：target 决定用哪个字段（name / id）。 */
interface SkillOpenBody { target?: unknown, name?: unknown, id?: unknown }

export default defineEventHandler(async (event) => {
  const host = dshContextOf(event) as unknown as PanelExtensionHost
  const body = await readBody<SkillOpenBody>(event, { type: 'json' })
  if (typeof body?.target !== 'string') {
    event.res.status = 400
    return { error: 'target is required' }
  }
  try {
    let dir: string | undefined
    if (body.target === 'user-skills') {
      dir = userSkillsDir()
      // 用户还没建过任何技能时该目录不存在；「打开技能目录」应按需创建而非报错。
      mkdirSync(dir, { recursive: true })
    }
    else if (body.target === 'plugin-state') {
      dir = skillsRootDir()
      mkdirSync(dir, { recursive: true })
    }
    else if (body.target === 'skill') {
      if (typeof body.name !== 'string') {
        event.res.status = 400
        return { error: 'name is required' }
      }
      const definition = await host.skills.get(body.name)
      if (definition === undefined) {
        event.res.status = 404
        return { error: 'skill not found' }
      }
      // 文件型技能打开它所在目录（SKILL.md 的父目录）；目录型技能直接用其根。
      dir = definition.path !== undefined
        ? definition.path.replace(/[/\\]SKILL\.md$/, '').replace(/[/\\][^/\\]+\.md$/, '')
        : definition.resourceBase?.kind === 'directory' ? definition.resourceBase.path : undefined
    }
    else if (body.target === 'root') {
      if (typeof body.id !== 'string') {
        event.res.status = 400
        return { error: 'id is required' }
      }
      const entry = (await getSkillRoots()).find(row => row.id === body.id)
      if (entry === undefined) {
        event.res.status = 404
        return { error: 'repository not found' }
      }
      dir = entry.materialDir ?? entry.path ?? entry.roots[0]
    }
    else {
      event.res.status = 400
      return { error: 'unknown target' }
    }
    if (dir === undefined || !openDirectory(dir)) {
      event.res.status = 422
      return { error: 'directory is not available on disk' }
    }
    return { ok: true }
  }
  catch (error) {
    event.res.status = 500
    return { error: error instanceof Error ? error.message : String(error) }
  }
})
