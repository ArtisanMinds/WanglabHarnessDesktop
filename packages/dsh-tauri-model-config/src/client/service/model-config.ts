import { postConfigOpen } from '../apis'

export type ConfigFileOpen
  = | { ok: true, path: string, opened: 'file' | 'directory' }
    | { ok: false, error: string }

/** 让宿主用系统默认程序打开 `$DSH_HOME/settings.yaml`（模型配置所在的设置文档）。 */
export async function openConfigFile(): Promise<ConfigFileOpen> {
  try {
    const response = await postConfigOpen()
    if (response.error !== undefined)
      return { ok: false, error: response.error }
    return { ok: true, path: response.path ?? '', opened: response.opened ?? 'file' }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
