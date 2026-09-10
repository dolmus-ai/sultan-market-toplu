# Sultan Market · Kurye

Harita odaklı kurye uygulaması. Kurye; günün teslimatlarını, abonelikleri ve
müşterilerin açık sepetlerini tek haritada görür, toplu siparişlerde en kısa
yolu hesaplatır ve teslimat durumlarını sahadan günceller.

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind v4**
- **MapLibre GL 5** + **OpenFreeMap** vektör karolar (API anahtarı gerekmez)
- **Supabase** (`sultan-market` projesi) — auth, veri, realtime
- **motion** ile geçişler

Renk dili: beyaz zemin, kırmızı vurgu (`#e30a17`), lacivert/siyah derinlik —
mağaza tabelasıyla aynı.

### Marka

Amblem ve tabela yazısı `src/bilesenler/SultanLogo.tsx` içinde tek dosyada,
inline SVG olarak duruyor: lacivert "S" kıvrımı, tepesinde kırmızı küre,
altında üç kırmızı damla. **Mağaza tabelasından okunarak yeniden çizildi**;
elinizde orijinal vektör dosyası varsa bu dosyadaki `path`'leri değiştirmek
yeterli — üst çubuk, giriş ekranı, hata ekranı ve haritadaki market pini
hepsi buradan besleniyor.

Giriş ekranında açılış animasyonu var: amblem çizilir, küre düşer, damlalar
sırayla belirir, tabela yazısı ve kırmızı şerit açılır, ardından giriş kartı
gelir. Beraberinde `src/lib/jingle.ts` içinde **Web Audio ile sentezlenen**
kısa bir jingle çalar (ses dosyası taşımaz). Tarayıcı ilk açılışta sesi
engellerse ilk dokunuşta çalar; sol üstteki hoparlör düğmesiyle kapatılır ve
tercih `localStorage`'a yazılır — sesli tarifle aynı anahtarı paylaşır.
İşletim sisteminde "hareketi azalt" açıksa animasyon atlanır.

---

## Kurulum

```bash
npm install
npm run dev
```

Ortam değişkenleri `.env` içinde ve **repoya dahil** — taze bir klonda ek
ayar yapmadan çalışır. Değerlerin hepsi herkese açık: Supabase publishable
key istemciye zaten gönderiliyor ve RLS ile korunuyor, harita/OSRM adresleri
ve market konumu gizli değil. Yerelde farklı bir değer denemek isterseniz
`.env.local` açın (git'e girmez, `.env`'i ezer).

| Değişken | Açıklama |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje adresi |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key |
| `NEXT_PUBLIC_HARITA_STILI` | MapLibre stil URL'si (varsayılan OpenFreeMap Liberty) |
| `NEXT_PUBLIC_MARKET_AD` / `_ADRES` / `_LAT` / `_LNG` | Sultan Market'in konumu — harita başlangıcı, depo pini ve rota çıkış noktası |
| `NEXT_PUBLIC_MARKET_ACILIS` | Açılış saati (varsayılan `07:30`) — bu saatten önce hiçbir teslimat "gecikti" sayılmaz |
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

### Sahada çalışması için

- **Teslim edilemedi akışı:** sebep (adreste yok · kapı açılmadı · müşteri
  teslim almadı · adres yanlış · ödeme yapılmadı · diğer), serbest not ve
  "yarın tekrar denensin" seçeneği. Deneme sayısı `siparisler.deneme_sayisi`
  içinde birikir.
- **Tahsilat ve kasa:** teslim ekranında ödeme yöntemi ve tahsil edilen tutar
  girilir (eksik/fazla farkı anında gösterilir), üst çubukta kasadaki para
  canlı görünür. "Vardiyada" rozetine dokununca vardiya özeti açılır: teslim
  edilen/edilemeyen sayısı, yol, süre, yöntem bazında tahsilat dökümü ve
  **kasa teslimi** (sayılan nakit ile beklenen arasındaki fark + açıklama).
  `vardiyalar` ve `tahsilatlar` tablolarında tutulur.
