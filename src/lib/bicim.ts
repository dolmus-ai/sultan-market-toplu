import { MARKET, acilisDakikasi } from "./market";
import type {
  BasarisizlikSebebi,
  OdemeYontemi,
  SiparisDurumu,
} from "./tipler";

const paraBicimi = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

export function para(tutar: number): string {
  return paraBicimi.format(tutar ?? 0);
}

export function saat(deger: string | null): string {
  if (!deger) return "—";
  return deger.slice(0, 5);
}

export function miktarYaz(miktar: number, birim: string): string {
  const sayi = Number.isInteger(miktar)
    ? String(miktar)
    : miktar.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return `${sayi} ${birim}`;
}

export const DURUM_ETIKET: Record<SiparisDurumu, string> = {
  bekliyor: "Bekliyor",
  hazirlaniyor: "Hazırlanıyor",
  yolda: "Yolda",
  teslim: "Teslim edildi",
  basarisiz: "Teslim edilemedi",
  iptal: "İptal",
};

export const SEBEP_ETIKET: Record<BasarisizlikSebebi, string> = {
  adreste_yok: "Adreste yok",
  kapi_acilmadi: "Kapı açılmadı",
  musteri_reddetti: "Müşteri teslim almadı",
  adres_yanlis: "Adres yanlış",
  odeme_yok: "Ödeme yapılmadı",
  diger: "Diğer",
};

/** Harita pinleri için durum rengi (aydınlık tema). */
export const DURUM_RENK: Record<SiparisDurumu, string> = {
  bekliyor: "#E30A17",
  hazirlaniyor: "#F59E0B",
  yolda: "#111114",
  teslim: "#16A34A",
  basarisiz: "#B45309",
  iptal: "#9CA3AF",
};

/** Karanlık haritada siyah pin kaybolduğu için ters çevrilmiş palet. */
export const DURUM_RENK_KARANLIK: Record<SiparisDurumu, string> = {
  ...DURUM_RENK,
  yolda: "#E9ECF1",
  iptal: "#6B7280",
};

export function haritaDurumRengi(karanlik: boolean) {
  return karanlik ? DURUM_RENK_KARANLIK : DURUM_RENK;
}

/**
 * Arayüz rozetleri için tema değişkenleri — CSS tarafında çevrildiği için
 * bileşenlere tema bilgisi taşımaya gerek kalmaz.
 */
export const DURUM_STIL: Record<
  SiparisDurumu,
  { background: string; color: string }
> = {
  bekliyor: {
    background: "var(--durum-bekliyor)",
    color: "var(--durum-bekliyor-yazi)",
  },
  hazirlaniyor: {
    background: "var(--durum-hazirlaniyor)",
    color: "var(--durum-hazirlaniyor-yazi)",
  },
  yolda: { background: "var(--durum-yolda)", color: "var(--durum-yolda-yazi)" },
  teslim: {
    background: "var(--durum-teslim)",
    color: "var(--durum-teslim-yazi)",
  },
  basarisiz: {
    background: "var(--durum-basarisiz)",
    color: "var(--durum-basarisiz-yazi)",
  },
  iptal: { background: "var(--durum-iptal)", color: "var(--durum-iptal-yazi)" },
};

export const ODEME_ETIKET: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  kredi_karti: "Kredi kartı",
  yemek_karti: "Yemek kartı",
  veresiye: "Veresiye",
  online: "Online ödendi",
};

export const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function gunlerYaz(gunler: number[]): string {
  if (!gunler?.length) return "—";
  if (gunler.length === 7) return "Her gün";
  return [...gunler]
    .sort((a, b) => a - b)
    .map((g) => GUN_KISA[g - 1] ?? "?")
    .join(", ");
}

/** ISO haftanın günü: Pazartesi = 1 … Pazar = 7. */
export function haftaninGunu(tarih = new Date()): number {
  return ((tarih.getDay() + 6) % 7) + 1;
}

/** "en-CA" biçimi zaten YYYY-MM-DD veriyor. */
const gunBicimi = new Intl.DateTimeFormat("en-CA", {
  timeZone: MARKET.saatDilimi,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Marketin saat dilimine göre bugünün tarihi — sunucuda da doğru sonuç verir. */
export function bugununTarihi(): string {
  return gunBicimi.format(new Date());
}

/**
 * Planlanan saate göre gecikme (dakika). Negatifse henüz vakti gelmemiş.
 * Market açılmadan önce hiçbir teslimat gecikmiş sayılmaz — kurye zaten
 * ürünleri alamaz. Saat tanımsızsa null.
 */
export function gecikmeDk(
  planlananSaat: string | null,
  tarih: string,
): number | null {
  if (!planlananSaat) return null;
  const bugun = bugununTarihi();
  if (tarih > bugun) return null;

  const simdi = new Date();
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  if (simdiDk < acilisDakikasi()) return null;

  if (tarih < bugun) return 24 * 60;

  const [sa, dk] = planlananSaat.split(":").map(Number);
  return simdiDk - (sa * 60 + dk);
}

/** Gecikmeyi kısa ve okunur yazar: "12 dk", "2 sa", "dün". */
export function gecikmeYaz(dakika: number): string {
  if (dakika >= 20 * 60) return "dünden";
  if (dakika >= 90) return `${Math.round(dakika / 60)} sa`;
  return `${Math.round(dakika)} dk`;
}

/**
 * Aynı binadaki teslimatları bir arada saymak için anahtar.
 * Kapı numarası varsa sokak+numara; yoksa koordinat ızgarası (~11 m).
 */
export function binaAnahtari(
  a: {
    adres_metni: string;
    bina?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null,
): string {
  if (!a) return "";
  const yol = a.adres_metni.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
  if (a.bina) return `${yol}|${a.bina}`;
  if (a.lat != null && a.lng != null)
    return `${a.lat.toFixed(4)}|${a.lng.toFixed(4)}`;
  return yol;
}

/** Adresi tek satırda toparlar. */
export function adresYaz(a: {
  adres_metni: string;
  bina?: string | null;
  kat?: string | null;
  daire?: string | null;
}): string {
  const ek = [
    a.bina ? `No ${a.bina}` : null,
    a.kat ? `Kat ${a.kat}` : null,
    a.daire ? `D. ${a.daire}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return ek ? `${a.adres_metni} · ${ek}` : a.adres_metni;
}
