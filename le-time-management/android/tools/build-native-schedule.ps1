param(
    [string]$BuildDirectory = "$env:LOCALAPPDATA/LeTimeManagementBuild/shiguang",
    [switch]$Installer
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ($BuildDirectory -match '[^\x00-\x7F]') { throw 'BuildDirectory must use an ASCII path for Windows jpackage.' }
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME/bin/jpackage.exe")) { throw 'Set JAVA_HOME to a JDK 21 installation.' }
Push-Location (Join-Path $repo 'vendor/shiguangschedule')
try {
    & ./gradlew.bat :desktopApp:test "-PshiguangDesktopBuildDir=$BuildDirectory" '-Pandroid.overridePathCheck=true' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Original source build or native UI tests failed.' }
} finally { Pop-Location }
$distribution = Join-Path $BuildDirectory 'compose/binaries/main/app/ShiguangSchedule'
if (-not (Test-Path "$distribution/ShiguangSchedule.exe")) { throw 'Original native executable was not produced.' }
$target = Join-Path $repo 'le-time-management/src-tauri/native/shiguang'
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path "$distribution/*" -Destination $target -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'vendor/shiguangschedule/LICENSE') -Destination "$target/LICENSE-shiguangschedule.txt" -Force
if ($Installer) {
    # Keep native-port artifacts separate from caches copied from another checkout.
    $previousTargetDirectory = $env:CARGO_TARGET_DIR
    if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $BuildDirectory 'tauri-target' }
    Push-Location (Join-Path $repo 'le-time-management')
    try {
        & npm.cmd run tauri -- build --config src-tauri/tauri.shiguang.conf.json --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw 'U-Time installer build failed.' }
    } finally { Pop-Location; $env:CARGO_TARGET_DIR = $previousTargetDirectory }
}
Write-Host "Original native course plugin staged at $target"
