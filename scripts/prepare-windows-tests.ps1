$ErrorActionPreference = 'Stop'

$buildOutput = & cargo test --manifest-path src-tauri/Cargo.toml --release --locked --lib --no-run --message-format=json-render-diagnostics 2>&1
$buildExit = $LASTEXITCODE
$testExecutables = @()
foreach ($line in $buildOutput) {
    try {
        $record = ConvertFrom-Json -InputObject "$line" -ErrorAction Stop
    } catch {
        Write-Output "$line"
        continue
    }
    if ($record.reason -eq 'compiler-artifact' -and $record.profile.test -and $record.executable) {
        $testExecutables += $record.executable
    }
}
if ($buildExit -ne 0) {
    $detail = ($buildOutput | Select-Object -Last 120) -join "`n"
    $detail = $detail.Replace('%', '%25').Replace("`r", '%0D').Replace("`n", '%0A')
    Write-Output "::error title=Windows test compilation::$detail"
    exit $buildExit
}
if ($testExecutables.Count -ne 1) {
    throw "Expected one Windows library test executable, got $($testExecutables.Count)"
}

# tauri-build links the Common Controls manifest only into application binaries.
$mt = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\mt.exe" |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $mt) {
    throw 'Windows SDK manifest tool was not found'
}
$application = (Resolve-Path 'src-tauri/target/release/deepseek-harness-desktop.exe').Path
$manifest = Join-Path $env:RUNNER_TEMP 'wanglab-test-application.manifest'
& $mt -nologo "-inputresource:$application;#1" "-out:$manifest"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
[xml]$document = Get-Content $manifest -Raw
$controls = $document.SelectSingleNode("//*[local-name()='assemblyIdentity' and @name='Microsoft.Windows.Common-Controls' and @version='6.0.0.0']")
if (-not $controls) {
    throw 'The application manifest does not enable Common Controls v6'
}
foreach ($executable in $testExecutables) {
    & $mt -nologo -manifest $manifest "-outputresource:$executable;#1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output "Applied application manifest to $executable"
}
Add-Content -Path $env:GITHUB_ENV -Value "WANGLAB_WINDOWS_TEST_EXE=$($testExecutables[0])"
