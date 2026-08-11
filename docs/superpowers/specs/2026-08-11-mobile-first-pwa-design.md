# Desain Mobile-First dan PWA Toko Zaina

**Tanggal:** 11 Agustus 2026
**Status:** Desain disetujui; implementasi dimulai

## Tujuan

Menulis ulang lapisan frontend Toko Zaina agar berawal dari layar ponsel 320 px,
tetap nyaman dipakai pada Android 360--430 px sebagai perangkat utama, dan
berkembang secara progresif ke tablet serta komputer kasir. Frontend baru juga
harus dapat dipasang sebagai PWA, membuka app shell ketika offline, dan
menampilkan katalog serta snapshot stok terakhir secara baca-saja.

Penjualan, penerimaan stok, barang pecah, perubahan barang, laporan, nota,
pengaturan, dan autentikasi tetap membutuhkan koneksi. Tidak ada antrean write
offline atau sinkronisasi transaksi tertunda karena saldo stok harus selalu
ditetapkan server.

## Keputusan yang sudah dikunci

- Pendekatan: rewrite frontend penuh dengan kontrak backend yang tetap.
- Perangkat acceptance utama: Android 360--430 px dan komputer kasir.
- Lebar minimum yang wajib berfungsi: 320 px.
- Breakpoint desain: 320--480 px mobile, 481--768 px tablet,
  769--1024 px desktop, dan 1025 px ke atas layar besar.
- Target sentuh: setiap kontrol interaktif minimal 48 x 48 px.
- Cache bisnis offline hanya berisi katalog barang dan saldo stok terakhir,
  beserta updatedAt dan versi skema snapshot.
- Laporan, nota, data akun, kredensial, token, dan respons autentikasi tidak
  boleh disimpan dalam cache offline.
- Saat logout atau sesi kedaluwarsa, snapshot lokal dihapus.
- Server tetap menjadi sumber kebenaran untuk harga, diskon, saldo, dan seluruh
  transaksi.

## Kondisi dan batasan saat ini

Frontend React/Vite yang ada sudah memiliki rute operasional, komponen dasar,
perhitungan harga/diskon, serta layout responsif. Namun CSS dasarnya masih
desktop-first dengan breakpoint max-width, indikator koneksi masih statis,
dan belum ada manifest PWA, service worker, ikon instalasi, atau kebijakan
cache offline.

Build terakhir menunjukkan JavaScript awal sekitar 146 KB gzip karena beberapa
chunk dipreload. Rewrite harus mempertahankan perilaku bisnis sambil memecah
route dan grafik laporan agar JavaScript awal mengejar target di bawah 100 KB
gzip dan total halaman di bawah 500 KB.

## Ruang lingkup

### Termasuk

- Shell aplikasi, autentikasi, session re-authentication, routing, dan status
  koneksi.
- Halaman Dashboard, Barang, Detail Barang, Jual, Stok, Laporan, Pengaturan,
  Login, dan Nota.
- Komponen UI baru untuk tombol, field, modal, tabel/kartu, banner, bottom
  sheet, toast, loading, empty, error, dan offline state.
- CSS mobile-first, token ukuran, safe-area inset, focus state, reduced motion,
  dan progressive enhancement ke tablet/desktop.
- Manifest, ikon PWA, service worker, install/update prompt, serta fallback
  offline.
- Adapter IndexedDB bertipe untuk snapshot katalog dan stok.
- Lazy loading per route, budget bundle, dan pengujian browser pada matrix
  viewport.
- Paritas seluruh aturan bisnis yang sudah ada, termasuk harga modal dasar,
  harga jual per satuan, diskon minimum/maksimum, snapshot penjualan, dan
  ledger stok.

### Tidak termasuk

- Perubahan model database atau mekanisme transaksi stok.
- Penjualan offline, antrean write, sinkronisasi konflik, atau mode kasir
  tanpa koneksi.
- Penyimpanan offline laporan, nota, kredensial, atau data akun.
- Promo baru, multi-toko, atau perubahan aturan harga/diskon.
- Perubahan desain API yang tidak diperlukan oleh frontend baru. Jika kontrak
  tambahan benar-benar diperlukan, perubahan harus additive dan diuji bersama.

## Arsitektur frontend

Rewrite tetap berada di apps/web, tetapi lapisan presentasi baru dipisahkan
secara jelas:

- app/: routing, session, layout, navigasi, error boundary, dan status
  koneksi.
- pwa/: pendaftaran service worker, install/update lifecycle, adapter
  IndexedDB, snapshot policy, dan offline capability.
