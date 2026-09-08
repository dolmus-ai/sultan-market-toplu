import type { Nokta } from "./tipler";

/** Sultan Market — kuryenin çıkış noktası (depo). */
export const MARKET = {
  ad: process.env.NEXT_PUBLIC_MARKET_AD ?? "Sultan Market",
  adres:
    process.env.NEXT_PUBLIC_MARKET_ADRES ??
    "Arabacıalanı Mah. Orhan Gazi Sk. No:19, 54050 Serdivan/Sakarya",
  nokta: {
    lat: Number(process.env.NEXT_PUBLIC_MARKET_LAT ?? 40.78067),
    lng: Number(process.env.NEXT_PUBLIC_MARKET_LNG ?? 30.35218),
  } as Nokta,
  /** "07:30" — market açılmadan hiçbir teslimat gecikmiş sayılmaz. */
  acilis: process.env.NEXT_PUBLIC_MARKET_ACILIS ?? "07:30",
  /**
   * Marketin saat dilimi. Sunucu Vercel'de UTC çalıştığı için "bugün"ün
   * hangi gün olduğu buradan hesaplanıyor; yoksa gece yarısı ile sabah 03:00
   * arasında kuryeye bir önceki günün siparişleri düşerdi.
   */
  saatDilimi: process.env.NEXT_PUBLIC_MARKET_SAAT_DILIMI ?? "Europe/Istanbul",
};

/** Açılış saati gün içinde kaçıncı dakika. */
export function acilisDakikasi(): number {
  const [sa, dk] = MARKET.acilis.split(":").map(Number);
  return (sa || 0) * 60 + (dk || 0);
}

/** Market şu an açık mı? */
export function marketAcikMi(): boolean {
  const s = new Date();
  return s.getHours() * 60 + s.getMinutes() >= acilisDakikasi();
}
