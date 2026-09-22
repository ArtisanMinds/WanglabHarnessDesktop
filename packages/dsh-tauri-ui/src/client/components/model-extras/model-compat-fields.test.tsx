import type { Translate } from './types'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ModelCompatFields } from './model-compat-fields'

vi.mock('dsh-tauri/client', () => ({
  defineLocale: (_namespace: string, dicts: unknown) => ({
    NS: _namespace,
    text: (key: string) => key,
    dicts,
    activeLocale: () => 'en',
    isEnglishLocale: () => true,
    useLocale: () => 'en',
    registerLocale: () => () => {},
  }),
}))

const t: Translate = (key, params) => {
  const dict: Record<string, string> = {
    modelConfig: 'Model config',
    thinkingMode: 'Thinking mode',
    thinkingLevels: 'Thinking levels',
    thinkingModeHint: 'Declare whether this model thinks',
    developerRole: 'Disable developer role',
    developerRoleHint: 'Turn this on for an endpoint that rejects the developer role',
  }
  const template = dict[key] ?? key
  if (params === undefined)
    return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

function markup(model: Record<string, unknown>, templateCompat: boolean, disabled?: boolean): string {
  return renderToStaticMarkup(
    <ModelCompatFields
      t={t}
      model={model}
      index={0}
      templateCompat={templateCompat}
      disabled={disabled}
      onPatch={() => {}}
    />,
  )
}

interface Choice {
  checked: boolean
  disabled: boolean
  label: string
  ariaLabel: string
  title: string
}

function choices(html: string): Choice[] {
  const pattern = /<label class="dshp-checkbox"([^>]*)><input class="dshp-checkbox__input" type="checkbox"([^>]*)><span class="dshp-checkbox__label">([^<]*)<\/span><\/label>/g
  return [...html.matchAll(pattern)].map((match) => {
    const input = match[2] ?? ''
    return {
      title: /title="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? '',
      checked: input.includes('checked=""'),
      disabled: input.includes('disabled=""'),
      ariaLabel: /aria-label="([^"]*)"/.exec(input)?.[1] ?? '',
      label: match[3] ?? '',
    }
  })
}

function chips(html: string): { checked: boolean, disabled: boolean, level: string }[] {
  return [...html.matchAll(/<label class="dshp-model-compat__chip"><input type="checkbox"([^>]*)>([a-z]+)<\/label>/g)]
    .map(match => ({
      checked: (match[1] ?? '').includes('checked'),
      disabled: (match[1] ?? '').includes('disabled'),
      level: match[2] ?? '',
    }))
}

describe('modelCompatFields', () => {
  it('labels the row and offers an ungraded thinking choice while thinking stays off', () => {
    const html = markup({}, false)
    expect(html).toContain('<fieldset class="dshp-model-compat" aria-label="Model config 1">')
    expect(html).toContain('<legend class="dshp-model-compat__label">Model config</legend>')
    expect(html).toContain('<div class="dshp-model-compat__choices">')
    expect(choices(html)).toHaveLength(1)
    expect(choices(html)[0]).toMatchObject({
      label: 'Thinking mode',
      ariaLabel: 'Thinking mode 1',
      title: 'Declare whether this model thinks',
      checked: false,
    })
    expect(html).not.toContain('Thinking levels')
  })

  it('renders the seven level chips once a graded level is declared', () => {
    const html = markup({ reasoningEfforts: { off: null, low: 'low' } }, false)
    expect(choices(html)[0]?.checked).toBe(true)
    expect(chips(html).map(chip => chip.level)).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(chips(html).filter(chip => chip.checked).map(chip => chip.level)).toEqual(['off', 'low'])
    expect(html).toContain('aria-label="Thinking levels 1"')
  })

  it('gates the developer-role choice on the caller protocol decision', () => {
    const model = { compat: { thinkingFormat: 'chat-template', supportsDeveloperRole: false } }
    expect(choices(markup(model, true)).map(choice => choice.label)).toEqual(['Thinking mode', 'Disable developer role'])
    expect(choices(markup(model, true))[1]).toMatchObject({
      ariaLabel: 'Disable developer role 1',
      title: 'Turn this on for an endpoint that rejects the developer role',
      checked: true,
    })
    expect(markup(model, false)).not.toContain('Disable developer role')
  })

  it('disables every control while the editor is read-only', () => {
    const html = markup({ reasoningEfforts: { low: 'low' } }, true, true)
    expect(choices(html).every(choice => choice.disabled)).toBe(true)
    expect(chips(html).every(chip => chip.disabled)).toBe(true)
  })
})
