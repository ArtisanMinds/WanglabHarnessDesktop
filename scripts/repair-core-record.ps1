param(
    [string]$AppDataDirectory = (Join-Path $env:APPDATA 'com.seuwanglab.wanglab-harness-desktop'),
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$running = Get-Process -Name 'deepseek-harness-desktop', 'Wanglab Harness Desktop' -ErrorAction SilentlyContinue
if ($running) {
    throw 'Exit Wanglab Harness Desktop from the system tray before running this repair.'
}
if (-not $NodePath) {
    $NodePath = Join-Path $AppDataDirectory 'runtime/node.exe'
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    $NodePath = (Get-Command node -ErrorAction Stop).Source
}

# Use the installed Node runtime to preserve JSON values and either setting representation.
@'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.argv[2];
const version = '0.1.5-rc.2';
const commit = '459af31e262017542ee8ddfd395499dc0a8484c8';
const tag = 'dsh-0.1.5-rc.2-wanglab040';
const storePath = path.join(root, '.store.dat');
const corePath = path.join(root, 'dependencies', 'dsh');
let temporary;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

try {
  const original = fs.readFileSync(storePath);
  const store = JSON.parse(original.toString('utf8'));
  if (!object(store)) throw new Error('Invalid settings store. No files changed.');
  const stringSetting = typeof store.setting === 'string';
  const setting = stringSetting ? JSON.parse(store.setting) : store.setting;
  if (!object(setting)) throw new Error('Invalid setting record. No files changed.');
  const manifest = JSON.parse(fs.readFileSync(path.join(corePath, 'package.json'), 'utf8'));
  const entry = path.join(corePath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (manifest.version !== version || setting.dsh_pkg_commit !== commit || !fs.statSync(entry).isFile()) {
    throw new Error('The installed Core cannot be confirmed. Install Desktop 0.4.2 to reinstall its paired Core. No files changed.');
  }
  if (setting.dsh_pkg_tag === tag) {
    console.log('Core release record is already correct. No files changed.');
  } else {
    setting.dsh_pkg_tag = tag;
    store.setting = stringSetting ? JSON.stringify(setting) : setting;
    const id = crypto.randomUUID();
    const backup = `${storePath}.before-core-repair-${id}`;
    temporary = `${storePath}.core-repair-${id}.tmp`;
    fs.copyFileSync(storePath, backup, fs.constants.COPYFILE_EXCL);
    if (!fs.readFileSync(backup).equals(original)) throw new Error('Settings changed during repair. Exit Desktop and retry.');
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (!fs.readFileSync(storePath).equals(original)) throw new Error('Settings changed during repair. Exit Desktop and retry.');
    fs.renameSync(temporary, storePath);
    temporary = undefined;
    console.log(`Core release tag repaired. Backup: ${backup}`);
    console.log('Reopen Wanglab Harness Desktop 0.4.1 or later.');
  }
} catch (error) {
  console.error(`CORE_RECORD_REPAIR_FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
'@ | & $NodePath - $AppDataDirectory
if ($LASTEXITCODE -ne 0) {
    throw 'Core record repair did not complete. The original settings have been retained.'
}
