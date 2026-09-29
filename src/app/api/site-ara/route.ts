import { NextResponse } from "next/server";

import { SAKARYA_KUTU, SAKARYA_ILCELERI, sakaryadaMi, type SiteAdayi } from "@/lib/site";

/**
 * Adres bulucunun canlı araması — derlenmiş listede olmayan siteler için.
 *
 * İki kaynak:
 * - **Google Places (Text Search, New)** — `GOOGLE_MAPS_API_KEY` tanımlıysa.
 *   Sitelerin çoğu OSM'de yok ama Google'da işletme/konut olarak kayıtlı.
 * - **Nominatim (OpenStreetMap)** — anahtar gerektirmez, her zaman denenir.
 *
 * İkisi de Sakarya kutusuna kısıtlanıyor; kutu komşu illere taştığı için
 * sonuçlar ayrıca adreslerinde "Sakarya" geçmesine göre süzülüyor.
 * Sunucudan çağrılıyor: Google anahtarı istemciye gitmesin, Nominatim de
 * kendini tanıtan bir User-Agent istiyor.
 */

export const runtime = "nodejs";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const KIMLIK = "SultanMarketKurye/1.0 (kurye uygulamasi; Serdivan/Sakarya)";
const GOOGLE = "https://places.googleapis.com/v1/places:searchText";

/** Site/apartman sayılmayan Google türleri — sorgu "market" içerse de. */
const GOOGLE_KONUT_DISI = new Set([
  "route",
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
]);

function ilceBul(metin: string): string | null {
  const kucuk = metin.toLocaleLowerCase("tr");
  return (
    SAKARYA_ILCELERI.find((i) => kucuk.includes(i.toLocaleLowerCase("tr"))) ??
    null
  );
}

function turTahmini(ad: string): SiteAdayi["tur"] {
  return /apartman|\bapt\b/i.test(ad) ? "apartman" : "site";
}

async function googleAra(sorgu: string, anahtar: string): Promise<SiteAdayi[]> {
  const yanit = await fetch(GOOGLE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": anahtar,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery: /sakarya/i.test(sorgu) ? sorgu : `${sorgu} Sakarya`,
      languageCode: "tr",
      regionCode: "TR",
      pageSize: 10,
      locationRestriction: {
        rectangle: {
          low: { latitude: SAKARYA_KUTU.guney, longitude: SAKARYA_KUTU.bati },
          high: { latitude: SAKARYA_KUTU.kuzey, longitude: SAKARYA_KUTU.dogu },
        },
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`google ${yanit.status}`);

  const veri = (await yanit.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      types?: string[];
      addressComponents?: { longText: string; types: string[] }[];
    }[];
  };

  return (veri.places ?? [])
    .filter(
      (p) =>
        p.location &&
        /sakarya/i.test(p.formattedAddress ?? "") &&
        !(p.types ?? []).some((t) => GOOGLE_KONUT_DISI.has(t)),
    )
    .map((p) => {
      const bilesen = (tur: string) =>
        p.addressComponents?.find((b) => b.types.includes(tur))?.longText ?? null;
      const adres = p.formattedAddress ?? "";
      const ad = p.displayName?.text ?? adres.split(",")[0];
      return {
        anahtar: `google:${p.id}`,
        ad,
        tur: turTahmini(ad),
        ilce: bilesen("administrative_area_level_2") ?? ilceBul(adres),
        mahalle:
          bilesen("administrative_area_level_4") ??
          bilesen("sublocality_level_1") ??
          bilesen("neighborhood"),
        adres: adres.replace(/,?\s*Türkiye$/i, ""),
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        bloklar: [],
        kaynak: "google" as const,
        kaynak_id: p.id,
      };
    });
}

