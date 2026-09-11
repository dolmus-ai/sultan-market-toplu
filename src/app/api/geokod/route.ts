import { NextResponse } from "next/server";

import { adresAdaylari } from "@/lib/adres";
import { MARKET } from "@/lib/market";
import { GOOGLE_GEOKOD_ANAHTARI } from "@/lib/ortam";
import { haversine } from "@/lib/rota";

/**
 * Adres metnini koordinata çevirir.
 *
 * Önce Google Geocoding API: Türkiye'de kapı numarasına kadar iner, işletme
 * adını ("Ramada Otel") da tanır. Anahtar yoksa ya da Google cevap vermezse
 * OpenStreetMap/Nominatim'e düşülür; orada kapı numarası verisi seyrek
 * olduğu için `adresAdaylari` giderek daha genel biçimler üretir, ilk tutan
 * kazanır. İki yolda da il/ilçe merkezine pin koymak reddedilir: konum
 * olmamasından beter, kurye kilometrelerce öteye gider. Sonuç kapı düzeyinde
 * değilse `kaba: true` döner; form kuryeye haritadan düzeltmesini söyler.
 */

export const runtime = "nodejs";

export type GeokodSonucu = {
  lat: number;
  lng: number;
  /** Bulunan adresin okunur hâli — kurye doğrulasın diye. */
  ad: string;
  /** Hangi arama tuttu; "tam" değilse kaba bir konum demektir. */
  aday: string;
  /** Sokak/mahalle düzeyinde bulundu; kapı değil. */
  kaba: boolean;
  motor: "google" | "nominatim";
};

/** Market çevresinde ~40 km'lik kutu — sonuçları buraya yaklaştırıyor. */
const KUTU_DERECE = 0.35;
/** Bundan uzak sonuç başka bir şehirdeki aynı adlı sokaktır. */
const AZAMI_UZAKLIK_M = 80_000;

/* ---------------- Google ---------------- */

const GOOGLE_SUNUCU = "https://maps.googleapis.com/maps/api/geocode/json";

/** Kabul edilmeyen Google sonuç türleri: il, ilçe, ülke, posta kodu. */
const GOOGLE_KABA_TURLER = new Set([
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "locality",
  "postal_code",
  "postal_town",
  "colloquial_area",
]);
/** Kapı düzeyinde sayılan türler. */
const GOOGLE_TAM_TURLER = new Set([
  "street_address",
  "premise",
  "subpremise",
  "establishment",
  "point_of_interest",
  "plus_code",
  "intersection",
]);

type GoogleSonuc = {
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
    location_type: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
  };
  types: string[];
  partial_match?: boolean;
};

async function googleIleAra(
  anahtar: string,
  sorgu: string,
): Promise<GeokodSonucu | null> {
  const { lat, lng } = MARKET.nokta;
  const p = new URLSearchParams({
    address: sorgu,
    key: anahtar,
    language: "tr",
    region: "tr",
    components: "country:TR",
    // Yanlılık, kısıt değil: aynı adlı sokak başka ilde de olsa bizimki öne çıkar.
    bounds: `${lat - KUTU_DERECE},${lng - KUTU_DERECE}|${lat + KUTU_DERECE},${lng + KUTU_DERECE}`,
  });
  const yanit = await fetch(`${GOOGLE_SUNUCU}?${p}`, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!yanit.ok) throw new Error(`google ${yanit.status}`);
  const veri = (await yanit.json()) as {
    status: string;
    results?: GoogleSonuc[];
    error_message?: string;
  };
  if (veri.status === "ZERO_RESULTS") return null;
  if (veri.status !== "OK") {
    // REQUEST_DENIED (API kapalı / anahtar kısıtlı), OVER_QUERY_LIMIT…
    throw new Error(`google ${veri.status}: ${veri.error_message ?? ""}`);
  }

  for (const sonuc of veri.results ?? []) {
    const turler = sonuc.types ?? [];
    // Yalnızca kaba türlerden oluşan sonuç (ör. "Adapazarı") reddedilir.
    if (turler.length === 0 || turler.every((t) => GOOGLE_KABA_TURLER.has(t) || t === "political")) {
      continue;
    }
    const nokta = sonuc.geometry.location;
    if (!Number.isFinite(nokta.lat) || !Number.isFinite(nokta.lng)) continue;
    if (haversine(nokta, MARKET.nokta) > AZAMI_UZAKLIK_M) continue;

    const tam =
      sonuc.geometry.location_type === "ROOFTOP" ||
      sonuc.geometry.location_type === "RANGE_INTERPOLATED" ||
      turler.some((t) => GOOGLE_TAM_TURLER.has(t));
    return {
      lat: nokta.lat,
      lng: nokta.lng,
      ad: sonuc.formatted_address,
      aday: tam ? "tam" : sorgu,
      kaba: !tam,
      motor: "google",
    };
  }
  return null;
}

