import { ArrowRotateRight, FolderOpen } from '@gravity-ui/icons'
import { Button, Chip, Label, Tooltip } from '@heroui/react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { If } from 'react-if-lite'
import { toast } from '@/utils/toast'
import { useDshCores } from '../hooks/use-dsh-cores'
import { Item } from './item'
import { PanelHeader } from './panel-header'
import { PanelState } from './panel-state'

export function ConfigCore() {
  const { t } = useTranslation()
  const { cores, loading, error, refreshCores, busy } = useDshCores()
  const current = cores.find(core => core.active) ?? cores[0]

  async function refresh() {
    try {
      await refreshCores()
    }
    catch {
      toast(t('core.refresh_failed'), {})
    }
  }

  async function openDirectory() {
    if (!current?.dir)
      return
    try {
      await invoke('open_dir', { path: current.dir })
    }
    catch {
      toast(t('core.open_dir_failed'), {})
    }
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title={t('core.title')}
        description=""
        action={(
          <Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label={t('core.refresh')}
              isDisabled={busy || loading}
              onPress={refresh}
            >
              <ArrowRotateRight className="size-4" />
            </Button>
            <Tooltip.Content>{t('core.refresh')}</Tooltip.Content>
          </Tooltip>
        )}
      />
      <PanelState loading={loading} error={error}>
        <If cond={!!current}>
          <Item
            left={(
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Label className="font-mono text-sm">{current?.version}</Label>
                <Chip size="sm" variant="soft" color="default">
                  {t('ui.current_version')}
                </Chip>
                <If cond={!current?.present}>
                  <span className="text-sm text-muted">{t('core.not_downloaded')}</span>
                </If>
              </div>
            )}
            right={(
              <If cond={!!current?.dir}>
                <Tooltip>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    aria-label={t('core.open_dir')}
                    onPress={openDirectory}
                  >
                    <FolderOpen className="size-4" />
                  </Button>
                  <Tooltip.Content>{t('core.open_dir')}</Tooltip.Content>
                </Tooltip>
              </If>
            )}
          />
        </If>
      </PanelState>
    </div>
  )
}
