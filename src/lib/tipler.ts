export type SiparisDurumu =
  | "bekliyor"
  | "hazirlaniyor"
  | "yolda"
  | "teslim"
  | "basarisiz"
  | "iptal";

export type BasarisizlikSebebi =
  | "adreste_yok"
  | "kapi_acilmadi"
  | "musteri_reddetti"
  | "adres_yanlis"
  | "odeme_yok"
  | "diger";

export type OdemeYontemi =
  | "nakit"
  | "kredi_karti"
  | "yemek_karti"
  | "veresiye"
  | "online";

export type AbonelikSikligi = "gunluk" | "haftalik" | "iki_haftalik" | "aylik";

export type Urun = {
  id: string;
  ad: string;
  kategori: string;
  birim: string;
  fiyat: number;
  emoji: string | null;
  gorsel_url: string | null;
  stok: number;
  aktif: boolean;
};

export type Adres = {
  id: string;
  musteri_id: string;
  baslik: string;
  adres_metni: string;
  bina: string | null;
  kat: string | null;
  daire: string | null;
  tarif: string | null;
  /** Kuryenin sahadan yazdığı kapı bilgisi — sonraki teslimatta da görünür. */
  kurye_notu: string | null;
  kapi_kodu: string | null;
  lat: number | null;
  lng: number | null;
  konum_dogrulandi: boolean;
};

export type Musteri = {
  id: string;
  ad: string;
  telefon: string | null;
  notlar: string | null;
};

export type Kalem = {
  id: string;
  urun_id: string;
  miktar: number;
  birim_fiyat: number;
  urun: Pick<Urun, "id" | "ad" | "birim" | "emoji" | "fiyat"> | null;
};

export type Siparis = {
  id: string;
  musteri_id: string;
  adres_id: string;
  kaynak: "manuel" | "abonelik" | "sepet";
  abonelik_id: string | null;
  kurye_id: string | null;
  durum: SiparisDurumu;
  oncelik: number;
  planlanan_tarih: string;
  planlanan_saat: string | null;
  teslim_zamani: string | null;
  odeme_yontemi: OdemeYontemi | null;
  tutar: number;
  notlar: string | null;
  basarisizlik_sebebi: BasarisizlikSebebi | null;
  basarisizlik_notu: string | null;
  deneme_sayisi: number;
  created_at: string;
  musteri: Musteri | null;
  adres: Adres | null;
  kalemler: Kalem[];
};

export type AbonelikKalemi = {
  id: string;
  miktar: number;
  urun: Pick<Urun, "id" | "ad" | "birim" | "emoji" | "fiyat"> | null;
};

export type Abonelik = {
  id: string;
  musteri_id: string;
  adres_id: string;
  baslik: string;
  siklik: AbonelikSikligi;
  gunler: number[];
  teslim_saati: string;
  baslangic: string;
  bitis: string | null;
  durum: "aktif" | "duraklatildi" | "iptal";
  notlar: string | null;
  musteri: Musteri | null;
  adres: Adres | null;
  kalemler: AbonelikKalemi[];
};

export type Sepet = {
  id: string;
  musteri_id: string;
  adres_id: string | null;
  durum: "acik" | "siparise_donustu" | "terk_edildi";
  updated_at: string;
  musteri: Musteri | null;
  adres: Adres | null;
};

export type Kurye = {
  id: string;
  ad: string;
  telefon: string | null;
  arac_tipi: "yaya" | "bisiklet" | "motosiklet" | "otomobil" | "kamyonet";
  plaka: string | null;
  vardiyada: boolean;
};

export type Vardiya = {
  id: string;
  kurye_id: string;
  baslangic: string;
  bitis: string | null;
  durum: "acik" | "kapali";
  teslim_edilen_nakit: number | null;
  notlar: string | null;
};

export type Tahsilat = {
  id: string;
  siparis_id: string;
  kurye_id: string;
  vardiya_id: string | null;
  tutar: number;
  yontem: OdemeYontemi;
  created_at: string;
};

export type KuryeKonumu = {
  kurye_id: string;
  lat: number;
  lng: number;
  yon: number | null;
  hiz: number | null;
  updated_at: string;
};

export type Nokta = { lat: number; lng: number };

export type RotaSonucu = {
  /** Duraklar en kısa yol sırasına göre. */
  sira: string[];
  toplamMesafeM: number;
  toplamSureSn: number;
  /** [lng, lat] çiftleri — haritaya çizilecek çizgi. */
  geometri: [number, number][];
  motor: "osrm" | "yerel";
};