/* ---------------- Nominatim (yedek) ---------------- */

const NOMINATIM_SUNUCU = "https://nominatim.openstreetmap.org/search";
/** Nominatim kimlik zorunlu tutuyor. */
const KIMLIK = "SultanMarketKurye/1.0 (kurye uygulamasi; Serdivan/Sakarya)";
/** Nominatim saniyede bir istek istiyor. */
const ISTEKLER_ARASI_MS = 1100;
const AZAMI_DENEME = 3;
/**
 * Kabul edilmeyen sonuç türleri. Mahalle (`suburb`) ve altı kabul;
 * `place_rank` ayırmaya yetmiyor çünkü mahalle de ilçe de 16 dönebiliyor.
 */
const NOMINATIM_KABA_TURLER = new Set([
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
/** Kapı düzeyi sayılan Nominatim türleri. */
const NOMINATIM_TAM_TURLER = new Set(["house", "building", "amenity", "shop", "office"]);

function bekle(ms: number) {
  return new Promise((coz) => setTimeout(coz, ms));
}

async function nominatimIleAra(
  sorgu: string,
  aday: string,
): Promise<GeokodSonucu | null> {
  const { lat, lng } = MARKET.nokta;
  const kutu = [
    lng - KUTU_DERECE,
    lat + KUTU_DERECE,
    lng + KUTU_DERECE,
    lat - KUTU_DERECE,
  ].join(",");
  const p = new URLSearchParams({
    q: sorgu,
    format: "jsonv2",
    limit: "1",
    countrycodes: "tr",
    "accept-language": "tr",
    viewbox: kutu,
  });
  const yanit = await fetch(`${NOMINATIM_SUNUCU}?${p}`, {
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
    category?: string;
  }[];
  const ilk = veri[0];
  if (!ilk) return null;
  if (
    NOMINATIM_KABA_TURLER.has(ilk.addresstype ?? "") ||
    (ilk.place_rank ?? 0) < EN_KABA_KADEME
  )
    return null;
  const enlem = Number(ilk.lat);
  const boylam = Number(ilk.lon);
  if (!Number.isFinite(enlem) || !Number.isFinite(boylam)) return null;
  const tam =
    aday === "tam" &&
    (NOMINATIM_TAM_TURLER.has(ilk.addresstype ?? "") ||
      NOMINATIM_TAM_TURLER.has(ilk.category ?? "") ||
      (ilk.place_rank ?? 0) >= 30);
  return {
    lat: enlem,
    lng: boylam,
    ad: ilk.display_name,
    aday: tam ? "tam" : sorgu,
    kaba: !tam,
    motor: "nominatim",
  };
}

/* ---------------- Uç ---------------- */

export async function GET(istek: Request) {
  const adres = new URL(istek.url).searchParams.get("adres")?.trim();
  if (!adres || adres.length < 5) {
    return NextResponse.json({ hata: "Adres çok kısa." }, { status: 400 });
  }

  const adaylar = adresAdaylari(adres).slice(0, AZAMI_DENEME);
  let servisHatasi = false;

  if (GOOGLE_GEOKOD_ANAHTARI) {
    try {
      // Önce metnin kendisi: Google kapı numarasını ve işletme adını anlıyor.
      // Tutmazsa kapı/daire ayıklanmış, giderek genelleşen adaylar.
      for (const sorgu of [adres, ...adaylar.filter((a) => a !== adres)]) {
        const sonuc = await googleIleAra(GOOGLE_GEOKOD_ANAHTARI, sorgu);
        if (sonuc) return NextResponse.json(sonuc);
      }
      // Google Türkiye'de neredeyse her şeyi bulur; bulamadıysa Nominatim'e
      // sormak gecikmeden başka bir şey getirmiyor.
      return NextResponse.json(
        { hata: "Bu adres haritada bulunamadı." },
        { status: 404 },
      );
    } catch (hata) {
      // Anahtar kısıtlı, API kapalı ya da ağ: sessizce Nominatim'e düş ama
      // sebebi günlüğe yaz — üretimde "neden Google kullanılmıyor" görünsün.
      console.error("[geokod] Google başarısız, Nominatim deneniyor:", hata);
      servisHatasi = true;
    }
  }

  try {
    for (const [i, aday] of adaylar.entries()) {
      if (i > 0) await bekle(ISTEKLER_ARASI_MS);
      const sonuc = await nominatimIleAra(aday, i === 0 ? "tam" : aday);
      if (sonuc) return NextResponse.json(sonuc);
    }
    return NextResponse.json(
      { hata: "Bu adres haritada bulunamadı." },
      { status: 404 },
    );
  } catch {
    return NextResponse.json(
      {
        hata: servisHatasi
          ? "Adres servislerine ulaşılamadı."
          : "Adres servisine ulaşılamadı.",
      },
      { status: 502 },
    );
  }
}
