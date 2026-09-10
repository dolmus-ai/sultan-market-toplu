import { bugununTarihi } from "./bicim";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Abonelik,
  AbonelikSikligi,
  Adres,
  Kurye,
  KuryeKonumu,
  Musteri,
  OdemeYontemiTanimi,
  Sepet,
  Siparis,
  Tahsilat,
  Urun,
  Vardiya,
} from "./tipler";

const SIPARIS_ALANLARI = `
  id, musteri_id, adres_id, kaynak, abonelik_id, kurye_id, durum, oncelik,
  planlanan_tarih, planlanan_saat, teslim_zamani, odeme_yontemi, tutar, notlar,
  basarisizlik_sebebi, basarisizlik_notu, deneme_sayisi, created_at,
  odeme_alindi, odeme_alinmayan_kisi, odeme_notu,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, kurye_notu, kapi_kodu, lat, lng, konum_dogrulandi ),
  kalemler:siparis_kalemleri (
    id, urun_id, miktar, birim_fiyat,
    urun:urunler ( id, ad, birim, emoji, fiyat )
  )
`;

const ABONELIK_ALANLARI = `
  id, musteri_id, adres_id, baslik, siklik, gunler, teslim_saati,
  baslangic, bitis, durum, tutar, notlar,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, kurye_notu, kapi_kodu, lat, lng, konum_dogrulandi ),
  kalemler:abonelik_kalemleri (
    id, miktar,
    urun:urunler ( id, ad, birim, emoji, fiyat )
  )
`;

