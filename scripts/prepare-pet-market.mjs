import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releases = resolve(repo, '../release-packages')
const cache = join(releases, 'pet-market-source')
const stage = join(releases, 'site-staging-pets')
const prefix = 'downloads/wanglab-harness/pets'
const output = join(stage, prefix)
const origin = 'https://seuwanglab.com/'
const upstream = 'https://codex-pets.net'
const sources = JSON.parse(await readFile(join(repo, 'marketplace/pets/sources.json'), 'utf8'))
const fixedTime = new Date('2000-01-01T00:00:00Z')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function publicUrl(path) {
  return new URL(`${prefix}/${path}`, origin).href
}

async function cachedDownload(url, path, limit = 32 * 1024 * 1024) {
  try {
    const bytes = await readFile(path)
    assert(bytes.length > 0 && bytes.length <= limit, `Invalid cached size: ${path}`)
    return bytes
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  console.log(`Downloading ${url}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200, url)
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.length
    assert(total <= limit, `Download exceeds limit: ${url}`)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  assert(bytes.length > 0, `Empty download: ${url}`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.part`, bytes)
  await rename(`${path}.part`, path)
  return bytes
}

function mitLicense(author) {
  return `MIT License

Copyright (c) 2026 ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
}

const pets = []
const shippedFiles = []
for (const source of sources) {
  assert.match(source.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.match(source.revision, /^\d+$/)
  assert.equal(source.license, 'MIT')
  const local = join(cache, source.id)
  const metadata = JSON.parse(await cachedDownload(`${upstream}/api/pets/${source.id}/share-data`, join(local, 'metadata.json'), 256 * 1024)).pet
  assert.equal(metadata.id, source.id)
  assert.equal(metadata.ownerName, source.author, `${source.id}: author changed; review source metadata`)
  const archive = await cachedDownload(`${upstream}/api/pets/${source.id}/download?v=${source.revision}`, join(local, 'original.zip'))
  const names = execFileSync('unzip', ['-Z1', join(local, 'original.zip')], { encoding: 'utf8' }).trim().split('\n')
  assert.deepEqual(names.toSorted(), ['pet.json', 'spritesheet.webp'])
  const rawManifest = execFileSync('unzip', ['-p', join(local, 'original.zip'), 'pet.json'])
  const manifest = JSON.parse(rawManifest)
  assert.equal(manifest.id, source.id)
  assert.equal(manifest.spritesheetPath, 'spritesheet.webp')
  const version = manifest.spriteVersionNumber ?? 1
  assert([1, 2].includes(version))
  assert.equal(version, metadata.spriteVersionNumber)
  const sprite = execFileSync('unzip', ['-p', join(local, 'original.zip'), 'spritesheet.webp'], { maxBuffer: 8 * 1024 * 1024 })
  const folder = join(local, 'prepared')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'spritesheet.webp'), sprite)
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(folder, 'spritesheet.webp')], { encoding: 'utf8' }))
  assert.equal(probe.streams[0].width, 1536)
  assert.equal(probe.streams[0].height, version === 1 ? 1872 : 2288)
  const sourceUrl = `${upstream}/#/pets/${source.id}`
  const attribution = {
    name: metadata.displayName,
    author: source.author,
    sourceUrl,
    sourceRevision: source.revision,
    sourceArchiveSha256: sha256(archive),
    spritesheetSha256: sha256(sprite),
    license: source.license,
    adaptation: 'Wanglab Harness package; original artwork and animation frames are unchanged.',
  }
  const attributionText = `# ${metadata.displayName}\n\nAuthor: ${source.author}\n\nSource: ${sourceUrl}\n\nLicense: ${source.license}\n\nThe artwork and animation frames belong to the original author. Wanglab provides Harness packaging and hosting.\n`
  await writeFile(join(folder, 'pet.json'), `${JSON.stringify({ ...manifest, spriteVersionNumber: version }, null, 2)}\n`)
  await writeFile(join(folder, 'ATTRIBUTION.json'), `${JSON.stringify(attribution, null, 2)}\n`)
  await writeFile(join(folder, 'ATTRIBUTION.md'), attributionText)
  await writeFile(join(folder, 'LICENSE'), mitLicense(source.author))
  const packageFiles = ['pet.json', 'spritesheet.webp', 'ATTRIBUTION.json', 'ATTRIBUTION.md', 'LICENSE']
  for (const file of packageFiles)
    await utimes(join(folder, file), fixedTime, fixedTime)
  const packageBytes = execFileSync('zip', ['-X', '-q', '-0', '-', ...packageFiles], { cwd: folder, env: { ...process.env, TZ: 'UTC' }, maxBuffer: 32 * 1024 * 1024 })
  const packageDigest = sha256(packageBytes)
  const archiveName = `${source.id}-${packageDigest.slice(0, 12)}.harness-pet.zip`
  await writeFile(join(folder, archiveName), packageBytes)
  // The upstream preview is a horizontal filmstrip, not an animated image.
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    '8',
    '-loop',
    '1',
    '-i',
    join(folder, 'spritesheet.webp'),
    '-frames:v',
    '6',
    '-vf',
    `crop=iw/8:ih/${version === 1 ? 9 : 11}:mod(n\\,6)*out_w:0`,
    '-c:v',
    'libwebp_anim',
    '-lossless',
    '1',
    '-compression_level',
    '6',
    '-loop',
    '0',
    join(folder, 'preview.webp'),
  ])
  const revision = sha256(Buffer.concat([Buffer.from(packageDigest), await readFile(join(folder, 'preview.webp'))])).slice(0, 16)
  const relative = `packages/${source.id}/${revision}`
  const destination = join(output, relative)
  await mkdir(destination, { recursive: true })
  for (const file of [...packageFiles, archiveName, 'preview.webp'])
    await copyFile(join(folder, file), join(destination, file))
  pets.push({
    id: source.id,
    name: metadata.displayName,
    description: metadata.description,
    author: { name: source.author, url: sourceUrl },
    sourceUrl,
    license: source.license,
    licenseUrl: publicUrl(`${relative}/LICENSE`),
    previewUrl: publicUrl(`${relative}/preview.webp`),
    spritesheetUrl: publicUrl(`${relative}/spritesheet.webp`),
    spriteVersion: version,
    archiveUrl: publicUrl(`${relative}/${archiveName}`),
    sha256: packageDigest,
    size: packageBytes.length,
  })
  shippedFiles.push(...[...packageFiles, archiveName, 'preview.webp'].map(file => `${prefix}/${relative}/${file}`))
  console.log(`${source.id}: v${version}, 1536x${probe.streams[0].height}, author=${source.author}, ${packageBytes.length} bytes`)
}

await writeFile(join(output, 'catalog.json.part'), `${JSON.stringify({ schemaVersion: 1, pets }, null, 2)}\n`)
await rename(join(output, 'catalog.json.part'), join(output, 'catalog.json'))
shippedFiles.push(`${prefix}/catalog.json`)
const sums = []
for (const path of shippedFiles) {
  const bytes = await readFile(join(stage, path))
  sums.push(`${sha256(bytes)}  ${path}`)
}
await writeFile(join(stage, 'SHA256SUMS'), `${sums.join('\n')}\n`)
console.log(`Pet market prepared: ${output}`)
console.log(`Catalog: ${pets.length} pets; ready for the Desktop marketplace.`)
