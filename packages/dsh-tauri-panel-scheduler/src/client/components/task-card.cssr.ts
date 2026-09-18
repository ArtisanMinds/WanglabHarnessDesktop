import { cssr, styles as sharedStyles } from 'dsh-tauri-ui/client'

const { c } = cssr
const { secondary, tertiary } = sharedStyles

/** 任务卡片开关（task-card.tsx）：卡片本体样式见 styles/index.cssr.ts。 */
export default c([
  c('.dshp-scheduler__task-toggle', { flex: 'none', display: 'inline-flex', marginTop: '2px', fontSize: '16px', color: tertiary, cursor: 'pointer' }),
  c('.dshp-scheduler__task-toggle:hover', { color: secondary }),
])
