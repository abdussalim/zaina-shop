param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$ComposeFile,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
if (-not $Yes) { throw 'Restore mengganti isi database. Jalankan kembali dengan -Yes.' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupFile = (Resolve-Path $BackupFile).Path
$hashFile = "$BackupFile.sha256"
if (-not (Test-Path -LiteralPath $hashFile)) {
  throw "Checksum tidak ditemukan: $hashFile"
}
$expectedHash = ((Get-Content -LiteralPath $hashFile -Raw).Trim() -split '\s+')[0]
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash
if ($actualHash -ne $expectedHash) { throw 'Checksum backup tidak cocok; restore dibatalkan.' }
if (-not $ComposeFile) { $ComposeFile = Join-Path $repoRoot 'compose.production.yaml' }
$ComposeFile = (Resolve-Path $ComposeFile).Path

$composeArgs = @('compose', '--project-directory', $repoRoot)
$envFile = Join-Path $repoRoot '.env'
if (Test-Path -LiteralPath $envFile) { $composeArgs += @('--env-file', $envFile) }
$composeArgs += @('-f', $ComposeFile)

$runningServices = & docker @composeArgs ps --status running --services
if ($LASTEXITCODE -ne 0) { throw 'Tidak dapat membaca status Docker Compose.' }
if ($runningServices -contains 'api') {
  throw "Hentikan API terlebih dahulu: docker compose -f `"$ComposeFile`" stop api web"
}

$containerFile = "/tmp/zaina-restore-$([guid]::NewGuid().ToString('N')).dump"
try {
  & docker @composeArgs cp $BackupFile "database:$containerFile"
  if ($LASTEXITCODE -ne 0) { throw 'Gagal menyalin backup ke container database.' }

  & docker @composeArgs exec -T database sh -c 'exec pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction "$1"' sh $containerFile
  if ($LASTEXITCODE -ne 0) { throw "pg_restore gagal dengan exit code $LASTEXITCODE." }
} finally {
  & docker @composeArgs exec -T database rm -f -- $containerFile 2>$null
}

$verificationSql = "SELECT (SELECT COUNT(*) >= 2 FROM schema_migrations) AND to_regclass('users') IS NOT NULL AND to_regclass('products') IS NOT NULL AND to_regclass('stock_movements') IS NOT NULL AND to_regclass('sales') IS NOT NULL AND to_regclass('store_settings') IS NOT NULL AND to_regclass('session') IS NOT NULL AND EXISTS (SELECT 1 FROM users) AND EXISTS (SELECT 1 FROM store_settings)"
$verificationOutput = & docker @composeArgs exec -T database sh -c 'exec psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"' sh $verificationSql
$verification = [string]::Join('', $verificationOutput).Trim()
if ($LASTEXITCODE -ne 0 -or $verification -ne 't') {
  throw 'Verifikasi restore gagal: tabel inti, migrasi, pengguna, atau pengaturan tidak lengkap.'
}
Write-Host 'Restore selesai. Jalankan kembali API dan web.'
