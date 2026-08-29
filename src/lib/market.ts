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
};
