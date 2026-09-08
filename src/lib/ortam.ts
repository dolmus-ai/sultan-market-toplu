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

/** Harita stilinin adresi. */
export const HARITA_STILI = ortamMetni(
  "NEXT_PUBLIC_HARITA_STILI",
  process.env.NEXT_PUBLIC_HARITA_STILI,
  "https://tiles.openfreemap.org/styles/liberty",
);

/** Haritanın açılış konumu — market çevresi. */
export const MERKEZ = {
  lat: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_LAT",
    process.env.NEXT_PUBLIC_MERKEZ_LAT,
    40.78067,
  ),
  lng: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_LNG",
    process.env.NEXT_PUBLIC_MERKEZ_LNG,
    30.35218,
  ),
  zoom: ortamSayisi(
    "NEXT_PUBLIC_MERKEZ_ZOOM",
    process.env.NEXT_PUBLIC_MERKEZ_ZOOM,
    14,
  ),
};
