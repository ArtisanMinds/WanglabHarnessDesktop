/**
 * 内嵌 dsh 界面的阻塞式引导弹层（跨域 iframe 内）。
 *
 * 首次进入 dsh 时会先后弹出两个弹层，二者都把帧内的 `_mask_` 遮罩镜像到壳层导航栏
 * （`packages/dsh-tauri/src/client/register/style.utils.ts` 的 `getOverlayMarkedStyle()`
 * → `src/layout/components/navbar.tsx` 的遮罩 div），导航栏因此不可点，于是所有依赖
 * 「点导航栏」的用例都会被卡死：
 * - 「内测声明」（`WelcomeNotice`，`headless` 渲染）：正文里只有「继续」一个按钮；
 * - 「添加一个 API Key 开始使用」（`DeepSeekOnboardingDialog`）：退出按钮是编辑器
 *   底部的取消项（「稍后配置」），位于 `EditorFooter` 的 `_editorActions` 容器内。
 *
 * 两个弹层都走 `OnboardingModal`，而后者把 `Modal.onClose` 写成了空实现
 * （`ignoreImplicitDismiss`），因此**点遮罩、按 Esc 都关不掉**：只有点各自的正向按钮
 * 才会触发 `complete()` 收起弹层。这是本模块必须按键而不能按遮罩的原因。
 *
 * 判定用结构与类名后缀，不用文案：文案随语言变（`zh-CN`/`en-US`），且规范禁止 E2E
 * 依赖文本。类名后缀是仓库既有做法（生产代码本身就按 `div[class^="_mask_"]` 匹配）。
 *
 * 帧是跨域的（壳层 `tauri://localhost` vs dsh `http://127.0.0.1:<port>`），顶层脚本
 * 拿不到帧内文档；上游驱动靠 `frame.contentWindow.eval`，跨域必然超时。因此这里依赖
 * 仓库的 vendor 补丁（`src-tauri/vendor/tauri-plugin-wdio-webdriver`，见其 `PATCH.md`）
 * 把 `switchFrame` 路由到 `ICoreWebView2Frame2::ExecuteScript`。
 */

import { NAVBAR_MENU_CONFIG, SHELL_IFRAME } from './selectors'

/** 帧内弹层根节点（`dsh-client-ui-primitives` 的 `Modal`，`role="dialog"`）。 */
const DIALOG = 'div[role="dialog"][aria-modal="true"]'

/** apiKey 引导的取消按钮（`EditorFooter` 的 `_editorActions` 里第一个按钮）。 */
const EDITOR_CANCEL = 'div[class*="_editorActions"] > button'

type DismissOutcome = 'none' | 'notice' | 'onboarding'

/** 壳层导航栏当前是否可点（被 dsh 弹层遮罩镜像时为 false）。 */
export async function isShellInteractive(browser: WebdriverIO.Browser): Promise<boolean> {
  const node = await browser.$(NAVBAR_MENU_CONFIG)
  return await node.isExisting() && await node.isClickable()
}

/**
 * 关掉当前帧内弹层；无弹层时返回 `none`。
 *
 * 返回的分支名用于日志排错：`notice` = 内测声明，`onboarding` = apiKey 引导。
 */
function dismissCurrent(browser: WebdriverIO.Browser): Promise<DismissOutcome> {
  return browser.execute((dialogSelector: string, cancelSelector: string) => {
    const dialog = document.querySelector(dialogSelector)
    if (dialog === null)
      return 'none'

    const cancel = dialog.querySelector(cancelSelector) as HTMLElement | null
    if (cancel !== null) {
      cancel.click()
      return 'onboarding'
    }

    // 内测声明是 headless 弹层：没有表头关闭按钮，正文只有「继续」一个按钮。
    dialog.querySelectorAll('button')[0]?.click()
    return 'notice'
  }, DIALOG, EDITOR_CANCEL) as Promise<DismissOutcome>
}

/** 弹层是否已离场；用于确认点对了按钮，避免对着同一个弹层空转。 */
async function dialogGone(browser: WebdriverIO.Browser, timeout: number): Promise<boolean> {
  try {
    await browser.waitUntil(
      () => browser.execute((dialogSelector: string) => document.querySelector(dialogSelector) === null, DIALOG),
      { timeout, interval: 200, timeoutMsg: '弹层未离场' },
    )
    return true
  }
  catch {
    return false
  }
}

/**
 * 确保壳层导航栏可点：不可点就进帧关掉挡住它的 dsh 弹层，直到导航栏恢复或超时。
 *
 * 必须做成「可重入的闸」而不能只在 `beforeAll` 关一次：apiKey 引导的完成态是**按帧内
 * 页面加载**判定的插槽状态，不落盘；iframe 一旦重建（语言切换等）就会重新弹出。且它
 * 的挂载晚于服务就绪，`beforeAll` 里往往还没出现。
 */
export async function ensureShellInteractive(browser: WebdriverIO.Browser, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const seen = new Set<DismissOutcome>()

  while (Date.now() < deadline) {
    if (await isShellInteractive(browser))
      break

    const frame = await browser.$(SHELL_IFRAME)
    if (!await frame.isExisting()) {
      await browser.pause(500)
      continue
    }

    try {
      await browser.switchFrame(frame)
      const outcome = await dismissCurrent(browser)
      if (outcome === 'none') {
        await browser.pause(500)
      }
      else {
        seen.add(outcome)
        await dialogGone(browser, 15_000)
      }
    }
    finally {
      // 无论成功与否都退回顶层，否则后续所有用例都会在帧上下文里跑。
      await browser.switchFrame(null)
    }

    // 弹层关闭后壳层要等一次 `dsh://style` 回报才会撤掉镜像遮罩，让它跑一轮。
    await browser.pause(400)
  }

  if (!await isShellInteractive(browser)) {
    throw new Error(
      `壳层导航栏长时间不可点：dsh 引导弹层未能关闭（已关闭：${[...seen].join(', ') || '无'}）。`
      + '若弹层结构变化，需同步 test/e2e/support/onboarding.ts 的选择器。',
    )
  }

  if (seen.size > 0)
    console.warn(`[dsh-onboarding] 已关闭引导弹层：${[...seen].join(', ')}`)
}
