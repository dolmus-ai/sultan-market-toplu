import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Teslim fotoğrafı.
 *
 * Kurye kapıya bıraktığı ya da teslim ettiği siparişin fotoğrafını çekiyor;
 * fotoğraf `teslim-fotolari` deposunda `<sipariş kimliği>/<zaman>.jpg`
 * yolunda duruyor. Yol sipariş kimliğinden türediği için siparişler
 * tablosunda ayrı bir sütun gerekmiyor: fotoğraf o klasörü listeleyerek
 * bulunuyor. Depo özel; görüntülemek için kısa ömürlü imzalı bağlantı açılıyor.
 */
export const FOTO_DEPOSU = "teslim-fotolari";

/** Uzun kenar bu pikseli geçmesin: telefon fotoğrafı 4-8 MB, bu ~150-300 KB. */
const AZAMI_KENAR = 1280;

/** Fotoğrafı küçültüp JPEG'e çevirir; tuval yoksa dosyanın kendisini döner. */
export async function fotoKucult(dosya: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(dosya);
    const oran = Math.min(1, AZAMI_KENAR / Math.max(bitmap.width, bitmap.height));
    const en = Math.round(bitmap.width * oran);
    const boy = Math.round(bitmap.height * oran);
    const tuval = document.createElement("canvas");
    tuval.width = en;
    tuval.height = boy;
    const ctx = tuval.getContext("2d");
    if (!ctx) return dosya;
    ctx.drawImage(bitmap, 0, 0, en, boy);
    bitmap.close();
    const blob = await new Promise<Blob | null>((coz) =>
      tuval.toBlob(coz, "image/jpeg", 0.72),
    );
    return blob ?? dosya;
  } catch {
    return dosya;
  }
}

/** Fotoğrafı siparişin klasörüne yükler. */
export async function teslimFotosuYukle(
  db: SupabaseClient,
  siparisId: string,
  foto: Blob,
): Promise<void> {
  const yol = `${siparisId}/${Date.now()}.jpg`;
  const { error } = await db.storage
    .from(FOTO_DEPOSU)
    .upload(yol, foto, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
}

/** Siparişin en son teslim fotoğrafı için imzalı bağlantı; yoksa null. */
export async function teslimFotosuBagla(
  db: SupabaseClient,
  siparisId: string,
): Promise<string | null> {
  const { data, error } = await db.storage
    .from(FOTO_DEPOSU)
    .list(siparisId, { limit: 20, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  const son = data?.find((d) => d.name.endsWith(".jpg"));
  if (!son) return null;
  const { data: imza, error: imzaHata } = await db.storage
    .from(FOTO_DEPOSU)
    .createSignedUrl(`${siparisId}/${son.name}`, 60 * 30);
  if (imzaHata) throw imzaHata;
  return imza?.signedUrl ?? null;
}
