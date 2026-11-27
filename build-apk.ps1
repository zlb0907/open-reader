# OpenReader phase-A APK builder.
# No Gradle, no Maven, no network download: only tools shipped with Android Studio.
# All native tools run inside an ASCII temp dir to avoid Windows CJK path encoding bugs.
# Usage:  powershell -File build-apk.ps1            -> build OpenReader.apk
#         powershell -File build-apk.ps1 -CheckOnly -> verify toolchain only
param([switch]$CheckOnly)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
function Say($m) { Write-Host "[openreader] $m" }
function Die($m) { throw $m }

# ---------- version: version.json is the single source of truth ----------
# Keep this block pure ASCII: PowerShell 5.1 reads .ps1 as ANSI by default.
$VersionFile = Join-Path $Root 'version.json'
if (-not (Test-Path $VersionFile)) { Die 'version.json is missing.' }
$V = Get-Content -LiteralPath $VersionFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $V.code -or -not $V.name) { Die 'version.json needs code and name.' }
$ManifestSrc = Join-Path $Root 'app\src\main\AndroidManifest.xml'
$GradleSrc = Join-Path $Root 'app\build.gradle'
$JavaSrcDir = Join-Path $Root 'app\src\main\java\com\openreader\app'
$mx = Get-Content -LiteralPath $ManifestSrc -Raw -Encoding UTF8
$gx = Get-Content -LiteralPath $GradleSrc -Raw -Encoding UTF8
if ($mx -notmatch ('versionCode="' + $V.code + '"') -or
    $mx -notmatch ('versionName="' + [regex]::Escape($V.name) + '"')) {
    Die "AndroidManifest.xml version mismatch, expected code=$($V.code) name=$($V.name)"
}
if ($gx -notmatch ('versionCode ' + $V.code + '\b') -or
    $gx -notmatch ("versionName '" + [regex]::Escape($V.name) + "'")) {
    Die "app/build.gradle version mismatch, expected code=$($V.code) name=$($V.name)"
}
$javaMain = Get-Content -LiteralPath (Join-Path $JavaSrcDir 'MainActivity.java') -Raw -Encoding UTF8
if ($javaMain -notmatch [regex]::Escape('"' + $V.update_url + '"')) {
    Die 'MainActivity.java UPDATE_URL does not match version.json update_url.'
}
if (-not (Test-Path (Join-Path $Root 'debug.keystore'))) {
    Die 'debug.keystore missing - never rebuild a release with a new key.'
}
Say "Version    : $($V.name) (code $($V.code))"

# ---------- locate Android SDK ----------
# Priority: explicit env > bundled minimal toolchain (pure ASCII path) > Android Studio defaults.
$candidates = New-Object System.Collections.ArrayList
if ($env:ANDROID_HOME)     { [void]$candidates.Add($env:ANDROID_HOME) }
if ($env:ANDROID_SDK_ROOT) { [void]$candidates.Add($env:ANDROID_SDK_ROOT) }
if ($env:LOCALAPPDATA) {
    [void]$candidates.Add((Join-Path $env:LOCALAPPDATA 'OpenReaderToolchain\sdk'))
    [void]$candidates.Add((Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
}
[void]$candidates.Add('C:\Android\Sdk')
[void]$candidates.Add((Join-Path $Root '_toolchain\sdk'))
$Sdk = $null
foreach ($c in $candidates) {
    if ($c -and (Test-Path (Join-Path $c 'platforms'))) { $Sdk = $c; break }
}
if (-not $Sdk) {
    Say 'No SDK with a platforms/ folder was found. Searched:'
    foreach ($c in $candidates) { Say "  $c" }
    Die 'Android SDK not found. Restore %LOCALAPPDATA%\OpenReaderToolchain, install Android Studio with SDK, or set ANDROID_HOME.'
}

$plat = Get-ChildItem -Path (Join-Path $Sdk 'platforms') -Directory |
    Where-Object { $_.Name -match '^android-\d+$' -and (Test-Path (Join-Path $_.FullName 'android.jar')) } |
    Sort-Object { [int]($_.Name -replace '^android-', '') } -Descending |
    Select-Object -First 1
if (-not $plat) { Die 'No SDK platform installed. Android Studio > SDK Manager > SDK Platforms.' }
$AndroidJar = Join-Path $plat.FullName 'android.jar'
$Api = [int]($plat.Name -replace '^android-', '')

$btRoot = Join-Path $Sdk 'build-tools'
if (-not (Test-Path $btRoot)) { Die 'build-tools missing. SDK Manager > SDK Tools > Android SDK Build-Tools.' }
$bt = Get-ChildItem -Path $btRoot -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'aapt2.exe') } |
    Sort-Object { [int](($_.Name -split '\.')[0]) } -Descending |
    Select-Object -First 1
