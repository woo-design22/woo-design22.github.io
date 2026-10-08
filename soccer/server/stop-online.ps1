$ErrorActionPreference = 'Stop'
$runtimeFile = Join-Path $PSScriptRoot 'online-runtime.json'
if (-not (Test-Path -LiteralPath $runtimeFile)) { Write-Host '실행 중인 서버가 없습니다.'; exit 0 }
$state = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
if (-not $process -or $process.StartTime.ToUniversalTime().ToString('o') -ne $state.startedUtc) {
  Write-Host '이 실행기의 서버가 이미 종료되었습니다.'; exit 0
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '.online-stop'), 'stop')
Write-Host '종료를 요청했습니다. 서버와 터널, 게시판 주소를 함께 정리합니다.'