- features/: satu boundary per alur Dashboard, Barang, Jual, Stok, Laporan,
  Pengaturan, Login, dan Nota.
- components/ui/: komponen visual semantik yang dapat diuji terpisah.
- lib/: format Rupiah/kuantitas, validasi tampilan, utilitas media query,
  dan helper error.

API client dan tipe domain tetap menjadi boundary bersama. Komponen tidak boleh
mengubah saldo secara optimistis; setelah mutasi online, data authoritative
dari server dipakai untuk memperbarui UI dan snapshot.

Rute yang dipertahankan:

/login, /, /products, /products/:id, /sales/new, /sales/:id, /inventory,
/reports, dan /settings.

## Sistem layout mobile-first

Gaya dasar selalu ditulis untuk mobile terlebih dahulu. Media query hanya
menambahkan kemampuan pada lebar yang lebih besar; tidak ada lagi layout desktop
sebagai default yang kemudian dipaksa mengecil.

Pada mobile, shell memakai header ringkas yang sticky, bottom navigation untuk
Dashboard, Barang, Jual, Stok, dan Lainnya, serta bottom sheet untuk form dan
konfirmasi. Aksi Jual tetap menjadi aksi utama yang mudah dijangkau ibu jari.

Pada tablet, daftar dan form dapat memakai dua kolom saat lebar efektif cukup.
Pada desktop, sidebar dan panel berdampingan diaktifkan secara progresif.
Pada layar besar, konten diberi batas lebar agar garis baca dan tabel tidak
melebar berlebihan.

Semua ukuran utama menggunakan rem, persentase, min(), max(), atau clamp().
Setiap halaman harus bebas scroll horizontal pada 320 px. Area interaktif
dipisahkan minimal 8 px dan field penting memiliki tinggi minimal 48 px.

Tabel operasional berubah menjadi kartu berlabel pada mobile. Tabel desktop
dipertahankan untuk laporan dan riwayat ketika ruang mencukupi. Modal panjang
menjadi bottom sheet pada mobile dan dialog terpusat pada desktop.

## PWA dan alur data offline

PWA menggunakan manifest web yang mendeklarasikan nama Toko Zaina, ikon
regular/maskable, warna tema, display standalone, dan start_url "/". Rute "/"
tetap melewati session gate sehingga instalasi tidak melewati autentikasi.
Service worker dikelola dengan strategi precache aset build dan app shell.
Pembaruan service worker ditampilkan sebagai banner yang dapat ditunda sampai
tidak ada aksi transaksi aktif; aplikasi tidak memaksa reload di tengah alur
kasir.

Alur online:

1. App shell memuat dan memeriksa session.
2. Setelah session valid, katalog dan saldo stok dimuat dari API.
3. Respons yang berhasil dipetakan ke bentuk snapshot minimal dan disimpan ke
   IndexedDB dengan store/version key serta waktu updatedAt.
4. Mutasi tetap berjalan melalui API dengan cookie/session yang sedang berlaku.
5. Hasil server setelah mutasi memperbarui query UI dan snapshot lokal.

Alur offline:

1. Service worker melayani aset shell yang sudah diprecache.
2. Aplikasi menggabungkan navigator.onLine, event koneksi, dan probe ringan
   ketika koneksi kembali untuk menentukan status yang terlihat pengguna.
3. Hanya halaman katalog dan stok yang membaca snapshot lokal. UI selalu
   menampilkan waktu snapshot dan label bahwa datanya mungkin usang.
4. Tombol dan form yang dapat menulis ke server dinonaktifkan, dengan pesan
   yang menjelaskan bahwa koneksi diperlukan.
5. Dashboard finansial, laporan, nota, pengaturan, dan autentikasi menampilkan
   offline state tanpa mencoba memakai cache bisnis yang tidak diizinkan.

Alur reconnect mengambil data terbaru dari server dan mengganti snapshot secara
atomik. Tidak ada replay request lama. Bila IndexedDB tidak tersedia atau
snapshot rusak, aplikasi tetap menampilkan offline state yang jujur tanpa
membuat data contoh.

## Kebijakan keamanan cache

- Tidak menyimpan password, token, cookie, respons login/session, data laporan,
  data nota, atau data akun di Cache Storage maupun IndexedDB. Bundle JavaScript
  statis untuk rute laporan/nota boleh diprecache karena bukan data bisnis.
- Snapshot dikurangi ke field yang diperlukan untuk katalog dan stok; data
  internal yang tidak diperlukan UI tidak ikut disalin.
