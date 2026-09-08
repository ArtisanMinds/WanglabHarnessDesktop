import { cssr } from 'dsh-tauri-ui/client'

const { c } = cssr

export default c([
  c('.dshp-pet__tool-icon', { width: '30px', height: '30px', padding: '6px', justifyContent: 'center' }),
  c('.dshp-pet__market', { display: 'grid', gap: '12px', minWidth: '0' }),
  c('.dshp-pet__market-tools, .dshp-pet__market-error', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }),
  c('.dshp-pet__market-tools', { justifyContent: 'flex-end' }),
  c('.dshp-pet__market-error', { fontSize: '13px', flexWrap: 'wrap' }),
  c('.dshp-pet__market-grid', {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
    gap: '12px',
  }),
  c('.dshp-pet__market-card', {
    minWidth: '0',
    border: '1px solid var(--dsw-alias-border-weak, rgba(127,127,127,0.2))',
    borderRadius: '8px',
    overflow: 'hidden',
  }),
  c('.dshp-pet__market-preview', {
    height: '156px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--dsw-alias-bg-layer-1)',
    overflow: 'hidden',
    padding: '8px',
    fontSize: '13px',
  }),
  c('.dshp-pet__market-preview img', { width: '100%', height: '100%', objectFit: 'contain' }),
  c('.dshp-pet__market-body', { padding: '12px', display: 'grid', gap: '8px', minWidth: '0', overflowWrap: 'anywhere' }),
  c('.dshp-pet__market-body h3', { margin: '0', fontSize: '14px', lineHeight: '20px', fontWeight: '600' }),
  c('.dshp-pet__market-author', {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '12px',
  }),
  c('.dshp-pet__market-meta', { display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' }),
  c('.dshp-pet__market-progress', { display: 'block', width: '100%', height: '4px', accentColor: 'var(--dsw-alias-brand-primary)' }),
])
