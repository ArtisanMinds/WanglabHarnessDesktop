/**
 * host/service/mutation-queue.ts — 宿主变更串行队列。
 *
 * 开链（open-url）与开目录（open-path）都会拉起系统进程；两个变更同时到达时排队
 * 依次执行，避免一次用户交互里并发拉起多个 OS 打开操作。
 *
 * 队列是模块级单例（插件只有一份装配），处理器直接 `await withMutationLock(...)`
 * 包住变更本体——请求级逻辑（读体、校验、置状态码、组织响应）仍留在处理器体内，
 * 这里只提供「排队」这一领域能力。
 */

/** 队列尾指针：每个新变更都接在上一次落定之后（成功失败都继续，不卡死后续）。 */
let tail: Promise<unknown> = Promise.resolve()

/**
 * 把一个宿主变更排进串行队列。
 * @param operation - 变更本体（开链 / 开目录）。
 * @returns 本次变更的结果；前一次失败不会阻塞后一次。
 */
export function withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation, operation)
  tail = result.then(() => undefined, () => undefined)
  return result
}