if (-not $bt) { Die 'aapt2.exe not found under build-tools.' }
$BtDir = $bt.FullName
foreach ($tool in @('aapt2.exe', 'd8.bat', 'zipalign.exe', 'apksigner.bat')) {
    if (-not (Test-Path (Join-Path $BtDir $tool))) { Die "Missing $tool in $BtDir" }
}

# ---------- locate JDK / Android Studio JBR ----------
$jbrs = New-Object System.Collections.ArrayList
if ($env:JAVA_HOME) { [void]$jbrs.Add($env:JAVA_HOME) }
if ($env:LOCALAPPDATA) {
    [void]$jbrs.Add((Join-Path $env:LOCALAPPDATA 'OpenReaderToolchain\jdk'))
    [void]$jbrs.Add((Join-Path $env:LOCALAPPDATA 'Programs\Android Studio\jbr'))
}
[void]$jbrs.Add((Join-Path $Root '_toolchain\jdk'))
[void]$jbrs.Add('C:\Program Files\Android\Android Studio\jbr')
foreach ($base in @('C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft')) {
    if (Test-Path $base) {
        Get-ChildItem -Path $base -Directory | ForEach-Object { [void]$jbrs.Add($_.FullName) }
    }
}
$Jbr = $null
foreach ($c in $jbrs) {
    if (Test-Path (Join-Path $c 'bin\javac.exe')) { $Jbr = $c; break }
}
if (-not $Jbr) { Die 'JDK 17+ not found. Restore %LOCALAPPDATA%\OpenReaderToolchain\jdk, install Android Studio (jbr), or set JAVA_HOME.' }
if (-not (Test-Path (Join-Path $Jbr 'bin\jar.exe'))) { Die 'jar.exe missing from JDK bin.' }

Say "SDK         : $Sdk"
Say "Platform    : android-$Api"
Say "Build-tools : $($bt.Name)"
Say "JDK         : $Jbr"
if ($CheckOnly) {
    Say 'CHECK OK - toolchain is ready. Run build-apk.ps1 without -CheckOnly to build.'
    exit 0
}

$env:JAVA_HOME = $Jbr
$env:ANDROID_HOME = $Sdk
$env:PATH = (Join-Path $Jbr 'bin') + ';' + $env:PATH

# ---------- stage sources into a pure-ASCII workspace ----------
$TmpRoot = $env:TEMP
if (-not $TmpRoot) { $TmpRoot = 'C:\Windows\Temp' }
$Tmp = Join-Path $TmpRoot 'openreader-apk-build'
if (Test-Path $Tmp) { Remove-Item -Path $Tmp -Recurse -Force }
New-Item -ItemType Directory -Path $Tmp -Force | Out-Null

$SrcMain = Join-Path $Root 'app\src\main'
$Manifest = Join-Path $Tmp 'AndroidManifest.xml'
Copy-Item -Path (Join-Path $SrcMain 'AndroidManifest.xml') -Destination $Manifest -Force

# WebView assets (HTML / JS / core) must also live on an ASCII path for aapt2.
$AssetsSrc = Join-Path $SrcMain 'assets'
$AssetsTmp = Join-Path $Tmp 'assets'
foreach ($must in @('index.html', 'bundle.js', 'shell.js', 'compat.js', 'bootstrap.mjs', 'core\api.mjs', 'android-storage.mjs', 'vendor\fflate.mjs')) {
    if (-not (Test-Path (Join-Path $AssetsSrc $must))) {
        Die "assets/$must missing. Run: node sync-web.mjs"
    }
}
Copy-Item -Path $AssetsSrc -Destination $AssetsTmp -Recurse -Force

# Launcher icons must also be staged on an ASCII path for aapt2.
$ResSrc = Join-Path $SrcMain 'res'
$ResTmp = Join-Path $Tmp 'res'
if (Test-Path $ResSrc) { Copy-Item -Path $ResSrc -Destination $ResTmp -Recurse -Force }

$JavaDir = Join-Path $Tmp 'java\com\openreader\app'
New-Item -ItemType Directory -Path $JavaDir -Force | Out-Null
# Stage every *.java (MainActivity + ApkProvider), not just one file.
$srcJava = @(Get-ChildItem -LiteralPath $JavaSrcDir -Filter '*.java' | ForEach-Object { $_.FullName })
if ($srcJava.Count -lt 2) { Die 'Need both MainActivity.java and ApkProvider.java.' }
foreach ($f in $srcJava) { Copy-Item -LiteralPath $f -Destination $JavaDir -Force }
$stagedJava = @(Get-ChildItem -LiteralPath $JavaDir -Filter '*.java' | ForEach-Object { $_.FullName })

