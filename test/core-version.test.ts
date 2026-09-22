import { describe, expect, it } from 'vitest'
import { compareVersions, isCoreBelowBaseline, isCoreUnsupported, MIN_SUPPORTED_CORE_VERSION } from '@/utils/core-version'

/**
 * issue #596：随包内置插件按推荐核心版本（`version-recommend.json`）编译，本地核心
 * 低于该基线时 client bundle 需要的 `@deepseek-ai/*` 平台模块在运行时模块表里不存在
 * （`@deepseek-ai/dsh-client-store` 首版为 dsh 0.1.2-alpha.2，0.1.5 起才成为平台种子
 * 词），插件必然加载失败并把应用卡在启动阶段。
 *
 * 后端据此回退预打包核心，前端核心面板据此标注「不兼容」并拒绝激活；这里锁住两侧
 * 共用的版本判定：低于基线为 true，等于/高于为 false，不可解析不误判。
 */
describe('isCoreBelowBaseline', () => {
  it('detects the issue #596 local core (0.1.0-rc.7) as below the bundled baseline', () => {
    expect(isCoreBelowBaseline('0.1.0-rc.7', '0.1.5-rc.2')).toBe(true)
    expect(isCoreBelowBaseline('0.1.2-rc.1', '0.1.5-rc.2')).toBe(true)
    expect(isCoreBelowBaseline('0.1.5-rc.1', '0.1.5-rc.2')).toBe(true)
  })

  it('accepts the baseline itself and newer cores', () => {
    expect(isCoreBelowBaseline('0.1.5-rc.2', '0.1.5-rc.2')).toBe(false)
    expect(isCoreBelowBaseline('0.1.5-rc.3', '0.1.5-rc.2')).toBe(false)
    expect(isCoreBelowBaseline('0.1.6-alpha.2', '0.1.5-rc.2')).toBe(false)
  })

  it('never blocks when a version is missing or unparsable', () => {
    expect(isCoreBelowBaseline('', '0.1.5-rc.2')).toBe(false)
    expect(isCoreBelowBaseline('0.1.0-rc.7', null)).toBe(false)
    expect(isCoreBelowBaseline('0.1.0-rc.7', '')).toBe(false)
    // compareVersions 对不可解析值返回 0 → 视为达标，避免把可用核心判死
    expect(compareVersions('not-a-version', '0.1.5-rc.2')).toBe(0)
    expect(isCoreBelowBaseline('not-a-version', '0.1.5-rc.2')).toBe(false)
  })
})

/**
 * 核心列表「不兼容版本」分组的分组判据：低于最低支持基线（0.1.5-rc.1）的旧版本默认折叠，
 * 可展开显示；基线与更新版本、以及不可解析的版本都留在可用列表里。
 */
describe('isCoreUnsupported', () => {
  it('把低于 0.1.5-rc.1 的旧版本判为不兼容', () => {
    expect(isCoreUnsupported('0.1.0-rc.7')).toBe(true)
    expect(isCoreUnsupported('0.1.2-rc.1')).toBe(true)
    expect(isCoreUnsupported('0.1.5-alpha.2')).toBe(true)
  })

  it('基线本身与更新的版本都算兼容', () => {
    expect(isCoreUnsupported(MIN_SUPPORTED_CORE_VERSION)).toBe(false)
    expect(isCoreUnsupported('0.1.5-rc.2')).toBe(false)
    expect(isCoreUnsupported('0.1.6-alpha.2')).toBe(false)
    expect(isCoreUnsupported('0.1.7-alpha.1')).toBe(false)
  })

  it('版本缺失或不可解析时不误判为不兼容', () => {
    expect(isCoreUnsupported('')).toBe(false)
    expect(isCoreUnsupported('not-a-version')).toBe(false)
  })

  it('带 dsh-/src- 前缀的 release tag 按同一基线判定', () => {
    expect(isCoreUnsupported('dsh-0.1.2-rc.1')).toBe(true)
    expect(isCoreUnsupported('src-0.1.5-rc.1')).toBe(false)
  })
})
