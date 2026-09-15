/**
 * dsh-tauri 宿主共享类型出口。
 * 【来源】HTTP 是桌面端自报协议；其余服务类型来自官方 @deepseek-ai d.ts。
 * 【修订】2026-01：收口 HostContext 与宿主能力子集；路由身份类型统一从
 * `host/routes/index.type` 取（`defineRoutes` 是唯一路由声明协议）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentRegistry, ModelSelection } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionStore } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { ConnectionGate, HostRoute, RouteHandler, WebServerLike } from '../routes/index.type'

/** JSON 请求体（插件路由自报协议的公共形状）。 */
export type JsonBody = Record<string, unknown>

/** 宿主 webserver 注册面（与 `host/routes` 的 `WebServerLike` 同一契约）。 */
export type WebServerService = WebServerLike

export interface AgentDefaultModelService { currentSelection?: () => ModelSelection | undefined }
export interface AgentPresetsService { mount?: (agentCtx: unknown, presetId: string) => Promise<unknown> | unknown }
export interface PermissionPresetsService {
  names: readonly string[]
  defaultPreset: string
  optionOf: (name: string) => { value: string, name: string, description?: string }
  set: (session: unknown, name: string) => void
}
export interface ToolRegistrationService { register: (definition: ToolDefinition | unknown) => () => void | undefined }

export type HostContext = Context & {
  agents: AgentRegistry
  sessions: SessionStore
  workspaceRegistry: WorkspaceRegistry
  tools: ToolRuntime & ToolRegistrationService
  webServer: WebServerService
  connection?: ConnectionGate
  llm?: LlmRuntime
  agentDefaultModel?: AgentDefaultModelService
  agentPresets?: AgentPresetsService
  permissionPresets?: PermissionPresetsService
  loader: { import: (name: string) => Promise<unknown>, unwrapExports: (exports: unknown) => unknown }
} & HostLifecycle

/** 宿主生命周期/注册表面（cordis Context 类型发布缺陷兜底：各插件 host/apply 共享）。 */
export interface HostLifecycle {
  effect: (callback: () => void | (() => void), id?: string) => void
  inject: (services: readonly string[], setup: (hostCtx: HostContext) => void) => void
  plugin: (plugin: unknown, config?: unknown) => unknown
  logger: { error: (message: string) => void }
}

export type { AgentRegistry, ConnectionGate, ContentBlock, HostRoute, LlmRuntime, ModelSelection, RouteHandler, SessionStore, ToolDefinition, ToolRuntime, WorkspaceRegistry }
