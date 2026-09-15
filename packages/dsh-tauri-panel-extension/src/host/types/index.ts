/** Shared types across the capabilities manager modules. */

/** One skill as the host registry reports it (SkillSummary subset). */
export interface HostSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: { modelInvocable: boolean, userInvocable: boolean }
  readonly source: string
  readonly provider: string
  /** Provider-specific base (directory skills carry their folder here). */
  readonly resourceBase?: { kind: 'directory', path: string } | { kind: 'url', url: string } | { kind: 'opaque', description: string }
}

/** Loaded skill definition subset the routes consume. */
export interface HostSkillDefinition {
  readonly name: string
  readonly content: string
  readonly path?: string
  readonly resourceBase?: HostSkill['resourceBase']
}

/** The skills service subset this plugin consumes (structural). */
export interface SkillsService {
  list: (options?: { cwd?: string }) => Promise<HostSkill[]>
  get: (name: string, options?: { cwd?: string }) => Promise<HostSkillDefinition | undefined>
}

/** Repository metadata attached to a skill row for client navigation. */
export interface SkillRepositoryMetadata {
  /** Stable repository registration id. */
  id: string
  /** Human-readable local folder or `owner/repo` label. */
  label: string
  kind: 'local' | 'git'
  /** Canonical clickable GitHub URL; present only for GitHub imports. */
  githubUrl?: string
}

/**
 * 宿主 ctx 里本插件路由消费的能力子集（结构兼容，不需要适配）。
 *
 * 方法限制 / OPTIONS / 连接鉴权 / 回环与跨源由 `dsh-tauri` 的 `defineRoutes` 统一承担，
 * 因此这里不再声明 webServer / connection。
 */
export interface PanelExtensionHost {
  skills: SkillsService
}

/**
 * 路由的 apply 期依赖面（`routes(ctx, deps)` 的 deps 形状）。
 *
 * profile patch 目录与 provider 重挂载函数在装配期解析、不作为宿主服务暴露，处理器
 * 无法从事件取回，因此随注册传入、由处理器经 `dshRouteDepsOf(event)` 取回（宿主 ctx
 * 本身仍由 `dshContextOf(event)` 取回，不走 deps）。deps 由本次注册的闭包捕获，同一
 * 份声明在两组 deps 下注册时各读各的依赖。
 */
export interface ExtensionRouteDeps {
  /** profile 的 patch 目录（`<DSH_HOME>/profiles/<profile>`）。 */
  profileDirPath: string
  /**
   * 重挂宿主 filesystem skill provider（根集变更后重新扫描全部技能根）。
   * 技能「刷新」与仓库增删都要先走它，避免删被 watch 的树（Windows EPERM）。
   */
  remountProvider: () => Promise<void>
}
