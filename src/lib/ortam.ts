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

function ortam(ad: string, deger: string | undefined, varsayilan: string) {
  const temiz = deger?.trim();
  if (temiz) return temiz;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[ortam] ${ad} tanımsız, varsayılan kullanılıyor.`);
  }
  return varsayilan;
}

export const SUPABASE_URL = ortam(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "https://lgomzbderctwrbwlrjrw.supabase.co",
);

export const SUPABASE_ANON_KEY = ortam(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "sb_publishable_Ut3ar40QqwVY2GqwgpiHLg_xpxpTcmo",
);

/** Rota/navigasyon isteklerinin gittiği OSRM sunucusu (yalnızca sunucu tarafı). */
export const OSRM_SUNUCU = ortam(
  "OSRM_SUNUCU",
  process.env.OSRM_SUNUCU,
  "https://router.project-osrm.org",
);
