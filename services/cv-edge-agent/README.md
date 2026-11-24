# Toko Zaina — CV Edge Agent (`services/cv-edge-agent`)

Mesin **Computer Vision (Intel OpenVINO)** yang sangat ringan untuk PC Intel di Toko Zaina.
Berbeda dengan arsitektur lama (yang memakai PostgreSQL, NATS, Node.js backend, Nginx, dan Traefik lokal), `cv-edge-agent` hanya menjalankan **1 proses/container Python**:

- Membaca RTSP CCTV lokal (`cam1` dalam toko, `cam2` area luar/pintu masuk) dengan pemutusan RTSP otomatis saat kamera dimatikan atau status toko **TUTUP**.
- Menjalankan deteksi orang **OpenVINO `person-detection-0200`** (otomatis `GPU` -> fallback `CPU`) + pelacakan `CentroidTracker` (`person_enter` / `person_exit`).
- Menyinkronkan telemetri (`cpu`, `mem`, `gpu`, `serverSpecs`) dan kontrol jarak jauh (`doorClosed`, `opMode`, `cam1Active`, `cam2Active`) ke **Cloudflare Workers API** (`/api/v1/monitor/agent/*`).
- Menyediakan server **MJPEG zero-latency** di port `8090` (`/stream/cam1`, `/stream/cam2`, `/health`) dengan CORS aktif agar bisa ditayangkan langsung di dashboard `zaina-shop` melalui **Cloudflare Tunnel (`cloudflared`) gratis**, plus fallback unggah snapshot berkala ke **Cloudflare R2**.

---

## 1. Persiapan Model OpenVINO (Wajib sebelum mode `watch`)

File biner model (`.xml` dan `.bin`) **tidak disimpan di Git** agar repository tetap ringan.
Unduh atau salin model `person-detection-0200` ke dalam folder `services/cv-edge-agent/models/`:

```text
services/cv-edge-agent/
└── models/
    └── intel/
        └── person-detection-0200/
            └── FP16/
                ├── person-detection-0200.xml
                └── person-detection-0200.bin
```

> **Urutan prioritas otomatis:** `INT8` -> `FP16` -> `FP32` (`models/person-detection-0200/person-detection-0200.xml`).
> Jika Anda menggunakan `openvino-dev` / Open Model Zoo:
> ```bash
> omz_downloader --name person-detection-0200 --precisions FP16 -o ./models
> ```
> Atau cukup salin folder `models/intel/person-detection-0200/` dari PC lama ke `services/cv-edge-agent/models/`.

---

## 2. Konfigurasi `.env`

Salin `.env.example` menjadi `.env`:

```bash
cd services/cv-edge-agent
cp .env.example .env
```

Lalu edit `.env` dan isi nilai asli (jangan pernah commit `.env` ke Git):

| Variabel | Keterangan | Contoh |
| --- | --- | --- |
| `CLOUDFLARE_API_BASE` | URL API backend Cloudflare Workers `zaina-shop` | `https://api.zaina-shop.example.com` |
| `MONITOR_AGENT_KEY` | Kunci rahasia bersama (harus sama dengan secret `MONITOR_AGENT_KEY` di Cloudflare Worker) | `rahasia-panjang-toko-zaina` |
| `CAM1_RTSP_URL` | RTSP kamera 1 (dalam toko) | `rtsp://user:password@192.168.1.3:554/ch0_0.264` |
| `CAM2_RTSP_URL` | RTSP kamera 2 (luar / pintu masuk, penghitung pengunjung) | `rtsp://user:password@192.168.1.8:554/streamtype=0` |
| `OPENVINO_DEVICE` | `GPU` untuk Intel iGPU atau `CPU` | `GPU` |
| `MJPEG_PORT` | Port server MJPEG lokal (`0` untuk menonaktifkan) | `8090` |
| `UPLOAD_FRAMES_TO_CLOUD` | `true` untuk kirim snapshot fallback ke R2 setiap ~`1.2` detik | `true` |