- Snapshot diberi namespace store dan versi skema agar tidak tertukar jika
  perangkat dipakai untuk akun/toko berbeda.
- Logout, session expiry, perubahan akun, dan kegagalan migrasi snapshot
  menghapus data bisnis lokal.
- API write selalu network-only. Service worker tidak boleh mengintersep
  atau menunda request mutasi.
- Status offline dan waktu data terakhir harus terlihat; data usang tidak boleh
  disajikan seolah-olah saldo saat ini.

## Error handling dan state UI

Setiap fitur memiliki state loading, success, empty, error, dan offline yang
eksplisit. Error API memakai pesan yang dapat ditindaklanjuti dan request ID
ketika tersedia. Error session 401 membuka re-authentication tanpa membuang
isi form atau keranjang penjualan.

Saat koneksi putus ketika form sedang diisi, nilai form tetap dipertahankan.
Jika submit online gagal, server tidak boleh meninggalkan perubahan parsial dan
UI menampilkan error yang dapat dipetakan ke field atau baris terkait. Pada
katalog dan stok offline, kontrol tulis disabled sebelum submit sehingga tidak
ada kesan transaksi diterima.

## Performa dan aksesibilitas

- JavaScript awal dipecah agar shell/login tidak memuat grafik laporan atau
  halaman yang belum dibuka.
- CSS dan aset menggunakan relative units serta font-display swap; gambar
  katalog memakai ukuran responsif dan lazy loading.
- Budget CI: JavaScript awal <100 KB gzip, total halaman <500 KB, dan FCP
  mobile 3G <3 detik.
- Semua tombol, link penting, input, select, dan kontrol kuantitas minimal
  48 x 48 px.
- HTML semantik, label form terhubung, error aria-describedby, focus-visible,
  kontras yang cukup, keyboard path, dan prefers-reduced-motion wajib.
- PWA tetap dapat digunakan dengan pembesaran teks tanpa merusak layout.

## Strategi pengujian dan kriteria selesai

### Unit dan komponen

- Snapshot adapter: serialisasi, versi, timestamp, overwrite atomik, dan clear
  saat logout/session expiry.
- Connectivity state: online/offline/reconnect, probe gagal, dan stale label.
- Cache policy: hanya katalog/stok yang boleh masuk; auth, laporan, nota, dan
  write request ditolak.
- Komponen diuji untuk loading, empty, error, offline, field error, dan target
  aksesibilitas.
- Perhitungan harga, modal, faktor satuan, dan diskon yang sudah ada tidak
  berubah.

### Browser dan PWA

- Acceptance utama pada Android viewport 360--430 px dan komputer kasir.
- Matrix tambahan: 320, 360, 430, 768, 1024, dan 1366 px.
- Uji installability manifest dan service worker.
- Uji online -> offline -> reconnect dengan DevTools/browser automation.
- Uji bahwa katalog/stok dapat dibaca offline, sementara semua write dan
  laporan ditolak dengan pesan yang benar.
- Uji logout/session expiry menghapus snapshot.
- Uji tidak ada scroll horizontal, target sentuh, keyboard/focus, screen reader
  labels, kontras, dan reduced motion.

### Quality gates

npm ci, seluruh unit/integration/browser test, typecheck, lint, production
build, bundle budget, dan smoke test read-only harus lulus. Acceptance flow
write lengkap tetap dijalankan pada staging atau database sekali pakai, bukan
pada produksi.

### Rollout

Frontend rewrite dikerjakan pada branch terisolasi. Frontend lama tetap menjadi
referensi selama parity test berlangsung dan tidak dihapus sampai seluruh route,
aturan diskon, transaksi, laporan, dan PWA acceptance gate lulus. Penggantian
entrypoint frontend menjadi satu commit terpisah agar rollback mudah dilakukan.

Deployment produksi tidak termasuk dalam pekerjaan ini dan tetap menunggu
persetujuan pemilik.

## Risiko dan mitigasi

- Bundle awal masih terlalu besar: route-level lazy loading, defer grafik,
  font subset/swap, dan budget CI mencegah regresi.
- Data stok offline menyesatkan: timestamp wajib terlihat dan seluruh write
  disabled; tidak ada optimistic update atau queue.
- Cache bocor antar akun: namespace store/session, clear saat logout/expiry,
  dan larangan menyimpan auth response.
- Rewrite menghilangkan perilaku bisnis: kontrak API dipertahankan,
  acceptance parity per route, serta perhitungan harga/diskon diuji sebelum
  entrypoint diganti.
- Update PWA mengganggu kasir: update ditunda sampai idle dan pengguna
  memilih reload.