# ---------- L2: inject signing fingerprint + asset hashes ----------
# The checked-in Integrity.java is a DEV placeholder. Overwrite only the
# staged copy so every release carries the fingerprint of debug.keystore and
# the SHA-256 of every file under assets/. Nothing is written to the source tree.
Say 'Preparing integrity constants'
$kt = & (Join-Path $Jbr 'bin\keytool.exe') '-list' '-v' `
    '-keystore' (Join-Path $Root 'debug.keystore') '-storepass' 'android' 2>&1
$sigMatch = [regex]::Match(($kt -join "`n"), 'SHA256:\s*([0-9A-Fa-f:]{2,})')
if (-not $sigMatch.Success) { Die 'Cannot read SHA-256 from debug.keystore.' }
$sigHex = ($sigMatch.Groups[1].Value -replace ':', '').ToLowerInvariant()
if ($sigHex.Length -ne 64) { Die 'Unexpected signing certificate fingerprint length.' }
$assetEntries = @()
foreach ($f in @(Get-ChildItem -LiteralPath $AssetsTmp -Recurse -File | Sort-Object FullName)) {
    $rel = $f.FullName.Substring($AssetsTmp.Length + 1).Replace('\', '/')
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $assetEntries += ('assets/' + $rel + ':' + $h)
}
if ($assetEntries.Count -lt 5) { Die 'Asset list looks incomplete.' }
$integrityText = @'
package com.openreader.app;

/** Generated by build-apk.ps1. Do not edit by hand. */
public final class Integrity {
    private Integrity() {}
    public static final String SIGNATURE_SHA256 = "__SIG__";
    public static final String ASSET_HASHES = "__ASSETS__";
    public static boolean enabled() { return !"DEV".equals(SIGNATURE_SHA256); }
}
'@
$integrityText = $integrityText.Replace('__SIG__', $sigHex).Replace('__ASSETS__', ($assetEntries -join ';'))
[System.IO.File]::WriteAllText((Join-Path $JavaDir 'Integrity.java'),
    $integrityText, (New-Object System.Text.UTF8Encoding($false)))
Say ("       signature=" + $sigHex.Substring(0, 12) + "... assets=" + $assetEntries.Count)

$Classes = Join-Path $Tmp 'classes'
$DexDir  = Join-Path $Tmp 'dex'
$BaseApk = Join-Path $Tmp 'base.apk'
$Aligned = Join-Path $Tmp 'aligned.apk'
$Signed  = Join-Path $Tmp 'OpenReader.apk'
New-Item -ItemType Directory -Path $Classes, $DexDir -Force | Out-Null

# ---------- javac ----------
Say '1/7 Compiling MainActivity.java'
$javacArgs = @('-source', '17', '-target', '17', '-encoding', 'UTF-8',
    '-cp', $AndroidJar, '-d', $Classes) + $stagedJava
& (Join-Path $Jbr 'bin\javac.exe') @javacArgs
if ($LASTEXITCODE -ne 0) { Die 'javac failed.' }
$classFiles = @(Get-ChildItem -Path $Classes -Recurse -Filter '*.class' | ForEach-Object { $_.FullName })
if ($classFiles.Count -eq 0) { Die 'javac produced no .class files.' }

# ---------- d8 ----------
Say '2/7 Building classes.dex'
$d8Args = @('--lib', $AndroidJar, '--min-api', '24', '--output', $DexDir) + $classFiles
& (Join-Path $BtDir 'd8.bat') @d8Args
if ($LASTEXITCODE -ne 0) { Die 'd8 failed.' }
$Dex = Join-Path $DexDir 'classes.dex'
if (-not (Test-Path $Dex)) { Die 'classes.dex was not produced.' }

# ---------- aapt2 ----------
# Compile each launcher icon PNG into a .flat (one per density / shape),
# then pass them all to link so @mipmap/ic_launcher resolves.
Say '3/7 Compiling launcher icons + linking manifest'
$FlatDir = Join-Path $Tmp 'flat'
New-Item -ItemType Directory -Path $FlatDir -Force | Out-Null
$flatFiles = @()
if (Test-Path $ResTmp) {
    $pngs = @(Get-ChildItem -LiteralPath $ResTmp -Recurse -File -Filter '*.png' |
        ForEach-Object { $_.FullName })
    foreach ($f in $pngs) {
        & (Join-Path $BtDir 'aapt2.exe') 'compile' $f '-o' $FlatDir
        if ($LASTEXITCODE -ne 0) { Die "aapt2 compile failed: $f" }
    }
    $flatFiles = @(Get-ChildItem -LiteralPath $FlatDir -Filter '*.flat' |
        ForEach-Object { $_.FullName })
    if ($flatFiles.Count -lt $pngs.Count) {
        Die "aapt2 produced $($flatFiles.Count) flats for $($pngs.Count) PNGs."
    }
}
if ($flatFiles.Count -eq 0) { Die 'No compiled launcher icons found in res/.' }
$linkArgs = @('link', '-o', $BaseApk, '-I', $AndroidJar,
    '--manifest', $Manifest, '--min-sdk-version', '24', '--target-sdk-version', '34',
    '--version-code', ([string]$V.code), '--version-name', ([string]$V.name), '-A', $AssetsTmp)
foreach ($f in $flatFiles) { $linkArgs += @('-R', $f) }
& (Join-Path $BtDir 'aapt2.exe') @linkArgs
if ($LASTEXITCODE -ne 0) { Die 'aapt2 link failed.' }

# ---------- inject dex with the JDK jar tool (keeps the APK a plain zip) ----------
Say '4/7 Injecting classes.dex'
& (Join-Path $Jbr 'bin\jar.exe') 'uf' $BaseApk '-C' $DexDir 'classes.dex'
if ($LASTEXITCODE -ne 0) { Die 'jar update failed.' }
$DexCheck = Join-Path $Tmp 'dexcheck.txt'
& (Join-Path $Jbr 'bin\jar.exe') 'tf' $BaseApk | Out-File -FilePath $DexCheck -Encoding ascii
if (-not (Select-String -Path $DexCheck -SimpleMatch 'classes.dex' -Quiet)) {
    Die 'classes.dex is missing from the APK.'
}

# ---------- zipalign ----------
Say '5/7 Aligning'
& (Join-Path $BtDir 'zipalign.exe') '-f' '-p' '4' $BaseApk $Aligned
if ($LASTEXITCODE -ne 0) { Die 'zipalign failed.' }

# ---------- keystore ----------
Say '6/7 Signing'
$Ks = Join-Path $Tmp 'debug.keystore'
$PersistKs = Join-Path $Root 'debug.keystore'
if (Test-Path $PersistKs) {
    Copy-Item -Path $PersistKs -Destination $Ks -Force
} else {
    & (Join-Path $Jbr 'bin\keytool.exe') '-genkeypair' '-v' '-keystore' $Ks `
        '-alias' 'androiddebugkey' '-keyalg' 'RSA' '-keysize' '2048' '-validity' '10000' `
        '-storepass' 'android' '-keypass' 'android' '-dname' 'CN=Android Debug,O=Android,C=US'
    if ($LASTEXITCODE -ne 0) { Die 'keytool failed.' }
    Copy-Item -Path $Ks -Destination $PersistKs -Force
}
& (Join-Path $BtDir 'apksigner.bat') 'sign' '--ks' $Ks '--ks-pass' 'pass:android' `
    '--key-pass' 'pass:android' '--out' $Signed $Aligned
if ($LASTEXITCODE -ne 0) { Die 'apksigner sign failed.' }

# ---------- verify + publish ----------
Say '7/7 Verifying signature'
& (Join-Path $BtDir 'apksigner.bat') 'verify' '--verbose' $Signed
if ($LASTEXITCODE -ne 0) { Die 'apksigner verify failed.' }

$Out = Join-Path $Root 'OpenReader.apk'
Copy-Item -Path $Signed -Destination $Out -Force
Say "APK READY: $Out"
Get-Item -Path $Out | Select-Object FullName, Length | Format-List

# ---------- publish: exactly the two files to upload to ~/or_update/ ----------
$Pub = Join-Path $Root 'publish'
New-Item -ItemType Directory -Path $Pub -Force | Out-Null
$PubApk = Join-Path $Pub 'OpenReader.apk'
Copy-Item -LiteralPath $Signed -Destination $PubApk -Force
$Sha = (Get-FileHash -LiteralPath $PubApk -Algorithm SHA256).Hash.ToLowerInvariant()
# force=true -> clients must install this build before they can read.
# Missing field defaults to true, so forgetting it never silently disables the gate.
$Force = if ($null -eq $V.force) { $true } else { [bool]$V.force }
$ManifestJson = [ordered]@{
    code         = [int]$V.code
    name         = [string]$V.name
    notes        = [string]$V.notes
    url          = [string]$V.download_url
    sha256       = $Sha
    fallback_url = [string]$V.fallback_url
    min_android  = [int]$V.min_android
    force        = $Force
}
$Json = $ManifestJson | ConvertTo-Json -Compress
# No BOM: org.json.JSONObject chokes on a leading U+FEFF.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $Pub 'update.json'), $Json, $Utf8NoBom)
$PubHash = (Get-FileHash -LiteralPath $PubApk -Algorithm SHA256).Hash.ToLowerInvariant()
if ($PubHash -ne $Sha) { Die 'publish/update.json sha256 does not match the APK.' }
Say "PUBLISH READY: $Pub (update.json + OpenReader.apk)"
Say "sha256      : $Sha"
Say "Upload both files to ~/or_update/ on PythonAnywhere; no Reload needed."
Say "Verify      : curl $($V.update_url)"
Say 'Install on phone: adb install -r OpenReader.apk (signature unchanged).'
