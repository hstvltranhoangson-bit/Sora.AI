# SORA source-recovery setup (Windows PowerShell 5.1), no elevation required.
# Usage: .\KhoiPhuc-Sora.ps1 -Mode Check
#        .\KhoiPhuc-Sora.ps1 -Mode Install
#        .\KhoiPhuc-Sora.ps1 -Mode RepairElectron  # fix only the Electron binary
[CmdletBinding()]
param([ValidateSet('Check','Install','RepairElectron')][string]$Mode='Check', [switch]$SkipAgent)
$ErrorActionPreference='Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root
Write-Host "SORA SOURCE: $root" -ForegroundColor Cyan
$required=@('package.json','backend\requirements.txt','src\main\main.js','assets\capri\capri-full.png','Sora.exe')
foreach($rel in $required){if(-not(Test-Path -LiteralPath (Join-Path $root $rel))){throw "Thieu file: $rel"}}
if($Mode -eq 'Check') {
  foreach($rel in @('node_modules\electron\dist\electron.exe','.venv\Scripts\python.exe','data\memory.sqlite3')) {
    $f=Join-Path $root $rel
    if(Test-Path -LiteralPath $f){ Write-Host '[OK]' $rel } else { Write-Host '[CAN CAI]' $rel }
  }
  $node=Get-Command node.exe -ErrorAction SilentlyContinue
  $npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
  Write-Host "Node: $($node.Source)";Write-Host "npm: $($npm.Source)"
  Write-Host 'CHECK XONG. Neu chua co .venv hoac node_modules, chay -Mode Install.'
  exit 0
}
# Electron 44+ downloads its executable on demand. For unstable networks,
# download the official archive with curl's resume (-C -), verify SHA-256,
# then extract the complete runtime and create Electron's path.txt marker.
function Assert-TargetVolumeSafe {
  $letter = [IO.Path]::GetPathRoot($root).Substring(0,1)
  $vol = Get-Volume -DriveLetter $letter -ErrorAction Stop
  if ($vol.HealthStatus -ne 'Healthy' -or $vol.OperationalStatus -ne 'OK') {
    throw "Volume $letter`: is not healthy. Stop and back up data before installing."
  }
  $dirty = ((& fsutil.exe dirty query "$letter`:" 2>&1) | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $dirty -notmatch '(?i)\bis\s+not\s+dirty\b') {
    throw "Volume $letter`: has an uncertain NTFS state: $dirty"
  }
}
function Repair-ElectronBinary {
  Assert-TargetVolumeSafe
  $electronRoot = Join-Path $root 'node_modules\electron'
  $electronPackage = Join-Path $electronRoot 'package.json'
  if(-not(Test-Path -LiteralPath $electronPackage)){
    throw 'Electron JS package is missing. Run CaiMoiTruong-SoraAI.ps1 -Mode Install first.'
  }
  $version = [string]((Get-Content -LiteralPath $electronPackage -Raw -Encoding UTF8 | ConvertFrom-Json).version)
  if($version -ne '44.9.3'){
    throw "Electron package is $version, but this verified recovery downloader targets 44.9.3. Do not install mismatched binaries."
  }
  $electronExe = Join-Path $electronRoot 'dist\electron.exe'
  $electronVersionFile = Join-Path $electronRoot 'dist\version'
  $electronPathFile = Join-Path $electronRoot 'path.txt'
  if(-not(Test-Path -LiteralPath $electronExe) -or -not(Test-Path -LiteralPath $electronVersionFile)){
    $electronCache = Join-Path (Split-Path -Parent $root) 'electron-cache'
    New-Item -ItemType Directory -Path $electronCache -Force | Out-Null
    $asset = "electron-v$version-win32-x64.zip"
    $archive = Join-Path $electronCache $asset
    $url = "https://github.com/electron/electron/releases/download/v$version/$asset"
    # SHA-256 shown on the official Electron v44.9.3 GitHub release asset.
    $expected = '41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c'
    $validArchive = $false
    if(Test-Path -LiteralPath $archive){
      $validArchive = ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expected)
    }
    if(-not $validArchive){
      $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
      if(-not $curl){ throw 'curl.exe is missing. Windows 10/11 normally includes it; download Electron from the official release page in a browser instead.' }
      Write-Host "Downloading $asset (~151 MB) to $archive (resume enabled)." -ForegroundColor Cyan
      for($attempt=1; $attempt -le 3; $attempt++){
        Write-Host "Download attempt $attempt/3. An interrupted run can be resumed by rerunning -Mode RepairElectron."
        & $curl.Source --location --fail --continue-at - --retry 6 --retry-all-errors --retry-delay 5 --connect-timeout 45 --output $archive $url
        $code=$LASTEXITCODE
        if($code -eq 0 -and (Test-Path -LiteralPath $archive)){
          $validArchive = ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -eq $expected)
          if($validArchive){ break }
          # Unexpected payload: do not extract it or silently replace a bad archive.
          $bad = Join-Path $electronCache 'electron-invalid-download.zip'
          Move-Item -LiteralPath $archive -Destination $bad -Force
          Write-Warning "Archive checksum mismatch. Bad download saved at $bad; restarting the download."
        } else {
          Write-Warning "Download interrupted (curl exit $code); partial data remains in $archive."
        }
      }
    }
    if(-not $validArchive){
      throw "Cannot verify Electron download. Rerun -Mode RepairElectron after stabilizing network; partial archive is kept in $electronCache."
    }
    $dist=Join-Path $electronRoot 'dist'
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    Write-Host 'Electron SHA-256 verified. Extracting runtime into node_modules\electron\dist ...' -ForegroundColor Cyan
    Expand-Archive -LiteralPath $archive -DestinationPath $dist -Force
  }
  if(-not(Test-Path -LiteralPath $electronExe)){
    throw "Electron archive was extracted but electron.exe was not found at $electronExe"
  }
  if(-not(Test-Path -LiteralPath $electronVersionFile)){
    throw 'Electron dist/version is missing; extracted runtime seems incomplete.'
  }
  [System.IO.File]::WriteAllText($electronPathFile,'electron.exe',[System.Text.UTF8Encoding]::new($false))
  Write-Host '[OK] Electron binary:' $electronExe -ForegroundColor Green
  Write-Host '[OK] Electron package marker:' $electronPathFile -ForegroundColor Green
}
if($Mode -eq 'RepairElectron') {
  Repair-ElectronBinary
  Write-Host 'Electron repair completed; Python, SQLite, and Node dependencies were not reinstalled.' -ForegroundColor Green
  exit 0
}

