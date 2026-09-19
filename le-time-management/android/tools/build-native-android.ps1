param([ValidateSet('Debug','Release')][string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$generated = Join-Path $repo 'le-time-management/src-tauri/gen/android'
$settings = Get-Content (Join-Path $generated 'tauri.settings.gradle') -Raw
$sources = @{}
foreach ($match in [regex]::Matches($settings, 'project\('':([^'']+)''\)\.projectDir = new File\("([^"\r\n]+)"\)')) {
    $sources[$match.Groups[1].Value] = $match.Groups[2].Value.Replace('\\','\')
}
foreach ($name in @('tauri-android','tauri-plugin-opener')) {
    if (-not $sources[$name] -or -not (Test-Path $sources[$name])) { throw "Missing generated Tauri Android source: $name" }
}
if (-not (Test-Path "$generated/app/src/main/jniLibs/arm64-v8a/libletime_lib.so")) { throw 'Build the U-Time arm64 Rust library first.' }
Push-Location (Join-Path $repo 'vendor/shiguangschedule')
try {
    & ./gradlew.bat ":leAndroid:assemble$Configuration" '-PleAndroid=true' '-Pkotlin.incremental=false' '-Pandroid.overridePathCheck=true' "-PtauriAndroidSource=$($sources['tauri-android'])" "-PtauriOpenerSource=$($sources['tauri-plugin-opener'])" --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Integrated original Android app build failed.' }
} finally { Pop-Location }
Write-Host "APK output: $repo/vendor/shiguangschedule/leAndroid/build/outputs/apk"
