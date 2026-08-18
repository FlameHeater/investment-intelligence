---
title: Kenapa Sebagian Data Sengaja Dikosongkan
category: Memahami Platform Ini
level: dasar
order: 2
summary: Aplikasi ini sering menampilkan "tidak tersedia" alih-alih angka. Itu keputusan desain, bukan bug. Artikel ini menjelaskan alasannya dan apa artinya bagi Anda.
---

Kalau Anda membuka halaman saham IDX di aplikasi ini, bagian Fundamental & Valuasi akan kosong dengan keterangan kuning. Kalau Anda membuka halaman kripto, dimensi fundamental dan valuasi hilang sama sekali. Ini bukan fitur yang belum jadi.

## Tiga alasan sebuah angka bisa kosong

**1. Datanya memang tidak ada di dunia nyata.**
Bitcoin tidak punya laporan keuangan. Emas tidak menghasilkan laba. Menghitung PER untuk keduanya bukan sulit — melainkan tidak punya arti. Untuk aset seperti ini, dimensi fundamental dan valuasi dilewati sepenuhnya, dan bobotnya dialihkan ke dimensi lain.

**2. Datanya ada, tapi tidak tersedia gratis.**
Ini kasus saham IDX. Laporan keuangan emiten Indonesia tentu ada — dipublikasikan resmi ke IDX. Tapi per Agustus 2026, tidak ada API gratis dan stabil yang menyajikannya dalam bentuk terstruktur. Yang tersedia gratis hanyalah harga dan riwayatnya lewat endpoint publik Yahoo Finance.

Ada dua pilihan di titik ini. Pilihan pertama: mengisi kekosongan itu dengan angka hasil scraping tanpa jaminan, atau lebih buruk, dengan estimasi. Pilihan kedua: mengosongkannya dan mengatakan terus terang bahwa datanya tidak ada.

Aplikasi ini memilih yang kedua.

**3. Job pengambil data belum dijalankan.**
Ini yang paling mudah diperbaiki — cukup jalankan `npm run job:fundamentals`. Aplikasi membedakan kasus ini dari dua kasus di atas lewat pesan yang berbeda.

## Kenapa tidak diisi angka perkiraan saja?

Karena angka yang salah lebih berbahaya daripada tidak ada angka.

Kalau kolom ROE saham IDX diisi dengan estimasi, Anda akan memakainya untuk membandingkan BBCA dengan JPMorgan. Perbandingan itu akan terasa masuk akal, terlihat presisi, dan salah. Kolom kosong setidaknya jujur: ia memberi tahu Anda bahwa perbandingan itu belum bisa dilakukan di sini, dan Anda perlu mencari datanya di tempat lain.

Prinsip yang sama berlaku untuk label kesegaran data. Aplikasi ini menampilkan "Delayed 15 menit" alih-alih menyembunyikannya, karena sumber datanya memang bukan real-time. Mengklaim real-time akan membuat Anda mengambil keputusan dengan asumsi yang salah tentang seberapa baru angka yang Anda lihat.

## Bagaimana ini memengaruhi skor

Ketika sebuah dimensi kosong, dua hal terjadi:

1. **Bobotnya dinormalisasi ulang.** Dimensi kosong tidak dihitung sebagai skor 0 — bobotnya dikeluarkan dari perhitungan, dan sisanya dibagi ulang. Tanpa ini, setiap aset dengan data tidak lengkap otomatis terlihat buruk, padahal masalahnya ada di data kita, bukan di asetnya.

2. **Confidence turun.** Ini yang memberi tahu Anda bahwa skornya dihitung dari gambar yang tidak utuh.

## Efeknya di screener

Kalau Anda memfilter "ROE di atas 15%" tanpa membatasi kelas aset, semua saham IDX dan kripto akan tersaring keluar — bukan karena ROE mereka rendah, tapi karena tidak ada angkanya untuk dinilai.

Aplikasi memberi tahu ini di bawah hasil screener: berapa aset yang tersaring karena data kosong, bukan karena gagal memenuhi syarat. Angka itu penting. Kalau Anda memfilter 270 aset dan hanya 12 yang lolos sementara 180 tersaring karena data kosong, hasil Anda bukan "12 aset terbaik" — melainkan "12 aset terbaik di antara 90 yang datanya ada".

## Jalan keluar kalau Anda butuh data IDX lengkap

PRD mencatat ini sebagai kandidat Phase 2: berlangganan penyedia data berbayar untuk fundamental IDX. Keputusan itu sebaiknya diambil setelah Anda memakai aplikasi ini beberapa minggu dan tahu apakah fitur tersebut benar-benar Anda butuhkan — bukan sebelumnya.
