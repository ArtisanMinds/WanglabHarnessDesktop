import { cssr, styles as sharedStyles } from 'dsh-tauri-ui/client'
import { SESSION_ICON_ATTRIBUTE } from '../constants'

const { c } = cssr
const { primary, secondary, tertiary, dimmed, borderL3, borderL4, brand, layer1, modulePlatform, hover, hoverSolid, hoverDanger, error, success, primaryFill, primaryHover, primaryFg, chevronSelectSvg: chevronSvg, focusRing } = sharedStyles

/**
 * 跨组件通用的官方控件复刻（input / selectInput / textarea / iconButton /
 * 36px 胶囊按钮 / field / pill selector），多组件共享，不属任何单一组件。
 */
export default c([
  // —— 官方控件复刻：input / selectInput / textarea ——
  c('.dshp-scheduler__input', { boxSizing: 'border-box', border: `.5px solid ${borderL4}`, width: '100%', height: '32px', font: 'inherit', background: layer1, color: primary, borderRadius: '8px', padding: '0 10px', fontSize: '14px', lineHeight: '22px' }),
  c('select.dshp-scheduler__input', { cursor: 'pointer', maxWidth: '240px' }),
  c('.dshp-scheduler__input:focus', { borderColor: brand, outline: 'none' }),
  c('.dshp-scheduler__input::placeholder', { color: dimmed }),
  c('.dshp-scheduler__input:disabled', { opacity: '.6', cursor: 'default' }),
  c('.dshp-scheduler__select-input', { appearance: 'none', backgroundImage: chevronSvg, backgroundPosition: 'right 12px center', backgroundRepeat: 'no-repeat', backgroundSize: '12px 12px', paddingRight: '32px' }),
  c('.dshp-scheduler__textarea', { boxSizing: 'border-box', border: `.5px solid ${borderL4}`, width: '100%', height: 'auto', minHeight: '240px', font: 'inherit', background: layer1, color: primary, borderRadius: '8px', padding: '10px', paddingBottom: '46px', fontSize: '14px', lineHeight: '1.55', resize: 'vertical', outline: 'none' }),
  c('.dshp-scheduler__textarea:focus', { borderColor: brand }),
  c('.dshp-scheduler__textarea::placeholder', { color: dimmed }),
  // —— 官方控件复刻：iconButton ——
  c('.dshp-scheduler__icon-button:focus-visible', focusRing),
  c('.dshp-scheduler__icon-button', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1',
  }, [
    c('&:hover', { background: 'var(--dsw-alias-interactive-bg-hover)' }),
  ]),
  // —— 任务 / 执行记录行（task-card.tsx 与 runs-tab.tsx 共用，须随注册样式挂载）——
  c('.dshp-scheduler__card', { boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', width: '100%', minWidth: '0', height: '60px', padding: '10px 12px', borderRadius: '10px', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '13px', lineHeight: '20px', textAlign: 'left', cursor: 'pointer', overflow: 'hidden' }),
  c('.dshp-scheduler__card:hover', { background: hover }),
  c('.dshp-scheduler__card--paused', { opacity: '.6' }),
  c('.dshp-scheduler__card-title', { display: 'flex', alignItems: 'center', gap: '8px', margin: '0', fontSize: '13px', lineHeight: '18px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__card-icon', { flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px', width: '16px', height: '16px', fontSize: '16px', color: 'var(--dsw-alias-state-business-primary)' }),
  c('.dshp-scheduler__card-icon[data-status="succeeded"]', { color: success }),
  c('.dshp-scheduler__card-icon[data-status="failed"],.dshp-scheduler__card-icon[data-status="interrupted"]', { color: error }),
  c('.dshp-scheduler__card-icon[data-status="running"],.dshp-scheduler__card-icon[data-status="queued"]', { color: secondary }),
  c('.dshp-scheduler__card-icon[data-status="cancelled"],.dshp-scheduler__card-icon[data-status="skipped"]', { color: tertiary }),
  c('.dshp-scheduler__card-meta', { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '0' }),
  c('.dshp-scheduler__card-meta-text', { flex: '1', minWidth: '0', color: tertiary, fontSize: '12px', lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__card-meta-text strong', { color: secondary, fontWeight: '600' }),
  c('.dshp-scheduler__card-waiting', { flex: 'none', display: 'inline-flex', alignItems: 'center', height: '18px', padding: '0 6px', borderRadius: '6px', background: hover, color: 'var(--dsw-alias-state-business-primary)', fontSize: '11px', lineHeight: '18px', whiteSpace: 'nowrap' }),
  // —— 未读角标：侧边栏 panellist 行（复刻官方尾部槽位几何）与执行记录标题 ——
  c('button:has(.dshp-scheduler__nav-badge)', { position: 'relative' }),
  c('.dshp-scheduler__nav-badge', { position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '20px', flex: 'none', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', color: tertiary }),
  c('.dshp-scheduler__unread-dot', { flex: 'none', width: '6px', height: '6px', borderRadius: '50%', background: success }),
  // —— 官方控件复刻：36px 胶囊按钮（primary / secondary / danger）——
  c('.dshp-scheduler__btn,.dshp-scheduler__btn--primary,.dshp-scheduler__btn--danger', { boxSizing: 'border-box', height: '36px', font: 'inherit', cursor: 'pointer', border: 'none', borderRadius: '18px', justifyContent: 'center', alignItems: 'center', gap: '4px', padding: '0 14px', fontSize: '14px', lineHeight: '22px', display: 'inline-flex', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__btn', { border: `.5px solid ${borderL3}`, color: primary, background: 'transparent' }),
  c('.dshp-scheduler__btn:not(:disabled):hover', { background: hoverSolid }),
  c('.dshp-scheduler__btn--primary', { background: primaryFill, color: primaryFg, borderColor: 'transparent' }),
  c('.dshp-scheduler__btn--primary:not(:disabled):hover', { background: primaryHover, borderColor: 'transparent' }),
  c('.dshp-scheduler__btn--danger', { color: error }),
  c('.dshp-scheduler__btn--danger:not(:disabled):hover', { background: hoverDanger }),
  c('.dshp-scheduler__btn:disabled,.dshp-scheduler__btn--primary:disabled,.dshp-scheduler__btn--danger:disabled', { opacity: '.4', cursor: 'default' }),
  c('.dshp-scheduler__btn:focus-visible,.dshp-scheduler__btn--primary:focus-visible,.dshp-scheduler__btn--danger:focus-visible', focusRing),
  // —— 官方控件复刻：字段 / 下拉 pill selector ——
  c('.dshp-scheduler__field', { flexDirection: 'column', gap: '2px', display: 'flex', minWidth: '0', fontSize: '13px' }),
  c('.dshp-scheduler__field-label', { color: secondary, alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: '500', lineHeight: '18px', display: 'inline-flex' }),
  c('.dshp-scheduler__inline', { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }),
  c('.dshp-scheduler__inline-select', { flex: '1', minWidth: '120px' }),
  c('.dshp-scheduler__inline-select--auto', { flex: 'none', width: 'auto', minWidth: '120px' }),
  c('.dshp-scheduler__composer', { display: 'flex', gap: '8px', alignItems: 'center', right: '10px' }),
  c('.dshp-scheduler__prompt-wrap', { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }),
  c('.dshp-scheduler__selector', { background: modulePlatform, height: '36px', font: 'inherit', color: primary, cursor: 'pointer', border: 'none', borderRadius: '18px', alignItems: 'center', gap: '12px', padding: '0 14px', fontSize: '14px', lineHeight: '22px', display: 'inline-flex', whiteSpace: 'nowrap' }),
  c('.dshp-scheduler__selector:hover', { background: hover }),
  c('.dshp-scheduler__selector-chevron', { flex: 'none' }),
  c('.dshp-scheduler__selector-effort', { color: tertiary, fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }),
  c('.dshp-scheduler__flyout-root', { position: 'absolute', inset: '0', zIndex: '1200', overflow: 'visible', pointerEvents: 'none' }),
  c('.dshp-scheduler__flyout-root .dshp-scheduler__menu-select-menu, .dshp-scheduler__flyout-root .dshp-scheduler__model-select-menu', { pointerEvents: 'auto' }),
  // —— 侧边栏会话行时钟图标补丁（配合 register/session-icons.ts 的 DOM 观察器）——
  c(`[${SESSION_ICON_ATTRIBUTE}]`, {
    width: '16px',
    height: '20px',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '2px',
    marginRight: '5px',
    color: 'var(--dsw-alias-label-secondary)',
  }),
  c('[role="treeitem"]', { position: 'relative' }),
])
