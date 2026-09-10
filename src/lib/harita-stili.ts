import type { Map as MapLibreMap, LayerSpecification } from "maplibre-gl";

export type Tema = "aydinlik" | "karanlik";

type Palet = {
  zemin: string;
  su: string;
  yesil: string;
  arazi: string;
  bina: string;
  binaCizgi: string;
  yolBeyaz: string;
  yolIkincil: string;
  yolKenar: string;
  otoyol: string;
  otoyolKenar: string;
  demiryolu: string;
  sinir: string;
  yazi: string;
  yaziSonuk: string;
  hale: string;
  bina3b: [string, string, string];
};

/**
 * OpenFreeMap "liberty" stilini Yandex Haritalar'ın görünümüne yaklaştırır.
 *
 * Yandex'in kendi karo sunucusu üçüncü parti harita kütüphanelerinde
 * kullanılamıyor (kullanım şartları buna izin vermiyor, anahtarsız erişim de
 * kapalı). Bu yüzden veri kaynağı OpenStreetMap/OpenFreeMap olarak kalıyor;
 * değişen yalnızca renk paleti: Yandex'in sıcak bej zemini, doygun mavi
 * suyu, canlı yeşil parkları ve sarı ana yolları. Kırmızı hep bize ait.
 */
const PALETLER: Record<Tema, Palet> = {
  // Gündüz: Yandex'in sıcak bej zemini, doygun mavi su, canlı yeşil parklar.
  aydinlik: {
    zemin: "#f3f0ea",
    su: "#a9cdec",
    yesil: "#c8e3ae",
    arazi: "#eae6dd",
    bina: "#e4ded2",
    binaCizgi: "#d6cfc0",
    yolBeyaz: "#ffffff",
    yolIkincil: "#fdfbf6",
    yolKenar: "#ddd6c8",
    // Yandex ana yolları sarıya çalar; şehirde yön bulmayı kolaylaştırıyor.
    otoyol: "#fbe08a",
    otoyolKenar: "#e8c65f",
    demiryolu: "#c6bfb2",
    sinir: "#cac2b4",
    yazi: "#33383d",
    yaziSonuk: "#767d85",
    hale: "#ffffff",
    bina3b: ["#e8e2d6", "#ddd6c8", "#cfc7b6"],
  },
  // Gece: Yandex'in gece modundaki lacivert-arduvaz zemin; yollar zeminden
  // daha açık, ana yollar soluk amber.
  karanlik: {
    zemin: "#232c38",
    su: "#16202c",
    yesil: "#2a3a30",
    arazi: "#28313d",
    bina: "#2e3845",
    binaCizgi: "#39434f",
    yolBeyaz: "#3d4855",
    yolIkincil: "#39434f",
    yolKenar: "#2a333e",
    otoyol: "#6a5c3c",
    otoyolKenar: "#4d442d",
    demiryolu: "#4a545f",
    sinir: "#59636f",
    yazi: "#e8edf3",
    yaziSonuk: "#a9b3bd",
    hale: "#1a222c",
    bina3b: ["#39434f", "#323b47", "#2b333e"],
  },
};

function guvenliBoya(
  harita: MapLibreMap,
  id: string,
  ozellik: string,
  deger: unknown,
) {
  try {
    harita.setPaintProperty(
      id,
      ozellik as Parameters<MapLibreMap["setPaintProperty"]>[1],
      deger as never,
    );
  } catch {
    /* katman bu özelliği desteklemiyorsa sessizce geç */
  }
}

function guvenliDuzen(
  harita: MapLibreMap,
  id: string,
  ozellik: string,
  deger: unknown,
) {
  try {
    harita.setLayoutProperty(
      id,
      ozellik as Parameters<MapLibreMap["setLayoutProperty"]>[1],
      deger as never,
    );
  } catch {
    /* yok say */
  }
}

