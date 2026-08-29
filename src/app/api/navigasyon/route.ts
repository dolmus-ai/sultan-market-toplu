import { NextResponse } from "next/server";

import { haversine } from "@/lib/rota";
import { manevrayiCevir, type Adim, type RotaSecenegi } from "@/lib/navigasyon";
import type { Nokta } from "@/lib/tipler";

type Istek = { baslangic: Nokta; hedef: Nokta };

function gecerli(n: unknown): n is Nokta {
  return (
    !!n &&
    typeof n === "object" &&
    typeof (n as Nokta).lat === "number" &&
    typeof (n as Nokta).lng === "number" &&
    Math.abs((n as Nokta).lat) <= 90 &&
    Math.abs((n as Nokta).lng) <= 180
  );
}

const SEHIR_ICI_KATSAYI = 1.35;
const ORTALAMA_HIZ_MSN = 6.1;

/** OSRM yoksa tek seçenekli, kuş uçuşu bir rota üretir. */
function yerelSecenek(baslangic: Nokta, hedef: Nokta): RotaSecenegi {
  const mesafe = haversine(baslangic, hedef) * SEHIR_ICI_KATSAYI;
  return {
    id: "yerel",
    ad: "Tahmini rota",
    mesafeM: mesafe,
    sureSn: mesafe / ORTALAMA_HIZ_MSN,
    geometri: [
      [baslangic.lng, baslangic.lat],
      [hedef.lng, hedef.lat],
    ],
    adimlar: [
      {
        tarif: "Hedefe doğru ilerleyin",
        manevra: "cikis",
        mesafeM: mesafe,
        nokta: hedef,
        yol: "",
      },
      {
        tarif: "Varış noktası",
        manevra: "varis",
        mesafeM: 0,
        nokta: hedef,
        yol: "",
      },
    ],
    motor: "yerel",
  };
}

type OsrmAdim = {
  name?: string;
  distance: number;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
};

type OsrmRota = {
  distance: number;
  duration: number;
  geometry: GeoJSON.LineString;
  legs: { steps: OsrmAdim[] }[];
};

const SECENEK_ADI = ["En hızlı", "2. seçenek", "3. seçenek"];

async function osrmIleCoz(
  taban: string,
  baslangic: Nokta,
  hedef: Nokta,
): Promise<RotaSecenegi[] | null> {
  const koordinat =
    `${baslangic.lng.toFixed(6)},${baslangic.lat.toFixed(6)};` +
    `${hedef.lng.toFixed(6)},${hedef.lat.toFixed(6)}`;

  const url =
    `${taban.replace(/\/$/, "")}/route/v1/driving/${koordinat}` +
    `?alternatives=true&steps=true&geometries=geojson&overview=full`;

  const yanit = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!yanit.ok) return null;

  const veri = (await yanit.json()) as { code?: string; routes?: OsrmRota[] };
  if (veri.code !== "Ok" || !veri.routes?.length) return null;

  return veri.routes.slice(0, 3).map((r, i) => {
    const adimlar: Adim[] = r.legs
      .flatMap((l) => l.steps)
      .map((s) => {
        const { tarif, manevra } = manevrayiCevir(s.maneuver, s.name ?? "");
        return {
          tarif,
          manevra,
          mesafeM: s.distance,
          nokta: { lng: s.maneuver.location[0], lat: s.maneuver.location[1] },
          yol: s.name ?? "",
        };
      });

    return {
      id: `osrm-${i}`,
      ad: SECENEK_ADI[i] ?? `${i + 1}. seçenek`,
      mesafeM: r.distance,
      sureSn: r.duration,
      geometri: r.geometry.coordinates as [number, number][],
      adimlar,
      motor: "osrm" as const,
    };
  });
}

export async function POST(istek: Request) {
  let govde: Istek;
  try {
    govde = (await istek.json()) as Istek;
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek" }, { status: 400 });
  }

  if (!gecerli(govde?.baslangic) || !gecerli(govde?.hedef)) {
    return NextResponse.json(
      { hata: "Başlangıç ve hedef konumu gerekli" },
      { status: 400 },
    );
  }

  const osrm = process.env.OSRM_SUNUCU?.trim();
  if (osrm) {
    try {
      const secenekler = await osrmIleCoz(osrm, govde.baslangic, govde.hedef);
      if (secenekler?.length) return NextResponse.json({ secenekler });
    } catch {
      // yerele düş
    }
  }

  return NextResponse.json({
    secenekler: [yerelSecenek(govde.baslangic, govde.hedef)],
  });
}
