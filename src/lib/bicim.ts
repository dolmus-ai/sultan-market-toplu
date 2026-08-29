import type { OdemeYontemi, SiparisDurumu } from "./tipler";

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
  iptal: "İptal",
};

/** Harita pinleri ve rozetler için durum rengi. */
export const DURUM_RENK: Record<SiparisDurumu, string> = {
  bekliyor: "#E30A17",
  hazirlaniyor: "#F59E0B",
  yolda: "#111114",
  teslim: "#16A34A",
  iptal: "#9CA3AF",
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

export function bugununTarihi(): string {
  const t = new Date();
  const ay = String(t.getMonth() + 1).padStart(2, "0");
  const gun = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${ay}-${gun}`;
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