export function markaStiliUygula(harita: MapLibreMap, tema: Tema = "aydinlik") {
  const stil = harita.getStyle();
  if (!stil?.layers) return;
  const P = PALETLER[tema];

  for (const katman of stil.layers as LayerSpecification[]) {
    const id = katman.id;
    // Kendi çizgilerimiz ve 3B binalar ayrı ele alınıyor.
    if (
      id.startsWith("nav-") ||
      id.startsWith("rota-") ||
      katman.type === "fill-extrusion"
    )
      continue;

    const kaynakKatman =
      "source-layer" in katman ? (katman["source-layer"] as string) : "";

    if (katman.type === "background") {
      guvenliBoya(harita, id, "background-color", P.zemin);
      continue;
    }

    if (katman.type === "symbol") {
      const poi = kaynakKatman === "poi" || id.includes("poi");
      guvenliBoya(harita, id, "text-color", poi ? P.yaziSonuk : P.yazi);
      guvenliBoya(harita, id, "text-halo-color", P.hale);
      guvenliBoya(harita, id, "text-halo-width", 1.6);
      guvenliBoya(harita, id, "icon-opacity", poi ? 0.45 : 0.8);
      if (poi) guvenliDuzen(harita, id, "text-size", 10);
      continue;
    }

    switch (kaynakKatman) {
      case "water":
      case "waterway":
        guvenliBoya(harita, id, "fill-color", P.su);
        guvenliBoya(harita, id, "line-color", P.su);
        break;
      case "park":
      case "landcover":
        guvenliBoya(harita, id, "fill-color", P.yesil);
        guvenliBoya(harita, id, "fill-opacity", 0.9);
        guvenliBoya(harita, id, "line-color", P.yesil);
        break;
      case "aeroway":
        guvenliBoya(harita, id, "fill-color", P.arazi);
        guvenliBoya(harita, id, "line-color", P.arazi);
        break;
      case "landuse":
        guvenliBoya(harita, id, "fill-color", P.arazi);
        guvenliBoya(harita, id, "fill-opacity", 0.7);
        break;
      case "building":
        guvenliBoya(harita, id, "fill-color", P.bina);
        guvenliBoya(harita, id, "fill-outline-color", P.binaCizgi);
        break;
      case "boundary":
        guvenliBoya(harita, id, "line-color", P.sinir);
        break;
      case "transportation":
        if (id.includes("rail")) {
          guvenliBoya(harita, id, "line-color", P.demiryolu);
        } else if (id.includes("casing") || id.includes("outline")) {
          guvenliBoya(
            harita,
            id,
            "line-color",
            id.includes("motorway") || id.includes("trunk")
              ? P.otoyolKenar
              : P.yolKenar,
          );
        } else if (id.includes("motorway") || id.includes("trunk")) {
          guvenliBoya(harita, id, "line-color", P.otoyol);
        } else if (id.includes("minor") || id.includes("service")) {
          guvenliBoya(harita, id, "line-color", P.yolIkincil);
        } else {
          guvenliBoya(harita, id, "line-color", P.yolBeyaz);
        }
        break;
      default:
        break;
    }
  }

  binaTemasiUygula(harita, tema);
}

/**
 * Haritadaki 3B bina katmanının kimliği. Liberty stili kendi
 * `building-3d` katmanıyla geliyor; varsa onu kullanırız, yoksa ekleriz.
 * İkisini birden çizmek z-çakışmasına yol açıyor.
 */
export function ucBoyutluBinaKatmani(harita: MapLibreMap): string | null {
  const katmanlar = harita.getStyle()?.layers as
    | LayerSpecification[]
    | undefined;
  const bulunan = katmanlar?.find(
    (k) =>
      k.type === "fill-extrusion" &&
      "source-layer" in k &&
      k["source-layer"] === "building",
  );
  return bulunan?.id ?? null;
}

/** Stilde 3B bina katmanı yoksa ekler; varsa yükseklik ifadelerini sağlamlaştırır. */
export function ucBoyutluBinalarEkle(harita: MapLibreMap) {
  const mevcut = ucBoyutluBinaKatmani(harita);
  if (mevcut) {
    // Liberty'nin kendi katmanı yüksekliği doğrudan `["get", ...]` ile
    // okuyor. Özelliği olmayan binalarda null gelince MapLibre her karo
    // için "Expected value to be of type number" uyarısı basıyor.
    guvenliBoya(harita, mevcut, "fill-extrusion-height", [
      "coalesce",
      ["get", "render_height"],
      6,
    ]);
    guvenliBoya(harita, mevcut, "fill-extrusion-base", [
      "coalesce",
      ["get", "render_min_height"],
      0,
    ]);
    return;
  }

  const stil = harita.getStyle();
  const binaKatmani = (stil?.layers as LayerSpecification[] | undefined)?.find(
    (k) => "source-layer" in k && k["source-layer"] === "building",
  );
  if (!binaKatmani || !("source" in binaKatmani)) return;

  const ilkEtiket = (stil?.layers as LayerSpecification[]).find(
    (k) => k.type === "symbol",
  )?.id;

  harita.addLayer(
    {
      id: "bina-3b",
      type: "fill-extrusion",
      source: binaKatmani.source as string,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          16,
          ["coalesce", ["get", "render_height"], 6],
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      },
    },
    ilkEtiket,
  );
}

/** 3B binaların rengini temaya göre günceller. */
export function binaTemasiUygula(harita: MapLibreMap, tema: Tema) {
  const id = ucBoyutluBinaKatmani(harita);
  if (!id) return;
  const [a, b, c] = PALETLER[tema].bina3b;
  guvenliBoya(harita, id, "fill-extrusion-opacity", 0.9);
  guvenliBoya(harita, id, "fill-extrusion-color", [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "render_height"], 6],
    0,
    a,
    40,
    b,
    120,
    c,
  ]);
}

export function ucBoyutluBinalariGoster(harita: MapLibreMap, goster: boolean) {
  const id = ucBoyutluBinaKatmani(harita);
  if (!id) return;
  guvenliDuzen(harita, id, "visibility", goster ? "visible" : "none");
}
