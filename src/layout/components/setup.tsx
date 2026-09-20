import type { IconComponent } from './loadable'
import type { SetupStatus } from '@/store/modules/harness'
import { ArrowDownToLine, CircleCheck, CircleExclamation, CircleInfo, Copy, Magnifier, Rocket, ShieldCheck } from '@gravity-ui/icons'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { If, Then } from 'react-if-lite'
import { useStore } from 'valtio-define'
import { button } from '@/components/primitives'
import { store } from '@/store'
import { containsPatchEntryUnresolved } from '@/store/modules/harness'
import { writeClipboardText } from '@/utils/clipboard'
import { toast } from '@/utils/toast'
import { Loadable } from './loadable'

// 各阶段对应不同图标，保持与 logo 一致的黑白中性色调
const STATUS_ICONS: Record<SetupStatus, IconComponent> = {
  checking: Magnifier,
  installing: ArrowDownToLine,
  starting: Rocket,
  preinstall: CircleInfo,
  ready: CircleCheck,
  error: CircleExclamation,
}

async function copyLogsHandler(t: (key: string) => string) {
  let logs: string
  try {
    logs = await invoke<string>('read_run_logs')
  }
  catch (err) {
    // 读取失败必须可见：静默 catch 会让「复制日志」看起来毫无反应
    console.error('[Setup] failed to read logs:', err)
    toast(t('messages.logs_read_failed'), { variant: 'danger' })
    return
  }
  // 成功/失败提示由 writeClipboardText 统一给出，这里只记录日志
  await writeClipboardText(logs, t('messages.logs_copied')).catch((err) => {
    console.error('[Setup] failed to copy logs:', err)
  })
}

/**
 * 安装/更新页：基于通用 Loadable 组件渲染，
 * 视觉与官方 web shell 的 boot 加载页（AppRoot）一致。
 * 状态与重试动作直接从 harness store 读取，不再接收 props。
 */
export function Setup() {
  const { t } = useTranslation()
  const {
    status,
    installer,
    errorMsg,
    errorLogs,
    pluginConflictHint,
    inotifyLimitHint,
    patchLayerHint,
    downloadDisabled,
  } = useStore(store.harness)
  const error = status === 'error'
  // 环境禁用了依赖下载（E2E 的 `DSH_E2E_DISABLE_DOWNLOAD=1`）：装配必然停在
  // 「找不到 dsh CLI」，但那是被刻意截断的结果而非故障。按「禁用页」渲染，
  // 版式与错误页完全一致（同一个 Loadable 的失败版式：图标 + 静态说明 + 动作行），
  // 只是文案与动作不同。
  const disabled = error && downloadDisabled
  const installing = status === 'installing'
  const heading = disabled
    ? t('status.download_disabled')
    : (error ? t('status.error') : installer.title || t('status.installing'))
  // Loadable 的失败版式由 `errorMsg != null` 触发：禁用页必须把说明当失败信息传进去，
  // 否则会落进加载版式（没有图标、标题下面挂一个 spinner）。
  const failureMsg = disabled ? t('status.download_disabled_detail') : errorMsg
  const StatusIcon = disabled ? ArrowDownToLine : STATUS_ICONS[status]
  // 安装中展示安装日志；错误态展示启动失败时从 dsh 服务日志读取的真实错误行。
  // 禁用页不给日志面板：装配根本没跑，日志只会误导。
  const logs = disabled
    ? undefined
    : (installing ? installer.logs : (error && errorLogs.length > 0 ? errorLogs : undefined))
  // 错误态的针对性提示：插件路由冲突 / Linux inotify 文件监视上限 / 补丁层问题，
  // 三者互斥（由各自的失败特征识别），优先展示最具体的一条。
  const hint = error && !disabled ? (patchLayerHint || pluginConflictHint || inotifyLimitHint) : undefined
  // 补丁层问题分两种，恢复动作不同：语法错误整层隔离（改名备份），悬空 insert 只
  // 剥离解析不到的条目。两者的提示共用 patchLayerHint，入口按错误特征二选一。
  const patchEntriesUnresolved = !disabled && error && containsPatchEntryUnresolved(errorMsg)
  const patchLayerBroken = !disabled && error && patchLayerHint !== '' && !patchEntriesUnresolved

  return (
    <Loadable
      icon={StatusIcon}
      title={heading}
      subtitle={error ? undefined : installer.detail || t('status.installing')}
      percentage={installing ? installer.percentage : undefined}
      logs={logs}
      errorMsg={error ? failureMsg : undefined}
      testId={disabled ? 'dsh-setup-disabled' : error ? 'dsh-setup-error' : undefined}
    >
      {hint && (
        <p className="m-0 text-xs leading-[18px] break-all text-load-muted">{hint}</p>
      )}
      <If cond={disabled}>
        <Then>
          {/* 禁用态操作区：与错误页同一行布局，但只保留「复制日志」——重试与安全模式
              在下载被环境禁用的前提下都没有意义。 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              className={button({ tone: 'ghost', size: 'sm' })}
              onClick={() => copyLogsHandler(t)}
            >
              <Copy className="size-4" />
              {t('buttons.copy_logs')}
            </button>
          </div>
        </Then>
      </If>
      <If cond={error && !disabled}>
        <Then>
          {/* 错误态操作区：重试 / 复制日志 / 安全模式 三按钮放同一行，避免叠罗汉 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              className={button({ tone: 'primary', size: 'sm' })}
              onClick={() => {
                void store.harness.boot()
              }}
            >
              {t('app.retry')}
            </button>
            <If cond={patchLayerBroken}>
              <button
                className={button({ tone: 'primary', size: 'sm' })}
                onClick={() => {
                  void store.harness.quarantineBrokenPatchLayers()
                }}
              >
                {t('buttons.quarantine_patch')}
              </button>
            </If>
            <If cond={patchEntriesUnresolved}>
              <button
                className={button({ tone: 'primary', size: 'sm' })}
                onClick={() => {
                  void store.harness.stripUnresolvedPatchEntries()
                }}
              >
                {t('buttons.strip_patch_entries')}
              </button>
            </If>
            <button
              className={button({ tone: 'ghost', size: 'sm' })}
              onClick={() => copyLogsHandler(t)}
            >
              <Copy className="size-4" />
              {t('buttons.copy_logs')}
            </button>
            <button
              className={button({ tone: 'primary', size: 'sm' })}
              onClick={() => {
                void store.harness.enterSafeMode()
              }}
            >
              <ShieldCheck className="size-4" />
              {t('buttons.safe_mode')}
            </button>
          </div>
          <p className="m-0 text-xs leading-[18px] break-all text-load-muted">
            {t('hints.safe_mode')}
          </p>
        </Then>
      </If>
    </Loadable>
  )
}
