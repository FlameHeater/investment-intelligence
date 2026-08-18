---
title: Sejauh Mana AI di Aplikasi Ini Boleh Dipercaya
category: Memahami Platform Ini
level: menengah
order: 5
summary: Claude dipakai di tiga tempat berbeda dengan tingkat kebebasan yang berbeda. Mengetahui yang mana membantu Anda tahu kapan perlu memverifikasi.
---

Aplikasi ini memanggil Claude di tiga tempat. Ketiganya punya aturan berbeda, dan perbedaan itu menentukan seberapa besar Anda perlu memeriksa hasilnya.

## Tempat 1: AI Reasoning di halaman aset

**Kebebasan model: paling sempit.**

Ketika Anda menekan tombol hitung ulang, sistem mengirim satu paket data ke Claude: kelima sub-skor, semua angka mentah yang mendasarinya, sampai lima berita terbaru, dan timestamp semua data itu. Bersama paket itu dikirim instruksi yang melarang model menambahkan fakta apa pun dari ingatannya sendiri tentang perusahaan tersebut.

Artinya: kalau Claude menyebut angka ROE, angka itu ada di paket yang dikirim. Kalau ia menyebut sebuah berita, berita itu ada di database Anda.

Model juga dilarang memberi rekomendasi beli/jual dan dilarang menyebut target harga. Skenario bull/base/bear yang ditampilkan adalah deskripsi kondisi ("kalau margin bertahan di atas X dan tren harga tetap di atas SMA 50"), bukan ramalan angka.

**Yang tetap perlu Anda periksa:** apakah penafsirannya masuk akal. Model bisa saja mengambil angka yang benar tapi menariknya ke kesimpulan yang lemah. Semua angka yang dirujuknya bisa Anda cocokkan langsung di panel breakdown di halaman yang sama.

## Tempat 2: AI Screener

**Kebebasan model: sedang, tapi hasilnya bisa diaudit.**

Di sini Claude tidak menyentuh database sama sekali. Tugasnya hanya satu: mengubah kalimat Anda menjadi objek filter terstruktur. Filter itu lalu dijalankan oleh mesin screener yang persis sama dengan yang dipakai tab Advanced Screener.

Konsekuensinya penting: **AI tidak bisa memunculkan aset yang tidak bisa Anda temukan sendiri lewat filter manual.** Tidak ada jalur data rahasia.

Setelah diterjemahkan, filter hasilnya langsung disalin ke panel filter yang terlihat. Kalau Anda meminta "margin tinggi" dan model menerjemahkannya menjadi "margin bersih di atas 15%", Anda bisa melihat angka 15 itu dan mengubahnya kalau menurut Anda terlalu longgar.

Ringkasan hasil yang muncul di bawahnya tunduk pada aturan grounding yang sama dengan AI Reasoning.

**Yang perlu Anda periksa:** apakah terjemahannya sesuai maksud Anda. Bagian yang tidak bisa diterjemahkan dilaporkan terpisah di kotak kuning.

## Tempat 3: Fitur belajar dan penjelasan istilah

**Kebebasan model: paling luas — dan itu memang disengaja.**

Ketika Anda bertanya "apa itu ROE", yang dibutuhkan adalah pengetahuan keuangan umum, bukan fakta tentang sebuah aset. Di sini Claude boleh menjawab dari pengetahuannya.

Batasnya tetap ada: model dilarang menyebut angka spesifik milik sebuah perusahaan kecuali angka itu diberikan dalam konteks. Kalau Anda bertanya "berapa ROE BBCA", ia akan mengarahkan Anda ke halaman asetnya alih-alih menebak.

## Kalau API key tidak diisi

Semua yang bukan AI tetap berjalan penuh: pengambilan data, kelima skor deterministik, screener manual, watchlist, deteksi perubahan, dan glosarium metrik.

Yang mati hanya lapisan penjelasannya. Aplikasi memberi tahu ini secara eksplisit di setiap tempat, bukan menampilkan hasil kosong tanpa keterangan.

## Kesalahan yang tetap mungkin terjadi

Grounding ketat mengurangi halusinasi, tapi tidak menghapusnya. Yang masih bisa terjadi:

- **Salah tafsir angka yang benar.** Model bisa membaca margin 8% sebagai "sehat" untuk industri yang sebenarnya normalnya 25%.
- **Menganggap penting sesuatu yang tidak penting.** Satu berita dari sumber kecil bisa mendapat bobot berlebih dalam narasinya.
- **Terlalu percaya diri pada data tipis.** Meski diminta menyebut keterbatasan, nada tulisannya bisa terdengar lebih yakin daripada yang dibenarkan datanya.

Karena itu, penilaian akhir tetap ada pada Anda. Sistem ini dirancang untuk mempercepat pemahaman, bukan menggantikannya.
