# SORA Maintenance - PowerShell 5.1 compatible. Exact allowlist only.
[CmdletBinding()]
param(
    [ValidateSet('Preview','Archive','Purge')][string]$Mode = 'Preview',
    [ValidateSet('Installers','VoiceTests')][string[]]$Groups = @('Installers'),
    [string]$DriveRoot = 'H:\',
    [string]$Batch = '',
    [switch]$ConfirmArchive,
    [switch]$ConfirmDelete
)
$ErrorActionPreference = 'Stop'
$DriveRoot = [System.IO.Path]::GetFullPath($DriveRoot)
if (-not (Test-Path -LiteralPath $DriveRoot -PathType Container)) { throw "Không thấy ổ đĩa: $DriveRoot" }
$archiveRoot = Join-Path $DriveRoot 'SORA_Archive'
$auditRoot = Join-Path $DriveRoot 'SORA_Audit'

# NOTE: All candidates are exact top-level paths; no wildcard deletion.
# DO NOT list SORA, SORA_AI_Data, SORA_Audit, .venv, node_modules, Python312, Nodejs, or model/memory data.
$installers = @(
    'SORA_Glitch_Precision.zip', 'SORA_Glitch_Precision',
    'SORA_Glitch_Fast_32ms.zip', 'SORA_Glitch_Fast_32ms',
    'SORA_Glitch_ChayLienTuc_Fix.zip', 'SORA_Glitch_ChayLienTuc_Fix',
    'SORA_Glitch_Offline_Fix.zip', 'SORA_Glitch_Offline_Fix',
    'SORA_Network_Guard.zip', 'SORA_Network_Guard',
    'SORA_Network_Guard_Fix_Memory_Check.zip',
    'SORA_Network_Accuracy_V2.zip', 'SORA_Network_Accuracy_V2',
    'SORA_Network_OfflineFix.zip', 'SORA_Network_OfflineFix',
    'SORA_Persona_Engram.zip', 'SORA_Persona_Engram',
    'SORA_Screen_Context_Patch.zip', 'SORA_Screen_Context_Patch'
)
$voiceTests = @(
    'SORA_F5_Env', 'SORA_Voice_Env', 'SORA_Voice_Research',
    'SORA_F5_Vietnamese_Trial.zip', 'SORA_ElevenLabs_v3_Trial.zip',
    'SORA_Voice_Research_Starter.zip', 'SORA_Voice_Trial_V2.zip',
    'SORA_Voice_Reference_Test.zip', 'SORA_Voice_Emotion_V3.zip',
    'SORA_Voice_Pack_72_Cau.zip'
)

function Test-AllowedPath([string]$Path) {
    $abs = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($DriveRoot)
    if (-not $root.EndsWith('\')) { $root += '\' }
    if (-not $abs.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    $rel = $abs.Substring($root.Length)
    # Candidate must be directly below root and exact-name allowlisted.
    if ($rel.Contains('\') -or $rel.Contains('/') -or $rel -eq '') { return $false }
    return ($installers -ccontains $rel) -or ($voiceTests -ccontains $rel)
}
function Get-Size([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Get-Item -LiteralPath $Path).Length }
    $sum = [long]0
    Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { $sum += $_.Length }
    return $sum
}
if ($Mode -eq 'Purge') {
    if (-not $ConfirmDelete) { throw 'Purge yêu cầu -ConfirmDelete.' }
    if ($Batch -notmatch '^\d{8}_\d{6}_[0-9a-f]{6}$') { throw 'Tên batch không hợp lệ.' }
    $target = Join-Path $archiveRoot $Batch
    $rootFull = [System.IO.Path]::GetFullPath($archiveRoot)
    $targetFull = [System.IO.Path]::GetFullPath($target)
    if (-not $targetFull.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Sai đường dẫn.' }
    if (-not (Test-Path -LiteralPath $targetFull -PathType Container)) { throw 'Không thấy batch đã lưu.' }
    $folder = Get-Item -LiteralPath $targetFull -Force
    if ($folder.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Từ chối xóa thư mục symlink/reparse.' }
    $answer = Read-Host "Xóa vĩnh viễn batch '$Batch'? Gõ đúng: XOA $Batch"
    if ($answer -cne "XOA $Batch") { Write-Host 'Hủy xóa.'; exit 0 }
    Remove-Item -LiteralPath $targetFull -Recurse -Force
    Write-Host "Đã xóa batch trong SORA_Archive: $Batch"
    exit 0
}
$names = @()
if ('Installers' -in $Groups) { $names += $installers }
if ('VoiceTests' -in $Groups) { $names += $voiceTests }
$items = @()
foreach ($name in $names | Select-Object -Unique) {
    $source = Join-Path $DriveRoot $name
    if (-not (Test-Path -LiteralPath $source)) { continue }
    if (-not (Test-AllowedPath $source)) { throw "Không nằm trong danh sách cho phép: $source" }
    $item = Get-Item -LiteralPath $source -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Warning "Bỏ qua symlink/reparse: $source"
        continue
    }
    $bytes = Get-Size $source
    $group = if ($voiceTests -ccontains $name) { 'VoiceTests' } else { 'Installers' }
    $items += [pscustomobject]@{Group=$group;Name=$name;Path=$source;SizeMB=[math]::Round($bytes/1MB,2)}
}
if ($items.Count -eq 0) { Write-Host 'Không thấy tệp/thư mục thử nghiệm phù hợp trong danh sách an toàn.'; exit 0 }
$items | Format-Table -AutoSize
Write-Host ('Tổng dung lượng ứng viên: {0:N2} MB' -f (($items | Measure-Object -Property SizeMB -Sum).Sum))
if ($Mode -eq 'Preview') {
    New-Item -ItemType Directory -Path $auditRoot -Force | Out-Null
    $csv = Join-Path $auditRoot 'cleanup_candidates.csv'
    $items | Export-Csv -LiteralPath $csv -Encoding UTF8 -NoTypeInformation
    Write-Host "Đã lưu danh sách kiểm tra: $csv"
    Write-Host 'CHƯA xóa hay di chuyển bất cứ thứ gì.'
    Write-Host 'Các thư mục khác trên ổ H không nằm trong danh sách này và KHÔNG bị động đến.'
    exit 0
}
if (-not $ConfirmArchive) { throw 'Archive yêu cầu -ConfirmArchive; kiểm tra kết quả -Mode Preview trước.' }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$rand = [guid]::NewGuid().ToString('N').Substring(0,6)
$batchName = "${stamp}_$rand"
$dest = Join-Path $archiveRoot $batchName
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$moved = @()
foreach ($row in $items) {
    try {
        Move-Item -LiteralPath $row.Path -Destination (Join-Path $dest $row.Name) -ErrorAction Stop
        $moved += $row
        Write-Host "Đã chuyển vào kho lưu: $($row.Name)"
    } catch {
        Write-Warning "Không di chuyển được $($row.Name): $($_.Exception.Message)"
    }
}
$moved | Export-Csv -LiteralPath (Join-Path $dest 'manifest.csv') -NoTypeInformation -Encoding UTF8
Write-Host "Batch: $batchName"
Write-Host "Lưu tạm: $dest"
Write-Host 'Di chuyển trên cùng ổ KHÔNG giải phóng dung lượng. Chỉ xóa vĩnh viễn batch đã kiểm tra bằng -Mode Purge -Batch ... -ConfirmDelete.'
