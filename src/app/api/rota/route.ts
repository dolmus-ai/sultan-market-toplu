import { NextResponse } from "next/server";
import { OSRM_SUNUCU } from "@/lib/ortam";
import { yerelRotaCoz } from "@/lib/rota";
import type { Nokta, RotaSonucu } from "@/lib/tipler";

type Istek = {
  baslangic: Nokta;
  duraklar: { id: string; nokta: Nokta }[];
};

const MAKS_DURAK = 40;

function gecerliNokta(n: unknown): n is Nokta {
  return (
    !!n &&
    typeof n === "object" &&
    typeof (n as Nokta).lat === "number" &&
    typeof (n as Nokta).lng === "number" &&
    Math.abs((n as Nokta).lat) <= 90 &&
    Math.abs((n as Nokta).lng) <= 180
  );
}

/**
 * OSRM "trip" servisi gezgin satıcı problemini gerçek yol ağı üzerinde çözer.
 * Sunucu tanımlı değilse istek dışarı çıkmaz; yerel çözücü devreye girer.
 */
async function osrmIleCoz(
  taban: string,
  baslangic: Nokta,
  duraklar: { id: string; nokta: Nokta }[],
): Promise<RotaSonucu | null> {
  const koordinatlar = [baslangic, ...duraklar.map((d) => d.nokta)]
    .map((n) => `${n.lng.toFixed(6)},${n.lat.toFixed(6)}`)
    .join(";");

  const url =
    `${taban.replace(/\/$/, "")}/trip/v1/driving/${koordinatlar}` +
    `?source=first&roundtrip=false&geometries=geojson&overview=full`;

  const kontrol = AbortSignal.timeout(9000);
  const yanit = await fetch(url, { signal: kontrol, cache: "no-store" });
  if (!yanit.ok) return null;

  const veri = (await yanit.json()) as {
    code?: string;
    trips?: { distance: number; duration: number; geometry: GeoJSON.LineString }[];
    waypoints?: { waypoint_index: number }[];
  };
  if (veri.code !== "Ok" || !veri.trips?.[0] || !veri.waypoints) return null;

  const tur = veri.trips[0];
  const sirali = veri.waypoints
    .map((w, i) => ({ i, sira: w.waypoint_index }))
    .filter((w) => w.i > 0) // ilk nokta kuryenin kendisi
    .sort((a, b) => a.sira - b.sira)
    .map((w) => duraklar[w.i - 1].id);

  return {
    sira: sirali,
    toplamMesafeM: tur.distance,
    toplamSureSn: tur.duration + duraklar.length * 90,
    geometri: tur.geometry.coordinates as [number, number][],
    motor: "osrm",
  };
}

export async function POST(istek: Request) {
  let govde: Istek;
  try {
    govde = (await istek.json()) as Istek;
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek" }, { status: 400 });
  }

  if (!gecerliNokta(govde?.baslangic)) {
    return NextResponse.json(
      { hata: "Başlangıç konumu gerekli" },
      { status: 400 },
    );
  }

  const duraklar = (govde.duraklar ?? [])
    .filter((d) => typeof d?.id === "string" && gecerliNokta(d?.nokta))
    .slice(0, MAKS_DURAK);

  if (duraklar.length === 0) {
    return NextResponse.json({ hata: "En az bir durak gerekli" }, { status: 400 });
  }

  const osrm = OSRM_SUNUCU;
  if (osrm) {
    try {
      const sonuc = await osrmIleCoz(osrm, govde.baslangic, duraklar);
      if (sonuc) return NextResponse.json(sonuc);
    } catch {
      // yerel çözücüye düş
    }
  }

  return NextResponse.json(yerelRotaCoz(govde.baslangic, duraklar));
}
