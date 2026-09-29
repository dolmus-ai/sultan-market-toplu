import { NextResponse } from "next/server";

import { haversine } from "@/lib/rota";
import { adBenzerligi, sakaryadaMi, type GoogleDogrulama } from "@/lib/site";

/**
 * Adres bulucudaki adayın konumunu Google Haritalar'la eşler.
 *
 * Hazır listedeki (OSM / Overture) ve canlı aramadaki noktalar çoğu zaman
 * doğru ama bazen işletme sayfasının işaretlendiği yere düşüp yüzlerce metre
 * kayıyor. Kurye bir adayı açtığı anda bu uç nokta aynı yeri Google'da arıyor
 * ve bulursa pini Google'daki noktaya taşıyoruz; kurye onaylamadan önce iki
 * konum arasındaki farkı görüyor.
 *
 * Tek tek, kuryenin eylemiyle çalışır — Google verisi toplu çekilip
 * saklanmaz; kaydedilen konum kuryenin onayladığı noktadır. Uygulamanın
 * müşteri adresini Google'la geokodlamasıyla aynı kullanım.
 *
 * Anahtar: `GOOGLE_MAPS_API_KEY`, yoksa `GOOGLE_GEOKOD_ANAHTARI`. Önce Places
 * (Text Search, New) — site adlarını en iyi o tanıyor; kapalıysa ya da
 * eşleşme yoksa Geocoding API'nin işletme/bina düzeyindeki sonuçları.
 */

export const runtime = "nodejs";

const PLACES = "https://places.googleapis.com/v1/places:searchText";
const GEOKOD = "https://maps.googleapis.com/maps/api/geocode/json";

/** Adayın bulunduğu noktadan bu kadar uzaktaki eşleşme başka bir yerdir. */
const AZAMI_KAYMA_M = 4000;
/** Ad benzerliği bu eşiğin altındaysa aynı yer sayılmaz. */
const ESIK = 0.5;
/**
 * Geocoding'de yalnızca adı tanınmış yer (işletme/POI) kabul. Google adı
 * bilmediğinde sessizce mahallenin ya da bir sokağın adresini döndürüyor;
 * o sonuç pini yanlış yere taşırdı.
 */
const GEOKOD_TAM = new Set(["establishment", "point_of_interest"]);

type DogrulamaSonucu = GoogleDogrulama;

/** Aynı sorgu tekrar tekrar Google'a gitmesin (sunucu ömrü boyunca). */
const onbellek = new Map<string, DogrulamaSonucu>();

async function placesIle(
  anahtar: string,
  sorgu: string,
  ad: string,
  merkez: { lat: number; lng: number },
): Promise<DogrulamaSonucu | null> {
  const yanit = await fetch(PLACES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": anahtar,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: sorgu,
      languageCode: "tr",
      regionCode: "TR",
      pageSize: 5,
      locationBias: {
        circle: {
          center: { latitude: merkez.lat, longitude: merkez.lng },
          radius: 3000,
        },
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`places ${yanit.status}`);
  const veri = (await yanit.json()) as {
    places?: {
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };

  let enIyi: { puan: number; sonuc: DogrulamaSonucu } | null = null;
  for (const p of veri.places ?? []) {
    if (!p.location) continue;
    const nokta = { lat: p.location.latitude, lng: p.location.longitude };
    const fark = haversine(merkez, nokta);
    const puan = adBenzerligi(ad, p.displayName?.text ?? "");
    if (fark > AZAMI_KAYMA_M || puan < ESIK || !sakaryadaMi(nokta)) continue;
    if (!enIyi || puan > enIyi.puan) {
      enIyi = {
        puan,
        sonuc: {
          durum: "eslesti",
          ...nokta,
          ad: p.displayName?.text ?? ad,
          adres: p.formattedAddress?.replace(/,?\s*Türkiye$/i, "") ?? null,
          motor: "places",
          fark: Math.round(fark),
        },
      };
    }
  }
  return enIyi?.sonuc ?? null;
}

async function geocodingIle(
  anahtar: string,
  sorgu: string,
  merkez: { lat: number; lng: number },
): Promise<DogrulamaSonucu | null> {
  const p = new URLSearchParams({
    address: sorgu,
    key: anahtar,
    language: "tr",
    region: "tr",
    components: "country:TR",
  });
  const yanit = await fetch(`${GEOKOD}?${p}`, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!yanit.ok) throw new Error(`geocoding ${yanit.status}`);
  const veri = (await yanit.json()) as {
    status: string;
    results?: {
      formatted_address: string;
      types?: string[];
      partial_match?: boolean;
      geometry: { location: { lat: number; lng: number } };
    }[];
  };
  if (veri.status !== "OK") return null;

  for (const s of veri.results ?? []) {
    if (s.partial_match || !(s.types ?? []).some((t) => GEOKOD_TAM.has(t))) continue;
    const nokta = s.geometry.location;
    const fark = haversine(merkez, nokta);
    if (fark > AZAMI_KAYMA_M || !sakaryadaMi(nokta)) continue;
    return {
      durum: "eslesti",
      ...nokta,
      ad: s.formatted_address.split(",")[0],
      adres: s.formatted_address.replace(/,?\s*Türkiye$/i, ""),
      motor: "geocoding",
      fark: Math.round(fark),
    };
  }
  return null;
}

export async function GET(istek: Request) {
  const p = new URL(istek.url).searchParams;
  const ad = p.get("ad")?.trim() ?? "";
  const mahalle = p.get("mahalle")?.trim() || null;
  const ilce = p.get("ilce")?.trim() || null;
  const merkez = { lat: Number(p.get("lat")), lng: Number(p.get("lng")) };

  if (ad.length < 2 || !Number.isFinite(merkez.lat) || !Number.isFinite(merkez.lng)) {
    return NextResponse.json({ hata: "Ad ve konum gerekli." }, { status: 400 });
  }

  const anahtar =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOKOD_ANAHTARI?.trim();
  if (!anahtar) return NextResponse.json({ durum: "anahtarsiz" });

  const yer = [mahalle && `${mahalle.replace(/\s+Mahallesi$/i, "")} Mahallesi`, ilce, "Sakarya"]
    .filter(Boolean)
    .join(", ");
  const sorgu = `${ad}, ${yer}`;
  const anahtarKey = `${sorgu}|${merkez.lat.toFixed(4)},${merkez.lng.toFixed(4)}`;
  const onceki = onbellek.get(anahtarKey);
  if (onceki) return NextResponse.json(onceki);

  let sonuc: DogrulamaSonucu | null = null;
  try {
    sonuc = await placesIle(anahtar, sorgu, ad, merkez);
  } catch (hata) {
    // Places API bu anahtarda kapalı olabilir; Geocoding'le devam.
    console.warn("[site-dogrula]", hata);
  }
  if (!sonuc) {
    try {
      sonuc = await geocodingIle(anahtar, sorgu, merkez);
    } catch (hata) {
      console.error("[site-dogrula]", hata);
      return NextResponse.json(
        { hata: "Google'a ulaşılamadı." },
        { status: 502 },
      );
    }
  }

  const cevap: DogrulamaSonucu = sonuc ?? { durum: "bulunamadi" };
  if (onbellek.size > 2000) onbellek.clear();
  onbellek.set(anahtarKey, cevap);
  return NextResponse.json(cevap);
}
