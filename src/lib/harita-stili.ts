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
 * OpenFreeMap "liberty" stilini Sultan Market paletine boyar.
 * Aydınlık: beyaz zemin, sıcak gri araziler, siyah tipografi.
 * Karanlık: gece sürüşü için düşük parlaklık, kırmızı yalnızca bize ait.
 */
const PALETLER: Record<Tema, Palet> = {
  aydinlik: {
    zemin: "#fbfbfc",
    su: "#dfe7ef",
    yesil: "#eef2ea",
    arazi: "#f3f3f6",
    bina: "#ebebef",
    binaCizgi: "#e0e0e6",
    yolBeyaz: "#ffffff",
    yolIkincil: "#fafafb",
    yolKenar: "#e2e2e8",
    otoyol: "#ffffff",
    otoyolKenar: "#d6d6de",
    demiryolu: "#dcdce3",
    sinir: "#d9d9e0",
    yazi: "#3f434a",
    yaziSonuk: "#8b9099",
    hale: "#ffffff",
    bina3b: ["#f0f0f4", "#e2e2e9", "#d3d3dc"],
  },
  karanlik: {
    zemin: "#101216",
    su: "#0c1520",
    yesil: "#141b17",
    arazi: "#161920",
    bina: "#1d2129",
    binaCizgi: "#252a33",
    yolBeyaz: "#2c323c",
    yolIkincil: "#232830",
    yolKenar: "#141720",
    otoyol: "#3a414d",
    otoyolKenar: "#11141a",
    demiryolu: "#2a2f38",
    sinir: "#343a45",
    yazi: "#c9ced6",
    yaziSonuk: "#7b828d",
    hale: "#0b0d11",
    bina3b: ["#1f232c", "#272c37", "#313743"],
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
    if (id.startsWith("nav-") || id.startsWith("rota-") || id === "bina-3b")
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

/** Stildeki bina kaynağını bulup 3B kabartma katmanı ekler. */
export function ucBoyutluBinalarEkle(harita: MapLibreMap) {
  if (harita.getLayer("bina-3b")) return;

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
  if (!harita.getLayer("bina-3b")) return;
  const [a, b, c] = PALETLER[tema].bina3b;
  guvenliBoya(harita, "bina-3b", "fill-extrusion-color", [
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
  if (!harita.getLayer("bina-3b")) return;
  guvenliDuzen(harita, "bina-3b", "visibility", goster ? "visible" : "none");
}
