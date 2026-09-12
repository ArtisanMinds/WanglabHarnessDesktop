import type { HarnessCore } from '@/types'
import { ArrowRotateRight, FolderOpen } from '@gravity-ui/icons'
import { Button, Chip, Label, Tooltip } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { If } from 'react-if-lite'
import { Item } from '@/components/item'
import { Panel } from '@/components/panel'
import { queryKeys } from '@/config/query-keys'
import { useInvalidateOnSettingUpdated } from '@/hooks/use-invalidate-on-setting-updated'
import { toast } from '@/utils/toast'

export function ConfigCore() {
  const { t } = useTranslation()
  const { data, isLoading: loading, isFetching: busy, error, refetch } = useQuery({
    queryKey: queryKeys.cores,
    queryFn: () => invoke<HarnessCore[]>('get_cores'),
  })
  useInvalidateOnSettingUpdated(queryKeys.cores)
  const cores = data ?? []
  const current = cores.find(core => core.active) ?? cores[0]

  async function refresh() {
    try {
      const result = await refetch()
      if (result.error)
        throw result.error
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
      <Panel.Header
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
      <Panel.Loadable loading={loading} error={error ? String(error) : ''}>
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
      </Panel.Loadable>
    </div>
  )
}
