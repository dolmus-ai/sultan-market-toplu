# Sultan Market · Kurye

Harita odaklı kurye uygulaması. Kurye; günün teslimatlarını, abonelikleri ve
müşterilerin açık sepetlerini tek haritada görür, toplu siparişlerde en kısa
yolu hesaplatır ve teslimat durumlarını sahadan günceller.

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind v4**
- **MapLibre GL 5** + **OpenFreeMap** vektör karolar — ücretsiz, sınırsız,
  anahtarsız (Google Map Tiles'a geçiş tek değişkenle açılabilir, bkz. aşağısı)
- **Google Geocoding API** ile adres çözümleme — kapı numarasına kadar
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
| `GOOGLE_GEOKOD_ANAHTARI` | **Adres çözümleme için sunucu anahtarı** (Geocoding API). Tarayıcıya gitmez. Boşsa adresler OpenStreetMap/Nominatim ile aranır ve kapı numarası şaşabilir |
| `NEXT_PUBLIC_HARITA_STILI` | Harita zemininin MapLibre stil URL'si (varsayılan OpenFreeMap Liberty) |
| `NEXT_PUBLIC_GOOGLE_HARITA_ANAHTARI` | İsteğe bağlı, **varsayılan boş**. Doldurulursa zemin Google Map Tiles'a geçer (aşağıya bakın) |
| `NEXT_PUBLIC_BINA_KARO_KAYNAGI` | Google zemini açıkken 3B bina yüksekliklerini veren vektör karo kaynağı (varsayılan OpenFreeMap) |
| `NEXT_PUBLIC_MARKET_AD` / `_ADRES` / `_LAT` / `_LNG` | Sultan Market'in konumu — harita başlangıcı, depo pini ve rota çıkış noktası |
| `NEXT_PUBLIC_MARKET_ACILIS` | Açılış saati (varsayılan `07:30`) — bu saatten önce hiçbir teslimat "gecikti" sayılmaz |
| `NEXT_PUBLIC_MERKEZ_LAT` / `_LNG` / `_ZOOM` | Kurye konumu alınamazsa haritanın açılacağı yer (varsayılan: market) |
| `OSRM_SUNUCU` | Gerçek yol ağı rotası. Boşsa her şey yerel hesaplanır (aşağıya bakın) |

**Market konumu:** Arabacıalanı Mah. Orhan Gazi Sk. No:19, 54050 Serdivan/Sakarya
→ `40.7784889, 30.3518378` (Google Haritalar'daki işletme pini). Harita ve tüm
demo adresler Serdivan–Adapazarı
çevresine kuruludur.

### Adres çözümleme ve harita zemini

İki ayrı iş, iki ayrı karar:

**Zemin (harita görüntüsü) OpenFreeMap'te.** Ücretsiz, sınırsız, anahtar
istemiyor. Palet `src/lib/harita-stili.ts` içinde tek yerde duruyor ve
Yandex'in sıcak bej gündüz / lacivert gece görünümüne yaklaştırılmış.

**Adres çözümleme Google'da.** Türkiye'de OpenStreetMap'in kapı numarası
verisi seyrek; elle yazılan bir adres sokağın ortasına düşüyor ve kurye
yanlış yere gidiyor. Google Geocoding kapı numarasına iniyor, işletme adını
("Ramada Otel Sakarya") da tanıyor.

Kurulum — tek anahtar yeter:

1. Google Cloud Console'da bir proje açın, faturalandırmayı bağlayın,
   **Geocoding API**'yi etkinleştirin.
2. API anahtarı oluşturun. Bu anahtar Vercel **sunucusundan** kullanılıyor,
   tarayıcıya gitmiyor: *Uygulama kısıtlaması* → **Yok**, *API kısıtlaması* →
   yalnızca **Geocoding API**.
3. Vercel'de `GOOGLE_GEOKOD_ANAHTARI` olarak tanımlayın (yerelde
   `.env.local`). Başında `NEXT_PUBLIC_` **yok**; olsaydı anahtar istemciye
   gömülürdü.

Maliyet: Geocoding ayda 10.000 isteğe kadar ücretsiz, sonrası 1.000 istek
başına 5 dolar. Çağrı yalnızca **yeni** bir adres eklenirken çıkıyor; kayıtlı
müşterinin koordinatı veritabanında duruyor. Ayrıca hem istemcide hem
sunucuda aynı metin için önbellek var, tekrar eden aramalar isteğe dönüşmüyor.
Yine de Google Cloud'da bir bütçe uyarısı ve günlük kota tavanı kurmanız
önerilir.

Nasıl çalışıyor (`src/app/api/geokod/route.ts`):

- Önce ham adres metni Google'a soruluyor; tutmazsa `src/lib/adres.ts`
  kapı/daire/kat gibi parçaları ayıklayıp giderek genelleşen adaylar
  üretiyor, ilk tutan kazanıyor.
- Sonuçlar market çevresine yanlı (`bounds`), ülke `TR` ile kısıtlı ve
  marketten 80 km'den uzak sonuçlar reddediliyor — başka ildeki aynı adlı
  sokak seçilmesin diye.
- İl/ilçe merkezine düşen kaba sonuçlar hiç kabul edilmiyor: konum
  olmamasından beter, kurye kilometrelerce öteye gider.
- Sonuç kapı düzeyinde değilse `kaba: true` dönüyor ve form "≈ Yaklaşık
  konum — haritadan düzeltin" diyor.
- Anahtar yoksa ya da Google reddederse OpenStreetMap/Nominatim'e düşülüyor.
  O durumda form "OpenStreetMap ile bulundu — Google adres servisi devrede
  değil" satırını gösteriyor, böylece yanlış pinin sebebi görünür oluyor.

### İsteğe bağlı: zemini Google karolarına almak

Kod hazır (`src/lib/google-karo.ts`) ama **varsayılan olarak kapalı**.
`NEXT_PUBLIC_GOOGLE_HARITA_ANAHTARI` doldurulursa zemin Google Map Tiles
API'ye geçer; boşsa OpenFreeMap kullanılır. Kod değişikliği gerekmiyor,
beğenilmezse değişken silinip geri dönülüyor.

Neden varsayılan kapalı: Map Tiles karo **başına** faturalanıyor ve bir ekran
dolusu harita ~23 karo istiyor. Aylık 100.000 ücretsiz hak kabaca 4.300 kamera
hareketine denk; üç kuryenin yoğun kullanımı bu sınırın kenarında geziniyor.
Karşılığında alınan tek şey zeminin görünümü, adres doğruluğuyla ilgisi yok.

Açılırsa neler oluyor:

- Karolar iki adımlı: `createSession` ile harita türü, dil (`tr-TR`), bölge,
  2x çözünürlük ve **stil kuralları** verilip oturum açılıyor; karolar o
  oturum jetonuyla isteniyor. Oturum ~2 hafta geçerli, `localStorage`'da.
- Gündüz/gece paleti aynı `harita-stili.ts` tablosundan Google'ın stil diline
  çevriliyor; tema başına ayrı oturum açılıyor.
- Google karoları düz resim olduğu için 3B bina yükseklikleri ayrı bir vektör
  kaynaktan (`NEXT_PUBLIC_BINA_KARO_KAYNAGI`) alınıp üstüne çiziliyor. Yazı
  tipleri `public/maplibre/fonts/` altından kendi sunucumuzdan geliyor.
- Google'ın kullanım şartı gereği logo ve görünen bölgenin telif metni
  haritada duruyor; metin her harita hareketinde `viewport` ucundan
  yenileniyor.
- Oturum açılamazsa harita pinleriyle çalışmaya devam eder ve sebebi yazan
  bir "Yeniden dene" kartı çıkar.
- O anahtar tarayıcıya gittiği için mutlaka kısıtlanmalı: *Uygulama kısıtı* →
  HTTP yönlendirenler (üretim alan adınız ve `localhost`), *API kısıtı* →
  yalnızca Map Tiles API.

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
- **Konumun hata payı:** tarayıcı her ölçümle birlikte bir doğruluk yarıçapı
  veriyor — telefonun GPS'inde ~10 m, masaüstünde ya da VPN arkasında
  Wi-Fi/IP tahmininde kilometreler. İkisini de aynı kesinlikte nokta çizmek
  yalan oluyordu: kurye kendini bambaşka bir yerde görüp "konum yanlış"
  diyordu. Artık pay 25 m'yi geçince imlecin çevresine yeşil bir çember
  çiziliyor (`cemberNoktalari`, coğrafi çokgen — yakınlaştırınca da eğik
  haritada da metre olarak doğru), 300 m'yi geçince de payı yazan bir uyarı
  çıkıyor. 500 m'den kötü konum `kurye_konumlari` tablosuna hiç yazılmıyor:
  diğer kuryeye yanlış yer göstermektense hiç göstermemek yeğ.
- **Konum imleci:** beyaz halkalı kırmızı nokta ve yön konisi. Koni haritayla
  birlikte döner (`rotationAlignment: map`), eğimde yere yatar; yön bilinmiyorsa
  gizlenir.
- **Pin renkleri:** kırmızı = bekliyor, turuncu = hazırlanıyor, siyah = yolda,
  yeşil = teslim. Bekleyen ve yoldaki teslimatlar nabız atar.
- **İptal edilen sipariş teslimat sayılmaz:** ne sorgudan gelir ne listede
  çizilir. Kapanmış kayıt listede kalınca kurye onu da gezilecek bir durak
  sanıyordu.
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
  dokunuşla harici haritada da açabilir. Seçenekler süreye göre sıralanır;
  varsayılan seçim her zaman en hızlısıdır. Sürüşte kurye rotadan 50 m'den
  fazla saparsa (iki iyi doğruluklu GPS okuması üst üste) bulunduğu yerden
  hedefe en hızlı rota otomatik yeniden hesaplanır ve sesle bildirilir.
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

Adres çözümleme `/api/geokod` ile sunucuda yapılır; ayrıntısı yukarıdaki
"Adres çözümleme ve harita zemini" bölümünde.

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

### Haritadan ödeme

Teslimat, abonelik ve sepet pinlerine dokununca pinin üstünde bir balon
açılıyor: müşteri, adres, tutar ve **ödeme satırı**.

- Teslimat kapatılmışsa "Nakit ile alındı" (yeşil) ya da "Ödeme alınmadı ·
  <kişi>" (turuncu).
- Kapatılmamışsa planlanan yöntem ve doğrudan **Ödeme al** düğmesi — teslim
  ekranını listeye uğramadan açıyor.
- Abonelikte o günün siparişi varsa onun ödeme durumu gösteriliyor; yoksa
  günler ve teslim saati.
- Sepette "açık sepet, henüz sipariş değil".

Balon MapLibre işaretçisine bağlı, içeriği React portal ile basılıyor; harita
kaydırılınca pinin üstünde kalıyor. Boş alana dokunmak kapatıyor.

Kuryenin kendi imleci **açık yeşil**: teslimat pinleri kırmızı-siyah
ailesinden geldiği için "ben neredeyim" bir bakışta ayrılıyor.

### Sepetin amacı

Sepet, müşteri hâlâ eklemeye devam ederken açık duran kayıt; sipariş ise yola
çıkacak olan. İkisi arasındaki tek geçiş **Siparişe çevir**: sepet kapanır
(`durum = siparise_donustu`), tutarı bugünün teslimatına taşınır ve bağ
`siparisler.sepet_id` üzerinden korunur. Düğme hem harita balonunda hem satır
menüsünde.

### Uzun basış

Haritada bir pine basılı tutmak (mobilde uzun dokunuş, masaüstünde fareyi
basılı tutma) teslimatı **teslim edildi** olarak işaretler ve pin yeşile döner.
Parmağı çekip **aynı pine tekrar uzun basmak işareti kaldırır**: sipariş eski
durumuna, pin de eski rengine (çoğunlukla kırmızı "bekliyor") döner. Bildirimde
ayrıca 6 saniyelik **Geri al** çıkar. Abonelik pininde o günün siparişi
işaretlenir.

Teslim edilenler katmanı kapalıysa kendiliğinden açılır; yoksa yeşile dönen pin
gözden kaybolur ve tekrar basıp geri almak mümkün olmazdı. Katmanı istediğin
zaman katman panelinden kapatabilirsin.

Parmak 8 pikselden fazla kayarsa bu bir sürüklemedir, uzun basış iptal olur.
Uzun basıştan sonra gelen `click` yutulur; yoksa hem teslim işaretlenir hem
balon açılırdı.

### Uzun listeler

Defter yüklendikten sonra abonelik listesi binleri bulabiliyor. Liste ve
harita buna göre ayarlı:

- Abonelik sorgusu sayfa sayfa okuyor. PostgREST tek istekte en çok 1000 satır
  döndürüyor ve `.limit()` bu tavanı yükseltmiyor: liste 1216 abonenin 1000'ini
  gösteriyordu. `sayfalayarakGetir` 1000'lik dilimlerle `range` atıyor, sabit
  sıra (`created_at`, `id`) iki dilim arasında kayıt atlanmasını önlüyor.
  Haritadaki pinler de aynı listeden besleniyor.
- Abonelikler ve sepetler sekmesinde ad, telefon ya da adresle arayan bir kutu
  var. Ekranda en fazla 100 satır çiziliyor, üstü aramayla bulunuyor.
- Abonelik ve sepet satırlarında Motion'ın `layout` animasyonu yok: 1215
  satırda telefonda sekme geçişini 6 saniyeye çıkarıyordu, kaldırınca 0,9
  saniyeye indi (4x kısılmış işlemcide, 4 kayıtlı hâlle kıyaslanarak ölçüldü).
- Abonelik satırında müşterinin adresi yazıyor: defterden gelen abonelerin
  çoğunda başlık aynı ("Abonelik"), kurye kişiyi adresinden tanıyor. Teslim
  saatinin yanında telefonu da var — defterin `TEL` sütunundan geliyor.
- `/onizleme?abonelik=1215` gerçek hacmi denemek için abone listesini çoğaltır.

### Satır işlemleri

Düzenleme kartında **Telefon** alanı var: telefon aboneliğin değil müşterinin
alanı olduğu için `musteriler` tablosuna yazılıyor, kayıt sorgusundan önce
kaydediliyor ki dönen satır yeni numarayla gelsin. Üç kayıt türünde de çıkıyor.

Teslimat, abonelik ve sepet satırlarının sağındaki **⋯** düğmesi düzenleme,
konum düzeltme ve silme sunuyor. Silme onay istiyor. Teslim edilmiş sipariş
silinemez — tahsilat kaydı ona bağlı ve silinseydi kasa geçmişi de yok olurdu;
kural hem arayüzde hem RLS politikasında var.

### Adresleri haritaya oturt

Defterdeki adreslerin çoğu adres değil tarif: 1216 adresin 1118'inde sokak adı
bile geçmiyor. Yazılanlar kuryenin kafasındaki işaretler — `SAKLI BAHÇE-2 E
BLOK D:3`, `DAMLA ECZANE ÜSTÜ DAİRE-1`, `KEÇECİLERİN ORASI B A:D4`, hatta
`541 501 67 54 AKKENT VİLALARI NO:11` gibi başına telefon karışmış olanlar.
Bunları olduğu gibi Geocoding'e vermek işe yaramıyor: ya boş dönüyor ya da pin
Serdivan'ın merkezine düşüyor, ki bu konumsuzluktan beter.

**+ → Adresleri haritaya oturt** üç adım işletiyor:

1. **Ayıkla** (`/api/adres-zeka`, Claude Opus 5). Kırklı öbekler hâlinde
   gidiyor; site adı, blok, kat, daire, sokak ve araya karışmış telefon ayrı
   alanlara çıkıyor, aranacak temiz sorgu üretiliyor. Sorguya blok ve daire
   yazılmıyor — Geocoding'i bozuyorlar. Site adı aynı zamanda tekilleştiriliyor:
   defterde `CAGRI ELİT GARDEN`, `ÇAĞRI ELİT GARDEN` ve `ELİT GARDEN` aynı yer.
   Yapılandırılmış çıktı kullanılıyor, şema garanti; sistem istemi sabit
   tutulduğu için önbellekten okunuyor.
2. **Grupla ve ara.** Aynı yeri anlatanlar tek gruba düşüyor (`obekle`),
   site bir kez aranıyor, oradaki herkes aynı noktayı alıyor. Hem ucuz —
   Geocoding istek başına faturalı — hem tutarlı: aynı sitenin daireleri
   haritada birbirinden ayrı düşmüyor. Gruplama sadeleştirilmiş ada göre,
   üstüne bir harf uzaklıktakiler de birleştirilerek yapılıyor
   (`vilaları`/`villaları`); rakamlar birebir aynı olmak zorunda, yoksa
   `Emirgan 4` ile `Emirgan 6` aynı yer sanılırdı.
3. **Yaz ve raporla.** Marketten 25 km'den uzağa düşen sonuç reddediliyor —
   "Saklı Bahçe" adlı site Türkiye'nin her yerinde var. Kabul edilmeyenler ve
   hiç sorgu çıkmayanlar **elle konulacaklar** listesinde sebebiyle birlikte
   kalıyor.

İşlem yarıda kesilirse sorun olmuyor: yazılan konumlar yazılı kalıyor, yeniden
açınca kalanlarla devam ediliyor.

`ANTHROPIC_API_KEY` tanımlı değilse uç 503 dönüyor ve ekran bunu açıkça
söylüyor; uygulamanın kalanı etkilenmiyor. Bu uç bilerek geliştirme
listesinde değil — her çağrısı faturaya yazıldığı için geliştirmede bile
oturum istiyor. Bin iki yüz adresin Claude tarafı bir seferlik birkaç dolar.

### Excel'den toplu yükle

İki biçim tanınıyor; hangisi olduğu dosyadan anlaşılıyor ve önizlemede yazıyor.

**Abone defteri** — marketin elindeki defterin şekli, iki sayfa:

| Sayfa | Sütunlar |
| --- | --- |
| `SERVİS` | `ABONE NO`, müşteri adı (başlığı boş olabilir), `TEL`, `ADRES` — ayrıca `BİNA`, `KAT`, `DAİRE`, `TARİF`, `LAT`, `LNG` |
| `ÇİZELGE` | `ABONE NO`, `GÜN`, ürün sütunları (başlık ürün adı, hücre miktar), `SAAT`, `TUTAR`, `NOT` |

Her `SERVİS` satırı bir müşteri, bir adres ve bir **abonelik** açar —
defterdeki herkes abonedir. `ÇİZELGE` sayfasında satırı olanların aboneliği o
satırdaki gün ve miktarlarla kurulur; olmayanlarınki günü boş açılır. Günü boş
abonelik kendiliğinden sipariş üretmez (`abonelikBugunMu` haftalıkta günlere
bakar), markette teslim planı belli olunca gün işaretlemek yeter. Bir abonenin
çizelgede birden çok satırı varsa her satır ayrı abonelik olur; böylece aynı
kişinin pazartesi 3, perşembe 2 süt alması kaybolmaz. Gün adları kısaltmasıyla
da yazılabilir (`P.TESİ`, `P.TSİ`, `PERŞEMBE&P.TSİ`); `TOPLAM` satırı atlanır.
Ürün sütunundaki ad `urunler` tablosuyla eşleşirse abonelik kalemi olur,
eşleşmezse miktar aboneliğin notuna yazılır — bilgi kaybolmaz. Kalem
okunamadığında aboneliğin başlığı çizelge sayfasının adı oluyor, böylece
satırda "SÜT" yazıyor. `KAR` sütunu ürün sayılmaz; başlığı hiç olmayan sütun
da ürün değil serbest nottur — defterde "her hafta süt istiyor" ve bir telefon
numarası orada duruyor, numara müşterinin künyesine taşınır.

Numarası yazılmamış çizelge satırı bir öncekinin devamı sayılır: defterde
abonenin ikinci günü alt satıra (`PERŞEMBE&P.TSİ`), bazen de adedi bir satır
aşağı kaymış oluyor. Günler birleştirilir, adetler toplanır.

Çizelgede numara yerine ad yazılmışsa o da denenir. Hiç eşleşmeyen satır
artık düşmüyor: kişi çizelgedeki adıyla (`ERDİNÇ AMCA ALT KAT`) kendi müşterisi
olarak kaydedilir, adres alanına da aynı tarif yazılır. Bu tarif gerçek adres
olmadığı için geokodlamaya gönderilmez — arama sonucu alakasız bir noktaya
otururdu; market konumu elle düzeltir. Önizlemede kaç tanesinin böyle
kaydedileceği uyarı olarak çıkar. Adı boş bırakılmış abone `Abone 12` gibi
numarasıyla kaydedilir.

**Müşteri listesi** — tek sayfa, en az `Ad` ve `Adres` sütunu gerekir. Telefon,
Bina, Kat, Daire, Tarif, Lat, Lng ve Not isteğe bağlıdır. Başlıklar Türkçe
karakter, boşluk ve büyük/küçük harf farkını yok sayarak eşleşir ("Ad Soyad",
"Cep", "Açık Adres", "Enlem"/"Boylam" hepsi tanınır). `.csv` dosyaları hep bu
biçimde okunur.

Yükleme yarıda kesilirse dosyanın tamamı yeniden verilebilir: ad ve telefonun
rakamları eşleşen müşteri yeniden açılmaz. Mevcut kayıtta eksik ne varsa
tamamlanır — aboneliği yoksa kurulur, adresinin konumu yoksa aranır. Bitişte
kaç kişinin eklendiği, kaçının zaten kayıtlı olduğu ayrı ayrı yazar.

Dosya sunucuda çözümlenir (`src/lib/toplu.ts`), kayıt istemciden kuryenin
kendi oturumuyla atılır. Yükleme öncesi kaç müşteri, kaç abonelik kurulacağı
ve kaç satırın atlanacağı gösterilir. "Örnek dosyayı indir" abone defteri
biçiminde doldurulmuş bir `.xlsx` verir (`GET /api/toplu-musteri`).

Yükleme iki aşamalı. Önce kayıtlar yazılır, sonra dosyada koordinatı olmayan
adresler `/api/geokod` ile aranır ve bulunanların konumu kaydedilir — pinlerin
haritaya oturması için. Arama dörder istek paralel gider. İlk yanıt
Nominatim'den gelirse aşama orada durur ve "Google adres servisi devrede
değil" denir: yedek servis saniyede bir istek kabul ettiği için binlerce adres
saatler sürerdi ve site/blok adreslerini zaten çoğunlukla bulamaz. Kayıtlar
yerinde kalır, konum sonradan eklenebilir.

### Excel'e indir

Alt paneldeki **⤓** düğmesi açık sekmenin listesini Excel'e aktarır:
teslimatlar, abonelikler ve sepetler için ayrı ayrı. "Toplu seç" ile satırlar
işaretlenmişse yalnızca işaretliler, değilse listenin tamamı iner. Dosyayı
sunucu yazıyor (`POST /api/disa-aktar`, `src/lib/excel.ts`); exceljs istemci
paketine girmesin diye.

Abonelik çıktısı yukarıdaki **abone defteri biçiminde** yazılıyor: aynı dosya
indirilip Excel'de düzenlenip toplu yüklemeden geri verilebiliyor. Kapı
bilgisi ve koordinatlar da sütun olarak gittiği için gidiş-dönüşte kaybolmuyor.

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
gün listesi ve başlangıç–bitiş aralığı dikkate alınır.

Bir abonelik iki durumda atlanır: o güne zaten sipariş açılmışsa ya da
**önceki siparişi hâlâ teslim edilmemişse**. İkincisi olmadan teslim
edilmeyen sipariş kapanmadığı için her gün bir yenisi ekleniyordu ve kuryenin
listesinde aynı müşteri onlarca kez birikiyordu. Kurye siparişi teslim
ettiğinde ya da "teslim edilemedi" diye kapattığında sıradaki gün yeniden
üretilir. Yani bir aboneliğin aynı anda en fazla bir açık siparişi olur.

Market **07:30**'da açıldığı için cron
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

## Testler

```bash
npm test
```

`testler/testler.mts` tarayıcıya ihtiyaç duymayan her şeyi sınıyor: para/saat/
miktar biçimleri, gecikme ve açılış saati mantığı, ödeme yöntemi adları ve
`para_alinir` davranışı, adres normalleştirme adayları, haversine ve yerel rota
çözücü, navigasyon adım seçimi ve manevra çevirileri, CSV/XLSX ayrıştırma.
Node'un `--experimental-strip-types` kipiyle derlemeden çalışıyor;
`testler/ts-cozucu.mjs` uzantısız içe aktarmaları çözüyor.

Veritabanı tarafı (RLS altında müşteri/adres/teslimat/abonelik/sepet açma,
düzenleme, silme, ödeme alma ve alamama, sepetin siparişe dönmesi, vardiya,
muhasebe tablolarının kuryeye kapalı kalması) Supabase üzerinde kuryenin kendi
kimliği taklit edilerek sınanıyor; bu testler depoda durmuyor çünkü canlı
veritabanına yazıyorlar.

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
  su, sarı ana yollar; gece modunda lacivert arduvaz). Palet
  `src/lib/harita-stili.ts` içinde tek yerde duruyor; hem Google karolarının
  stil kuralları hem yedek OpenFreeMap stilinin boyaması oradan türetiliyor.
- OpenFreeMap'te trafik katmanı ve Street View yok.
- Açılışta 3 adet "Expected value to be of type number, but found null
  instead" uyarısı çıkıyor. Sebebi OpenFreeMap stilinin kendi 3B bina
  katmanı: ilk karolar biz katmanı düzeltmeden ayrıştırılıyor. Zararsız —
  sonraki karolar düzeltilmiş ifadeyi kullanıyor.
- Google Geocoding anahtarı tanımlı değilse adresler Nominatim ile aranır ve
  kapı numarası şaşabilir. Form bunu açıkça yazar; kurye haritadan düzeltir.
- Sesli tarif tarayıcının `speechSynthesis` desteğine bağlıdır. Cihazda
  Türkçe ses paketi yoksa sistem varsayılanı okur; hiç destek yoksa sessiz
  kalır, uygulama çalışmaya devam eder.
- Supabase'de "Leaked password protection" kapalı — Dashboard → Authentication
  → Policies bölümünden açmanız önerilir.
