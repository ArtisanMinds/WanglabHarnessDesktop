/**
 * styles/index.ts — 桌宠入口图标 + 设置页样式（css-render，apply() effect 内 mount）。
 */
import { CssRender } from 'css-render'
import { PET_CLIENT_PLUGIN } from '../constants'

const cssr = CssRender()
const { c } = cssr

const style = c([
  /* 侧栏入口图标：固定定位胶囊，绿色激活圆点右上角 */
  c('.dshpet-icon', {
    position: 'fixed',
    zIndex: 2147483000,
    width: '30px',
    height: '30px',
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    borderRadius: '50%',
    background: 'rgba(24,28,56,0.72)',
    color: '#e7e9ff',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
  }, [
    c('&:hover', { background: 'rgba(34,40,80,0.9)' }),
  ]),
  c('.dshpet-iconRail', { width: '34px', height: '34px' }),
  c('.dshpet-iconDot', {
    position: 'absolute',
    top: '2px',
    right: '2px',
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    background: '#3ddc84',
    border: '2px solid rgba(24,28,56,0.9)',
    boxSizing: 'content-box',
  }),
  /* 独立设置页：右下停靠面板 */
  c('.dshpet-settings', {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: 2147483000,
    width: '300px',
    borderRadius: '14px',
    border: '1px solid rgba(120,130,180,0.3)',
    background: 'rgba(24,28,56,0.92)',
    color: '#e7e9ff',
    fontSize: '13px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  }),
  c('.dshpet-settingsHead', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(120,130,180,0.2)',
  }),
  c('.dshpet-settingsTitle', { margin: 0, fontSize: '15px', fontWeight: 600 }),
  c('.dshpet-settingsClose', {
    border: 'none',
    background: 'none',
    color: '#abb1d6',
    fontSize: '18px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '2px 6px',
  }),
  c('.dshpet-settingsBody', {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px 16px',
  }),
  c('.dshpet-card', { display: 'flex', flexDirection: 'column', gap: '8px' }),
  c('.dshpet-row', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }),
  c('.dshpet-rowLabel', { fontWeight: 500 }),
  c('.dshpet-hint', { margin: 0, fontSize: '12px', color: 'rgba(171,177,214,0.8)', lineHeight: '18px' }),
  c('.dshpet-toggle', {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer',
    border: '1px solid rgba(120,130,180,0.35)',
    background: 'transparent',
    color: '#e7e9ff',
  }),
  c('.dshpet-toggle.on', { borderColor: 'rgba(61,220,132,0.7)', color: '#3ddc84' }),
  c('.dshpet-toggleDot', {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'rgba(122,127,153,0.8)',
    flex: 'none',
  }),
  c('.dshpet-toggle.on .dshpet-toggleDot', { background: '#3ddc84' }),
  c('.dshpet-dot', { width: '9px', height: '9px', borderRadius: '50%', flex: 'none' }),
  c('.dshpet-dot.on', { background: '#3ddc84' }),
  c('.dshpet-dot.off', { background: 'rgba(122,127,153,0.8)' }),
  c('.dshpet-pets', { display: 'flex', gap: '8px' }),
  c('.dshpet-petBtn', {
    flex: 1,
    padding: '7px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid rgba(120,130,180,0.3)',
    background: 'transparent',
    color: '#e7e9ff',
  }, [c('&:hover', { background: 'rgba(80,100,255,0.18)' })]),
  c('.dshpet-petBtnActive', { background: 'rgba(80,100,255,0.3)', borderColor: 'rgba(120,150,255,0.7)' }),
  c('.dshpet-btn', {
    flex: 1,
    padding: '7px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid rgba(120,130,180,0.3)',
    background: 'transparent',
    color: '#e7e9ff',
  }, [c('&:hover', { background: 'rgba(80,100,255,0.18)' })]),
  c('.dshpet-error', {
    margin: 0,
    fontSize: '12px',
    lineHeight: '18px',
    color: '#ff7a7a',
  }),
])

export function mountPetStyles(): () => void {
  style.mount({ id: `${PET_CLIENT_PLUGIN}-styles`, head: true })
  return () => style.unmount({ id: `${PET_CLIENT_PLUGIN}-styles` })
}
