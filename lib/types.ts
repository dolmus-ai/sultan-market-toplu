export type CariTip = "alici" | "satici";
export type HareketTur = "fatura" | "veresiye" | "yapilan_odeme" | "gelen_odeme";
export type OdemeYontemi = "nakit" | "kredi_karti" | "yemek_karti";

export type Profile = {
  id: string;
  full_name: string;
  role: "sahip" | "personel";
  aktif: boolean;
  created_at: string;
};

export type Cari = {
  id: string;
  tip: CariTip;
  unvan: string;
  telefon: string | null;
  adres: string | null;
  aktif: boolean;
  acilis_tarihi: string;
  created_at: string;
};

export type CariOzet = Cari & {
  toplam_giris: number;
  toplam_odeme: number;
  kalan_bakiye: number;
};

export type Hareket = {
  id: string;
  cari_id: string;
  tur: HareketTur;
  tutar: number;
  odeme_yontemi: OdemeYontemi | null;
  aciklama: string | null;
  tarih: string;
  belge_yolu: string | null;
  created_by: string | null;
  created_at: string;
  cariler?: { unvan: string; tip: CariTip } | null;
  profiles?: { full_name: string } | null;
};