- **Çevrimdışı kuyruk:** durum değişikliği, tahsilat ve kapı notu önce
  IndexedDB'ye yazılır; ağ yoksa ya da istek düşerse kuyrukta bekler,
  sinyal gelince sırayla gönderilir (`src/lib/cevrimdisi.ts`). Üst çubuktaki
  turuncu rozet bekleyen kayıt sayısını gösterir. Kuyruk 30 saniyede bir ve
  `online` olayında boşaltılır.
- **Ana ekrana kurulabilir (PWA):** `manifest.webmanifest` + servis çalışanı.
  Telefonda "Ana ekrana ekle" ile tam ekran açılır. Servis çalışanı yalnızca
  uygulama kabuğunu önbelleğe alır; veri yazımının çevrimdışı dayanıklılığı
  yukarıdaki kuyrukta — iki ayrı doğruluk kaynağı olmasın diye.

### Günlük işi hızlandıranlar

- **Kapı bilgisi hafızası:** kurye kapı/zil kodunu ve notu ("zil çalışmıyor,
  arayın") kendi yazar; adres kaydında kalır, sonraki her teslimatta detayın
  en üstünde kırmızı şeritte çıkar.
- **Aynı bina rozeti:** aynı sokak+numaradaki (numara yoksa ~11 m yarıçaptaki)
  açık teslimatlar listede "Aynı bina · 3" rozetiyle işaretlenir.
- **Gecikme uyarısı:** planlanan saati geçen teslimatlar listede ve detayda
  kırmızı rozetle ("12 dk geç", "2 sa geç", "dünden geç") öne çıkar; üst
  çubukta geciken sayısı görünür. **Market açılmadan (07:30) hiçbir teslimat
  gecikmiş sayılmaz** — kurye zaten ürünleri alamaz; o saatlerde üst çubuk
  "market 07:30'da açılıyor" der.
- **Diğer kuryeler:** vardiyadaki diğer kuryelerin son konumu haritada soluk
  gri noktalar ve adlarıyla görünür, canlı güncellenir.

### Ana ekranda neler var

- **Harita:** 3B eğim/döndürme, pusula, akıcı `flyTo` geçişleri, pin kümeleme,
  talep ısı haritası, 3B binalar, katman anahtarları.
- **Karanlık harita:** katman panelindeki anahtar hem harita paletini hem tüm
  arayüz yüzeylerini gece moduna alır; tercih `localStorage`'a yazılır.
  Karanlıkta kaybolacak siyah "yolda" rozeti ve pini otomatik ters çevrilir.
- **Harita paleti:** gündüz sıcak kırık beyaz zemin + beyaz yollar; gece
  arduvaz-mavi arazi ve arazi'den **daha koyu** yollar — Apple'ın gece
  navigasyonundaki okunaklılığı veren ters kontrast. 3B binalar, POI ikonları
  ve sokak adları iki temada da ayrı ayrı ayarlanır.
- **Rota şeridi:** gölge + koyu kenarlık + marka kırmızısı gövde + ince açık
  kırmızı parlaklık + akan beyaz kesikler; alternatifler soluk gri, tıklanınca
  seçilir.
- **Konum imleci:** beyaz halkalı kırmızı nokta ve yön konisi. Koni haritayla
  birlikte döner (`rotationAlignment: map`), eğimde yere yatar; yön bilinmiyorsa
  gizlenir.
- **Pin renkleri:** kırmızı = bekliyor, turuncu = hazırlanıyor, siyah = yolda,
  yeşil = teslim, gri = iptal. Bekleyen ve yoldaki teslimatlar nabız atar.
- **Alt panel** (sürüklenebilir, 3 kademeli): Teslimatlar · Abonelikler ·
  Sepetler. Sepetler sekmesi açık sepeti olan müşterinin adını ve sepet
  tutarını listeler; ürün dökümü gösterilmez.
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

## Ödeme ve tahsilat

Teslimat kapatılırken kurye önce **ödeme alındı / alınamadı** kararını verir.

- **Alındı** → yöntem seçilir, tahsil edilen tutar girilir, `tahsilatlar` tablosuna
  kayıt düşer ve vardiya kasası artar. Sipariş tutarıyla fark varsa ekranda
  "eksik/fazla" olarak gösterilir.
- **Alınamadı** → kapıdaki kişinin adı ve açıklama istenir. Teslimat yine
  tamamlanır, ama kasaya hiçbir şey işlenmez; borç `siparisler.odeme_alindi`,
  `odeme_alinmayan_kisi` ve `odeme_notu` alanlarında durur ve hem listede hem
  teslimat detayında turuncu olarak görünür.

Ödeme yöntemleri sabit değildir: `odeme_yontemleri` tablosundan gelir, kurye
ekranındaki **Düzenle** ile yenisi eklenir ya da listeden kaldırılır (kayıt
silinmez, `aktif=false` olur — geçmiş tahsilatlar bozulmasın diye). Varsayılan
olarak Nakit ve Kredi kartı açıktır. `para_alinir=false` işaretli bir yöntemde
kasa hareket etmez.

## Kayıt açma

Alt paneldeki **+** düğmesi iki yol sunar:

**Yeni kayıt** — dört adımlı, animasyonlu akış: müşteri (kayıtlıyı ara ya da
yenisini aç) → adres (mevcut adreslerden seç ya da yeni gir; "Kapıdayım"
düğmesi kuryenin GPS konumunu adrese işler) → kayıt türü → detay.

- **Teslimat**: tutar, tarih, saat, ödeme yöntemi, acil işareti, not.
- **Abonelik**: başlık, sıklık, günler, teslim saati, tutar. Gece çalışan
  `gunun_siparislerini_uret` bu abonelikten her gün siparişi kendi üretir.
- **Sepet**: müşteri toplamaya devam ederken açık duran kayıt.

Kurye ürün listesi görmediği için tutar elle giriliyor; abonelik ve sepette
kalem varsa tutar yine kalemlerden hesaplanır, yoksa `tutar` alanı kullanılır.

### Adresin haritada bulunması

Kayıt haritada ancak adresin `lat`/`lng` alanları doluysa görünür. Adres
girilirken iki yol var: kapıdayken **Kapıdayım** (kuryenin GPS konumu) ya da
**Adresten bul** — yazılan adresi OpenStreetMap/Nominatim üzerinde arar.
Hiçbiri kullanılmazsa kayıt sırasında adres kendiliğinden aranır.

Elle yazılan Türkçe adresleri servis çoğu zaman olduğu gibi bulamıyor
("Tığcılar mahallesi Kol sokak no 6 daire 8 filiz apartman SAKARYA/ADAPAZARI"
gibi). `src/lib/adres.ts` kapı/daire/kat/apartman parçalarını atıp giderek
daha genel adaylar üretiyor — tam metin → sokak + ilçe → mahalle + ilçe →
ilçe — ve ilk tutan kullanılıyor. Sokak bulunamazsa mahalle ortasına düşmek
hiç konum olmamasından iyi; kurye satır menüsündeki **Konumu düzelt** ile
haritaya dokunup ince ayar yapabiliyor.

Nominatim saniyede bir istek istiyor; uç nokta denemeler arasında bekliyor ve
en fazla dört aday deniyor.

### Satır işlemleri

Teslimat, abonelik ve sepet satırlarının sağındaki **⋯** düğmesi düzenleme,
konum düzeltme ve silme sunuyor. Silme onay istiyor. Teslim edilmiş sipariş
silinemez — tahsilat kaydı ona bağlı ve silinseydi kasa geçmişi de yok olurdu;
kural hem arayüzde hem RLS politikasında var.

**Excel'den toplu yükle** — .xlsx ya da .csv dosyasından müşteri + adres aktarır.
İlk satır başlık olmalı; en az `Ad` ve `Adres` sütunu gerekir. Telefon, Bina,
Kat, Daire, Tarif, Lat, Lng ve Not isteğe bağlıdır ve başlıklar Türkçe karakter,
boşluk ve büyük/küçük harf farkını yok sayarak eşleşir ("Ad Soyad", "Cep",
"Açık Adres", "Enlem"/"Boylam" hepsi tanınır). Dosya sunucuda çözümlenir
(`src/lib/toplu.ts`), kayıt istemciden kuryenin kendi oturumuyla atılır.
Yükleme öncesi kaç satırın geçerli, kaçının atlanacağı gösterilir. Ekrandaki
"Örnek dosyayı indir" doğru başlıklara sahip bir CSV verir.

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

## Otomatik sipariş üretimi

`public.gunun_siparislerini_uret(date)` aktif aboneliklerden o günün
siparişlerini üretir — sıklık (günlük / haftalık / iki haftalık / aylık),
gün listesi ve başlangıç–bitiş aralığı dikkate alınır; aynı abonelik için
aynı güne ikinci sipariş açılmaz. Market **07:30**'da açıldığı için cron
yarım saat önce, **07:00 (Europe/Istanbul)** çalışır:

```sql
select cron.schedule('gunun-siparisleri', '0 4 * * *',
  $$select public.gunun_siparislerini_uret(current_date)$$);
```

> Sunucu UTC çalışıyor: `0 4 * * *` = 07:00 Europe/Istanbul. Açılış saatini
> değiştirirseniz hem bu cron'u hem `NEXT_PUBLIC_MARKET_ACILIS`'i güncelleyin.

Elle çalıştırmak için (örneğin yarını hazırlamak):

```sql
select public.gunun_siparislerini_uret(current_date + 1);
```

---

## Vercel'e alma

İki tuzak var, ikisi de sessizce 500'e yol açıyor:

**1. Ortam değişkenleri.** Vercel depodaki `.env` dosyasını okumaz; yalnızca
panelde tanımlı değişkenleri build'e geçirir. Bu yüzden Supabase adresi ve
publishable anahtarı için `src/lib/ortam.ts` içinde varsayılan tutuluyor —
panelde hiçbir şey tanımlı olmasa da uygulama ayağa kalkar. Farklı bir Supabase
projesine bağlanacaksanız Settings → Environment Variables altında aynı adlarla
tanımlayın, koddaki varsayılanı ezer.

**2. Commit yazarı.** Depo private ve Vercel hesabı Hobby planındaysa, deploy
yalnızca repo sahibinin yazdığı commit'ler için çalışır. Başka bir e-postayla
atılan commit "Blocked — the commit author did not have contributing access"
diyerek deploy edilmez. Bu depoda çalışırken git kimliğini repo sahibine
sabitleyin:

```bash
git config user.name "dolmus-ai"
git config user.email "214736703+dolmus-ai@users.noreply.github.com"
```

(Depoya özel ayardır, diğer projelerinizdeki genel kimliğe dokunmaz.)

## Bilinen sınırlar

- Abonelikler ve sepetler ilk yüklemede gelir; canlı yenileme yalnızca
  `siparisler` tablosunda açıktır.
- Ürün, abonelik ve müşteri **girişi** bu uygulamada yok — kapsam yalnızca
  kurye tarafı. Abonelikten doğan siparişler cron ile otomatik üretiliyor;
  tek seferlik siparişler hâlâ Supabase üzerinden ya da ileride yazılacak
  kasa/yönetim ekranından girilmeli.
- Teslimat fotoğrafı, push bildirimi, iade/eksik ürün ve km-yakıt raporu
  henüz yok (öneri listesindeki 3. kademe).
- Harita görünümü Yandex Haritalar'a benzetildi (sıcak bej zemin, doygun mavi
  su, sarı ana yollar; gece modunda lacivert arduvaz). Karoların kendisi yine
  OpenStreetMap/OpenFreeMap'ten geliyor: Yandex'in karo sunucusu üçüncü parti
  harita kütüphanelerinde kullanılamıyor. Palet `src/lib/harita-stili.ts`
  içinde tek yerde duruyor.
- OpenFreeMap'te trafik katmanı ve Street View yoktur. Bunlar gerekiyorsa
  `NEXT_PUBLIC_HARITA_STILI` değiştirilip harita sağlayıcısı Google/Mapbox'a
  taşınabilir; uygulama içindeki harita kodu tek dosyada (`src/bilesenler/Harita.tsx`).
- Sesli tarif tarayıcının `speechSynthesis` desteğine bağlıdır. Cihazda
  Türkçe ses paketi yoksa sistem varsayılanı okur; hiç destek yoksa sessiz
  kalır, uygulama çalışmaya devam eder.
- Supabase'de "Leaked password protection" kapalı — Dashboard → Authentication
  → Policies bölümünden açmanız önerilir.
