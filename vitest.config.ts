import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 根测试配置：覆盖桌面端和内置插件，限制并发 worker 数与放宽超时。
 *
 * source/ 下的上游参考仓库不属于桌面端测试范围。
 *
 * dsh-tauri-worktree 的 operation.test 会创建真实 git 仓库（clone/checkout/
 * discard），全量并行（默认 cpu-1 个 worker）时与其他文件的 git 操作竞争系统
 * 资源，偶发 5s 超时 flake；限制 maxWorkers 后单独复跑稳定通过。
 */
export default defineConfig({
  // 与 vite.config.ts 保持一致：src 内部统一用 `@/` 别名，测试入口也必须能解析。
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx,js,mjs,cjs}',
      'packages/**/*.{test,spec}.{ts,tsx,js,mjs,cjs}',
      'test/toast.test.ts',
      // issue #469：桌面端不得持有屏幕唤醒锁（壳层用 reause useWakeLock 释放，桌宠 <video> 会间接加锁）。
      'test/wake-lock.test.ts',
      // issue #469：收起桌宠必须是销毁窗口（隐藏窗口里的视频仍在播放并持锁）。
      'test/pet-window-lifecycle.test.ts',
      'test/readiness.test.ts',
      'test/runtime-exit.test.ts',
      'test/runtime-exit-store.test.ts',
    ],
    maxWorkers: 4,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