async function nominatimAra(sorgu: string): Promise<SiteAdayi[]> {
  const k = SAKARYA_KUTU;
  const p = new URLSearchParams({
    q: /sakarya/i.test(sorgu) ? sorgu : `${sorgu}, Sakarya`,
    format: "jsonv2",
    addressdetails: "1",
    limit: "10",
    countrycodes: "tr",
    "accept-language": "tr",
    viewbox: [k.bati, k.kuzey, k.dogu, k.guney].join(","),
    bounded: "1",
  });
  const yanit = await fetch(`${NOMINATIM}?${p}`, {
    headers: { "User-Agent": KIMLIK, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`nominatim ${yanit.status}`);

  const veri = (await yanit.json()) as {
    osm_type: string;
    osm_id: number;
    lat: string;
    lon: string;
    name?: string;
    display_name: string;
    category?: string;
    type?: string;
    addresstype?: string;
    address?: Record<string, string>;
  }[];

  return veri
    .filter((r) => {
      const il = r.address?.province ?? r.address?.state ?? "";
      // Yol ve idari birim site değil; il merkezine pin koymak yanıltır.
      return (
        /sakarya/i.test(il || r.display_name) &&
        r.category !== "highway" &&
        r.category !== "boundary"
      );
    })
    .map((r) => {
      const a = r.address ?? {};
      const ad = r.name || r.display_name.split(",")[0];
      const sokak = a.road ? `${a.road}${a.house_number ? ` No:${a.house_number}` : ""}` : null;
      return {
        anahtar: `osm:${r.osm_type[0]}${r.osm_id}`,
        ad,
        tur: turTahmini(ad),
        // Büyükşehir olduğu için `city` çoğu zaman "Sakarya" dönüyor; ilçe
        // adını bilinen listeden okumak daha güvenilir.
        ilce: ilceBul(r.display_name) ?? a.town ?? a.county ?? null,
        mahalle: a.suburb ?? a.quarter ?? a.neighbourhood ?? a.village ?? null,
        adres: sokak,
        lat: Number(r.lat),
        lng: Number(r.lon),
        bloklar: [],
        // Nominatim sonucu da bir OSM nesnesi; derlemedeki kimlikle aynı
        // (`w123`). Kaynağı "osm" tutunca tablodaki (kaynak, kaynak_id)
        // tekilliği aynı siteyi iki yoldan eklemeyi de engelliyor.
        kaynak: "osm" as const,
        kaynak_id: `${r.osm_type[0]}${r.osm_id}`,
      };
    });
}

/**
 * Haritaya dokunulan noktanın ilçe/mahalle/sokak bilgisi — "haritaya
 * dokunarak ekle" akışında formu önceden doldurmak için. Bulunamazsa boş
 * bir aday döner; kurye adı kendisi yazar.
 */
async function tersAra(lat: number, lng: number): Promise<SiteAdayi> {
  const bos: SiteAdayi = {
    anahtar: `elle:${lat.toFixed(6)},${lng.toFixed(6)}`,
    ad: "",
    tur: "site",
    ilce: null,
    mahalle: null,
    adres: null,
    lat,
    lng,
    bloklar: [],
    kaynak: "elle",
    kaynak_id: null,
  };
  try {
    const p = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18",
      "accept-language": "tr",
    });
    const yanit = await fetch(`${NOMINATIM.replace("/search", "/reverse")}?${p}`, {
      headers: { "User-Agent": KIMLIK, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!yanit.ok) return bos;
    const r = (await yanit.json()) as {
      name?: string;
      display_name?: string;
      category?: string;
      address?: Record<string, string>;
    };
    const a = r.address ?? {};
    // Yol adı site adı değil; yalnızca bina/konut adı varsa öneriyoruz.
    const ad = r.category === "highway" ? "" : (r.name ?? a.building ?? "");
    return {
      ...bos,
      ad,
      tur: turTahmini(ad),
      ilce: ilceBul(r.display_name ?? "") ?? a.town ?? null,
      mahalle: a.suburb ?? a.quarter ?? a.neighbourhood ?? a.village ?? null,
      adres: a.road ? `${a.road}${a.house_number ? ` No:${a.house_number}` : ""}` : null,
    };
  } catch {
    return bos;
  }
}

export async function GET(istek: Request) {
  const parametre = new URL(istek.url).searchParams;
  const lat = Number(parametre.get("lat"));
  const lng = Number(parametre.get("lng"));
  if (parametre.has("lat") && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (!sakaryadaMi({ lat, lng })) {
      return NextResponse.json(
        { hata: "Nokta Sakarya dışında." },
        { status: 400 },
      );
    }
    return NextResponse.json({ aday: await tersAra(lat, lng) });
  }

  const sorgu = parametre.get("q")?.trim() ?? "";
  if (sorgu.length < 3) {
    return NextResponse.json({ hata: "En az 3 harf yazın." }, { status: 400 });
  }

  // Places için ayrı anahtar yoksa adres çözümlemenin anahtarı denenir;
  // Places API o anahtarda kapalıysa istek düşer ve yalnızca OSM kalır.
  const anahtar =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOKOD_ANAHTARI?.trim();
  const [google, osm] = await Promise.allSettled([
    anahtar ? googleAra(sorgu, anahtar) : Promise.resolve([]),
    nominatimAra(sorgu),
  ]);

  if (google.status === "rejected") console.error("[site-ara]", google.reason);
  if (osm.status === "rejected") console.error("[site-ara]", osm.reason);
  if (google.status === "rejected" && osm.status === "rejected") {
    return NextResponse.json(
      { hata: "Arama servisine ulaşılamadı." },
      { status: 502 },
    );
  }

  // Google önce: konut kayıtları orada daha eksiksiz. Aynı yeri iki kaynak
  // birden bulursa (aynı ad, ~150 m) ikincisini at.
  const sonuclar: SiteAdayi[] = [];
  for (const s of [
    ...(google.status === "fulfilled" ? google.value : []),
    ...(osm.status === "fulfilled" ? osm.value : []),
  ]) {
    if (!sakaryadaMi(s) || !Number.isFinite(s.lat)) continue;
    const ayni = sonuclar.some(
      (o) =>
        o.ad.toLocaleLowerCase("tr") === s.ad.toLocaleLowerCase("tr") &&
        Math.abs(o.lat - s.lat) < 0.0015 &&
        Math.abs(o.lng - s.lng) < 0.002,
    );
    if (!ayni) sonuclar.push(s);
  }

  return NextResponse.json({ sonuclar, google: !!anahtar });
}
