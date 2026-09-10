import { NextResponse } from "next/server";

import { adresAdaylari } from "@/lib/adres";
import { MARKET } from "@/lib/market";

/**
 * Adres metnini koordinata çevirir (OpenStreetMap / Nominatim).
 *
 * Sunucudan çağrılıyor: Nominatim kendini tanıtan bir User-Agent istiyor ve
 * saniyede bir istek sınırı var. Elle yazılan adres genelde olduğu gibi
 * bulunamadığı için `adresAdaylari` giderek daha genel biçimler üretiyor;
 * ilk tutan kazanıyor. Sonuçlar market çevresine yanlı: aynı sokak adı başka
 * şehirlerde de var.
 */

export const runtime = "nodejs";

const SUNUCU = "https://nominatim.openstreetmap.org/search";
/** Nominatim kimlik zorunlu tutuyor. */
const KIMLIK = "SultanMarketKurye/1.0 (kurye uygulamasi; Serdivan/Sakarya)";
/** Market çevresinde ~40 km'lik kutu — sonuçları buraya yaklaştırıyor. */
const KUTU_DERECE = 0.35;
/** Nominatim saniyede bir istek istiyor. */
const ISTEKLER_ARASI_MS = 1100;
const AZAMI_DENEME = 3;
/**
 * Kabul edilmeyen sonuç türleri. İl ya da ilçe merkezine pin koymak konum
 * olmamasından beter: kurye kilometrelerce öteye gider ve haritada her şey
 * yolundaymış gibi görünür. Mahalle (`suburb`) ve altı kabul; `place_rank`
 * ayırmaya yetmiyor çünkü mahalle de ilçe de 16 dönebiliyor.
 */
const KABA_TURLER = new Set([
  "country",
  "state",
  "province",
  "region",
  "county",
  "city",
  "town",
  "municipality",
  "district",
  "borough",
  "administrative",
]);
/** Ülke/il gibi çok kaba sonuçlara karşı ikinci güvence. */
const EN_KABA_KADEME = 14;

export type GeokodSonucu = {
  lat: number;
  lng: number;
  /** Bulunan adresin okunur hâli — kurye doğrulasın diye. */
  ad: string;
  /** Hangi arama tuttu; "tam" değilse kaba bir konum demektir. */
  aday: string;
};

function bekle(ms: number) {
  return new Promise((coz) => setTimeout(coz, ms));
}

export async function GET(istek: Request) {
  const adres = new URL(istek.url).searchParams.get("adres")?.trim();
  if (!adres || adres.length < 5) {
    return NextResponse.json({ hata: "Adres çok kısa." }, { status: 400 });
  }

  const { lat, lng } = MARKET.nokta;
  const kutu = [
    lng - KUTU_DERECE,
    lat + KUTU_DERECE,
    lng + KUTU_DERECE,
    lat - KUTU_DERECE,
  ].join(",");

  async function ara(sorgu: string): Promise<GeokodSonucu | null> {
    const p = new URLSearchParams({
      q: sorgu,
      format: "jsonv2",
      limit: "1",
      countrycodes: "tr",
      "accept-language": "tr",
      viewbox: kutu,
    });
    const yanit = await fetch(`${SUNUCU}?${p}`, {
      headers: { "User-Agent": KIMLIK, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!yanit.ok) throw new Error(String(yanit.status));
    const veri = (await yanit.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      place_rank?: number;
      addresstype?: string;
    }[];
    const ilk = veri[0];
    if (!ilk) return null;
    if (
      KABA_TURLER.has(ilk.addresstype ?? "") ||
      (ilk.place_rank ?? 0) < EN_KABA_KADEME
    )
      return null;
    const enlem = Number(ilk.lat);
    const boylam = Number(ilk.lon);
    if (!Number.isFinite(enlem) || !Number.isFinite(boylam)) return null;
    return { lat: enlem, lng: boylam, ad: ilk.display_name, aday: sorgu };
  }

  const adaylar = adresAdaylari(adres).slice(0, AZAMI_DENEME);

  try {
    for (const [i, aday] of adaylar.entries()) {
      if (i > 0) await bekle(ISTEKLER_ARASI_MS);
      const sonuc = await ara(aday);
      if (sonuc) return NextResponse.json(sonuc);
    }
    return NextResponse.json(
      { hata: "Bu adres haritada bulunamadı." },
      { status: 404 },
    );
  } catch {
    return NextResponse.json(
      { hata: "Adres servisine ulaşılamadı." },
      { status: 502 },
    );
  }
}
