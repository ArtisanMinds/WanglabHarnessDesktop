/**
 * styles/index.ts — 桌宠浮控件的样式（css-render，apply() 的 effect 内 mount）。
 * 浮层固定在 dsh 画布右下角；开关/选择/显示/隐藏与「设置页」卡片一体。
 */
import { CssRender } from 'css-render'
import { PET_CLIENT_PLUGIN } from '../constants'

const CLS = {
  wrap: 'dshpet-wrap',
  pill: 'dshpet-pill',
  statusDot: 'dshpet-statusDot',
  pop: 'dshpet-pop',
  row: 'dshpet-row',
  petBtn: 'dshpet-petBtn',
  petBtnActive: 'dshpet-petBtnActive',
} as const

const cssr = CssRender()
const { c } = cssr

const style = c([
  c(`.${CLS.wrap}`, {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: 2147483000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  }),
  c(`.${CLS.pill}`, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '1px solid rgba(120,130,180,0.35)',
    background: 'rgba(24,28,56,0.72)',
    backdropFilter: 'blur(6px)',
    color: '#e7e9ff',
    fontSize: '12px',
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    transition: 'background .16s ease, transform .1s ease',
  }),
  c(`.${CLS.pill}:hover`, {
    background: 'rgba(34,40,80,0.85)',
  }),
  c(`.${CLS.statusDot}`, {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flex: 'none',
  }),
  c(`.${CLS.pop}`, {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '220px',
    marginBottom: '8px',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid rgba(120,130,180,0.3)',
    background: 'rgba(24,28,56,0.9)',
    backdropFilter: 'blur(8px)',
    color: '#e7e9ff',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  }),
  c(`.${CLS.row}`, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  }),
  c(`.${CLS.petBtn}`, {
    flex: 1,
    padding: '6px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(120,130,180,0.3)',
    background: 'transparent',
    color: '#e7e9ff',
    fontSize: '12px',
    cursor: 'pointer',
  }),
  c(`.${CLS.petBtn}:hover`, {
    background: 'rgba(80,100,255,0.18)',
  }),
  c(`.${CLS.petBtnActive}`, {
    background: 'rgba(80,100,255,0.3)',
    borderColor: 'rgba(120,150,255,0.7)',
  }),
])

/** 挂载样式；返回卸载函数，供 apply() 的 effect 生命周期回收。 */
export function mountPetStyles(): () => void {
  style.mount({ id: `${PET_CLIENT_PLUGIN}-styles`, head: true })
  return () => style.unmount({ id: `${PET_CLIENT_PLUGIN}-styles` })
}