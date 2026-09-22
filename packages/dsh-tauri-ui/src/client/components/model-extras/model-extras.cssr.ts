import { styles as sharedStyles } from '../../constants/theme'
import { cssr } from '../../utils/cssr'

const { c, bem: { b, e, m } } = cssr
const { primary, secondary, tertiary, error, success, hover, borderL4, layer1, modulePlatform, focusRing } = sharedStyles

export default b('model-extras', [
  e('row', {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  }),
  e('link', {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0',
    border: 'none',
    background: 'none',
    color: secondary,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '13px',
    lineHeight: '20px',
    whiteSpace: 'nowrap',
  }, [
    c('&:hover:not(:disabled)', { color: primary }),
    c('&:focus-visible', focusRing),
    c('&:disabled', {
      cursor: 'not-allowed',
      opacity: '0.5',
    }),
    m('open', {
      color: secondary,
    }),
  ]),
  e('notice', {
    margin: '0',
    fontSize: '12px',
    lineHeight: '18px',
    color: tertiary,
  }, [
    m('failed', { color: error }),
    m('done', { color: success }),
  ]),
  e('dialog-field', {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }),
  e('dialog-label', {
    fontSize: '12px',
    lineHeight: '18px',
    color: secondary,
  }),
  e('input', {
    boxSizing: 'border-box',
    width: '100%',
    height: '32px',
    padding: '0 10px',
    border: `0.5px solid ${borderL4}`,
    borderRadius: '8px',
    background: layer1,
    color: primary,
    font: 'inherit',
    fontSize: '14px',
    lineHeight: '22px',
    outline: 'none',
  }, [
    c('&:focus-visible', focusRing),
    c('&:disabled', {
      cursor: 'not-allowed',
      opacity: '0.5',
    }),
  ]),
  e('dialog-hint', {
    fontSize: '12px',
    lineHeight: '18px',
    color: tertiary,
  }),
  e('dialog-error', {
    margin: '0',
    fontSize: '13px',
    lineHeight: '20px',
    color: error,
  }),
  e('busy', {
    background: modulePlatform,
    color: tertiary,
  }),
  c('&:hover .dshp-model-extras__link:not(:disabled)', { color: primary }),
  c('.dshp-model-extras__link:hover', { background: hover }),
])
