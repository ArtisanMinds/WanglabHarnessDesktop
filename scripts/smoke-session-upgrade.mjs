import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const [mode, corePath, fixturePath] = process.argv.slice(2)
assert(['seed', 'verify', 'restart'].includes(mode) && corePath && fixturePath, 'Usage: smoke-session-upgrade.mjs seed|verify|restart CORE_DIRECTORY FIXTURE_DIRECTORY')
const core = resolve(corePath)
const fixture = resolve(fixturePath)
const root = join(fixture, 'sessions')

async function coreModule(name) {
  const directory = join(core, 'node_modules', '@deepseek-ai', name)
  const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  return import(pathToFileURL(join(directory, metadata.main)).href)
}

async function artifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await artifacts(path))
    else if (entry.isFile())
      files.push(path)
  }
  return files
}

async function digest(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

const { Context } = await coreModule('cordis')
const { Session, SessionStore, SESSION_FORMAT_VERSION } = await coreModule('dsh-session')
const { createUserMessage, createAssistantMessage, AssistantStreamAccumulator, assembleAssistantStream } = await coreModule('dsh-llm')
const { default: Persistence } = await coreModule('dsh-session-persistence-jsonl')
const context = new Context()
// Persistence requires the sessions service registered by this constructor.
// eslint-disable-next-line no-new
new SessionStore(context)
const persistence = new Persistence(context, { root })

try {
  if (mode === 'seed') {
    assert.equal(SESSION_FORMAT_VERSION, 0, 'seed must use the released 0.1.2 Core codec')
    const cwd = join(fixture, 'workspace')
    await mkdir(cwd, { recursive: true })
    const id = 'wanglab-upgrade-conversation'
    const session = Session.create(id, [], {
      id,
      version: SESSION_FORMAT_VERSION,
      createdAt: 1788710400000,
      cwd,
      isSeeded: false,
      agentPreset: 'default',
    })
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('user/message', createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'Preserve this existing conversation.' }],
    }), { surfaceOp: 'append' })
    session.append('request/header', {
      header: { config: { provider: 'xai', model: 'grok-upgrade-fixture' } },
      reason: 'initial',
    })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        source: { provider: 'xai', model: 'grok-upgrade-fixture' },
        content: [{ type: 'text', text: 'Existing response with its original model identity.' }],
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await persistence.create(session.header)
    await persistence.append(id, session.snapshotEvents())
    const original = await persistence.load(id)
    assert.deepEqual(original.events, session.snapshotEvents())
    const files = []
    for (const path of await artifacts(root)) files.push({ path, sha256: await digest(path) })
    assert(files.length > 0)
    await writeFile(join(fixture, 'expected.json'), JSON.stringify({
      header: session.header,
      messages: session.deriveMessages(),
      request: session.requestHeader(),
      files,
    }))
    console.log('Old Core wrote and reloaded a real compressed conversation with model identity.')
  }
  else {
    assert(SESSION_FORMAT_VERSION > 0, 'verification must use the upgraded Core')
    const expected = JSON.parse(await readFile(join(fixture, 'expected.json'), 'utf8'))
    const id = expected.header.id
    const handle = await persistence.open(id, mode === 'verify' ? 'write' : 'read')
    try {
      const loaded = await handle.read()
      const session = Session.fromRestore(id, loaded.events, handle.header, handle.inheritedEventCount, loaded.eventState)
      assert.equal(handle.header.version, SESSION_FORMAT_VERSION)
      for (const field of ['id', 'cwd', 'createdAt', 'agentPreset', 'isSeeded'])
        assert.equal(handle.header[field], expected.header[field], `preserve ${field}`)
      assert.deepEqual(session.deriveMessages().slice(0, expected.messages.length), expected.messages)
      assert.deepEqual(session.requestHeader(), expected.request)
      if (mode === 'verify') {
        const block = { type: 'text', text: 'Continued response after upgrading.' }
        const stream = new AssistantStreamAccumulator()
        for (const chunk of [
          { type: 'block-start', index: 0, blockType: 'text' },
          { type: 'text-delta', index: 0, text: block.text },
          { type: 'block-end', index: 0, block },
          { type: 'finish', reason: { kind: 'stop' } },
        ]) stream.push({ time: Date.now(), chunk })
        const events = [
          ...session.snapshotEvents(loaded.events.length),
          session.append('turn/start', { turn: 2 }),
          session.append('step/start', { turn: 2, step: 1 }),
          session.append('user/message', createUserMessage({
            source: { kind: 'user' },
            content: [{ type: 'text', text: 'Continue after upgrading.' }],
          }), { surfaceOp: 'append' }),
          session.append('assistant/message', {
            turn: 2,
            step: 1,
            message: createAssistantMessage({
              source: { provider: 'xai', model: 'grok-upgrade-fixture' },
              content: [block],
            }),
            stream: stream.snapshot(),
          }, { surfaceOp: 'append' }),
          session.append('step/end', { turn: 2, step: 1 }),
          session.append('turn/end', { turn: 2, reason: { kind: 'completed' } }),
        ]
        await handle.append(events)
        await handle.flush()
      }
      else {
        assert.equal(session.deriveMessages().at(-2).content[0].text, 'Continue after upgrading.')
        assert.equal(session.deriveMessages().at(-1).content[0].text, 'Continued response after upgrading.')
        assert.equal(session.deriveMessages().length, expected.messages.length + 2)
        const response = loaded.events.findLast(event => event.type === 'assistant/message')
        assert.deepEqual(assembleAssistantStream(response.data.stream).blocks(), response.data.message.content)
      }
    }
    finally {
      await handle.close()
    }
    for (const file of expected.files)
      assert.equal(await digest(file.path), file.sha256, 'the original generation must remain unchanged')
    const listed = await persistence.list()
    assert.equal(listed.filter(item => item.header.id === id).length, 1, 'migration must not duplicate the conversation')
    console.log(`Session ${mode} passed: messages, model route, workspace, original bytes and continued history preserved.`)
  }
}
finally {
  await context.fiber.dispose()
}
