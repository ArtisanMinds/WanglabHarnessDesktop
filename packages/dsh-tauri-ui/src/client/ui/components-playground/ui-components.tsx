import type { ReactElement } from 'react'
import type { UiComponentEntry } from '../../components/registry'
import { useState } from 'react'
import { AddButton } from '../../components/add-button'
import { ComposerTriggerChip } from '../../components/composer-trigger-chip'
import { DangerOutlineButton } from '../../components/danger-outline-button'
import { HelpIconButton } from '../../components/help-icon-button'
import { Icon } from '../../components/icon'
import { ChevronDown, Comments, Gear, Magnifier, Person, Plus, Puzzle, TrashBin } from '../../components/icons'
import { MessageIconAction } from '../../components/message-icon-action'
import { ModelIconButton } from '../../components/model-icon-button'
import { NewSessionButton } from '../../components/new-session-button'
import { Button, Input, Pill, Switch, Tag } from '../../components/official'
import { UI_COMPONENT_REGISTRY } from '../../components/registry'
import { RoundIconButton } from '../../components/round-icon-button'
import { RowIconButton } from '../../components/row-icon-button'
import { SearchIconButton } from '../../components/search-icon-button'
import { SeatChip } from '../../components/seat-chip'
import { SettingsSelector } from '../../components/settings-selector'
import { StatusTag } from '../../components/status-tag'
import { ToolbarIconButton } from '../../components/toolbar-icon-button'
import { VersionTag } from '../../components/version-tag'
import { UI_COMPONENTS_STYLE_ID } from '../../constants'
import { useMountStyle } from '../../hooks/use-mount-style'
import uiComponentsStyle from './ui-components.cssr'

const BUTTON_VARIANTS = ['primary', 'outline', 'ghost', 'toolbar'] as const
const BUTTON_SIZES = ['md', 'sm'] as const
const TAG_TONES = ['outline', 'solid', 'neutral', 'quiet', 'success', 'info', 'warning', 'danger'] as const

function SourceCard({ entry }: { entry: UiComponentEntry }): ReactElement {
  const { source } = entry
  return (
    <div className="dshp-ui-components__card">
      <div className="dshp-ui-components__cardHead">
        <span className="dshp-ui-components__name">{entry.title}</span>
        <span className="dshp-ui-components__badge">{source.kind}</span>
      </div>
      <div className="dshp-ui-components__meta">
        <span>{`映射组件：${source.component}`}</span>
        <span className="dshp-ui-components__code">{source.package}</span>
        <span>{`版本：${source.availableAt.join(' / ')}`}</span>
        {source.mappedClass === undefined
          ? null
          : <span>{`官方类名：.${source.mappedClass}`}</span>}
        <span className="dshp-ui-components__code">{source.upstreamPath}</span>
      </div>
    </div>
  )
}

