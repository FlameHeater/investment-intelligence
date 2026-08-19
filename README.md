# Investment Intelligence

Asisten investasi personal untuk **saham AS, saham Indonesia (IDX), kripto, dan emas** — dengan reasoning yang bisa dijelaskan, bukan black box.

Dibangun dari [PRD Investment Intelligence Assistant v2](../PRD_Investment_Intelligence_v2.md): single-user, data publik/gratis, arsitektur cache-first, scoring deterministik + satu panggilan LLM yang di-*grounding* ketat.

> **Bukan broker, bukan penasihat keuangan.** Semua skor adalah penilaian analitis atas data historis dan publik, bukan rekomendasi transaksi. Lihat [Disclaimer](#disclaimer).

---

## Daftar Isi

- [Yang membuat proyek ini berbeda](#yang-membuat-proyek-ini-berbeda)
- [Fitur](#fitur)
- [Menjalankan (5 menit)](#menjalankan-5-menit)
- [Variabel environment](#variabel-environment)
- [Perintah](#perintah)
- [Memperbarui data](#memperbarui-data)
- [Arsitektur](#arsitektur)
- [Cakupan data & batasannya](#cakupan-data--batasannya)
- [Investment Mode](#investment-mode)
- [Bagaimana skor dihitung](#bagaimana-skor-dihitung)
- [Di mana AI dipakai](#di-mana-ai-dipakai)
- [Deployment](#deployment)
- [Peta jalan](#peta-jalan)
- [Disclaimer](#disclaimer)

---

## Yang membuat proyek ini berbeda

Kebanyakan dashboard investasi menyembunyikan ketidaktahuannya. Kalau sebuah angka tidak ada, ia diisi nol, diestimasi, atau kolomnya dihilangkan diam-diam. Aplikasi ini mengambil pendekatan sebaliknya:

| Prinsip | Wujud konkretnya di kode |
|---|---|
| **Jangan mengarang data** | Data yang tidak ada disimpan sebagai `null` dan ditampilkan sebagai "tidak tersedia", termasuk penjelasan kenapa. Saham IDX tidak punya kolom fundamental karena memang tidak ada sumber gratisnya. |
| **Ketidaklengkapan itu informasi** | Setiap skor punya angka `confidence` yang turun otomatis saat data bolong. Di bawah ambang mode, UI menampilkan peringatan alih-alih menyembunyikannya. |
| **Jangan mengklaim real-time** | Setiap harga membawa label kesegaran (`delayed_15m`, `eod`, dst) dan timestamp. Data lebih tua dari 48 jam ditandai basi di seluruh UI. |
| **Tidak ada skor tanpa breakdown** | Setiap dimensi bisa diklik untuk melihat angka mentah yang dipakai, bobot efektifnya, dan catatan keterbatasannya. |
| **AI menjelaskan, tidak mencari** | Claude hanya menerima data yang sudah tersimpan di database. Tidak ada tool, tidak ada akses web, dan model diinstruksikan menyatakan secara eksplisit ketika data tidak lengkap. |
| **Bobot dinormalisasi, bukan dinolkan** | Dimensi tanpa data dikeluarkan dari perhitungan dan bobotnya dibagi ulang — bukan diperlakukan sebagai skor 0 yang membuat aset terlihat buruk padahal datanya saja yang belum ada. |

---

## Fitur

- **Unified Dashboard** — ringkasan empat pasar, top movers, perubahan watchlist, dan status pipeline data.
- **Advanced Screener** — filter atas metrik yang benar-benar punya data, dengan laporan berapa aset tersaring karena data kosong.
- **AI Screener** — bahasa natural → filter terstruktur → dijalankan mesin screener yang **sama**, lalu diringkas. Filter hasil terjemahan disalin ke panel manual supaya bisa Anda periksa dan koreksi.
- **Halaman Aset** — chart harga, fundamental, indikator teknikal, berita berlabel sumber, Investment Score dengan breakdown yang bisa dibuka, dan AI Reasoning (faktor pendukung, faktor bertentangan, celah data, skenario bull/base/bear).
- **Smart Watchlist** — mendeteksi *perubahan* (pergeseran skor ≥5 poin, harga ≥5% sehari, berita resmi baru), bukan sekadar notifikasi harga; Claude menjelaskan penyebabnya dari data sebelum-sesudah.
- **Alert harga** dengan riwayat kejadian.
- **Contextual Education** — tooltip istilah di seluruh aplikasi (definisi lokal instan, penjelasan mendalam on-demand) + Learning Center berbasis markdown + glosarium metrik.
- **Source Verification badge** — setiap berita dilabeli `Resmi` / `Media` / `Belum terverifikasi` lewat aturan statis yang bisa diaudit di [`src/lib/providers/finnhub.ts`](src/lib/providers/finnhub.ts).

---

## Menjalankan (5 menit)

**Prasyarat:** Node.js 20+.

```bash
git clone <url-repo-anda> investment-intelligence
cd investment-intelligence
npm install
cp .env.example .env
```

Buka `.env` dan isi **dua** nilai wajib:

```dotenv
APP_PASSWORD="password-pilihan-anda"
SESSION_SECRET="string-acak-minimal-32-karakter"
```

Lalu siapkan database dan tarik data pertama:

```bash
npm run setup
```

Perintah ini menjalankan migrasi, mengisi universe (~270 aset), mengambil harga, dan menghitung skor. **Butuh 15–25 menit** — bukan karena lambat, tapi karena limiter sengaja memberi jeda antar-permintaan agar tidak diblokir provider gratis.

```bash
npm run dev
```

Buka http://localhost:3000 dan masuk dengan `APP_PASSWORD` Anda.

> **Tanpa satu pun API key**, aplikasi sudah berjalan penuh untuk harga, indikator teknikal, risiko, screening, watchlist, dan Learning Center. Yang butuh key hanyalah fundamental saham AS (Finnhub), berita (Finnhub/Marketaux), dan lapisan AI (Anthropic).

---

## Variabel environment

| Variabel | Wajib | Fungsi |
|---|---|---|
| `APP_PASSWORD` | **Ya** | Password gerbang single-user |
| `SESSION_SECRET` | **Ya** | Kunci penanda tangan cookie sesi (min. 16 karakter, disarankan 32+) |
| `DATABASE_URL` | Ya (ada default) | `file:./dev.db` untuk SQLite |
| `ANTHROPIC_API_KEY` | Tidak | Mengaktifkan AI Reasoning, AI Screener, dan penjelasan istilah |
| `ANTHROPIC_MODEL` | Tidak | Default `claude-sonnet-5` |
| `FINNHUB_API_KEY` | Tidak | Fundamental & berita saham AS (gratis, 60 calls/menit) |
| `COINGECKO_API_KEY` | Tidak | Menaikkan limit CoinGecko dari ~10 ke 30 calls/menit |
| `ALPHAVANTAGE_API_KEY` | Tidak | Cadangan fundamental saham AS |
| `CRON_SECRET` | Tidak | Mengaktifkan endpoint `/api/cron/[job]` untuk Vercel Cron |

Setiap fitur yang keynya kosong akan **mati dengan pesan yang jelas**, bukan menampilkan hasil kosong tanpa keterangan.

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm start` | Build & jalankan produksi |
| `npm run setup` | Migrasi + seed + tarik harga + hitung skor (sekali saat awal) |
| `npm run seed:universe` | Isi ulang daftar aset (kripto ditarik dari CoinGecko top-100) |
| `npm run job:market` | Perbarui harga. Flag: `--only=us,idx,crypto,gold`, `--full` (riwayat 2 tahun) |
| `npm run job:fundamentals` | Perbarui fundamental saham AS (butuh Finnhub) |
| `npm run job:news` | Perbarui berita |
| `npm run job:score` | Hitung ulang skor. Flag: `--all-modes` |
| `npm run job:watchlist` | Deteksi perubahan pada watchlist + penjelasan AI |
| `npm run job:all` | Empat job data secara berurutan |
| `npm run cron` | Scheduler jangka panjang (jalankan di terminal terpisah) |
| `npm run db:studio` | Prisma Studio untuk memeriksa isi database |
| `npm run typecheck` | Periksa tipe TypeScript |

---

## Memperbarui data

Ada tombol **Perbarui data** di kanan atas dashboard. Ia menjalankan pipeline lengkap — harga → fundamental → berita → hitung ulang skor — dengan progres per fase.

Tombol ini bekerja **di mana saja**, termasuk di Vercel, tanpa token atau layanan tambahan.

### Kenapa dipecah menjadi potongan

Menarik ~270 aset butuh 15-25 menit karena limiter provider gratis. Satu request ke fungsi serverless tidak boleh berjalan selama itu, dan pekerjaan latar apa pun ikut mati begitu response dikirim — jadi menjalankannya sebagai satu proses panjang bukan sekadar lambat di Vercel, melainkan tidak akan pernah selesai.

Karena itu tiap request mengerjakan sebanyak mungkin dalam anggaran 20 detik, menyimpan posisinya, lalu berhenti. Browser memanggil lagi untuk melanjutkan sampai tuntas.

Posisinya disimpan di **database**, bukan di memori proses, karena tiap request di Vercel bisa mendarat di instance yang berbeda. Efek sampingnya berguna: kalau halaman tertutup di tengah jalan, tombol **Lanjutkan** meneruskan dari titik terakhir alih-alih mengulang dari nol. Refresh yang ditinggalkan lebih dari 5 menit dianggap terbengkalai sehingga tidak memblokir tombol selamanya.

Konsekuensi yang perlu Anda tahu: halaman harus tetap terbuka selama proses berjalan, karena loop-nya ada di browser. Untuk refresh terjadwal tanpa penunggu, gunakan workflow GitHub Actions yang sudah disertakan (`.github/workflows/refresh-data.yml`) atau `npm run cron` di server yang menyala terus.

---

---

## Arsitektur

### Cache-first, selalu

```
Provider eksternal ──(job terjadwal)──► SQLite ──► Halaman & API internal
                                          │
                                          └──► Scoring pipeline ──► Claude (penjelasan)
```

Halaman **tidak pernah** memanggil provider secara langsung. Free tier hanya memberi 5–60 calls/menit; kalau setiap kunjungan halaman memicu fetch, aplikasi akan diblokir dalam hitungan menit. Semua pembacaan lewat [`src/lib/assetService.ts`](src/lib/assetService.ts), yang hanya menyentuh database.

### Struktur direktori

```
src/
├── app/
│   ├── (app)/            # halaman terautentikasi (dashboard, screener, asset, watchlist, alerts, learn)
│   ├── login/
│   └── api/              # route handler internal
├── components/           # komponen UI bersama
├── lib/
│   ├── providers/        # satu berkas per sumber data + rate limiter bersama
│   ├── scoring/          # lima scorer murni + orchestrator
│   ├── ai/               # client Claude, reasoning, screener parser, education
│   ├── screener.ts       # mesin screener (dipakai UI manual DAN AI)
│   ├── indicators.ts     # RSI, SMA, MACD, volatilitas, drawdown
│   ├── metrics.ts        # katalog metrik + glosarium
│   ├── jobRunners.ts     # logika job yang dipakai bersama CLI dan endpoint cron
│   └── universe.ts       # daftar aset statis
├── jobs/                 # entry point CLI untuk job terjadwal
└── content/learning/     # artikel Learning Center (markdown)
```

### Dari "Multi-Agent AI Engine" ke scoring pipeline

PRD v1 mendeskripsikan delapan AI agent yang saling bertukar hasil lewat orchestrator. Terdengar canggih, tapi tidak menjelaskan mekanisme teknisnya — dan sistem multi-agent yang saling bernegosiasi sulit dibuat reliable bahkan di skala perusahaan.

Versi yang benar-benar bisa dibangun:

1. **Lima fungsi scoring murni** (deterministik, tanpa LLM) menghasilkan skor 0–100 per dimensi.
2. **Orchestrator** — fungsi TypeScript biasa — menggabungkannya dengan bobot Investment Mode dan menghitung confidence dari kelengkapan data.
3. **Satu panggilan Claude** menerjemahkan angka-angka itu menjadi penjelasan berbahasa manusia, dengan larangan tegas menambahkan fakta di luar input.

Hasilnya tetap memenuhi prinsip Explainable AI dari PRD asli — bahkan lebih baik, karena setiap angka bisa ditelusuri ke fungsi yang menghitungnya.

---

## Cakupan data & batasannya

| Kelas aset | Jumlah | Sumber harga | Fundamental | Berita |
|---|---|---|---|---|
| Saham AS | ~107 large/mid cap | Yahoo Finance chart | Finnhub (opsional) | Finnhub (opsional) |
| Saham IDX | ~59 LQ45/blue chip | Yahoo Finance (`.JK`) | **Tidak tersedia** | Google News RSS (tanpa API key) |
| Kripto | 100 teratas by market cap | CoinGecko | Tidak berlaku | Belum ada sumber |
| Emas | GLD + GC=F | Yahoo Finance | Tidak berlaku | — |

**Soal saham IDX:** per Agustus 2026 tidak ada API resmi IDX yang gratis dan stabil untuk data fundamental. Yang tersedia gratis hanyalah harga lewat endpoint publik Yahoo Finance (tanpa SLA). Aplikasi ini menampilkan "tidak tersedia" untuk fundamental IDX alih-alih mengarang angka, dan confidence skornya turun sesuai. Berlangganan penyedia berbayar (mis. Sectors.app) adalah keputusan Phase 2, setelah terbukti fitur ini memang dipakai.

**Soal emas:** komoditas tidak punya laporan keuangan, jadi dimensi fundamental dan valuasi dilewati. Itu bukan bug.

Semua baris harga menyimpan `source`, `fetched_at`, dan `freshness`, dan ketiganya ditampilkan di UI.

---

## Investment Mode

Delapan mode di PRD v1 diringkas menjadi empat. Mode mengubah bobot lima sub-skor — aset yang sama bisa punya skor berbeda di mode berbeda, dan itu memang seharusnya.

| Mode | Fundamental | Teknikal | Valuasi | Sentimen | Risiko |
|---|---|---|---|---|---|
| Beginner | 30% | 10% | 20% | 10% | 30% |
| Investor | 40% | 10% | 30% | 5% | 15% |
| Trader | 10% | 45% | 5% | 25% | 15% |
| Crypto | — | 45% | — | 25% | 30% |

Ganti mode lewat menu di kanan atas. Skor tersimpan terpisah per mode.

---

## Bagaimana skor dihitung

Lima dimensi, masing-masing 0–100, **semuanya searah** (makin tinggi makin baik — termasuk risiko, di mana skor tinggi berarti risiko rendah):

| Dimensi | Basis perhitungan |
|---|---|
| Fundamental | ROE, margin bersih & kotor, pertumbuhan pendapatan & EPS, debt-to-equity, current ratio |
| Teknikal | tren (harga vs SMA 50/200), RSI (dinilai dengan kurva lonceng, bukan linear), MACD, momentum 30 & 90 hari |
| Valuasi | PER, PBV, dividend yield |
| Sentimen | proporsi berita positif/negatif 14 hari, dibobot menurut jenis sumber |
| Risiko | volatilitas tahunan (ambang berbeda per kelas aset), max drawdown, likuiditas, kesegaran data |

Confidence = (porsi bobot mode yang punya data) × (0,5 + 0,5 × kelengkapan data di dalam dimensi yang terpakai). Di bawah ambang mode, UI menampilkan peringatan.

Detail implementasi: [`src/lib/scoring/`](src/lib/scoring/).

---

## Di mana AI dipakai

| Tempat | Kebebasan model | Aturan |
|---|---|---|
| **AI Reasoning** (halaman aset) | Paling sempit | Hanya boleh memakai angka & berita dari paket data yang dikirim. Dilarang merekomendasikan aksi atau menyebut target harga. |
| **AI Screener** | Sedang, bisa diaudit | Tidak menyentuh database — hanya menerjemahkan kalimat menjadi filter. Filter hasilnya ditampilkan agar bisa dikoreksi. |
| **Education / penjelasan istilah** | Paling luas | Boleh memakai pengetahuan keuangan umum, tapi dilarang menyebut angka spesifik sebuah aset tanpa konteks. |

Semua system prompt memakai blok aturan bersama `GROUNDING_RULES` di [`src/lib/ai/client.ts`](src/lib/ai/client.ts) — terbuka untuk dibaca dan diubah.

Tanpa `ANTHROPIC_API_KEY`, ketiga fitur ini mati dengan pesan jelas dan sisanya berjalan penuh.

---

## Deployment

### Lokal / VPS / Raspberry Pi (disarankan)

Cara paling sederhana. Jalankan aplikasi dan scheduler di dua proses:

```bash
npm run build && npm start   # terminal 1
npm run cron                 # terminal 2
```

Scheduler menyesuaikan jam bursa IDX dan AS dalam zona waktu Asia/Jakarta.

### Vercel

**SQLite tidak bisa dipakai di Vercel.** Filesystem fungsi serverless bersifat read-only dan hilang setiap invokasi, jadi database harus berupa layanan terpisah. Proyek ini sudah menyiapkan jalurnya: `scripts/prepare-schema.mjs` berjalan sebelum `prisma generate` dan menukar `provider` di skema secara otomatis mengikuti bentuk `DATABASE_URL` Anda. Tidak ada berkas yang perlu diedit manual.

Langkahnya:

1. **Siapkan Postgres.** Tier gratis Neon atau Supabase sudah lebih dari cukup untuk single-user. Salin connection string-nya (diawali `postgresql://`).

2. **Login dan tautkan proyek:**

```bash
npx vercel login
```

```bash
npx vercel link
```

3. **Isi environment variable** di Vercel (Settings → Environment Variables), minimal:

   - `DATABASE_URL` — connection string Postgres tadi
   - `APP_PASSWORD`
   - `SESSION_SECRET`
   - `CRON_SECRET` — string acak, untuk melindungi endpoint cron
   - opsional: `ANTHROPIC_API_KEY`, `FINNHUB_API_KEY`, `COINGECKO_API_KEY`

4. **Deploy:**

```bash
npx vercel --prod
```

Skema database dibuat otomatis saat build (`prisma db push` ada di dalam `npm run build`).

5. **Isi datanya.** Setelah database kosong terbentuk, jalankan job dari mesin lokal Anda dengan `DATABASE_URL` yang menunjuk ke Postgres yang sama:

```bash
DATABASE_URL="postgresql://..." npm run seed:universe
```

```bash
DATABASE_URL="postgresql://..." npm run job:all
```

### Deploy lewat `git push`

Repo ini tersambung ke integrasi Git Vercel dengan `main` sebagai branch produksi, jadi setiap push otomatis memicu deployment produksi. Itu jalur yang seharusnya dipakai — bukan karena `vercel --prod` menghasilkan kode berbeda (tidak; CLI juga melampirkan SHA commit lokal), melainkan karena deploy lewat CLI membuat deployment KEDUA untuk commit yang sama.

Akibatnya proyek punya beberapa deployment berisi kode identik, dan ketiga alias Vercel bisa menunjuk deployment yang berbeda-beda meski isinya sama:

| Alias | Diperbarui oleh |
|---|---|
| `<proyek>.vercel.app` | deployment produksi terbaru |
| `<proyek>-<team>.vercel.app` | deployment produksi terbaru |
| `<proyek>-git-main-<team>.vercel.app` | deployment yang dipicu git |

Ini menyesatkan saat menelusuri masalah: nama deployment yang berbeda memberi kesan salah satunya basi, padahal keduanya membangun commit yang sama. Cara memeriksa yang benar adalah membandingkan SHA commit-nya, bukan nama deployment-nya:

```bash
npx vercel inspect <alias>
```

Satu peringatan: **jangan menetapkan alias `git-main` secara manual** dengan `vercel alias set`. Sekali ditetapkan manual, alias itu lepas dari pengelolaan otomatis dan berhenti mengikuti push berikutnya — persis kebalikan dari yang biasanya diinginkan.

---

### Kenapa job data tidak dijalankan di Vercel

Menarik ~270 aset dengan jeda rate limit butuh 15–25 menit, jauh melewati batas eksekusi fungsi Vercel (10–60 detik tergantung paket). Memaksakannya akan menghasilkan data yang selalu setengah terisi.

Pola yang berhasil: **aplikasi di Vercel, job data di tempat lain.** Pilihannya, dari yang paling sederhana:

- **Komputer Anda sendiri** — jalankan `npm run cron` dengan `DATABASE_URL` yang menunjuk ke Postgres produksi. Cocok kalau komputer memang menyala saat jam bursa.
- **GitHub Actions terjadwal** — gratis, tidak butuh server, dan `DATABASE_URL` disimpan sebagai repository secret.
- **VPS kecil atau Raspberry Pi** — paling andal kalau ingin benar-benar berjalan terus.

Vercel Cron di `vercel.json` tetap berguna untuk dua job ringan yang murni CPU dan tidak memanggil provider eksternal: `/api/cron/rescore` (hitung ulang skor) dan `/api/cron/watchlist` (deteksi perubahan). Keduanya dilindungi `CRON_SECRET`.

Jadwalnya dipasang **sekali sehari** karena paket Hobby Vercel menolak deployment yang punya cron lebih sering dari itu. Ini bukan masalah dalam praktiknya: workflow GitHub Actions sudah menjalankan scoring dan deteksi watchlist setiap selesai menarik data, sehingga cron Vercel berperan sebagai jaring pengaman, bukan jalur utama.

---

## Peta jalan

Ditunda dari MVP secara sadar, dengan alasannya (PRD §13):

- **Fundamental IDX lengkap** — butuh penyedia berbayar; evaluasi setelah MVP terbukti dipakai
- **Data makro (FRED API)** — gratis dan resmi; kandidat Phase 2 dengan rasio effort/value terbaik
- **Perbandingan valuasi dengan peer sektor** — butuh agregasi lintas provider
- **Insider & institutional activity** — tidak ada sumber gratis yang memadai
- **Sentimen media sosial** — API resmi berbayar; scraping berisiko melanggar ToS
- **Reksa dana, ETF selain GLD** — butuh sumber terverifikasi
- **Multi-user, RBAC, audit log** — tidak relevan untuk single-user
- **Integrasi broker, portfolio tracking otomatis** — proyek tersendiri, butuh OAuth per broker
- **Prediksi harga** — bertentangan dengan prinsip explainable & evidence-based

---

## Disclaimer

> Informasi di platform ini bersifat analitis dan edukatif, bukan rekomendasi atau jaminan keuntungan. Data dapat mengalami keterlambatan (delayed) sesuai sumbernya dan ditampilkan dengan timestamp. Keputusan investasi sepenuhnya menjadi tanggung jawab pengguna. Untuk keputusan material, verifikasi data pada sumber resmi (IDX, SEC, laporan perusahaan).

Aplikasi ini memakai endpoint publik Yahoo Finance yang tidak resmi dan tanpa SLA. Itu dapat diterima untuk penggunaan pribadi berskala kecil. Kalau proyek ini dikembangkan menjadi lebih dari alat pribadi — dibagikan ke orang lain, dimonetisasi, atau diperbesar skala permintaannya — tinjauan hukum dan sumber data berlisensi menjadi keharusan sebelum itu terjadi.

## Lisensi

MIT — lihat [LICENSE](LICENSE).
