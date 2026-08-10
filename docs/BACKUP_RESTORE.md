# Backup dan Restore

Database adalah sumber kebenaran stok dan transaksi. Simpan backup di media lain selain volume Docker/VPS dan uji restore secara berkala.

## Membuat backup

Linux/VPS:

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
```

PowerShell:

```powershell
.\scripts\backup.ps1
```

Hasil berupa custom dump PostgreSQL terkompresi `backups/zaina-YYYYMMDDTHHMMSSZ.dump` serta file checksum `.sha256`. Retensi default 14 hari.

Mengubah lokasi dan retensi di Linux:

```bash
BACKUP_DIR=/srv/backup-toko-zaina RETENTION_DAYS=30 ./scripts/backup.sh
```

PowerShell:

```powershell
.\scripts\backup.ps1 -BackupDirectory D:\Backup\TokoZaina -RetentionDays 30
```

Contoh cron harian pukul 02.15:

```cron
15 2 * * * cd /opt/toko-zaina && /opt/toko-zaina/scripts/backup.sh >> /var/log/toko-zaina-backup.log 2>&1
```

Salin backup terenkripsi ke penyimpanan off-site. Pantau exit code, ukuran file, dan usia backup terakhir; keberadaan file saja belum membuktikan backup dapat dipulihkan.

## Restore

Restore bersifat destruktif terhadap isi database saat ini. Ambil backup baru terlebih dahulu jika database lama masih dapat dibaca.

Linux/VPS:

```bash
docker compose --env-file .env -f compose.production.yaml stop web api
./scripts/restore.sh backups/zaina-20260810T020000Z.dump --yes
docker compose --env-file .env -f compose.production.yaml up -d api web
docker compose --env-file .env -f compose.production.yaml ps
```

PowerShell:

```powershell
docker compose --env-file .env -f compose.production.yaml stop web api
.\scripts\restore.ps1 -BackupFile .\backups\zaina-20260810T020000Z.dump -Yes
docker compose --env-file .env -f compose.production.yaml up -d api web
```

Skrip memverifikasi checksum bila file pendamping tersedia, memakai satu transaksi, berhenti pada kesalahan pertama, dan memeriksa tabel migrasi setelah restore. Skrip menolak berjalan bila service API masih aktif.

Setelah restore:

1. Pastikan semua service sehat.
2. Login dan periksa beberapa saldo serta nota lama.
3. Jalankan smoke test.
4. Catat nama backup, waktu restore, operator, dan hasil verifikasi.

## Uji pemulihan

Minimal setiap tiga bulan, pulihkan backup terbaru ke stack pengujian terpisah. Jangan menguji restore dengan menimpa produksi. Ukur waktu sampai aplikasi kembali siap agar target pemulihan toko realistis.
