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
| `NEXT_PUBLIC_MARKET_AD` / `_ADRES` / `_LAT` / `_LNG` | Sultan Market'in konumu — harita başlangıcı, depo pini ve rota çıkış noktası |
| `NEXT_PUBLIC_MERKEZ_LAT` / `_LNG` / `_ZOOM` | Kurye konumu alınamazsa haritanın açılacağı yer (varsayılan: market) |
| `OSRM_SUNUCU` | Gerçek yol ağı rotası. Boşsa her şey yerel hesaplanır (aşağıya bakın) |

**Market konumu:** Arabacıalanı Mah. Orhan Gazi Sk. No:19, 54050 Serdivan/Sakarya
→ `40.78067, 30.35218`. Harita ve tüm demo adresler Serdivan–Adapazarı
çevresine kuruludur.

```bash
npm run dev
```

---

## Kurye hesabı açma

Uygulama Supabase Auth kullanır; kendi kayıt ekranı yoktur.

1. **Supabase Dashboard → Authentication → Users → Add user** ile e-posta/şifre
   oluşturun ve "Auto confirm user" işaretleyin.
2. Kullanıcı ilk girişte otomatik olarak `kuryeler` tablosuna eklenir.
3. **Önemli:** `auth.users` üzerinde bir trigger her yeni kullanıcıya
   `profiles` tablosunda `role='personel'` kaydı açıyor — bu kayıt muhasebe
   erişimi demek. Kurye yalnızca kurye tarafını görsün istiyorsanız bu satırı
   silin:

```sql
delete from public.profiles p
using auth.users u
where p.id = u.id and u.email = 'yeni.kurye@ornek.com';
```

Kuryenin uygulamaya erişimi `kuryeler` kaydından geldiği için profil silinince
giriş bozulmaz; yalnızca muhasebe kapanır.

Mevcut muhasebe personeli (`profiles` tablosundaki 8 kullanıcı) de giriş
yapabilir ve her iki tarafı da görür.

### Muhasebe / kurye ayrımı

Muhasebe tabloları (`cariler`, `hareketler`, `marka_esleme`, `profiles`)
başlangıçta **oturum açan herkese** açıktı — okuma da silme de. Kurye hesapları
da `authenticated` olduğu için defteri görebiliyordu. Mevcut politikalara
dokunmadan, üzerlerine kısıtlayıcı (`restrictive`) bir kilit eklendi: erişim
için ayrıca `profiles` kaydı gerekiyor (`public.muhasebeci_mi()`).

Doğrulandı — RLS altında satır sayıları:

| | cariler | hareketler | siparisler | urunler |
| --- | --- | --- | --- | --- |
| sahip | 120 | 1391 | 22 | 44 |
| personel | 120 | 1391 | 22 | 44 |
| kurye | **0** | **0** | 22 | 44 |

Geri almak isterseniz:

```sql
drop policy "muhasebe kilidi" on public.cariler;
drop policy "muhasebe kilidi" on public.hareketler;
drop policy "muhasebe kilidi" on public.marka_esleme;
drop policy "muhasebe kilidi" on public.profiles;
```

---

## Ekranlar

| Yol | İçerik |
| --- | --- |
| `/giris` | E-posta + şifre ile giriş |
| `/harita` | Ana ekran — harita + alt panel |
| `/onizleme` | **Yalnızca geliştirme.** Giriş ve veritabanı olmadan sahte veriyle tasarımı denemek için |
| `/api/rota` | Toplu teslimat rota optimizasyonu (POST) |
| `/api/navigasyon` | Tek hedefe navigasyon, alternatifli (POST) |

### Ana ekranda neler var

- **Harita:** 3B eğim/döndürme, pusula, akıcı `flyTo` geçişleri, pin kümeleme,
  talep ısı haritası, 3B binalar, katman anahtarları.
- **Pin renkleri:** kırmızı = bekliyor, turuncu = hazırlanıyor, siyah = yolda,
  yeşil = teslim, gri = iptal. Bekleyen ve yoldaki teslimatlar nabız atar.
- **Alt panel** (sürüklenebilir, 3 kademeli): Teslimatlar · Abonelikler ·
  Sepetler · Ürünler.
- **Market pini:** deponun kendisi haritada sabit işaretli; kurye konumu
  yoksa rotalar buradan başlar.
- **Teslimat detayı:** sepet kalemleri, tutar, ödeme yöntemi, kapı tarifi,
  tek dokunuşla arama, durum ilerletme (hazırlığa aldım → yola çıktım →
  teslim ettim).
- **Uygulama içi navigasyon:** "Navigasyon" butonu harici uygulama açmaz;
  rotayı kendi haritamıza çizer. 2–3 alternatif sunulur (haritadan veya
  karttan seçilir), "Başla" ile sürüş moduna geçilir: üstte Türkçe manevra
  kartı (*"Göbekten 2. çıkış · Mehmet Akif Ersoy Caddesi"*), altta kalan
  süre/mesafe ve varış saati, kamera kuryenin arkasından eğik takip eder.
  Hedefe 70 m kala doğrudan "Teslim ettim" çıkar. İsteyen kurye tek
  dokunuşla harici haritada da açabilir.
- **Toplu rota:** birden çok teslimat seçilir, "En kısa yolu bul" duraklara
  sıra numarası verir ve rotayı haritaya çizer. "Üstlen" rotayı kaydeder ve
  siparişleri kuryenin üstüne alır.
- **Konum düzeltme:** adresin koordinatı yanlışsa kurye haritaya dokunarak
  düzeltir; kayıt `konum_dogrulandi` ile işaretlenir.
- **Canlı konum:** `watchPosition` ile takip, 15 saniyede bir
  `kurye_konumlari` tablosuna yazılır.

---

## Rota ve navigasyon

### Toplu teslimat — `POST /api/rota`

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

### Tek hedef navigasyon — `POST /api/navigasyon`

```json
{ "baslangic": { "lat": 40.78067, "lng": 30.35218 },
  "hedef":     { "lat": 40.7805,  "lng": 30.4028  } }
```

OSRM'in `route` servisinden `alternatives=true&steps=true` ile en fazla üç
seçenek alınır; OSRM manevraları Türkçeye çevrilir (`sola dönün`,
`göbekten 3. çıkış`, `yolun sonunda sağa`…). OSRM kapalıysa tek bir kuş uçuşu
seçenek döner ve arayüz bunu "kuş uçuşu tahmin" diye işaretler.

> **Dikkat — dış servis:** `OSRM_SUNUCU` şu an herkese açık demo sunucusuna
> (`router.project-osrm.org`) ayarlı. Yani **müşteri koordinatları o sunucuya
> gidiyor.** Üretimde kendi OSRM'inizi çalıştırıp bu değeri değiştirin; ya da
> boş bırakıp tamamen yerel çalışın (o zaman gerçek yol rotası ve sokak adlı
> manevra olmaz).

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
