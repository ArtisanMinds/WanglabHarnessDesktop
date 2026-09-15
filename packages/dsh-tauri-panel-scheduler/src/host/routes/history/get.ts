/**
 * routes/history/get.ts — GET /api/dsh-scheduler/history：列出执行记录（可按任务过滤）。
 *
 * 请求级逻辑（读 query、过滤、排序、组织响应）都在处理器体内；领域服务只读全量。
 */

import { defineEventHandler, getQuery } from 'dsh-tauri'
import { getAllRun } from '../../service/run'

export default defineEventHandler(async (event) => {
  // 重复查询参数取第一次出现（与迁移前的 URLSearchParams.get 一致）。
  const raw = getQuery<Record<string, string | string[] | undefined>>(event).taskId
  const taskId = (Array.isArray(raw) ? raw[0] : raw) ?? ''
  const all = await getAllRun()
  const runs = taskId ? all.filter(run => run.taskId === taskId) : all
  return { runs: [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) }
})
