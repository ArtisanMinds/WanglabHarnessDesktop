/**
 * routes/tasks/get.ts — GET /api/dsh-scheduler/tasks：列出定时任务（可按名称过滤）。
 *
 * 请求级逻辑（读 query、过滤、组织响应）都在处理器体内；领域服务只收具体参数。
 * 方法限制 / 连接鉴权 / 跨源校验 / 1 MiB 上限由 `defineRoutes` 统一承担。
 */

import { defineEventHandler, getQuery } from 'dsh-tauri'
import { getAllTask } from '../../service/task'

export default defineEventHandler(async (event) => {
  // 重复查询参数取第一次出现（与迁移前的 URLSearchParams.get 一致）。
  const raw = getQuery<Record<string, string | string[] | undefined>>(event).search
  const search = (Array.isArray(raw) ? raw[0] : raw) ?? ''
  const all = await getAllTask()
  const tasks = search
    ? all.filter(task => task.name.toLowerCase().includes(search.toLowerCase()))
    : all
  return { tasks }
})
