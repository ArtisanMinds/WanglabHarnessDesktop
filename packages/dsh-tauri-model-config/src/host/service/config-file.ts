import { statSync } from 'node:fs'
import { dirname } from 'node:path'
import { defineService, openDirectory, openUrl } from 'dsh-tauri'
import { resolveSettingsFilePath } from '../utils/paths'

export type ConfigOpenResult
  = | { ok: true, path: string, opened: 'file' | 'directory' }
    | { ok: false, path: string, error: string }

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  }
  catch {
    return false
  }
}

export const configFile = defineService({
  /** 模型配置所在的 DSH 设置文档路径（`$DSH_HOME/settings.yaml`）。 */
  resolvePath(): string {
    return resolveSettingsFilePath()
  },

  /**
   * 用系统默认程序打开模型配置文件。
   *
   * 文档尚未落盘时退而打开它所在的目录：`settings.yaml` 只在第一次写入时创建，
   * 空手打开一个不存在的路径在任何平台上都只会静默失败。
   * @returns 实际打开的路径与目标类型，或宿主侧自己的失败文案。
   */
  async open(): Promise<ConfigOpenResult> {
    const path = resolveSettingsFilePath()
    try {
      const servesFile = isFile(path)
      if (servesFile)
        await openUrl(path)
      else
        await openDirectory(dirname(path))
      return { ok: true, path, opened: servesFile ? 'file' : 'directory' }
    }
    catch (error) {
      return { ok: false, path, error: error instanceof Error ? error.message : String(error) }
    }
  },
})
