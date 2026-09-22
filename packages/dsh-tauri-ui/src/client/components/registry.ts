export interface UiComponentSource {
  kind: 'reexport' | 'refork'
  component: string
  package: string
  version: string
  availableAt: readonly string[]
  upstreamPath: string
  mappedClass?: string
}

export interface UiComponentEntry {
  id: string
  title: string
  source: UiComponentSource
}

const PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'
const VERSION = '0.1.7-alpha.1'
const AVAILABLE_BOTH = ['0.1.5-rc.1', '0.1.7-alpha.1']
const AVAILABLE_LATEST = ['0.1.7-alpha.1']

function slug(name: string): string {
  return name.replaceAll('_', '-').replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function primitives(component: string, file: string): UiComponentEntry {
  return {
    id: slug(component),
    title: component,
    source: {
      kind: 'reexport',
      component,
      package: PRIMITIVES,
      version: VERSION,
      availableAt: AVAILABLE_BOTH,
      upstreamPath: `packages/client/ui-primitives/src/${file}.tsx`,
    },
  }
}

function refork(component: string, source: Omit<UiComponentSource, 'kind' | 'component' | 'version'>): UiComponentEntry {
  return {
    id: slug(component),
    title: component,
    source: {
      kind: 'refork',
      component,
      version: VERSION,
      ...source,
    },
  }
}

export const UI_COMPONENT_REGISTRY: readonly UiComponentEntry[] = [
  primitives('Button', 'Button'),
  primitives('ButtonVariant', 'Button'),
  primitives('Switch', 'Switch'),
  primitives('Tag', 'Tag'),
  primitives('TagTone', 'Tag'),
  primitives('Pill', 'Pill'),
  primitives('Menu', 'Menu'),
  primitives('MenuEntry', 'Menu'),
  primitives('MenuItem', 'Menu'),
  primitives('MenuLabel', 'Menu'),
  primitives('MenuSeparator', 'Menu'),
  primitives('Input', 'Input'),
  primitives('Tooltip', 'Tooltip'),
  primitives('TooltipSide', 'Tooltip'),
  primitives('Toast', 'Toast'),
  primitives('Modal', 'Modal'),
  primitives('HoverCard', 'HoverCard'),
  primitives('DisclosureRow', 'DisclosureRow'),
  primitives('DisclosureRowProps', 'DisclosureRow'),
  primitives('StateDot', 'StateDot'),
  primitives('StateDotState', 'StateDot'),
  primitives('ConnectionIndicator', 'ConnectionIndicator'),
  primitives('ConnectionIndicatorState', 'ConnectionIndicator'),
  primitives('BrandWordmark', 'BrandWordmark'),
  primitives('BrandWordmarkProps', 'BrandWordmark'),
  primitives('FishLogo', 'FishLogo'),
  primitives('FISH_LOGO_PATH', 'FishLogo'),
  primitives('FISH_LOGO_VIEWBOX', 'FishLogo'),

  refork('NewSessionButton', {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-sidebar/src/client/SidebarRoot.module.css',
    mappedClass: 'newSession',
  }),
  refork('SearchIconButton', {
    package: '@deepseek-ai/dsh-client-ui-workspace',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.module.css',
    mappedClass: 'searchButton',
  }),
  refork('ToolbarIconButton', {
    package: '@deepseek-ai/dsh-client-ui-plugin-manager',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css',
    mappedClass: 'iconButton',
  }),
  refork('AddButton', {
    package: '@deepseek-ai/dsh-client-ui-plugin-manager',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css',
    mappedClass: 'addButton',
  }),
  refork('DangerOutlineButton', {
    package: '@deepseek-ai/dsh-client-ui-plugin-manager',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css',
    mappedClass: 'danger',
  }),
  refork('RowIconButton', {
    package: '@deepseek-ai/dsh-client-ui-workspace',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-workspace/src/client/rows/Rows.module.css',
    mappedClass: 'iconButton',
  }),
  refork('HelpIconButton', {
    package: PRIMITIVES,
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-primitives/src/settings-form/fields.module.css',
    mappedClass: 'helpButton',
  }),
  refork('SeatChip', {
    package: '@deepseek-ai/dsh-client-ui-agent-preset',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-agent-preset/src/client/AgentPresetSeat.module.css',
    mappedClass: 'seat',
  }),
  refork('ComposerTriggerChip', {
    package: '@deepseek-ai/dsh-client-ui-permission-presets',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-permission-presets/src/client/PermissionSelect.module.css',
    mappedClass: 'trigger',
  }),
  refork('MessageIconAction', {
    package: '@deepseek-ai/dsh-client-ui-chat',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-chat/src/client/chat/MessageIconActions.module.css',
    mappedClass: 'action',
  }),
  refork('SettingsSelector', {
    package: '@deepseek-ai/dsh-client-ui-permission-presets',
    availableAt: AVAILABLE_BOTH,
    upstreamPath: 'packages/client/ui-permission-presets/src/client/PermissionRow.module.css',
    mappedClass: 'selector',
  }),
  refork('VersionTag', {
    package: '@deepseek-ai/dsh-client-ui-plugin-manager',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css',
    mappedClass: 'versionTag',
  }),
  refork('StatusTag', {
    package: '@deepseek-ai/dsh-client-ui-plugin-manager',
    availableAt: AVAILABLE_LATEST,
    upstreamPath: 'packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css',
    mappedClass: 'statusTag',
  }),
]
