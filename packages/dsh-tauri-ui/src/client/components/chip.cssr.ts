import { styles as sharedStyles } from '../constants/theme'
import { cssr } from '../utils/cssr'

const { c, bem: { b, e, m } } = cssr
const { dimmed, focusRing, hover, modulePlatform, primary, secondary } = sharedStyles

export default b('chip', {}, [
  m('seat', {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: '0',
    maxWidth: 'min(100%, 240px)',
    minHeight: '28px',
    padding: '0 8px',
    border: 'none',
    borderRadius: '16px',
    background: 'transparent',
    color: primary,
    fontSize: '13px',
    lineHeight: '20px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }, [
    c('&:not(:disabled):hover, &[aria-expanded=\'true\']', { background: hover }),
    c('&:disabled', {
      cursor: 'default',
      color: 'var(--dsw-alias-label-quaternary)',
    }),
    e('chevron', {
      display: 'inline-flex',
      flex: '0 0 auto',
      color: 'var(--dsw-alias-label-caption)',
    }),
  ]),
  m('composerTrigger', {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: '0',
    maxWidth: '220px',
    height: '28px',
    padding: '0 4px 0 8px',
    border: 'none',
    borderRadius: '24px',
    outline: 'none',
    background: 'transparent',
    color: secondary,
    fontSize: '13px',
    lineHeight: '20px',
    fontWeight: '500',
    cursor: 'pointer',
  }, [
    c('&:hover:not(:disabled)', { background: hover }),
    c('&:focus-visible', { ...focusRing }),
    c('&:disabled', {
      color: dimmed,
      cursor: 'default',
    }),
    e('chevron', {
      display: 'inline-flex',
      flex: '0 0 auto',
      color: 'var(--dsw-alias-label-caption)',
      transition: 'transform 120ms ease',
    }, [
      c('&[data-open=\'true\']', { transform: 'rotate(180deg)' }),
    ]),
  ]),
  m('selector', {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    height: '36px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '18px',
    background: modulePlatform,
    font: 'inherit',
    fontSize: '14px',
    lineHeight: '22px',
    color: primary,
    cursor: 'pointer',
  }, [
    c('&:hover:not(:disabled)', { background: hover }),
    c('&:disabled', { cursor: 'default' }),
    e('chevron', {
      display: 'inline-flex',
      flex: '0 0 auto',
      color: 'var(--dsw-alias-label-caption)',
    }),
  ]),
])
