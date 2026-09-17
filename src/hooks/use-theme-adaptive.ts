import { usePreferredDark, useWatch } from '@reause/core'
import { useDshStyle } from './use-dsh-style'
import { useInvoke } from './use-invoke'

export function useThemeAdaptive() {
  const themePreference = useInvoke<'dark' | 'light' | 'system'>('get_dsh_theme')
  const [dshStyle] = useDshStyle()
  const systemDark = usePreferredDark()
  const theme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference || 'dark'
  useWatch(
    dshStyle.colorScheme || theme,
    value => document.documentElement.dataset.theme = value,
    { immediate: true },
  )
}
