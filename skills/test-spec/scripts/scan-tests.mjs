#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname, resolve } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.artifacts', 'archive', 'target', '.vite', 'out'])
const TEST_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const SEVERITY_ORDER = { blocker: 0, major: 1, minor: 2, info: 3 }
const SEVERITY_LABEL = { blocker: 'BLOCKER', major: 'MAJOR  ', minor: 'MINOR  ', info: 'INFO   ' }

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const paths = args.filter(a => !a.startsWith('--'))
const asJson = flags.has('--json')
const strict = flags.has('--strict')
const quiet = flags.has('--quiet')
const minSeverity = (() => {
  const raw = args.find(a => a.startsWith('--min='))
  return raw ? raw.slice(6) : 'minor'
})()

if (flags.has('--help') || flags.has('-h') || paths.length === 0) {
  console.log(`scan-tests.mjs — 测试代码机械扫描（Vitest / 本仓规范）

用法:
  node scripts/scan-tests.mjs <path...> [--json] [--strict] [--quiet] [--min=blocker|major|minor|info]

说明:
  path 可为文件或目录；目录递归扫描 *.test.* / *.spec.* / *.e2e.*
  永远跳过 node_modules/.git/dist/archive/target
  --strict 存在 blocker 时以退出码 1 结束（默认恒为 0）
  --min    只输出不低于该等级的发现

扫描的是"机械可判定"的问题。语义问题（断言是否验到契约、用例是否真跑过）由评审者按 references/rubric.md 判断。`)
  process.exit(0)
}

function walk(target, out) {
  const abs = resolve(target)
  if (!existsSync(abs)) return out
  const st = statSync(abs)
  if (st.isFile()) {
    if (TEST_EXT.has(extname(abs)) && /\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(abs)) out.push(abs)
    return out
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      walk(join(abs, entry.name), out)
      continue
    }
    if (!entry.isFile()) continue
    if (!TEST_EXT.has(extname(entry.name))) continue
    if (!/\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(entry.name)) continue
    out.push(join(abs, entry.name))
  }
  return out
}

const files = [...new Set(paths.flatMap(p => walk(p, [])))].sort()
if (files.length === 0) {
  console.error('未匹配到测试文件。检查路径，或测试文件命名不符合 *.test.* / *.spec.* / *.e2e.*')
  process.exit(0)
}

const ROOT = process.cwd()
const configText = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vite.config.ts']
  .filter(f => existsSync(join(ROOT, f)))
  .map(f => readFileSync(join(ROOT, f), 'utf8'))
  .join('\n')
const hasRestoreMocks = /restoreMocks\s*:\s*true/.test(configText)
const hasClearMocks = /clearMocks\s*:\s*true/.test(configText)

