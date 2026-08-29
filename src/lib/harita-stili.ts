import type { Map as MapLibreMap, LayerSpecification } from "maplibre-gl";

/**
 * OpenFreeMap "liberty" stilini Sultan Market paletine boyar:
 * beyaz zemin, sıcak gri araziler, siyah tipografi, kırmızı yalnızca bize ait.
 */
const PALET = {
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

export function markaStiliUygula(harita: MapLibreMap) {
  const stil = harita.getStyle();
  if (!stil?.layers) return;

  for (const katman of stil.layers as LayerSpecification[]) {
    const id = katman.id;
    const kaynakKatman =
      "source-layer" in katman ? (katman["source-layer"] as string) : "";

    if (katman.type === "background") {
      guvenliBoya(harita, id, "background-color", PALET.zemin);
      continue;
    }

    if (katman.type === "symbol") {
      const poi = kaynakKatman === "poi" || id.includes("poi");
      guvenliBoya(
        harita,
        id,
        "text-color",
        poi ? PALET.yaziSonuk : PALET.yazi,
      );
      guvenliBoya(harita, id, "text-halo-color", PALET.hale);
      guvenliBoya(harita, id, "text-halo-width", 1.6);
      guvenliBoya(harita, id, "icon-opacity", poi ? 0.45 : 0.8);
      if (poi) guvenliDuzen(harita, id, "text-size", 10);
      continue;
    }

    switch (kaynakKatman) {
      case "water":
      case "waterway":
        guvenliBoya(harita, id, "fill-color", PALET.su);
        guvenliBoya(harita, id, "line-color", PALET.su);
        break;
      case "park":
      case "landcover":
        guvenliBoya(harita, id, "fill-color", PALET.yesil);
        guvenliBoya(harita, id, "fill-opacity", 0.9);
        break;
      case "landuse":
        guvenliBoya(harita, id, "fill-color", PALET.arazi);
        guvenliBoya(harita, id, "fill-opacity", 0.7);
        break;
      case "building":
        guvenliBoya(harita, id, "fill-color", PALET.bina);
        guvenliBoya(harita, id, "fill-outline-color", PALET.binaCizgi);
        break;
      case "boundary":
        guvenliBoya(harita, id, "line-color", PALET.sinir);
        break;
      case "transportation":
        if (id.includes("rail")) {
          guvenliBoya(harita, id, "line-color", PALET.demiryolu);
        } else if (id.includes("casing") || id.includes("outline")) {
          guvenliBoya(
            harita,
            id,
            "line-color",
            id.includes("motorway") || id.includes("trunk")
              ? PALET.otoyolKenar
              : PALET.yolKenar,
          );
        } else if (id.includes("motorway") || id.includes("trunk")) {
          guvenliBoya(harita, id, "line-color", PALET.otoyol);
        } else if (id.includes("minor") || id.includes("service")) {
          guvenliBoya(harita, id, "line-color", PALET.yolIkincil);
        } else {
          guvenliBoya(harita, id, "line-color", PALET.yolBeyaz);
        }
        break;
      default:
        break;
    }
  }
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
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "render_height"], 6],
          0,
          "#f0f0f4",
          40,
          "#e2e2e9",
          120,
          "#d3d3dc",
        ],
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

export function ucBoyutluBinalariGoster(harita: MapLibreMap, goster: boolean) {
  if (!harita.getLayer("bina-3b")) return;
  guvenliDuzen(harita, "bina-3b", "visibility", goster ? "visible" : "none");
}
