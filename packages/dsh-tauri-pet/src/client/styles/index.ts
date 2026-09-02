/**
 * styles/index.ts — 桌宠侧栏入口 + 设置分区样式（css-render，apply() effect 内 mount）。
 *
 * 侧栏入口按钮复刻官方 `.rtSEdW_iconButton`（appearance/color/border-radius/
 * padding/hover/focus-visible 与 data-tip 气泡），并叠加右上角绿色激活圆点；
 * 设置分区沿用 settings.section 的版式语言（卡片 + 行 + 次级文案），全部走
 * `--dsw-alias-*` 主题变量，明暗主题自适应。
 */
import { CssRender } from 'css-render'
import { PET_CLIENT_PLUGIN } from '../constants'

const cssr = CssRender()
const { c } = cssr

const style = c([
  // ── 侧栏入口：官方 iconButton 复刻（插在 .dsh-tu-settingsTrigger 右侧）──
  c('.dshpet-iconButton', {
    appearance: 'none',
    color: 'var(--dsw-alias-label-tertiary)',
    cursor: 'pointer',
    background: '0 0',
    border: '0',
    borderRadius: '7px',
    alignItems: 'center',
    padding: '6px',
    display: 'inline-flex',
    position: 'relative',
  }, [
    c('&:disabled', { opacity: '0.4', cursor: 'default' }),
    c('&:hover:not(:disabled)', {
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
    }),
    c('&:focus-visible', {
      outline: '2px solid var(--dsw-alias-brand-primary)',
      outlineOffset: '-1px',
    }),
  ]),
  // data-tip 气泡（同官方 iconButton 的 :after 提示位）。
  c('.dshpet-iconButton::after', {
    content: 'attr(data-tip)',
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--dsw-alias-label-primary)',
    color: 'var(--dsw-alias-bg-layer-3, #fff)',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.15s ease',
    zIndex: '10',
  }),
  c('.dshpet-iconButton:hover::after, .dshpet-iconButton:focus-visible::after', { opacity: '1' }),
  // 激活态绿色小圆点（右上角），未激活时隐藏。
  c('.dshpet-iconDot', {
    position: 'absolute',
    top: '2px',
    right: '2px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--dsw-alias-state-success-primary, #3ddc84)',
    display: 'none',
  }),
  c('.dshpet-iconButton.dshpet-iconOn .dshpet-iconDot', { display: 'block' }),

  // ── 设置行布局：复刻新版 dsh 客户端 SettingsRoot 的 triggerRow（flex 行）──
  // 旧版客户端 sidebar.settings 是通栏块级触发器，图标按钮直接插会被挤到下
  // 一行；把设置槽包裹层立成 flex 行、触发器占满剩余宽度，图标排右侧。
  // 两个钩子并存：renderer 的 data-slot 包裹层（稳定）+ 补丁加的行类（兜底）。
  c('[data-slot="sidebar"] [data-slot="sidebar.settings"], .dshpet-settingsRow', {
    display: 'flex',
    alignItems: 'center',
  }),
  c('[data-slot="sidebar"] [data-slot="sidebar.settings"] > .dsh-tu-settingsTrigger:not(.dsh-tu-settingsTriggerRail), .dshpet-settingsRow > .dsh-tu-settingsTrigger:not(.dsh-tu-settingsTriggerRail)', {
    flex: '1 1 auto',
    width: 'auto',
    minWidth: '0',
  }),
  c('[data-slot="sidebar"] [data-slot="sidebar.settings"] > .dshpet-iconButton, .dshpet-settingsRow > .dshpet-iconButton', {
    flex: 'none',
    marginRight: '2px',
  }),

  // ── 设置分区（settings.section）：卡片 + 行，主题变量自适应 ──
  c('.dshpet-page', {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '560px',
    color: 'var(--dsw-alias-label-primary)',
  }),
  c('.dshpet-title', { margin: '0', fontSize: '20px', fontWeight: '600', lineHeight: '28px' }),
  c('.dshpet-card', {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.2))',
    background: 'var(--dsw-alias-bg-base)',
  }),
  c('.dshpet-row', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }),
  c('.dshpet-rowLabel', { fontWeight: '500', color: 'var(--dsw-alias-label-primary)' }),
  c('.dshpet-rowValue', { color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' }),
  c('.dshpet-hint', {
    margin: '0',
    fontSize: '12px',
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary))',
  }),
  c('.dshpet-slider', {
    width: '100%',
    accentColor: 'var(--dsw-alias-brand-primary)',
    cursor: 'pointer',
  }),
  c('.dshpet-toggle', {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.2))',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
  }, [
    c('&:disabled', { opacity: '0.4', cursor: 'default' }),
  ]),
  c('.dshpet-toggle.on', {
    borderColor: 'var(--dsw-alias-state-success-primary, #3ddc84)',
    color: 'var(--dsw-alias-state-success-primary, #3ddc84)',
  }),
  c('.dshpet-toggleDot', {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--dsw-alias-label-tertiary)',
    flex: 'none',
  }),
  c('.dshpet-toggle.on .dshpet-toggleDot', { background: 'var(--dsw-alias-state-success-primary, #3ddc84)' }),
  c('.dshpet-pets', { display: 'flex', gap: '8px' }),
  c('.dshpet-petBtn', {
    flex: '1',
    padding: '7px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.2))',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
  }, [
    c('&:hover:not(:disabled)', { background: 'var(--dsw-alias-interactive-bg-hover)' }),
    c('&:disabled', { opacity: '0.4', cursor: 'default' }),
  ]),
  c('.dshpet-petBtnActive', {
    borderColor: 'var(--dsw-alias-brand-primary)',
    color: 'var(--dsw-alias-brand-primary)',
    background: 'var(--dsw-alias-interactive-bg-hover)',
  }),
  c('.dshpet-actions', { display: 'flex', gap: '8px' }),
  c('.dshpet-btn', {
    flex: '1',
    padding: '7px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.2))',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
  }, [
    c('&:hover:not(:disabled)', { background: 'var(--dsw-alias-interactive-bg-hover)' }),
    c('&:disabled', { opacity: '0.4', cursor: 'default' }),
  ]),
  c('.dshpet-error', {
    fontSize: '12px',
    lineHeight: '18px',
    color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-danger-text, #ff7a7a))',
  }),
])

export function mountPetStyles(): () => void {
  style.mount({ id: `${PET_CLIENT_PLUGIN}-styles`, head: true })
  return () => style.unmount({ id: `${PET_CLIENT_PLUGIN}-styles` })
}
