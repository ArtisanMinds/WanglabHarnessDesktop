import type { ReactElement } from 'react'
import type { MarketFace } from '../service/market.types'
import { useMountStyle } from 'dsh-tauri-ui/client'
import { useEffect, useId, useRef, useState } from 'react'
import { EXTENSION_PANEL_STYLE_ID } from '../constants'
import { locale } from '../locales'
import extensionPanelStyle from './extension-panel.cssr'
import { MarketTab } from './market-tab'
import { McpTab } from './mcp-tab'
import { SkillsTab } from './skills-tab'

export interface ExtensionPanelProps {
  createSkill: () => Promise<void>
  /** 市场未安装 / 未发布 `render` 时为 undefined：此时不出现市场标签页。 */
  market: MarketFace | undefined
}

interface ExtensionTab {
  id: string
  label: string
  render: () => ReactElement
}

export function ExtensionPanel({ createSkill, market }: ExtensionPanelProps): ReactElement {
  const t = locale.text
  useMountStyle(extensionPanelStyle, EXTENSION_PANEL_STYLE_ID)
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const marketFace = market
  const rows: ExtensionTab[] = [
    ...(marketFace === undefined
      ? []
      : [{ id: 'market', label: t('marketTab'), render: () => <MarketTab market={marketFace} /> }]),
    { id: 'skills', label: t('skillsTab'), render: () => <SkillsTab t={t} createSkill={createSkill} /> },
    { id: 'mcp', label: t('mcpTab'), render: () => <McpTab t={t} /> },
  ]
  const initialId = rows[0]?.id ?? 'skills'
  const [activeId, setActiveId] = useState(initialId)
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([initialId]))
  useEffect(() => setVisited(previous => previous.has(activeId) ? previous : new Set([...previous, activeId])), [activeId])

  return (
    <div className="dshp-extension">
      <div className="dshp-extension__section">
        <div className="dshp-extension__tabs" role="tablist" aria-label={t('extension')}>
          {rows.map((row, index) => {
            const selected = row.id === activeId
            return (
              <button
                key={row.id}
                ref={(element) => { tabRefs.current[index] = element }}
                id={`${tabsId}-tab-${row.id}`}
                type="button"
                role="tab"
                className="dshp-extension__tab"
                aria-selected={selected}
                aria-controls={`${tabsId}-panel-${row.id}`}
                data-active={selected ? 'true' : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(row.id)}
                onKeyDown={(event) => {
                  let next: number
                  if (event.key === 'ArrowRight')
                    next = (index + 1) % rows.length
                  else if (event.key === 'ArrowLeft')
                    next = (index - 1 + rows.length) % rows.length
                  else if (event.key === 'Home')
                    next = 0
                  else if (event.key === 'End')
                    next = rows.length - 1
                  else return
                  event.preventDefault()
                  setActiveId(rows[next]?.id ?? 'skills')
                  tabRefs.current[next]?.focus()
                }}
              >
                {row.label}
              </button>
            )
          })}
        </div>
        {rows.filter(row => row.id === activeId || visited.has(row.id)).map((row) => {
          const selected = row.id === activeId
          return <div key={row.id} id={`${tabsId}-panel-${row.id}`} className="dshp-extension__tab-panel" role="tabpanel" aria-labelledby={`${tabsId}-tab-${row.id}`} hidden={!selected}>{row.render()}</div>
        })}
      </div>
    </div>
  )
}