> **Catatan Secret Cloudflare Worker:**
> Pastikan Worker sudah memiliki secret yang sama:
> ```bash
> npx wrangler secret put MONITOR_AGENT_KEY
> ```

---

## 3. Menjalankan dengan Docker (Direkomendasikan di PC Intel)

### A. PC Intel Linux (Ubuntu / Debian)
Jika ingin akselerasi Intel iGPU + pembacaan metrik `intel_gpu_top`, buka komentar bagian `devices: ["/dev/dri:/dev/dri"]` di `docker-compose.yml`.

```bash
cd services/cv-edge-agent
docker compose up -d --build
docker compose logs -f cv-edge-agent
```

### B. PC Intel Windows (Docker Desktop)
Biarkan bagian `devices` tetap dikomentari di `docker-compose.yml` (OpenVINO otomatis memakai `CPU`), lalu jalankan:

```powershell
cd services\cv-edge-agent
docker compose up -d --build
docker compose logs -f cv-edge-agent
```

Cek kesehatan stream lokal di browser PC toko:
- `http://localhost:8090/health`
- `http://localhost:8090/stream/cam1`
- `http://localhost:8090/stream/cam2`

---

## 4. Menjalankan Tanpa Docker (Python Langsung di Windows / Linux)

Cocok jika PC Intel Windows tidak ingin menjalankan Docker Desktop:

```powershell
cd services\cv-edge-agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m agent.main
```

*(Di Linux: `source .venv/bin/activate` lalu `python -m agent.main`.)*

---

## 5. Menghubungkan Live MJPEG via Cloudflare Tunnel (`cloudflared`) Gratis

Agar staf bisa menonton live video mulus (10 FPS tanpa membebani kuota R2) dari halaman **Monitor CCTV** di web `zaina-shop`:

1. Buat **Cloudflare Tunnel** di Cloudflare Zero Trust -> *Networks* -> *Tunnels*:
   - **Public Hostname**: misalnya `cctv.domain-anda.com`
   - **Service**: `HTTP` -> `cv-edge-agent:8090` (jika `cloudflared` dijalankan di Docker Compose yang sama) atau `http://localhost:8090` (jika `cloudflared` di-install langsung di Windows/Linux).
2. Jika memakai Docker Compose, isi `CLOUDFLARE_TUNNEL_TOKEN` di `.env`, buka komentar blok `cloudflared` di `docker-compose.yml`, lalu jalankan:
   ```bash
   docker compose up -d
   ```
   Atau uji cepat tanpa akun domain (Quick Tunnel sementara):
   ```bash
   cloudflared tunnel --url http://localhost:8090
   ```
3. Buka menu **Monitor CCTV** di dashboard web `zaina-shop`, masukkan URL dasar tunnel (mis. `https://cctv.domain-anda.com`) pada pengaturan **URL Live Stream**, lalu simpan.
   Dashboard akan langsung memuat:
   - `https://cctv.domain-anda.com/stream/cam1`
   - `https://cctv.domain-anda.com/stream/cam2`
   dan otomatis jatuh ke snapshot R2 jika tunnel sedang offline.

---

## 6. Troubleshooting Cepat

- **Tampilan Kamera Berubah Jadi Silang Merah (`X`):**
  Normal jika status toko di dashboard sedang **TUTUP** atau toggle kamera **OFF** (RTSP sengaja dimatikan agar hemat listrik & CPU).
- **Error `401 Unauthorized` di log `[CLOUD][WARN]`:**
  Periksa kembali `MONITOR_AGENT_KEY` di `.env` harus persis sama dengan `MONITOR_AGENT_KEY` di Cloudflare Worker.
- **OpenVINO Warning `Failed to initialize GPU, falling back to CPU`:**
  Normal di Windows Docker atau PC tanpa driver OpenCL/Level Zero `/dev/dri`; agent tetap berjalan normal memakai CPU.
- **Kamera `Reconnecting...` terus:**
  Pastikan PC Intel berada di segmen LAN yang sama dengan IP CCTV (`192.168.1.x`) dan username/password RTSP di `.env` benar.
