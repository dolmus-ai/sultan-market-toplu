export type SiparisDurumu =
  | "bekliyor"
  | "hazirlaniyor"
  | "yolda"
  | "teslim"
  | "iptal";

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

export type SepetKalemi = {
  id: string;
  miktar: number;
  urun: Pick<Urun, "id" | "ad" | "birim" | "emoji" | "fiyat"> | null;
};

export type Sepet = {
  id: string;
  musteri_id: string;
  adres_id: string | null;
  durum: "acik" | "siparise_donustu" | "terk_edildi";
  updated_at: string;
  musteri: Musteri | null;
  adres: Adres | null;
  kalemler: SepetKalemi[];
};

export type Kurye = {
  id: string;
  ad: string;
  telefon: string | null;
  arac_tipi: "yaya" | "bisiklet" | "motosiklet" | "otomobil" | "kamyonet";
  plaka: string | null;
  vardiyada: boolean;
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
