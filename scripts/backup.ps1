param(
  [string]$ComposeFile,
  [string]$BackupDirectory,
  [ValidateRange(1, 3650)][int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $ComposeFile) { $ComposeFile = Join-Path $repoRoot 'compose.production.yaml' }
if (-not $BackupDirectory) { $BackupDirectory = Join-Path $repoRoot 'backups' }
$ComposeFile = (Resolve-Path $ComposeFile).Path
$BackupDirectory = [IO.Path]::GetFullPath($BackupDirectory)

if ($BackupDirectory -eq [IO.Path]::GetPathRoot($BackupDirectory)) {
  throw 'Direktori backup tidak boleh berupa root filesystem.'
}
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null

$composeArgs = @('compose', '--project-directory', $repoRoot)
$envFile = Join-Path $repoRoot '.env'
if (Test-Path -LiteralPath $envFile) { $composeArgs += @('--env-file', $envFile) }
$composeArgs += @('-f', $ComposeFile)

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$fileName = "zaina-$timestamp.dump"
$backupFile = Join-Path $BackupDirectory $fileName
$containerFile = "/tmp/$fileName"

try {
  & docker @composeArgs exec -T database sh -c 'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --compress=9 --file="$1"' sh $containerFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal dengan exit code $LASTEXITCODE." }

  & docker @composeArgs cp "database:$containerFile" $backupFile
  if ($LASTEXITCODE -ne 0) { throw "Penyalinan backup gagal dengan exit code $LASTEXITCODE." }
} finally {
  & docker @composeArgs exec -T database rm -f -- $containerFile 2>$null
}

if (-not (Test-Path -LiteralPath $backupFile) -or (Get-Item -LiteralPath $backupFile).Length -eq 0) {
  throw 'Backup kosong; file tidak dapat digunakan.'
}
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$backupFile.sha256", "$hash  $fileName`n")

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $BackupDirectory -File -Filter 'zaina-*.dump' |
  Where-Object LastWriteTime -LT $cutoff |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName
    $hashFile = "$($_.FullName).sha256"
    if (Test-Path -LiteralPath $hashFile) { Remove-Item -LiteralPath $hashFile }
  }

Write-Host "Backup selesai: $backupFile"
