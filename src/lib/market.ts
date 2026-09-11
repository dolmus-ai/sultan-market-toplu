import { ortamMetni, ortamSayisi } from "./ortam";
import type { Nokta } from "./tipler";

/** Sultan Market — kuryenin çıkış noktası (depo). */
export const MARKET = {
  ad: ortamMetni(
    "NEXT_PUBLIC_MARKET_AD",
    process.env.NEXT_PUBLIC_MARKET_AD,
    "Sultan Market",
  ),
  adres: ortamMetni(
    "NEXT_PUBLIC_MARKET_ADRES",
    process.env.NEXT_PUBLIC_MARKET_ADRES,
    "Arabacıalanı Mah. Orhan Gazi Sk. No:19, 54050 Serdivan/Sakarya",
  ),
  nokta: {
    lat: ortamSayisi(
      "NEXT_PUBLIC_MARKET_LAT",
      process.env.NEXT_PUBLIC_MARKET_LAT,
      40.7784889,
    ),
    lng: ortamSayisi(
      "NEXT_PUBLIC_MARKET_LNG",
      process.env.NEXT_PUBLIC_MARKET_LNG,
      30.3518378,
    ),
  } as Nokta,
  /** "07:30" — market açılmadan hiçbir teslimat gecikmiş sayılmaz. */
  acilis: ortamMetni(
    "NEXT_PUBLIC_MARKET_ACILIS",
    process.env.NEXT_PUBLIC_MARKET_ACILIS,
    "07:30",
  ),
  /**
   * Marketin saat dilimi. Sunucu Vercel'de UTC çalıştığı için "bugün"ün
   * hangi gün olduğu buradan hesaplanıyor; yoksa gece yarısı ile sabah 03:00
   * arasında kuryeye bir önceki günün siparişleri düşerdi.
   */
  saatDilimi: ortamMetni(
    "NEXT_PUBLIC_MARKET_SAAT_DILIMI",
    process.env.NEXT_PUBLIC_MARKET_SAAT_DILIMI,
    "Europe/Istanbul",
  ),
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
