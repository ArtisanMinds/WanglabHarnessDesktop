import { cssr } from '../utils/cssr'

const { c } = cssr

export default c([
  c('[data-slot="sidebar.right.tab.guide"]', [
    c('[class$="guide"]', {
      gap: '8px',
    }),
    c('[class$="entry"]:has(> button)', {
      padding: '0',
      gap: 0,
    }),
    c('[class$="entry"]', {
      border: 'none',
      padding: '8px 16px',
      gap: '12px',
      minHeight: 'auto',
      alignItems: 'start',
    }),
    c('[class$="entry"]>button', {
      border: 'none',
      padding: '8px 16px',
      gap: '12px',
      minHeight: 'auto',
      alignItems: 'start',
    }),
    c('[class$="entryIcon"], [class$="icon"]', {
      marginTop: '2px',
      width: '18px',
      height: '18px',
    }),
    c('[class$="entryTitle"], [class$="title"]', {
      fontSize: '14px',
    }),
    c('[class$="entryDescription"], [class$="description"]', {
      fontSize: '12px',
    }),
  ]),
  c('[data-dsh-toggle-cluster], .nArs4W_toggleCluster', {
    top: '6px !important',
    right: '6px !important',
    gap: '2px !important',
  }),
  c('[data-dsh-toggle-cluster] button[aria-label], .nArs4W_toggleCluster button[aria-label]', {
    display: 'flex !important',
    borderRadius: '8px !important',
    flexShrink: 0,
  }),
  c('[class$="_panelRow"], [class*="_panelRow "]', {
    color: 'var(--dsw-alias-label-primary) !important',
  }),
  c('[class$="logoRow"]', {
    color: 'var(--dsw-alias-label-primary) !important',
    justifyContent: 'center !important',
  }, [
    c('[class$="toggle"], [class*="toggle "]', {
      justifyContent: 'center !important',
    }),
    // 官方品牌按钮的类名是 `clsx(brand, wide)`，类属性以 `_wide` 结尾，
    // 仅靠 `[class$="brand"]` 匹配不到；两种形态都列上才能各代都隐藏。
    c('[class$="brand"], [class*="brand "]', {
      display: 'none !important',
    }),
  ]),
  // 折叠轨道回到官方左对齐：上一条 `!important` 会盖掉官方 `.collapsed .logoRow`。
  c('[class*="collapsed"] [class$="logoRow"]', {
    justifyContent: 'flex-start !important',
  }),
])
