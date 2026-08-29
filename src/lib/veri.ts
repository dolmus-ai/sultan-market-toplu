import type { SupabaseClient } from "@supabase/supabase-js";
import type { Abonelik, Kurye, Sepet, Siparis, Urun } from "./tipler";

const SIPARIS_ALANLARI = `
  id, musteri_id, adres_id, kaynak, abonelik_id, kurye_id, durum, oncelik,
  planlanan_tarih, planlanan_saat, teslim_zamani, odeme_yontemi, tutar, notlar, created_at,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, lat, lng, konum_dogrulandi ),
  kalemler:siparis_kalemleri (
    id, urun_id, miktar, birim_fiyat,
    urun:urunler ( id, ad, birim, emoji, fiyat )
  )
`;

const ABONELIK_ALANLARI = `
  id, musteri_id, adres_id, baslik, siklik, gunler, teslim_saati,
  baslangic, bitis, durum, notlar,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, lat, lng, konum_dogrulandi ),
  kalemler:abonelik_kalemleri (
    id, miktar,
    urun:urunler ( id, ad, birim, emoji, fiyat )
  )
`;

const SEPET_ALANLARI = `
  id, musteri_id, adres_id, durum, updated_at,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, lat, lng, konum_dogrulandi ),
  kalemler:sepet_kalemleri (
    id, miktar,
    urun:urunler ( id, ad, birim, emoji, fiyat )
  )
`;

/** Bugünün ve devam eden tüm teslimatları. */
export async function siparisleriGetir(
  db: SupabaseClient,
  tarih: string,
): Promise<Siparis[]> {
  const { data, error } = await db
    .from("siparisler")
    .select(SIPARIS_ALANLARI)
    .or(
      `planlanan_tarih.eq.${tarih},durum.in.(bekliyor,hazirlaniyor,yolda)`,
    )
    .order("oncelik", { ascending: false })
    .order("planlanan_saat", { ascending: true, nullsFirst: false })
    .limit(400);

  if (error) throw error;
  return (data ?? []) as unknown as Siparis[];
}

export async function abonelikleriGetir(
  db: SupabaseClient,
): Promise<Abonelik[]> {
  const { data, error } = await db
    .from("abonelikler")
    .select(ABONELIK_ALANLARI)
    .eq("durum", "aktif")
    .limit(400);

  if (error) throw error;
  return (data ?? []) as unknown as Abonelik[];
}

export async function sepetleriGetir(db: SupabaseClient): Promise<Sepet[]> {
  const { data, error } = await db
    .from("sepetler")
    .select(SEPET_ALANLARI)
    .eq("durum", "acik")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as unknown as Sepet[];
}

export async function urunleriGetir(db: SupabaseClient): Promise<Urun[]> {
  const { data, error } = await db
    .from("urunler")
    .select("id, ad, kategori, birim, fiyat, emoji, gorsel_url, stok, aktif")
    .eq("aktif", true)
    .order("kategori")
    .order("ad");

  if (error) throw error;
  return (data ?? []) as Urun[];
}

export async function kuryeGetir(
  db: SupabaseClient,
  kullaniciId: string,
): Promise<Kurye | null> {
  const { data } = await db
    .from("kuryeler")
    .select("id, ad, telefon, arac_tipi, plaka, vardiyada")
    .eq("id", kullaniciId)
    .maybeSingle();
  return (data as Kurye) ?? null;
}

/** Aboneliğin verilen günde teslimatı var mı? */
export function abonelikBugunMu(abonelik: Abonelik, tarih: Date): boolean {
  if (abonelik.durum !== "aktif") return false;

  const gun = ((tarih.getDay() + 6) % 7) + 1;
  const baslangic = new Date(`${abonelik.baslangic}T00:00:00`);
  if (tarih < baslangic) return false;
  if (abonelik.bitis && tarih > new Date(`${abonelik.bitis}T23:59:59`))
    return false;

  const gunFarki = Math.floor(
    (tarih.getTime() - baslangic.getTime()) / 86_400_000,
  );

  switch (abonelik.siklik) {
    case "gunluk":
      return true;
    case "haftalik":
      return abonelik.gunler.includes(gun);
    case "iki_haftalik":
      return abonelik.gunler.includes(gun) && Math.floor(gunFarki / 7) % 2 === 0;
    case "aylik":
      return tarih.getDate() === baslangic.getDate();
    default:
      return false;
  }
}

export function sepetToplami(kalemler: { miktar: number; urun: { fiyat: number } | null }[]) {
  return kalemler.reduce((t, k) => t + k.miktar * (k.urun?.fiyat ?? 0), 0);
}
