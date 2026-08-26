# 반대항축구 온라인 — 서버 + Cloudflare 빠른 터널을 한 번에 띄운다.
#
#   powershell -ExecutionPolicy Bypass -File start-online.ps1
#
# 하는 일
#   1) node server.js 를 8080 에 띄운다 (이미 떠 있으면 그것을 쓴다)
#   2) cloudflared 빠른 터널을 열어 https 주소를 받는다 (계정·도메인·로그인 없음)
#   3) 그 주소를 화면에 크게 찍는다 — 친구에게 그 주소를 주면 된다
#
# 창을 닫으면 터널이 닫히고 주소도 사라진다. 다시 켜면 **주소가 바뀐다**(빠른 터널의 성질).
# 고정 주소가 필요하면 Cloudflare 계정 + 본인 도메인이 있어야 한다(설계도 §9).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:PORT) { $env:PORT } else { '8080' }

function Test-Server($p) {
  try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$p/stats" -UseBasicParsing -TimeoutSec 3; return $true } catch { return $false }
}

# ── 1) 게임 서버 ──────────────────────────────────────────────────────────
if (Test-Server $port) {
  Write-Host "게임 서버가 이미 $port 에 떠 있습니다." -ForegroundColor DarkGray
} else {
  if (-not (Test-Path (Join-Path $here 'node_modules\ws'))) {
    Write-Host "의존성 설치 중 (npm install)..." -ForegroundColor DarkGray
    Push-Location $here; npm install --no-audit --no-fund | Out-Null; Pop-Location
  }
  Write-Host "게임 서버 시작 중 (포트 $port)..." -ForegroundColor DarkGray
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $here -WindowStyle Hidden
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 400; if (Test-Server $port) { $ok = $true; break } }
  if (-not $ok) { Write-Host "서버가 뜨지 않았습니다. 'node server.js' 를 직접 실행해 오류를 보세요." -ForegroundColor Red; exit 1 }
}

# ── 2) cloudflared 찾기 ───────────────────────────────────────────────────
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  foreach ($p in @("C:\Program Files (x86)\cloudflared\cloudflared.exe", "C:\Program Files\cloudflared\cloudflared.exe")) {
    if (Test-Path $p) { $cf = $p; break }
  }
}
if (-not $cf) {
  Write-Host "cloudflared 가 없습니다. 먼저 설치하세요:" -ForegroundColor Red
  Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}

