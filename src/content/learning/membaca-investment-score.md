---
title: Cara Membaca Investment Score
category: Memahami Platform Ini
level: dasar
order: 1
summary: Skor 0-100 di aplikasi ini bukan rekomendasi beli. Artikel ini menjelaskan dari mana angkanya berasal, apa arti confidence, dan kapan skor sebaiknya diabaikan.
---

Setiap aset di aplikasi ini punya satu angka besar: **Investment Score**, dari 0 sampai 100. Angka itu menggoda untuk dibaca sebagai nilai rapor — makin tinggi makin bagus, makin rendah makin buruk. Pembacaan itu tidak salah, tapi terlalu dangkal untuk dipakai mengambil keputusan.

## Skor adalah rata-rata dari lima penilaian terpisah

Skor akhir bukan hasil satu perhitungan, melainkan gabungan lima dimensi:

| Dimensi | Menilai apa | Skor tinggi berarti |
|---|---|---|
| Fundamental | Kesehatan bisnis: laba, margin, pertumbuhan, utang | Bisnisnya sehat dan tumbuh |
| Teknikal | Kondisi harga: tren, momentum, posisi terhadap rata-rata | Harga sedang dalam tren naik yang sehat |
| Valuasi | Harga terhadap laba dan nilai buku | Relatif murah dibanding labanya |
| Sentimen | Nada berita 14 hari terakhir | Berita cenderung positif |
| Risiko | Volatilitas, drawdown, likuiditas, kesegaran data | Risikonya rendah |

Perhatikan baris terakhir. **Skor risiko tinggi berarti risiko rendah**, bukan sebaliknya. Konvensi ini dipilih supaya kelima dimensi searah — semua "makin tinggi makin baik" — sehingga rata-ratanya bermakna.

## Bobot tiap dimensi bergantung pada mode Anda

Mode **Investor** memberi bobot 40% ke fundamental dan hanya 10% ke teknikal. Mode **Trader** membalik itu: 45% teknikal, 10% fundamental. Aset yang sama bisa punya skor sangat berbeda di dua mode, dan itu memang seharusnya begitu — pertanyaan yang diajukan seorang investor jangka panjang berbeda dari pertanyaan seorang swing trader.

Kalau Anda mengubah mode dan skor sebuah aset melonjak, itu bukan berarti asetnya membaik. Yang berubah adalah pertanyaan yang Anda ajukan.

## Confidence lebih penting daripada skor

Di sebelah setiap skor ada angka **confidence**. Ini bukan hiasan.

Confidence menunjukkan seberapa besar porsi penilaian yang benar-benar punya data. Contoh nyata: saham IDX di aplikasi ini tidak punya data fundamental — tidak ada sumber gratis yang bisa dipercaya untuk itu. Jadi ketika Anda melihat BBCA dengan skor 68 dan confidence 45%, artinya:

> Angka 68 itu dihitung hanya dari teknikal, sentimen, dan risiko. Dimensi fundamental dan valuasi — yang di mode Investor menyumbang 70% bobot — sama sekali kosong.

Skor 68 dengan confidence 45% dan skor 68 dengan confidence 90% adalah dua hal yang sangat berbeda. Yang pertama nyaris tidak berarti apa-apa.

**Aturan praktis:** kalau confidence di bawah ambang mode Anda, aplikasi akan menampilkan peringatan kuning. Ketika itu muncul, jangan pakai skornya untuk membandingkan aset. Pakai saja untuk tahu bahwa Anda perlu mencari data di tempat lain.

## Apa yang skor ini TIDAK lakukan

- **Tidak memprediksi harga.** Tidak ada model prediksi di dalamnya. Semua angkanya menggambarkan kondisi saat ini dan masa lalu.
- **Tidak tahu konteks makro.** Suku bunga, inflasi, kebijakan pemerintah — tidak ada satupun yang masuk hitungan di versi ini.
- **Tidak tahu apa-apa yang tidak ada di database.** Kalau sebuah perusahaan mengumumkan sesuatu penting hari ini dan berita itu belum tersimpan, skornya tidak berubah.
- **Tidak menyarankan aksi.** Skor 85 tidak berarti beli. Skor 20 tidak berarti jual.

## Cara memakainya yang masuk akal

Skor ini paling berguna sebagai **alat penyaring, bukan alat pemutus**. Dari 270 aset, skor membantu Anda memilih 10 yang layak dibaca lebih detail. Setelah itu, yang mengambil keputusan tetap Anda — dengan membuka breakdown sub-skor, membaca angka mentahnya, memeriksa berita, dan memverifikasi di sumber resmi.

Klik dimensi mana pun di panel skor untuk melihat angka mentah yang dipakai. Kalau sebuah angka terlihat aneh, kemungkinan besar memang ada yang salah dengan datanya — dan itu informasi yang berguna.