$venvPython=Join-Path $root '.venv\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $venvPython)) {
  $pyCmd=Get-Command py.exe -ErrorAction SilentlyContinue
  $pythonCmd=Get-Command python.exe -ErrorAction SilentlyContinue
  if($pyCmd){
    & $pyCmd.Source -3.12 -m venv (Join-Path $root '.venv')
    if($LASTEXITCODE -ne 0){
      & $pyCmd.Source -3.11 -m venv (Join-Path $root '.venv')
      if($LASTEXITCODE -ne 0){ throw 'Khong tao duoc .venv. Cai Python 3.12 hoac 3.11 roi chay lai.' }
    }
  } elseif($pythonCmd){
    & $pythonCmd.Source -m venv (Join-Path $root '.venv')
    if($LASTEXITCODE -ne 0){ throw 'Khong tao duoc .venv. Cai Python 3.12 hoac 3.11 roi chay lai.' }
  } else {throw 'Khong tim thay Python. Cai Python 3.12 (64-bit), sau do chay lai.'}
}
& $venvPython -m pip install -r (Join-Path $root 'backend\requirements.txt')
if($LASTEXITCODE -ne 0){throw 'pip install requirements.txt that bai'}
if(-not $SkipAgent){
  & $venvPython -m pip install -r (Join-Path $root 'backend\requirements-agent.txt')
  if($LASTEXITCODE -ne 0){Write-Warning 'Goi Desktop Agent tuy chon chua cai duoc; thu lai sau.'}
}
$env:PYTHONPATH=Join-Path $root 'backend'
$env:SORA_MEMORY_DB=Join-Path $root 'data\memory.sqlite3'
# PowerShell 5.1 strips literal double quotes in native `python -c` arguments.
# Send source code over stdin to preserve Python string literals exactly.
$init = @'
from sora.ai.sora_memory import Memory
from sora.ai.experience_memory import ExperienceMemory
import os
Memory()
ExperienceMemory(os.environ["SORA_MEMORY_DB"])
'@
$init | & $venvPython -
if($LASTEXITCODE -ne 0){throw 'Khoi tao SQLite that bai'}
$npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
if(-not $npm){throw 'Chua tim thay npm. Cai Node.js 22.12+ tu nodejs.org roi chay lai.'}
& $npm.Source ci --no-audit --no-fund
if($LASTEXITCODE -ne 0){throw 'npm ci that bai'}
Repair-ElectronBinary
Write-Host '[OK] Electron executable:' (Join-Path $root 'node_modules\electron\dist\electron.exe') -ForegroundColor Green
Write-Host 'DA CAI PHU THUOC. Khong can Sora.vbs.' -ForegroundColor Green
Write-Host 'Neu chua cai model, chay: ollama pull qwen2.5:1.5b' -ForegroundColor Yellow
Write-Host 'Mo Sora bang .\Sora.exe. Lan dau model va phu thuoc can Internet.' -ForegroundColor Green