export function UiComponentsPanel(): ReactElement {
  useMountStyle(uiComponentsStyle, UI_COMPONENTS_STYLE_ID)
  const [checked, setChecked] = useState(true)
  const [activePill, setActivePill] = useState('alpha')
  const [query, setQuery] = useState('')

  return (
    <div className="dshp-ui-components">
      <section className="dshp-ui-components__section">
        <span className="dshp-ui-components__title">官方转发（reexport）</span>
        <span className="dshp-ui-components__hint">
          两代内核都导出，直接转发官方实现，样式由官方 CSS Modules 提供。
        </span>
        <div className="dshp-ui-components__sample">
          {BUTTON_SIZES.map(size => BUTTON_VARIANTS.map(variant => (
            <Button key={`${size}-${variant}`} size={size} variant={variant}>
              {`${variant} / ${size}`}
            </Button>
          )))}
        </div>
        <div className="dshp-ui-components__sample">
          <Button icon={<Plus />} variant="primary">带图标</Button>
          <Button icon={<TrashBin />} variant="ghost">带图标</Button>
          {TAG_TONES.map(tone => <Tag key={tone} tone={tone}>{tone}</Tag>)}
          <Pill active={activePill === 'alpha'} onClick={() => setActivePill('alpha')}>alpha</Pill>
          <Pill active={activePill === 'beta'} onClick={() => setActivePill('beta')}>beta</Pill>
          <Switch checked={checked} label="开关" onChange={setChecked} />
          <Input
            icon={<Magnifier />}
            placeholder="搜索"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
      </section>

      <section className="dshp-ui-components__section">
        <span className="dshp-ui-components__title">refork 组件</span>
        <span className="dshp-ui-components__hint">
          官方只在 0.1.7 有实现或未导出，按官方 CSS 在本地重写；映射见下方表格。
        </span>
        <div className="dshp-ui-components__sample">
          <div className="dshp-ui-components__stack">
            <NewSessionButton icon={<Plus width={16} height={16} />}>新建会话</NewSessionButton>
            <AddButton icon={<Plus width={16} height={16} />}>添加模型</AddButton>
            <DangerOutlineButton icon={<TrashBin width={16} height={16} />}>删除</DangerOutlineButton>
            <NewSessionButton disabled icon={<Plus width={16} height={16} />}>禁用态</NewSessionButton>
          </div>
          <SearchIconButton aria-label="搜索" icon={<Magnifier width={16} height={16} />} />
          <ToolbarIconButton aria-label="工具栏" icon={<Gear width={16} height={16} />} />
          <ModelIconButton aria-label="模型" icon={<Puzzle width={16} height={16} />} />
          <RoundIconButton aria-label="圆形" icon={<Plus width={16} height={16} />} />
          <RowIconButton aria-label="行内" icon={<TrashBin width={16} height={16} />} />
          <HelpIconButton aria-label="帮助" icon={<Person width={16} height={16} />} />
          <MessageIconAction aria-label="消息动作" icon={<Comments width={16} height={16} />} />
        </div>
        <div className="dshp-ui-components__sample">
          <SeatChip chevron={<ChevronDown width={12} height={12} />} icon={<Person width={14} height={14} />}>
            默认
          </SeatChip>
          <ComposerTriggerChip
            chevron={<ChevronDown width={12} height={12} />}
            icon={<Gear width={14} height={14} />}
            open
          >
            默认权限
          </ComposerTriggerChip>
          <ComposerTriggerChip chevron={<ChevronDown width={12} height={12} />} icon={<Gear width={14} height={14} />}>
            收起态
          </ComposerTriggerChip>
          <SettingsSelector chevron={<ChevronDown width={12} height={12} />}>跟随系统</SettingsSelector>
          <VersionTag>1.0.0</VersionTag>
          <VersionTag tone="neutral">1.0.0</VersionTag>
          <StatusTag tone="outline">outline</StatusTag>
          <StatusTag tone="info">info</StatusTag>
          <StatusTag tone="danger">danger</StatusTag>
        </div>
      </section>

      <section className="dshp-ui-components__section">
        <span className="dshp-ui-components__title">{`映射表（${UI_COMPONENT_REGISTRY.length}）`}</span>
        <span className="dshp-ui-components__hint">
          kind = reexport 表示直接转发官方；refork 表示按官方 CSS 在本地重写。
        </span>
        <div className="dshp-ui-components__grid">
          {UI_COMPONENT_REGISTRY.map(entry => <SourceCard key={entry.id} entry={entry} />)}
        </div>
      </section>

      <section className="dshp-ui-components__section">
        <span className="dshp-ui-components__title">图标</span>
        <span className="dshp-ui-components__hint">
          官方 icons 桶两代导出名不同，统一走 @gravity-ui/icons，经 dsh-tauri-ui/client 转发。
        </span>
        <div className="dshp-ui-components__sample">
          <Icon as={Plus} size={20} />
          <Icon as={TrashBin} size={20} />
          <Icon as={Magnifier} size={20} />
          <Icon as={Gear} size={20} />
        </div>
      </section>
    </div>
  )
}
