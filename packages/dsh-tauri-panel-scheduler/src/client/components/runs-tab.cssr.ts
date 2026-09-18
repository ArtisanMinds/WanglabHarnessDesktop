import { cssr } from 'dsh-tauri-ui/client'

const { c } = cssr

/** 执行记录（runs-tab.tsx）：列表；行本体与未读角标样式见 styles/index.cssr.ts。 */
export default c([
  c('.dshp-scheduler__runs-list', { display: 'flex', flexDirection: 'column', gap: '8px', margin: '0', padding: '0', listStyle: 'none' }),
])