const SEPET_ALANLARI = `
  id, musteri_id, adres_id, durum, tutar, updated_at,
  musteri:musteriler ( id, ad, telefon, notlar ),
  adres:adresler ( id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, kurye_notu, kapi_kodu, lat, lng, konum_dogrulandi ),
  kalemler:sepet_kalemleri ( id, miktar, urun:urunler ( fiyat ) )
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

/** Kuryenin açık vardiyası; yoksa null. */
export async function acikVardiyaGetir(
  db: SupabaseClient,
  kuryeId: string,
): Promise<Vardiya | null> {
  const { data } = await db
    .from("vardiyalar")
    .select("id, kurye_id, baslangic, bitis, durum, teslim_edilen_nakit, notlar")
    .eq("kurye_id", kuryeId)
    .eq("durum", "acik")
    .order("baslangic", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Vardiya) ?? null;
}

export async function vardiyaTahsilatlari(
  db: SupabaseClient,
  vardiyaId: string,
): Promise<Tahsilat[]> {
  const { data } = await db
    .from("tahsilatlar")
    .select("id, siparis_id, kurye_id, vardiya_id, tutar, yontem, created_at")
    .eq("vardiya_id", vardiyaId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Tahsilat[];
}

/** Vardiyada olan diğer kuryelerin son konumları. */
export async function kuryeKonumlariGetir(
  db: SupabaseClient,
  harici: string,
): Promise<(KuryeKonumu & { ad: string })[]> {
  const { data } = await db
    .from("kurye_konumlari")
    .select("kurye_id, lat, lng, yon, hiz, updated_at, kurye:kuryeler ( ad, vardiyada )")
    .neq("kurye_id", harici);

  type Satir = KuryeKonumu & { kurye: { ad: string; vardiyada: boolean } | null };
  return ((data ?? []) as unknown as Satir[])
    .filter((k) => k.kurye?.vardiyada)
    .map((k) => ({ ...k, ad: k.kurye?.ad ?? "Kurye" }));
}

export function sepetToplami(kalemler: { miktar: number; urun: { fiyat: number } | null }[]) {
  return kalemler.reduce((t, k) => t + k.miktar * (k.urun?.fiyat ?? 0), 0);
}

const ADRES_ALANLARI =
  "id, musteri_id, baslik, adres_metni, bina, kat, daire, tarif, kurye_notu, kapi_kodu, lat, lng, konum_dogrulandi";

/* ------------------------------------------------------------------ */
/* Ödeme yöntemleri                                                    */
/* ------------------------------------------------------------------ */

export async function odemeYontemleriGetir(
  db: SupabaseClient,
): Promise<OdemeYontemiTanimi[]> {
  const { data, error } = await db
    .from("odeme_yontemleri")
    .select("kod, ad, para_alinir, sira, aktif")
    .order("sira");
  if (error) throw error;
  return (data ?? []) as OdemeYontemiTanimi[];
}

/** Yöntem adından kod türetir: "Yemek kartı" → "yemek_karti". */
export function yontemKodu(ad: string): string {
  const harita: Record<string, string> = {
    "ç": "c",
    "ğ": "g",
    "ı": "i",
    "ö": "o",
    "ş": "s",
    "ü": "u",
  };
  return (
    ad
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (h) => harita[h] ?? h)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "yontem"
  );
}

export async function odemeYontemiEkle(
  db: SupabaseClient,
  ad: string,
  paraAlinir = true,
): Promise<OdemeYontemiTanimi> {
  const { data, error } = await db
    .from("odeme_yontemleri")
    .upsert(
      { kod: yontemKodu(ad), ad: ad.trim(), para_alinir: paraAlinir, aktif: true },
      { onConflict: "kod" },
    )
    .select("kod, ad, para_alinir, sira, aktif")
    .single();
  if (error) throw error;
  return data as OdemeYontemiTanimi;
}

/** Yöntemi listeden kaldırır — geçmiş kayıtlar bozulmasın diye silinmez, pasifleşir. */
export async function odemeYontemiKaldir(db: SupabaseClient, kod: string) {
  const { error } = await db
    .from("odeme_yontemleri")
    .update({ aktif: false })
    .eq("kod", kod);
  if (error) throw error;
}

export async function odemeYontemiAdlandir(
  db: SupabaseClient,
  kod: string,
  ad: string,
) {
  const { error } = await db
    .from("odeme_yontemleri")
    .update({ ad: ad.trim() })
    .eq("kod", kod);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Müşteri ve adres                                                    */
/* ------------------------------------------------------------------ */

export async function musterileriAra(
  db: SupabaseClient,
  arama: string,
): Promise<Musteri[]> {
  let sorgu = db
    .from("musteriler")
    .select("id, ad, telefon, notlar")
    .eq("aktif", true)
    .order("ad")
    .limit(30);
  const temiz = arama.trim();
  if (temiz) sorgu = sorgu.or(`ad.ilike.%${temiz}%,telefon.ilike.%${temiz}%`);
  const { data, error } = await sorgu;
  if (error) throw error;
  return (data ?? []) as Musteri[];
}

export async function musteriAdresleri(
  db: SupabaseClient,
  musteriId: string,
): Promise<Adres[]> {
  const { data, error } = await db
    .from("adresler")
    .select(ADRES_ALANLARI)
    .eq("musteri_id", musteriId)
    .order("varsayilan", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Adres[];
}

export type YeniMusteri = {
  ad: string;
  telefon?: string | null;
  notlar?: string | null;
};

export async function musteriEkle(
  db: SupabaseClient,
  musteri: YeniMusteri,
): Promise<Musteri> {
  const { data, error } = await db
    .from("musteriler")
    .insert({
      ad: musteri.ad.trim(),
      telefon: musteri.telefon?.trim() || null,
      notlar: musteri.notlar?.trim() || null,
    })
    .select("id, ad, telefon, notlar")
    .single();
  if (error) throw error;
  return data as Musteri;
}

export type YeniAdres = {
  musteri_id: string;
  baslik?: string;
  adres_metni: string;
  bina?: string | null;
  kat?: string | null;
  daire?: string | null;
  tarif?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export async function adresEkle(
  db: SupabaseClient,
  adres: YeniAdres,
): Promise<Adres> {
  const { data, error } = await db
    .from("adresler")
    .insert({
      musteri_id: adres.musteri_id,
      baslik: adres.baslik?.trim() || "Ev",
      adres_metni: adres.adres_metni.trim(),
      bina: adres.bina?.trim() || null,
      kat: adres.kat?.trim() || null,
      daire: adres.daire?.trim() || null,
      tarif: adres.tarif?.trim() || null,
      lat: adres.lat ?? null,
      lng: adres.lng ?? null,
      konum_dogrulandi: adres.lat != null && adres.lng != null,
    })
    .select(ADRES_ALANLARI)
    .single();
  if (error) throw error;
  return data as Adres;
}

/* ------------------------------------------------------------------ */
/* Teslimat / abonelik / sepet oluşturma                               */
/* ------------------------------------------------------------------ */

export async function siparisEkle(
  db: SupabaseClient,
  yeni: {
    musteri_id: string;
    adres_id: string;
    tutar: number;
    planlanan_tarih: string;
    planlanan_saat?: string | null;
    odeme_yontemi?: string | null;
    oncelik?: number;
    notlar?: string | null;
  },
): Promise<Siparis> {
  const { data, error } = await db
    .from("siparisler")
    .insert({
      musteri_id: yeni.musteri_id,
      adres_id: yeni.adres_id,
      kaynak: "manuel",
      durum: "bekliyor",
      tutar: yeni.tutar,
      planlanan_tarih: yeni.planlanan_tarih,
      planlanan_saat: yeni.planlanan_saat || null,
      odeme_yontemi: yeni.odeme_yontemi || null,
      oncelik: yeni.oncelik ?? 0,
      notlar: yeni.notlar?.trim() || null,
    })
    .select(SIPARIS_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Siparis;
}

export async function abonelikEkle(
  db: SupabaseClient,
  yeni: {
    musteri_id: string;
    adres_id: string;
    baslik: string;
    siklik: AbonelikSikligi;
    gunler: number[];
    teslim_saati: string;
    tutar: number;
    notlar?: string | null;
  },
): Promise<Abonelik> {
  const { data, error } = await db
    .from("abonelikler")
    .insert({
      musteri_id: yeni.musteri_id,
      adres_id: yeni.adres_id,
      baslik: yeni.baslik.trim() || "Abonelik",
      siklik: yeni.siklik,
      gunler: yeni.gunler,
      teslim_saati: yeni.teslim_saati,
      tutar: yeni.tutar,
      durum: "aktif",
      notlar: yeni.notlar?.trim() || null,
    })
    .select(ABONELIK_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Abonelik;
}

export async function sepetEkle(
  db: SupabaseClient,
  yeni: { musteri_id: string; adres_id: string | null; tutar: number },
): Promise<Sepet> {
  const { data, error } = await db
    .from("sepetler")
    .insert({
      musteri_id: yeni.musteri_id,
      adres_id: yeni.adres_id,
      durum: "acik",
      tutar: yeni.tutar,
    })
    .select(SEPET_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Sepet;
}

/** Kalem varsa kalemlerden, yoksa kayda yazılan sabit tutar. */
export function kayitTutari(kayit: {
  tutar?: number | null;
  kalemler?: { miktar: number; urun: { fiyat: number } | null }[] | null;
}): number {
  const kalem = sepetToplami(kayit.kalemler ?? []);
  return kalem > 0 ? kalem : (kayit.tutar ?? 0);
}

/* ------------------------------------------------------------------ */
/* Düzenleme ve silme                                                  */
/* ------------------------------------------------------------------ */

export async function siparisDuzenle(
  db: SupabaseClient,
  id: string,
  yama: {
    tutar?: number;
    planlanan_tarih?: string;
    planlanan_saat?: string | null;
    odeme_yontemi?: string | null;
    oncelik?: number;
    notlar?: string | null;
  },
): Promise<Siparis> {
  const { data, error } = await db
    .from("siparisler")
    .update(yama)
    .eq("id", id)
    .select(SIPARIS_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Siparis;
}

export async function abonelikDuzenle(
  db: SupabaseClient,
  id: string,
  yama: {
    baslik?: string;
    siklik?: AbonelikSikligi;
    gunler?: number[];
    teslim_saati?: string;
    tutar?: number;
    durum?: "aktif" | "duraklatildi" | "iptal";
    notlar?: string | null;
  },
): Promise<Abonelik> {
  const { data, error } = await db
    .from("abonelikler")
    .update(yama)
    .eq("id", id)
    .select(ABONELIK_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Abonelik;
}

export async function sepetDuzenle(
  db: SupabaseClient,
  id: string,
  yama: { tutar?: number; durum?: "acik" | "siparise_donustu" | "terk_edildi" },
): Promise<Sepet> {
  const { data, error } = await db
    .from("sepetler")
    .update({ ...yama, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SEPET_ALANLARI)
    .single();
  if (error) throw error;
  return data as unknown as Sepet;
}

/**
 * Teslim edilmiş sipariş silinemez: tahsilat kaydı ona bağlı ve silinseydi
 * kasa geçmişi de sessizce yok olurdu. RLS de aynı kuralı uyguluyor.
 */
export async function siparisSil(db: SupabaseClient, id: string) {
  const { error, count } = await db
    .from("siparisler")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("silinemedi");
}

export async function abonelikSil(db: SupabaseClient, id: string) {
  const { error, count } = await db
    .from("abonelikler")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("silinemedi");
}

export async function sepetSil(db: SupabaseClient, id: string) {
  const { error, count } = await db
    .from("sepetler")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("silinemedi");
}

/* ------------------------------------------------------------------ */
/* Adres konumu                                                        */
/* ------------------------------------------------------------------ */

export async function adresKonumuYaz(
  db: SupabaseClient,
  adresId: string,
  lat: number,
  lng: number,
) {
  const { error } = await db
    .from("adresler")
    .update({ lat, lng, konum_dogrulandi: true })
    .eq("id", adresId);
  if (error) throw error;
}

export type GeokodSonucu = { lat: number; lng: number; ad: string };

/** Adres metnini koordinata çevirir; bulunamazsa null döner. */
export async function adresiGeokodla(
  adres: string,
): Promise<GeokodSonucu | null> {
  try {
    const yanit = await fetch(`/api/geokod?adres=${encodeURIComponent(adres)}`);
    if (!yanit.ok) return null;
    return (await yanit.json()) as GeokodSonucu;
  } catch {
    return null;
  }
}

/**
 * Sepeti güne ait bir teslimata çevirir.
 *
 * Sepet "müşteri hâlâ topluyor" demek; sipariş "yola çıkacak" demek. Çevirme
 * ikisinin arasındaki tek geçiş: sepet kapanıyor, tutarı siparişe taşınıyor
 * ve bağ `siparisler.sepet_id` üzerinden korunuyor.
 */
export async function sepetiSiparise(
  db: SupabaseClient,
  sepet: Sepet,
  ek: { planlanan_saat?: string | null; odeme_yontemi?: string | null } = {},
): Promise<Siparis> {
  if (!sepet.adres_id) throw new Error("adres yok");

  const { data, error } = await db
    .from("siparisler")
    .insert({
      musteri_id: sepet.musteri_id,
      adres_id: sepet.adres_id,
      kaynak: "sepet",
      sepet_id: sepet.id,
      durum: "bekliyor",
      tutar: kayitTutari(sepet),
      planlanan_tarih: bugununTarihi(),
      planlanan_saat: ek.planlanan_saat ?? null,
      odeme_yontemi: ek.odeme_yontemi ?? null,
    })
    .select(SIPARIS_ALANLARI)
    .single();
  if (error) throw error;

  // Sipariş yazıldıktan sonra sepet kapanıyor; ters sırada olsa sipariş
  // yazılamadığında sepet boşuna kapanmış olurdu.
  const { error: sepetHatasi } = await db
    .from("sepetler")
    .update({ durum: "siparise_donustu", updated_at: new Date().toISOString() })
    .eq("id", sepet.id);
  if (sepetHatasi) throw sepetHatasi;

  return data as unknown as Siparis;
}
