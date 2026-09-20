/**
 * Ortam değişkenleri ve varsayılanları.
 *
 * Buradaki değerlerin hepsi herkese açık: Supabase publishable anahtarı zaten
 * istemciye gönderiliyor ve erişim RLS ile korunuyor, OSRM adresi de gizli
 * değil. Varsayılanların kodda durmasının sebebi, barındırma tarafında ortam
 * değişkeni tanımlanmadığında uygulamanın komple 500 vermesini engellemek:
 * Vercel depodaki `.env` dosyasını okumaz, yalnızca panelde tanımlı
 * değişkenleri geçer. Panelde aynı adla bir değer tanımlanırsa bunlar ezilir.
 */

/**
 * Metin değeri okur. Boş string de tanımsız sayılır: barındırma tarafında
 * değişken adı tanımlanıp değeri boş bırakıldığında `??` yedeği devreye
 * sokmuyor, uygulama boş adresle çalışmaya kalkıyordu.
 */
export function ortamMetni(
  ad: string,
  deger: string | undefined,
  varsayilan: string,
): string {
  const temiz = deger?.trim();
  if (temiz) return temiz;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[ortam] ${ad} boş, varsayılan kullanılıyor.`);
  }
  return varsayilan;
}

/** Sayısal değer okur; boş ya da sayıya çevrilemeyen her şey varsayılana düşer. */
export function ortamSayisi(
  ad: string,
  deger: string | undefined,
  varsayilan: number,
): number {
  const temiz = deger?.trim();
  const sonuc = temiz ? Number(temiz) : Number.NaN;
  if (Number.isFinite(sonuc)) return sonuc;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[ortam] ${ad} sayı değil, varsayılan kullanılıyor.`);
  }
  return varsayilan;
}

export const SUPABASE_URL = ortamMetni(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "https://lgomzbderctwrbwlrjrw.supabase.co",
);

export const SUPABASE_ANON_KEY = ortamMetni(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "sb_publishable_Ut3ar40QqwVY2GqwgpiHLg_xpxpTcmo",
);

/** Rota/navigasyon isteklerinin gittiği OSRM sunucusu (yalnızca sunucu tarafı). */
export const OSRM_SUNUCU = ortamMetni(
  "OSRM_SUNUCU",
  process.env.OSRM_SUNUCU,
  "https://router.project-osrm.org",
);

/**
 * Google Map Tiles API anahtarı — **isteğe bağlı, varsayılan olarak kapalı.**
 *
 * Harita zemini OpenFreeMap vektör karolarıyla çiziliyor: ücretsiz, sınırsız
 * ve anahtarsız. Google karoları karo başına faturalanıyor ve her kaydırma
 * onlarca karo istediği için aylık ücretsiz hakkı hızla tüketiyor; kazanç ise
 * yalnızca zeminin görünümü, adres doğruluğuyla ilgisi yok. Bu yüzden boş
 * bırakılıyor. Doldurulursa zemin Google karolarına geçer; o durumda Google
 * Cloud tarafında HTTP yönlendiren (alan adı) ve "Map Tiles API" kısıtı
 * konulmalı, çünkü anahtar istemciye gidiyor.
 */
export const GOOGLE_HARITA_ANAHTARI =
  process.env.NEXT_PUBLIC_GOOGLE_HARITA_ANAHTARI?.trim() ?? "";

/**
 * Adres çözümleme (Google Geocoding API) için **sunucu** anahtarı.
 *
 * Harita anahtarından bilerek ayrı: bu istek Vercel sunucusundan çıkıyor,
 * tarayıcı yönlendireni yok. Google Cloud'da uygulama kısıtlaması "Yok",
 * API kısıtlaması yalnızca Geocoding API olmalı. Boşsa adresler
 * OpenStreetMap/Nominatim ile aranır; orada kapı numarası verisi seyrek
 * olduğu için pin sokak ortasına düşebilir.
 */
export const GOOGLE_GEOKOD_ANAHTARI = (() => {
  const temiz = process.env.GOOGLE_GEOKOD_ANAHTARI?.trim();
  if (temiz) return temiz;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[ortam] GOOGLE_GEOKOD_ANAHTARI boş, adresler Nominatim ile aranacak.",
    );
  }
  return "";
})();

/**
 * Claude API anahtarı — defterdeki tarif adresleri çözmek için.
 *
 * Market defterinde adreslerin çoğu tarif: "KEÇECİLERİN ORASI B A:D4",
 * "TERAS PARK VİLALARIN ARKASINDAKİ PEMBE MÜSTAKİL". Geocoding bunları
 * olduğu gibi aratınca ya bir şey bulamıyor ya da ilçe merkezine düşüyor.
 * Claude önce tarifi ayıklıyor — site adı, blok, daire ayrı ayrı — sonra
 * aranacak temiz sorguyu üretiyor; Geocoding'e o gidiyor.
 *
 * Sunucu anahtarı, tarayıcıya gitmiyor. Boşsa özellik kapalı kalıyor ve
 * uygulama bunu açıkça söylüyor; başka hiçbir yeri etkilemiyor.
 */
export const CLAUDE_ANAHTARI = (() => {
  const temiz = process.env.ANTHROPIC_API_KEY?.trim();
  if (temiz) return temiz;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[ortam] ANTHROPIC_API_KEY boş, adres çözümleme kapalı kalacak.",
    );
  }
  return "";
})();

/** Harita zemininin stil adresi (varsayılan: OpenFreeMap Liberty). */
export const HARITA_STILI = ortamMetni(
  "NEXT_PUBLIC_HARITA_STILI",
  process.env.NEXT_PUBLIC_HARITA_STILI,
  "https://tiles.openfreemap.org/styles/liberty",
);

/**
 * 3B bina katmanını besleyen vektör karo kaynağı (TileJSON adresi). Google
 * 2B karoları düz resim olduğu için bina yükseklikleri buradan geliyor;
 * boş bırakılırsa 3B bina katmanı hiç kurulmaz.
 */
export const BINA_KARO_KAYNAGI = ortamMetni(
  "NEXT_PUBLIC_BINA_KARO_KAYNAGI",
  process.env.NEXT_PUBLIC_BINA_KARO_KAYNAGI,
  "https://tiles.openfreemap.org/planet",
);

/** Haritanın açılış konumu — market çevresi. */
export const MERKEZ = {
  lat: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_LAT",
    process.env.NEXT_PUBLIC_MERKEZ_LAT,
    40.7784889,
  ),
  lng: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_LNG",
    process.env.NEXT_PUBLIC_MERKEZ_LNG,
    30.3518378,
  ),
  zoom: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_ZOOM",
    process.env.NEXT_PUBLIC_MERKEZ_ZOOM,
    14,
  ),
};
