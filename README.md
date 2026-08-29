# Sultan Market · Kurye

Harita odaklı kurye uygulaması. Kurye; günün teslimatlarını, abonelikleri ve
müşterilerin açık sepetlerini tek haritada görür, toplu siparişlerde en kısa
yolu hesaplatır ve teslimat durumlarını sahadan günceller.

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind v4**
- **MapLibre GL 5** + **OpenFreeMap** vektör karolar (API anahtarı gerekmez)
- **Supabase** (`sultan-market` projesi) — auth, veri, realtime
- **motion** ile geçişler

Renk dili: beyaz zemin, kırmızı vurgu (`#e30a17`), siyah derinlik.

---

## Kurulum

```bash
npm install
```

`.env.local` zaten dolu. Örneği `.env.example` içinde:

| Değişken | Açıklama |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje adresi |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `NEXT_PUBLIC_HARITA_STILI` | MapLibre stil URL'si (varsayılan OpenFreeMap Liberty) |
| `NEXT_PUBLIC_MERKEZ_LAT` / `_LNG` / `_ZOOM` | Kurye konumu alınamazsa haritanın açılacağı yer |
| `OSRM_SUNUCU` | Boşsa rota tamamen yerel hesaplanır (aşağıya bakın) |

```bash
npm run dev
```

---

## Kurye hesabı açma

Uygulama Supabase Auth kullanır; kendi kaydı yoktur. Bir kurye eklemek için
**Supabase Dashboard → Authentication → Users → Add user** ile e-posta/şifre
oluşturun. Kullanıcı ilk girişte otomatik olarak `kuryeler` tablosuna eklenir.

Mevcut muhasebe personeli (`profiles` tablosundaki 8 kullanıcı) da doğrudan
giriş yapabilir — RLS bu iki tabloyu birlikte kabul eder.

---

## Ekranlar

| Yol | İçerik |
| --- | --- |
| `/giris` | E-posta + şifre ile giriş |
| `/harita` | Ana ekran — harita + alt panel |
| `/onizleme` | **Yalnızca geliştirme.** Giriş ve veritabanı olmadan sahte veriyle tasarımı denemek için |
| `/api/rota` | Rota optimizasyonu (POST) |

### Ana ekranda neler var

- **Harita:** 3B eğim/döndürme, pusula, akıcı `flyTo` geçişleri, pin kümeleme,
  talep ısı haritası, 3B binalar, katman anahtarları.
- **Pin renkleri:** kırmızı = bekliyor, turuncu = hazırlanıyor, siyah = yolda,
  yeşil = teslim, gri = iptal. Bekleyen ve yoldaki teslimatlar nabız atar.
- **Alt panel** (sürüklenebilir, 3 kademeli): Teslimatlar · Abonelikler ·
  Sepetler · Ürünler.
- **Teslimat detayı:** sepet kalemleri, tutar, ödeme yöntemi, kapı tarifi,
  tek dokunuşla arama ve cihazın harita uygulamasında navigasyon, durum
  ilerletme (hazırlığa aldım → yola çıktım → teslim ettim).
- **Toplu rota:** birden çok teslimat seçilir, "En kısa yolu bul" duraklara
  sıra numarası verir ve rotayı haritaya çizer. "Üstlen" rotayı kaydeder ve
  siparişleri kuryenin üstüne alır.
- **Konum düzeltme:** adresin koordinatı yanlışsa kurye haritaya dokunarak
  düzeltir; kayıt `konum_dogrulandi` ile işaretlenir.
- **Canlı konum:** `watchPosition` ile takip, 15 saniyede bir
  `kurye_konumlari` tablosuna yazılır.

---

## Rota optimizasyonu

`POST /api/rota`

```json
{
  "baslangic": { "lat": 40.9903, "lng": 29.027 },
  "duraklar": [{ "id": "…", "nokta": { "lat": 40.98, "lng": 29.02 } }]
}
```

İki motor var:

1. **Yerel (varsayılan).** `OSRM_SUNUCU` boşken hiçbir veri dışarı çıkmaz.
   Kuş uçuşu mesafe matrisi + şehir içi dolambaç katsayısı üzerinden
   en yakın komşu ile kaba sıra kurulur, ardından **2-opt** ile kesişen
   bacaklar düzeltilir. Rota düz çizgilerle çizilir.
2. **OSRM.** `OSRM_SUNUCU` doldurulursa duraklar OSRM'in `trip` servisine
   gönderilir ve gerçek yol ağı üzerinde çözülür; rota sokak geometrisiyle
   çizilir. **Duraklar bu sunucuya gönderilir** — müşteri koordinatları söz
   konusu olduğu için kendi OSRM sunucunuzu çalıştırmanız önerilir.

Her iki motorda da en fazla 40 durak işlenir.

---

## Veritabanı

Mevcut muhasebe tablolarına (`cariler`, `hareketler`, `marka_esleme`,
`profiles`) dokunulmadı. Eklenen tablolar:

```
musteriler ──< adresler ──┐
                          ├──< abonelikler ──< abonelik_kalemleri
                          ├──< sepetler     ──< sepet_kalemleri
                          └──< siparisler   ──< siparis_kalemleri
urunler  (abonelik/sepet/sipariş kalemlerinin hedefi)
kuryeler ──< kurye_konumlari
         └──< rotalar ──< siparisler.rota_id
```

`musteriler.cari_id` isteğe bağlı olarak `cariler`'e bağlanır — kurye ekranında
cari bakiye göstermek isterseniz bağ hazır.

### RLS

- Aktif personel/kurye tüm operasyonel veriyi **okur**.
- Kurye yalnızca **kendi** konumunu, rotasını ve profilini yazar.
- Kurye, üstünde olan veya sahipsiz siparişlerin durumunu günceller.
- Kurye adres koordinatını düzeltebilir.
- Diğer tüm yazma/silme yetkisi `profiles.role = 'sahip'` kullanıcılarındadır.

### Demo veri

Kadıköy çevresine 26 müşteri, 26 konumlu adres, 44 ürün, 12 abonelik,
7 açık sepet ve bugün için 22 sipariş yüklendi. Temizlemek için:

```sql
truncate siparis_kalemleri, siparisler, sepet_kalemleri, sepetler,
         abonelik_kalemleri, abonelikler, adresler, musteriler, urunler
restart identity cascade;
```

---

## Bilinen sınırlar

- Abonelikler ve sepetler ilk yüklemede gelir; canlı yenileme yalnızca
  `siparisler` tablosunda açıktır.
- Ürün, abonelik ve müşteri **girişi** bu uygulamada yok — kapsam yalnızca
  kurye tarafı. Bu kayıtlar Supabase üzerinden veya ileride yazılacak yönetim
  panelinden girilir.
- OpenFreeMap'te trafik katmanı ve Street View yoktur. Bunlar gerekiyorsa
  `NEXT_PUBLIC_HARITA_STILI` değiştirilip harita sağlayıcısı Google/Mapbox'a
  taşınabilir; uygulama içindeki harita kodu tek dosyada (`src/bilesenler/Harita.tsx`).
- Supabase'de "Leaked password protection" kapalı — Dashboard → Authentication
  → Policies bölümünden açmanız önerilir.
