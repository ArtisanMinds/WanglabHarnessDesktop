$ErrorActionPreference = 'Stop'
$repair = Join-Path $PSScriptRoot 'repair-core-record.ps1'
$node = (Get-Command node -ErrorAction Stop).Source
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('wanglab-record-repair-' + [Guid]::NewGuid().ToString('N'))
$utf8 = New-Object System.Text.UTF8Encoding($false)
$commit = '459af31e262017542ee8ddfd395499dc0a8484c8'
$tag = 'dsh-0.1.5-rc.2-wanglab040'

function Write-JsonFile($Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100 -Compress), $utf8)
}

function Assert-Equal($Actual, $Expected, $Message) {
    if ($Actual -cne $Expected) { throw "$Message (expected: $Expected; actual: $Actual)" }
}

function New-Fixture($Name, $StringSetting, $RecordedTag) {
    $directory = Join-Path $root $Name
    $core = Join-Path $directory 'dependencies/dsh'
    $entryDirectory = Join-Path $core 'node_modules/@deepseek-ai/dsh/lib'
    New-Item -ItemType Directory -Path $entryDirectory -Force | Out-Null
    Write-JsonFile (Join-Path $core 'package.json') @{version = '0.1.5-rc.2'}
    [System.IO.File]::WriteAllText((Join-Path $entryDirectory 'bin.js'), 'fixture entry', $utf8)
    $setting = [ordered]@{
        installed = $true
        port = 3187
        language = 'zh-CN'
        active_profile = 'existing-profile'
        pet_size = 48
        dsh_pkg_tag = $RecordedTag
        dsh_pkg_commit = $commit
        extra = [ordered]@{empty = $null; items = @(1, $false, 'keep'); text = [string][char]0x4E2D}
    }
    $record = $setting
    if ($StringSetting) { $record = $setting | ConvertTo-Json -Depth 100 -Compress }
    Write-JsonFile (Join-Path $directory '.store.dat') ([ordered]@{
        setting = $record
        window = @{width = 1200; height = 800}
        other = @('2026-09-13T00:00:00Z', $null, $true)
    })
    return $directory
}

try {
    foreach ($stringSetting in @($false, $true)) {
        foreach ($recordedTag in @('dsh-0.1.2-rc.1-wanglab032', $null)) {
            $directory = New-Fixture ([Guid]::NewGuid().ToString('N')) $stringSetting $recordedTag
            $storePath = Join-Path $directory '.store.dat'
            $originalHash = (Get-FileHash -LiteralPath $storePath).Hash
            $expected = Get-Content -LiteralPath $storePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $expectedSetting = $expected.setting
            if ($stringSetting) { $expectedSetting = $expectedSetting | ConvertFrom-Json }
            $expectedSetting.dsh_pkg_tag = $tag
            $expected.setting = $expectedSetting
            if ($stringSetting) { $expected.setting = $expectedSetting | ConvertTo-Json -Depth 100 -Compress }

            & $repair -AppDataDirectory $directory -NodePath $node | Out-Null
            $actual = Get-Content -LiteralPath $storePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($stringSetting) {
                if ($actual.setting -isnot [string]) { throw 'Setting representation changed' }
                $actual.setting = $actual.setting | ConvertFrom-Json
                $expected.setting = $expected.setting | ConvertFrom-Json
            }
            Assert-Equal ($actual | ConvertTo-Json -Depth 100 -Compress) ($expected | ConvertTo-Json -Depth 100 -Compress) 'Other settings changed during repair'
            $backups = @(Get-ChildItem -LiteralPath $directory -Force -Filter '.store.dat.before-core-repair-*')
            Assert-Equal $backups.Count 1 'Expected one backup'
            Assert-Equal (Get-FileHash -LiteralPath $backups[0].FullName).Hash $originalHash 'Backup differs from original store'
            Assert-Equal ([System.IO.File]::ReadAllBytes($storePath)[0]) 123 'Store must be UTF-8 without a BOM'
            $repairedHash = (Get-FileHash -LiteralPath $storePath).Hash
            & $repair -AppDataDirectory $directory -NodePath $node | Out-Null
            Assert-Equal (Get-FileHash -LiteralPath $storePath).Hash $repairedHash 'Repeated repair must not write again'
            Assert-Equal @(Get-ChildItem -LiteralPath $directory -Force -Filter '.store.dat.before-core-repair-*').Count 1 'Repeated repair created another backup'
        }
    }

    foreach ($invalid in @('old-version', 'old-commit', 'missing-commit', 'missing-manifest', 'missing-entry', 'invalid-store', 'invalid-setting')) {
        $directory = New-Fixture $invalid $false $tag
        $storePath = Join-Path $directory '.store.dat'
        $core = Join-Path $directory 'dependencies/dsh'
        switch ($invalid) {
            'old-version' { Write-JsonFile (Join-Path $core 'package.json') @{version = '0.1.2-rc.1'} }
            'old-commit' {
                $store = Get-Content -LiteralPath $storePath -Raw -Encoding UTF8 | ConvertFrom-Json
                $store.setting.dsh_pkg_commit = '90e7887e78256f577b945dc3a22a1926d59cf131'
                Write-JsonFile $storePath $store
            }
            'missing-commit' {
                $store = Get-Content -LiteralPath $storePath -Raw -Encoding UTF8 | ConvertFrom-Json
                $store.setting.PSObject.Properties.Remove('dsh_pkg_commit')
                Write-JsonFile $storePath $store
            }
            'missing-manifest' { Remove-Item -LiteralPath (Join-Path $core 'package.json') }
            'missing-entry' { Remove-Item -LiteralPath (Join-Path $core 'node_modules/@deepseek-ai/dsh/lib/bin.js') }
            'invalid-store' { [System.IO.File]::WriteAllText($storePath, '{invalid', $utf8) }
            'invalid-setting' { Write-JsonFile $storePath @{setting = '{invalid'} }
        }
        $before = (Get-FileHash -LiteralPath $storePath).Hash
        $rejected = $false
        try { & $repair -AppDataDirectory $directory -NodePath $node 2>&1 | Out-Null }
        catch { $rejected = $true }
        if (-not $rejected) { throw "Invalid state was accepted: $invalid" }
        Assert-Equal (Get-FileHash -LiteralPath $storePath).Hash $before "Original store changed: $invalid"
        Assert-Equal @(Get-ChildItem -LiteralPath $directory -Force | Where-Object { $_.Name.StartsWith('.store.dat.') }).Count 0 "Unexpected repair files: $invalid"
    }
    Write-Output 'Core record recovery passed: object/string settings, stale/missing tags, backup, idempotence, and seven rejected states.'
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
exit 0
