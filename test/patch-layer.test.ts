import { describe, expect, it } from 'vitest'
import {
  containsPatchLayerParseError,
  containsQuarantineFailure,
  patchLayerErrorDetail,
  quarantineFailureDetail,
} from '../src/store/modules/harness/patch-layer'

/**
 * issue #525：用户手写的 `cordis.patch.yml` 解析失败时，启动失败信息里的真实
 * 原因被包在「Plugin installation 阶段失败」里，前端必须能识别出来并给出
 * 「哪个文件、哪一行、怎么改」的提示与隔离入口。
 */
const REAL_FAILURE = 'Harness 在Plugin installation阶段失败。最后的就绪状态：'
  + 'INTERNAL_PLUGIN_INSTALL_FAILED: INTERNAL_PLUGIN_PATCH_PARSE_FAILED: '
  + 'C:\\Users\\Administrator\\.dsh\\cordis.patch.yml: '
  + 'mapping values are not allowed in this context at line 15 column 155'

describe('patch layer diagnostics', () => {
  it('recognizes a wrapped patch parse failure', () => {
    expect(containsPatchLayerParseError(REAL_FAILURE)).toBe(true)
  })

  it('ignores unrelated startup failures', () => {
    expect(containsPatchLayerParseError('Harness 在process-boot阶段失败')).toBe(false)
    // 只是提到错误码（例如日志行）但没有 `:` 分隔的细节时不算命中。
    expect(containsPatchLayerParseError('see INTERNAL_PLUGIN_PATCH_PARSE_FAILED for details')).toBe(false)
  })

  it('extracts the file path and YAML error with line and column', () => {
    expect(patchLayerErrorDetail(REAL_FAILURE)).toBe(
      'C:\\Users\\Administrator\\.dsh\\cordis.patch.yml: '
      + 'mapping values are not allowed in this context at line 15 column 155',
    )
  })

  it('returns an empty detail when the code is absent', () => {
    expect(patchLayerErrorDetail('Harness 在plugin-install阶段失败')).toBe('')
  })
})

/**
 * 隔离失败（改名被占用 / 权限拒绝）：后端拒绝切档案与重启并回
 * `PATCH_LAYER_QUARANTINE_FAILED`，前端必须据此换成「先处理文件」的提示，
 * 而不是假装已恢复。
 */
const QUARANTINE_FAILURE = 'PATCH_LAYER_QUARANTINE_FAILED: '
  + 'C:\\Users\\Administrator\\.dsh\\cordis.patch.yml: Access is denied. (os error 5)'

describe('patch quarantine failures', () => {
  it('recognizes an aborted quarantine', () => {
    expect(containsQuarantineFailure(QUARANTINE_FAILURE)).toBe(true)
    // 成功路径上的解析失败提示不应被误判为隔离失败。
    expect(containsQuarantineFailure(REAL_FAILURE)).toBe(false)
  })

  it('extracts the path and rename error', () => {
    expect(quarantineFailureDetail(QUARANTINE_FAILURE)).toBe(
      'C:\\Users\\Administrator\\.dsh\\cordis.patch.yml: Access is denied. (os error 5)',
    )
    expect(quarantineFailureDetail(REAL_FAILURE)).toBe('')
  })
})
