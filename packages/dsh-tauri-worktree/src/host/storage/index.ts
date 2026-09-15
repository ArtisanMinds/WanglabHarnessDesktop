/**
 * host/storage.ts — 工作树宿主状态的持久化：binding ledger + 一次性检出上下文。
 *
 * 为什么按会话分文件：旧实现把全部 binding 挤进单个 `ledger.json`（load-modify-save
 * 整表读写）。同一组会话下多个工作树的 create/checkout/discard 会并发 load-modify-save
 * 同一文件，互相覆盖并反复踩 rename 的 EPERM 锁竞争（「多点几次多出一堆工作树」）。
 * 这里改为每个会话独立文件 `ledger/<sessionId>.json`，读改写只作用于单个会话，天然消除
 * 共享文件竞争，无需额外加锁。
 *
 * 数据根：固定为 `DSH_HOME`（`~/.dsh`）。插件行配置不提供覆盖项——调用方不再传根目录，
 * 路径一律从这里拼出，避免同一份状态被拆到两个根下。测试用 `vi.mock('dsh-tauri')`
 * 注入临时根。
 *
 * key 形态：unstorage 以 `:` 作层级分隔符，driver 把它还原成 `/`（见 dsh-tauri 的
 * fsAtomicDriver）。故「ledger:sess-id.json」落在 `base/ledger/sess-id.json`。
 * 原子写走 dsh-tauri 共享的 fsAtomicDriver（tmp+rename）。同步读保留给工具 execute 与
 * systemPrompt 渲染路径（小文件同步读可接受）。
 */

import type { Binding, CheckoutContext } from '../types'
import { readdirSync, readFileSync } from 'node:fs'
import { DSH_HOME, fsAtomicDriver } from 'dsh-tauri'
import { join } from 'pathe'
import { createStorage } from 'unstorage'

const LEDGER_DIR = 'ledger'
const CHECKOUT_CONTEXT_DIR = 'checkout-context'

/**
 * 数据根下的 key-value 存储（绝对路径直接作为 driver base）。
 *
 * `fsAtomicDriver({ base })` 的 base 是绝对路径时原样使用，写盘走 tmp+rename 原子写。
 * `DSH_HOME` 是模块级常量，故存储实例可以一次建立、全程复用。
 */
const storage = createStorage({ driver: fsAtomicDriver({ base: DSH_HOME }) })

/** 会话 id → 按会话文件的相对路径（不含 base）。 */
function sessionFile(sessionId: string): string {
  return `${LEDGER_DIR}/${sessionId}.json`
}

function checkoutContextFile(sessionId: string): string {
  return `${CHECKOUT_CONTEXT_DIR}/${sessionId}.json`
}

/** 解析单个对象；文件缺失或内容损坏返回 null。 */
function parseBinding(raw: string): Binding | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? parsed as Binding
      : null
  }
  catch {
    return null
  }
}

function parseCheckoutContext(raw: string): CheckoutContext | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? parsed as CheckoutContext
      : null
  }
  catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// binding ledger（按会话独立文件）
// ---------------------------------------------------------------------------

/**
 * 同步读取某会话的 binding。文件缺失/损坏一律返回 null（绝不让只读渲染路径抛错）。
 */
export function loadBinding(sessionId: string): Binding | null {
  try {
    return parseBinding(readFileSync(join(DSH_HOME, sessionFile(sessionId)), 'utf8'))
  }
  catch {
    /* 文件缺失/损坏按无绑定处理 */
    return null
  }
}

/** 原子写某个会话的 binding（幂等：同会话重复写只覆盖自己的文件）。 */
export async function saveBinding(sessionId: string, binding: Binding): Promise<void> {
  await storage.setItem(
    sessionFile(sessionId),
    `${JSON.stringify(binding, null, 2)}\n`,
  )
}

/** 删除某个会话的 binding（不存在时视为成功）。 */
export async function removeBinding(sessionId: string): Promise<void> {
  await storage.removeItem(sessionFile(sessionId))
}

/** 同步枚举全部 binding（仅按 key 寻址等「需要全量」的路径使用）。 */
export function listBindings(): Binding[] {
  const results: Binding[] = []
  const dir = join(DSH_HOME, LEDGER_DIR)
  let names: string[]
  try {
    names = readdirSync(dir)
  }
  catch {
    return results // ledger/ 目录尚不存在
  }
  for (const name of names) {
    // 只认本方案的 `<sessionId>.json` 叶文件，忽略中断写盘残留的 tmp/目录项。
    if (!name.endsWith('.json'))
      continue
    try {
      const binding = parseBinding(readFileSync(join(dir, name), 'utf8'))
      if (binding)
        results.push(binding)
    }
    catch {
      /* 单个文件损坏不阻断其余 */
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// 一次检出上下文（按会话独立文件）
// ---------------------------------------------------------------------------

/** 同步读取某会话的一次性检出上下文（缺失/损坏返回 null）。 */
export function loadCheckoutContext(sessionId: string): CheckoutContext | null {
  try {
    return parseCheckoutContext(readFileSync(join(DSH_HOME, checkoutContextFile(sessionId)), 'utf8'))
  }
  catch {
    /* 文件缺失/损坏按无上下文处理 */
    return null
  }
}

/** 写入某会话的一次性检出上下文（原子写，只碰自己的文件）。 */
export async function setPendingCheckoutContext(sessionId: string, context: CheckoutContext): Promise<void> {
  await storage.setItem(
    checkoutContextFile(sessionId),
    `${JSON.stringify(context, null, 2)}\n`,
  )
}

/** 清除某会话的一次性检出上下文（不存在时视为成功）。 */
export async function clearPendingCheckoutContext(sessionId: string): Promise<void> {
  await storage.removeItem(checkoutContextFile(sessionId))
}