# ── 3) 빠른 터널 ──────────────────────────────────────────────────────────
$log = Join-Path $env:TEMP 'soccer-cloudflared.log'
if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "터널 여는 중..." -ForegroundColor DarkGray
$proc = Start-Process -FilePath $cf -ArgumentList @('tunnel', '--url', "http://localhost:$port", '--no-autoupdate') `
  -RedirectStandardError $log -RedirectStandardOutput "$log.out" -WindowStyle Hidden -PassThru

$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
}
if (-not $url) {
  Write-Host "터널 주소를 받지 못했습니다. 로그: $log" -ForegroundColor Red
  exit 1
}

# ── 주소 게시판 (GitHub Gist) ─────────────────────────────────────────────
# Deno 판은 잠들면 주소를 잊고 무료 한도도 금세 닳아 실제로 정지됐다(2026-08-26).
# Gist 는 잠들지 않고 한도가 넉넉하다. 쓰기는 gh CLI 가 이미 로그인돼 있어 토큰을 따로 두지 않는다.
$GistId = "5d0b2f4daf7e089553c5a541b53cd29c"
$GistFile = "soccer-server.json"
function Publish-Url([string]$u) {
  if (-not $GistId) { return }
  $ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $tmp = Join-Path $env:TEMP $GistFile
  $json = if ($u) { "{""url"":""$u"",""at"":$ms}" } else { "{""url"":"""",""at"":0}" }
  Set-Content -Path $tmp -Value $json -Encoding utf8 -NoNewline
  try { & gh gist edit $GistId -f $GistFile $tmp 2>$null | Out-Null
        if ($u) { Write-Host "게시판(Gist)에 주소를 올렸습니다." -ForegroundColor DarkGray } }
  catch { Write-Host "게시판에 못 올렸습니다(gh 로그인 확인): $($_.Exception.Message)" -ForegroundColor Yellow }
}
Publish-Url $url

# ── 4) 예비 게시판(Deno)에도 알리기 (선택) ────────────────────────────────
# 대문(GitHub Pages)에 올린 사본이 "지금 주소"를 스스로 찾게 하려면, 켤 때마다 여기에 적어 준다.
# 두 값은 이 스크립트 옆의 registry.txt 에서 읽는다 (1줄: 게시판 주소 / 2줄: WRITE_KEY).
# 파일이 없으면 그냥 건너뛴다 — 집에서만 할 때는 필요 없다.
$regFile = Join-Path $here 'registry.txt'
if (Test-Path $regFile) {
  $lines = Get-Content $regFile | Where-Object { $_.Trim() -ne '' }
  if ($lines.Count -ge 2) {
    $regUrl = $lines[0].Trim().TrimEnd('/')
    $regKey = $lines[1].Trim()
    try {
      $body = @{ url = $url; key = $regKey } | ConvertTo-Json -Compress
      $res = Invoke-RestMethod -Uri "$regUrl/" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10
      if ($res.ok) { Write-Host "게시판에 주소를 올렸습니다: $regUrl" -ForegroundColor DarkGray }
      else { Write-Host "게시판 응답: $($res | ConvertTo-Json -Compress)" -ForegroundColor Yellow }
    } catch { Write-Host "게시판에 못 올렸습니다: $($_.Exception.Message)" -ForegroundColor Yellow }
  } else {
    Write-Host "registry.txt 형식이 틀립니다 (1줄 주소 / 2줄 키)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  반대항축구 온라인 주소" -ForegroundColor Green
Write-Host "  $url" -ForegroundColor White
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  이 주소를 친구에게 주면 바로 들어옵니다."
Write-Host "  이 창을 닫으면 터널이 닫히고 주소도 사라집니다."
Write-Host "  다시 켜면 주소가 바뀝니다."
Write-Host ""
Write-Host "  확인:  node loadtest.js --url $url --players 4" -ForegroundColor DarkGray
Write-Host ""
Write-Host "닫으려면 Ctrl+C 를 누르세요." -ForegroundColor DarkGray
try {
  # 게시판이 주소를 잊어도 스스로 되살아나도록 10분마다 같은 주소를 다시 올린다. **더 자주 두드리지 말 것** —
  # 30초 간격으로 두었더니 Deno Deploy 무료 한도를 다 써서 게시판 앱이 정지됐다(2026-08-26).
  # 게시판이 빈 값을 주는 문제는 클라이언트가 2.5초 간격으로 3번 다시 묻는 것으로 덮는다.
  # (게시판이 메모리 저장으로 도는 동안에는 앱이 잠들 때 주소를 잊는다 — 실제로 겪었다.)
  $beat = 0
  while (-not $proc.HasExited) {
    Start-Sleep -Seconds 10
    $beat += 10
    if ($beat -ge 600) {
      $beat = 0
      Publish-Url $url                      # Gist 는 registry.txt 가 없어도 갱신한다
      if ($regUrl -and $regKey) {
        try {
          $body = @{ url = $url; key = $regKey } | ConvertTo-Json -Compress
          Invoke-RestMethod -Uri "$regUrl/" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 8 | Out-Null
        } catch {}
      }
    }
  }
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  Publish-Url ''            # 터널이 닫혔으면 Gist 도 비운다
  # 터널이 닫혔으면 게시판도 비운다(옛 주소로 붙는 것을 막는다)
  if ($regUrl -and $regKey) {
    try {
      $body = @{ url = ''; key = $regKey } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$regUrl/" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 6 | Out-Null
      Write-Host "게시판을 비웠습니다." -ForegroundColor DarkGray
    } catch {}
  }
}
