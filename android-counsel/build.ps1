# 마음결(AI 상담) APK 빌드 (Gradle 없이 Android SDK 도구만 사용)
#
#   aapt2 compile/link  ->  리소스 + AndroidManifest 를 base APK 로
#   javac + d8          ->  MainActivity.java 를 classes.dex 로
#   zipalign            ->  4바이트 정렬
#   apksigner           ->  디버그 키로 서명
#
# 실행:  powershell -ExecutionPolicy Bypass -File build.ps1
#
# 주의: 줄 끝 백틱(`) 연결은 인코딩에 따라 깨질 수 있어 인자 배열로 넘긴다.

$ErrorActionPreference = "Stop"

$JAVA_HOME   = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot"
$SDK         = "C:\Android\sdk"
$BT          = "$SDK\build-tools\34.0.0"
$ANDROID_JAR = "$SDK\platforms\android-34\android.jar"

# d8.bat / apksigner.bat 은 JAVA_HOME 을 직접 읽으므로 프로세스 환경에 넣어 준다
$env:JAVA_HOME = $JAVA_HOME
$env:Path = "$JAVA_HOME\bin;$env:Path"

$ROOT  = $PSScriptRoot
$BUILD = "$ROOT\build"
$OUT   = "$ROOT\dist"

function Invoke-Step($label, $exe, $argList) {
    Write-Host "== $label ==" -ForegroundColor Cyan
    & $exe @argList
    if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE)" }
}

Write-Host "== 0/5 clean + sync assets ==" -ForegroundColor Cyan
if (Test-Path $BUILD) { Remove-Item $BUILD -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$BUILD\res", "$BUILD\classes", "$BUILD\dex", $OUT | Out-Null

# 웹 앱 원본을 그대로 가져온다. 웹/APK 가 같은 index.html 을 쓰도록 하는 게 목적.
# 아이콘은 넣지 않는다 - WebView 는 favicon/manifest 를 쓰지 않고,
# 런처 아이콘은 res\mipmap-* 에 따로 들어간다. (그리고 assets 하위 폴더를 두면
# 윈도우 aapt2 가 zip 경로에 역슬래시를 넣는다.)
$WEB = Join-Path (Split-Path $ROOT -Parent) "counsel-chat"
if (-not (Test-Path "$WEB\index.html")) { throw "web source not found: $WEB" }
$assets = "$ROOT\assets"
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item "$WEB\index.html" $assets
Write-Host "   assets <- $WEB\index.html" -ForegroundColor DarkGray

Invoke-Step "1/5 aapt2 compile" "$BT\aapt2.exe" @(
    "compile", "--dir", "$ROOT\res", "-o", "$BUILD\res\resources.zip"
)

Invoke-Step "2/5 aapt2 link" "$BT\aapt2.exe" @(
    "link",
    "-I", $ANDROID_JAR,
    "--manifest", "$ROOT\AndroidManifest.xml",
    "-A", "$ROOT\assets",
    "--java", "$BUILD\gen",
    "--min-sdk-version", "24",
    "--target-sdk-version", "34",
    "--version-code", "1",
    "--version-name", "1.0",
    "-o", "$BUILD\base.apk",
    "$BUILD\res\resources.zip"
)

# 안드로이드는 Java 8 바이트코드 기준. JDK 17 에서 -bootclasspath 는
# target 8 이하에서만 허용된다. -encoding UTF-8 을 빼면 한국어 윈도우에서
# 소스를 949 로 읽어 주석이 깨진다.
$sources = @(Get-ChildItem "$ROOT\java" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
if (Test-Path "$BUILD\gen") {
    $sources += @(Get-ChildItem "$BUILD\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
}
Invoke-Step "3/5 javac" "$JAVA_HOME\bin\javac.exe" (@(
    "-source", "8", "-target", "8",
    "-bootclasspath", $ANDROID_JAR,
    "-classpath", $ANDROID_JAR,
    "-encoding", "UTF-8",
    "-nowarn",
    "-d", "$BUILD\classes"
) + $sources)

$classFiles = @(Get-ChildItem "$BUILD\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
Invoke-Step "4/5 d8" "$BT\d8.bat" (@(
    "--min-api", "24", "--lib", $ANDROID_JAR, "--output", "$BUILD\dex"
) + $classFiles)

Write-Host "== 5/5 package + sign ==" -ForegroundColor Cyan

# base.apk 안에 classes.dex 를 밀어 넣는다
Copy-Item "$BUILD\base.apk" "$BUILD\unsigned.apk" -Force
Push-Location "$BUILD\dex"
& "$JAVA_HOME\bin\jar.exe" uf "$BUILD\unsigned.apk" "classes.dex"
$dexRc = $LASTEXITCODE
Pop-Location
if ($dexRc -ne 0) { throw "adding classes.dex failed" }

# 디버그 키스토어가 없으면 만든다 (배포용 아님, 로컬 설치 확인용)
$KS = "$ROOT\debug.keystore"
if (-not (Test-Path $KS)) {
    Write-Host "   creating debug keystore" -ForegroundColor DarkGray
    & "$JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $KS -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}

Invoke-Step "   zipalign" "$BT\zipalign.exe" @(
    "-f", "-p", "4", "$BUILD\unsigned.apk", "$BUILD\aligned.apk"
)

$APK = "$OUT\maeumgyeol.apk"
Invoke-Step "   apksigner" "$BT\apksigner.bat" @(
    "sign",
    "--ks", $KS, "--ks-pass", "pass:android", "--key-pass", "pass:android",
    "--min-sdk-version", "24",
    "--out", $APK,
    "$BUILD\aligned.apk"
)

& "$BT\apksigner.bat" verify --print-certs $APK | Select-Object -First 3

$size = (Get-Item $APK).Length / 1KB
Write-Host ""
Write-Host ("DONE: $APK  ({0:N0} KB)" -f $size) -ForegroundColor Green