const MATCHER = /\.(toBe|toEqual|toStrictEqual|toMatchObject|toMatch|toContain|toThrow|toThrowError|toHaveLength|toHaveProperty|toHaveBeenCalled\w*|toBeTypeOf|toBeInstanceOf|toBeGreaterThan\w*|toBeLessThan\w*|toBeCloseTo|toSatisfy|toMatchSnapshot|toMatchInlineSnapshot|toMatchFileSnapshot|resolves|rejects|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toBeDefined|toBeNaN)\b/g
const WEAK = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy'])
const TEST_START = /^\s*(?:it|test)(?:\.\w+)*\s*\(/

function readTests(text) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let current = null
  let depth = 0
  lines.forEach((line, i) => {
    if (TEST_START.test(line)) {
      if (current) blocks.push(current)
      const title = (line.match(/\((['"`])([\s\S]*?)\1/) || [])[2] || ''
      current = { start: i + 1, end: i + 1, title, asserts: 0, weakOnly: 0, matchers: [], body: [], typeOnly: false }
      depth = 0
    }
    if (!current) return
    current.end = i + 1
    current.body.push(line)
    if (/@ts-expect-error|@ts-ignore|expectTypeOf|assertType\s*[<(]/.test(line)) current.typeOnly = true
    const hits = line.match(MATCHER)
    if (hits) current.matchers.push(...hits)
    if (/\bexpect\s*\(/.test(line)) current.asserts += 1
    if (/\.(toBeDefined|toBeTruthy|toBeFalsy|not\.toBeNull)\s*\(/.test(line)) current.weakOnly += 1
    depth += (line.match(/[{[(]/g) || []).length - (line.match(/[}\])]/g) || []).length
    if (depth <= 0) {
      blocks.push(current)
      current = null
    }
  })
  if (current) blocks.push(current)
  return { lines, blocks }
}

const findings = []
const push = (file, line, rule, severity, message, evidence, hint) => {
  if (SEVERITY_ORDER[severity] > SEVERITY_ORDER[minSeverity]) return
  findings.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line, rule, severity, message, evidence: evidence.trim(), hint })
}

const RULES = [
  {
    id: 'jest-api', severity: 'blocker',
    test: (line) => /\bjest\s*\.\s*(fn|mock|spyOn|clearAllMocks|resetAllMocks|restoreAllMocks|useFakeTimers|setSystemTime|requireActual)\b/.test(line),
    message: '使用了 Jest API，本仓统一 Vitest',
    hint: '改为 vi.fn / vi.mock / vi.spyOn / vi.useFakeTimers / vi.setSystemTime',
  },
  {
    id: 'focused-test', severity: 'blocker',
    test: (line) => /(^|[^.\w])(f(it|describe)|x?it\.only|test\.only|describe\.only)\s*\(/.test(line),
    message: '存在 .only / fdescribe / fit，会静默跳过其余用例',
    hint: '删除聚焦标记后重跑',
  },
  {
    id: 'skipped-test', severity: 'major',
    test: (line) => /(^|[^.\w])(x(it|describe)|it\.skip|test\.skip|describe\.skip|it\.todo|test\.todo)\s*\(/.test(line),
    message: '存在跳过/待办用例',
    hint: '补全或删除并说明原因；长期 skip 等同没有覆盖',
  },
  {
    id: 'missing-await', severity: 'blocker',
    test: (line) => /\bexpect\s*\(/.test(line) && /\.(resolves|rejects)\b/.test(line) && !/\bawait\b/.test(line) && !/\breturn\b/.test(line) && !/=>/.test(line),
    message: '断言 resolves/rejects 却没有 await，用例会恒过',
    hint: '改为 await expect(promise).resolves.toXxx(...)，或 return 该断言',
  },
  {
    id: 'mock-calls-reference', severity: 'minor',
    test: (line) => /\.mock\s*\.\s*calls\b/.test(line),
    message: '.mock.calls 保存的是实参引用而非快照',
    hint: '断言前先结构化克隆（structuredClone），或在实参被 mutate 前断言',
  },
  {
    id: 'snapshot-blind', severity: 'major',
    test: (line) => /\.toMatchSnapshot\s*\(/.test(line),
    message: '使用了快照断言',
    hint: '快照必须随代码提交并被 review；小对象优先 toMatchInlineSnapshot，含易变字段时传 asymmetric matcher',
  },
  {
    id: 'snapshot-dynamic', severity: 'major',
    test: (line, ctx) => /\.(toMatchSnapshot|toMatchInlineSnapshot)\s*\(\s*\)/.test(line) && /(Date\.now|Math\.random|randomUUID|new Date\s*\()/.test(ctx.blockText),
    message: '对含易变值的对象做无参快照，快照会每次不同',
    hint: '首参传 { id: expect.any(Number), createdAt: expect.any(Date) } 之类的匹配器',
  },
  {
    id: 'e2e-css-selector', severity: 'blocker', e2eOnly: true,
    test: (line) => /(\$\$?|locator|querySelector(?:All)?|element)\s*\(\s*['"`]\s*\./.test(line),
    message: 'E2E 用 CSS 类名定位，违反 data-testid 规范',
    hint: '改用 [data-testid="dsh-<业务域>-<元素名>"]，常量收敛到 test/e2e/support/selectors.ts',
  },
  {
    id: 'e2e-text-selector', severity: 'major', e2eOnly: true,
    test: (line) => /(getByText|getByRole\s*\([^)]*name\s*:|locator\s*\(\s*['"`]text=|\$\$?\(\s*['"`][^.'"`[\s])/.test(line),
    message: 'E2E 用文本/层级定位，文案一变就红',
    hint: '改用 data-testid；内嵌上游页面可用稳定结构锚点，并在协议文档登记为已知例外',
  },
  {
    id: 'e2e-no-testid', severity: 'major', e2eOnly: true, fileLevel: true,
    test: () => false,
    message: 'E2E 文件里没有出现任何 data-testid / dsh-* 标识',
    hint: '正向断言必须锚定可见产物，禁止以"无报错"代替存在性断言',
  },
  {
    id: 'real-user-data', severity: 'blocker',
    test: (line) => /(\.dsh\.dev\b|\.store\.dev\.dat\b|[^-]\.store\.dat\b)/.test(line) && !/(DSH_E2E_HOME|E2E_HOME|\.store\.test\.dat)/.test(line),
    message: '疑似读写用户真实数据目录',
    hint: '严禁触碰用户 ~/.dsh、~/.dsh.dev、.store.dev.dat、.store.dat；用 DSH_E2E_HOME 隔离',
  },
  {
    id: 'realtime-sleep', severity: 'minor',
    test: (line) => /await\s+new\s+Promise\s*\(\s*(?:\(?\s*(?:r|resolve)\s*\)?)\s*=>\s*(?:setTimeout|setInterval)/.test(line),
    message: '真实时间等待，既慢又不稳',
    hint: '单元层用 vi.useFakeTimers() + vi.advanceTimersByTime；E2E 层用可轮询的条件等待',
  },
  {
    id: 'console-noise', severity: 'minor',
    test: (line) => /\bconsole\s*\.\s*(log|debug|info)\s*\(/.test(line),
    message: '测试里的临时调试输出',
    hint: '定位完成后删除；console.error 断言属 E2E 契约，不在此列',
  },
  {
    id: 'todo-marker', severity: 'minor', commentOk: true,
    test: (line) => /(?:^|\/\/|\/\*)\s*(TODO|FIXME|XXX)\b/.test(line),
    message: '测试里残留 TODO/FIXME',
    hint: '要么补全成用例，要么转成 issue 后删除',
  },
  {
    id: 'verbose-name', severity: 'info',
    test: (line) => {
      const m = line.match(/^\s*(?:it|test)(?:\.\w+)*\s*\(\s*(['"`])([\s\S]*?)\1/)
      return !!m && m[2].length > 80
    },
    message: '用例名过长，失败时无法一眼定位',
    hint: '收短为「<行为> <条件>」，如 "formats USD prices"、"throws for negative amounts"',
  },
  {
    id: 'and-in-name', severity: 'info',
    test: (line) => {
      const m = line.match(/^\s*(?:it|test)(?:\.\w+)*\s*\(\s*(['"`])([\s\S]*?)\1/)
      if (!m) return false
      const t = m[2]
      return /(并且|同时|以及|\band\b)/.test(t) === true
    },
    message: '用例名里带 "and/并且"，通常意味着一个用例验了多个行为',
    hint: '拆成多个 it()，每个只验一个行为',
  },
  {
    id: 'mkdtemp-no-cleanup', severity: 'major', fileLevel: true,
    test: () => false,
    message: '创建了临时目录却没有清理',
    hint: 'afterEach/afterAll 中 rm -rf；E2E 用 resetTestStore/purgeStaleHomes 同口径收尾',
  },
]

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const isE2E = /\.e2e\.[cm]?[jt]sx?$/.test(file)
  const { lines, blocks } = readTests(text)

  lines.forEach((line, idx) => {
    const lineNo = idx + 1
    const trimmed = line.trim()
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')
    const block = blocks.find(b => lineNo >= b.start && lineNo <= b.end)
    const ctx = { blockText: block ? block.body.join('\n') : line, isE2E, isComment, file }
    for (const rule of RULES) {
      if (rule.fileLevel) continue
      if (rule.e2eOnly && !isE2E) continue
      if (isComment && !rule.commentOk) continue
      if (rule.enabled && !rule.enabled()) continue
      let hit = false
      try { hit = !!rule.test(line, ctx) } catch { hit = false }
      if (hit) push(file, lineNo, rule.id, rule.severity, rule.message, line, rule.hint)
    }
  })

  for (const block of blocks) {
    const hasRealMatcher = block.matchers.some(m => !WEAK.has(m.replace(/^\./, '')))
    if (block.asserts === 0) {
      if (!block.typeOnly) push(file, block.start, 'no-assertion', 'blocker', `用例「${block.title || '(无名)'}」没有任何 expect/断言`, lines[block.start - 1], '补一个真断言，或删掉这个空壳用例')
      continue
    }
    if (block.weakOnly > 0 && !hasRealMatcher) {
      push(file, block.start, 'weak-assertion', 'major', `用例「${block.title || '(无名)'}」只有 toBeDefined/toBeTruthy 级别的弱断言`, lines[block.start - 1], '断言真实字段或可观察行为，如 toMatchObject({ name, email })')
    }
  }

  if (isE2E && !/data-testid/.test(text) && !/from\s+['"][^'"]*selectors['"]/.test(text) && /\b(page|browser)\s*\./.test(text)) {
    const rule = RULES.find(r => r.id === 'e2e-no-testid')
    push(file, 1, rule.id, rule.severity, rule.message, '(file)', rule.hint)
  }
  if (/\bmkdtemp\b|mkdtempSync/.test(text) && !/(\brm\s*\(|rmSync|rimraf|removeSync|purgeStale)/.test(text)) {
    const rule = RULES.find(r => r.id === 'mkdtemp-no-cleanup')
    push(file, 1, rule.id, rule.severity, rule.message, '(file)', rule.hint)
  }
  if (/\bvi\s*\.\s*spyOn\s*\(/.test(text) && !hasRestoreMocks && !/(restoreAllMocks|mockRestore)/.test(text)) {
    const first = lines.findIndex(l => /\bvi\s*\.\s*spyOn\s*\(/.test(l)) + 1
    push(file, first || 1, 'spy-leak', 'major', '文件用了 vi.spyOn，但既未在配置打开 restoreMocks，也没有手动 restore', lines[first - 1] || '(file)', '打开 restoreMocks: true（推荐），或 afterEach(() => vi.restoreAllMocks())')
  }
}

findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line)

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, findings }, null, 2))
} else {
  const bySeverity = { blocker: 0, major: 0, minor: 0, info: 0 }
  let lastFile = null
  for (const f of findings) {
    bySeverity[f.severity] += 1
    if (f.file !== lastFile) {
      console.log(`\n${f.file}`)
      lastFile = f.file
    }
    if (quiet && f.severity !== 'blocker') continue
    console.log(`  ${SEVERITY_LABEL[f.severity]} ${f.line}:${String(f.rule).padEnd(22)} ${f.message}`)
    console.log(`         ${f.evidence.slice(0, 160)}`)
    console.log(`         → ${f.hint}`)
  }
  console.log(`\n扫描 ${files.length} 个文件：blocker ${bySeverity.blocker} / major ${bySeverity.major} / minor ${bySeverity.minor}`)
  if (bySeverity.blocker === 0 && files.length > 0) console.log('机械扫描未发现 blocker —— 这不代表测试合格，请继续按 references/rubric.md 做语义评审，并实际运行用例。')
}

process.exit(strict && findings.some(f => f.severity === 'blocker') ? 1 : 0)
