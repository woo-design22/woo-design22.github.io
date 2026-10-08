param([switch]$LocalOnly, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 8080 }
$gistId = '5d0b2f4daf7e089553c5a541b53cd29c'
$gistFile = 'soccer-server.json'
$build = 'handoff-2026-10-08'

# Windows PowerShell 5에서는 네이티브 stderr가 예외가 되므로 종료 코드로 판정한다.
function Invoke-GitHub([string[]]$GhArgs) {
  $savedPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & gh @GhArgs 2>$null
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $savedPreference }
  return @{ Code = $code; Output = ($output -join [Environment]::NewLine) }
}


foreach ($command in @('node', 'npm.cmd')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "필요한 도구가 없습니다: $command" }
}
$major = [int]((& node -p 'process.versions.node').Split('.')[0])
if ($major -lt 22) { throw 'Node.js 22 이상이 필요합니다.' }
if (-not (Test-Path -LiteralPath (Join-Path $here 'node_modules/ws/package.json'))) {
  Push-Location $here
  try {
    & npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '서버 패키지 설치에 실패했습니다.' }
  } finally { Pop-Location }
}

$cf = $null
if (-not $LocalOnly) {
  $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cf) {
    foreach ($candidate in @('C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe')) {
      if (Test-Path -LiteralPath $candidate) { $cf = $candidate; break }
    }
  }
  if (-not $cf) { throw 'cloudflared가 없습니다. winget install --id Cloudflare.cloudflared 로 설치하세요.' }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI가 필요합니다.' }
  $auth = Invoke-GitHub -GhArgs @('auth', 'status')
  if ($auth.Code -ne 0) { throw 'GitHub 로그인이 필요합니다. 같은 폴더의 GitHub 로그인.cmd 를 실행하세요.' }
  $owner = Invoke-GitHub -GhArgs @('api', "gists/$gistId", '--jq', '.owner.login')
  if ($owner.Code -ne 0) { throw '서버 주소 게시판에 접근하지 못했습니다. GitHub 계정을 확인하세요.' }
  $login = Invoke-GitHub -GhArgs @('api', 'user', '--jq', '.login')
  if ($login.Code -ne 0 -or $owner.Output.Trim() -ne $login.Output.Trim()) { throw '서버 주소 게시판을 소유한 GitHub 계정으로 로그인해야 합니다.' }
}
if ($CheckOnly) { Write-Host '실행 준비 확인 완료'; exit 0 }

function Get-Server {
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:$port/stats" -TimeoutSec 2 } catch { return $null }
}
function Publish-Url([string]$url) {
  $record = @{ url = $url; at = if ($url) { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } else { 0 } }
  $tmp = Join-Path $env:TEMP ("soccer-gist-$PID.json")
  try {
    [IO.File]::WriteAllText($tmp, ($record | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
    $result = Invoke-GitHub -GhArgs @('gist', 'edit', $gistId, '-f', $gistFile, $tmp)
    if ($result.Code -ne 0) { throw '주소 게시판 갱신에 실패했습니다.' }
  } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } }
}

$runtimeFile = Join-Path $here 'online-runtime.json'
$stopRequest = Join-Path $here '.online-stop'
if (Test-Path -LiteralPath $runtimeFile) {
  $prior = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
  $priorProcess = Get-Process -Id $prior.pid -ErrorAction SilentlyContinue
  if ($priorProcess -and $priorProcess.StartTime.ToUniversalTime().ToString('o') -eq $prior.startedUtc) {
    throw '이미 실행 중입니다. 온라인 끄기.cmd로 종료한 뒤 다시 실행하세요.'
  }
}
if (Test-Path -LiteralPath $stopRequest) { Remove-Item -LiteralPath $stopRequest -Force }
@{ pid = $PID; startedUtc = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $runtimeFile -Encoding UTF8
$game = $null; $tunnel = $null; $published = $false
$log = Join-Path $env:TEMP "soccer-cloudflared-$PID.log"
try {
  $existing = Get-Server
  if ($existing -and $existing.build -ne $build) { throw "포트 $port 에 다른 버전의 서버가 있습니다. 그 서버를 종료한 뒤 다시 실행하세요." }
  if (-not $existing) {
    $env:PORT = "$port"
    $game = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.js' -WorkingDirectory $here -WindowStyle Hidden -PassThru -RedirectStandardOutput "$log.server.out" -RedirectStandardError "$log.server.err"
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 200
      if (Get-Server) { break }
      if ($game.HasExited) { throw "서버 시작에 실패했습니다. 로그: $log.server.err" }
    }
    if (-not (Get-Server)) { throw "서버 응답이 없습니다. 로그: $log.server.err" }
  }
  if ($LocalOnly) {
    Write-Host "반대항축구: http://127.0.0.1:$port/" -ForegroundColor Green
    Write-Host '이 창에서 Ctrl+C를 누르면 종료합니다.'
    while (-not (Test-Path -LiteralPath $stopRequest)) { Start-Sleep -Seconds 1 }; return
  }
  $tunnel = Start-Process -FilePath $cf -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$port", '--no-autoupdate') -WindowStyle Hidden -PassThru -RedirectStandardError $log -RedirectStandardOutput "$log.out"
  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($tunnel.HasExited) { throw "터널이 종료됐습니다. 로그: $log" }
    if (Test-Path -LiteralPath $log) {
      $match = Select-String -LiteralPath $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
      if ($match) { $url = $match.Matches[0].Value; break }
    }
  }
  if (-not $url) { throw "터널 주소를 받지 못했습니다. 로그: $log" }
  Publish-Url $url
  $published = $true
  Write-Host "반대항축구 온라인: $url" -ForegroundColor Green
  Write-Host '친구에게 이 주소를 보내세요. Ctrl+C로 종료합니다.'
  $beat = 0
  while (-not $tunnel.HasExited -and -not (Test-Path -LiteralPath $stopRequest)) {
    Start-Sleep -Seconds 2; $beat += 2
    if ($game -and $game.HasExited) { throw '게임 서버가 종료됐습니다.' }
    if ($beat -ge 600) {
      $beat = 0
      try { Publish-Url $url } catch { Write-Warning $_.Exception.Message }
    }
  }
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  if ($published) { try { Publish-Url '' } catch { Write-Warning '게시판을 비우지 못했습니다.' } }
  if ($game -and -not $game.HasExited) { Stop-Process -Id $game.Id -Force }
  if (Test-Path -LiteralPath $runtimeFile) { Remove-Item -LiteralPath $runtimeFile -Force }
  if (Test-Path -LiteralPath $stopRequest) { Remove-Item -LiteralPath $stopRequest -Force }
}
