$ErrorActionPreference = "Stop"
$html = (Resolve-Path (Join-Path $PSScriptRoot "shot-plugin-center.html")).Path.Replace("\", "/")
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path -LiteralPath $edge)) { throw "Microsoft Edge not found" }

$bg = Join-Path $PSScriptRoot "_background.png"
$desktop = Join-Path $PSScriptRoot "real-windows-plugin-center.png"
$miniSource = Join-Path $PSScriptRoot "real-miniprogram-plugin-center.png"
$wechatSource = Join-Path $PSScriptRoot "real-mobile-plugin-center.png"
$mini = Join-Path $PSScriptRoot "_mini-framed.png"
$wechat = Join-Path $PSScriptRoot "_wechat-framed.png"
$preview = Join-Path $PSScriptRoot "preview.png"
$output = Join-Path $PSScriptRoot "U-Time-三端插件中心动画.mp4"

& $edge --headless --disable-gpu --hide-scrollbars --window-size=1920,1080 --screenshot=$bg "file:///$html`?mode=background" | Out-Null
if (-not (Test-Path -LiteralPath $desktop)) { throw "Missing real Windows capture: $desktop" }
if (-not (Test-Path -LiteralPath $miniSource)) { throw "Missing real mini-program capture: $miniSource" }
if (-not (Test-Path -LiteralPath $wechatSource)) { throw "Missing real mobile capture: $wechatSource" }

ffmpeg -y -i $miniSource -vf "scale=330:714:force_original_aspect_ratio=decrease,pad=330:850:(ow-iw)/2:(oh-ih)/2:color=0x173f3a" -frames:v 1 -update 1 $mini | Out-Null
ffmpeg -y -i $wechatSource -vf "scale=330:714:force_original_aspect_ratio=decrease,pad=330:850:(ow-iw)/2:(oh-ih)/2:color=0x173f3a" -frames:v 1 -update 1 $wechat | Out-Null

$filters = @"
[1:v]format=rgba,fade=t=in:st=0.35:d=0.25:alpha=1[left];
[2:v]format=rgba,fade=t=in:st=0.95:d=0.25:alpha=1[mini];
[3:v]format=rgba,fade=t=in:st=1.45:d=0.25:alpha=1[wechat];
[0:v][left]overlay=x='if(lt(t,0.4),-1050,if(lt(t,1.82),60-1110*pow(1-(t-0.4)/1.42,3),60))':y=150:enable='between(t,0.35,9)'[v1];
[v1][mini]overlay=x=1165:y='if(lt(t,1),-850,if(lt(t,2.5),150-1000*pow(1-(t-1)/1.5,3),150))':enable='between(t,0.95,9)'[v2];
[v2][wechat]overlay=x=1530:y='if(lt(t,1.5),1080,if(lt(t,3),150+930*pow(1-(t-1.5)/1.5,3),150))':enable='between(t,1.45,9)',
fade=t=out:st=8.4:d=0.6,format=yuv420p[v]
"@
ffmpeg -y -loop 1 -framerate 30 -t 9 -i $bg -loop 1 -framerate 30 -t 9 -i $desktop -loop 1 -framerate 30 -t 9 -i $mini -loop 1 -framerate 30 -t 9 -i $wechat -filter_complex $filters -map "[v]" -r 30 -c:v libx264 -preset medium -crf 18 -movflags +faststart $output

ffmpeg -y -ss 6 -i $output -frames:v 1 -update 1 $preview | Out-Null
Remove-Item -LiteralPath $bg,$mini,$wechat -Force
Write-Host "Rendered: $output"
