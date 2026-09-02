# Sultan Market — Bakkal Defteri

Kağıt bakkal defterinin yerini alan cari hesap + tahsilat/ödeme + rapor uygulaması.
Mobil öncelikli web uygulaması (PWA) — telefona "ana ekrana ekle" ile kurulur.

## Özellikler (Faz 1 MVP)

- **Cari Hesaplar:** Müşteriler ve toptancılar ayrı listelerde. Toptancı satırında
  **Gelen Fatura / Yapılan Ödeme / Kalan Bakiye** üçlüsü tek bakışta.
  Ekranlarda muhasebe jargonu yok: "Borç/Alacak" yerine **Yapılan Ödeme / Gelen Ödeme**.
- **İşlem Girişi:** Ödeme Al, Veresiye Yaz, Ödeme Yap, Fatura Ekle — 3 dokunuşta kayıt.
  Ödeme yöntemi: Nakit / Kredi Kartı / Yemek Kartı. Bakiye otomatik güncellenir.
- **Kart Takibi:** Kartla ödemede hangi kartla ödendiği de kaydedilir. Kart adlarını
  kullanıcı kendisi verir; işlem sırasında listede yoksa oracıkta eklenir.
  Kart yönetimi (ad değiştirme, pasife alma) `Kartlar` ekranından yapılır.
- **Raporlar:** Günlük/haftalık/aylık özet, en borçlu cariler, işlem geçmişi (kim, ne zaman, ne girdi).
- **Kullanıcılar:** Her personel kendi hesabıyla girer; her kaydın üstünde işlemi yapan görünür.

## Teknoloji

- Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- Supabase (PostgreSQL + Auth + RLS)

## Kurulum

```bash
npm install
cp .env.example .env.local   # Supabase URL ve anon key doldurun
npm run dev
```

Veritabanı şeması: `supabase/migrations/` altındaki dosyaları sırayla Supabase
SQL Editor'de çalıştırın (`001_init.sql` → `006_kartlar.sql`).

## Yol Haritası

- **Faz 2:** Fatura/Fiş OCR ile otomatik kayıt
- **Faz 3:** App Store / Play Store yayını
