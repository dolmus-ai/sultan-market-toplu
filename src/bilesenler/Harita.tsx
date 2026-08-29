"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  markaStiliUygula,
  ucBoyutluBinalarEkle,
  ucBoyutluBinalariGoster,
} from "@/lib/harita-stili";
import { DURUM_RENK } from "@/lib/bicim";
import type { Nokta, RotaSonucu, Siparis, Abonelik } from "@/lib/tipler";

export type Katmanlar = {
  abonelikler: boolean;
  teslimEdilenler: boolean;
  ucBoyut: boolean;
  isiHaritasi: boolean;
};

export type HaritaApi = {
  ucur: (nokta: Nokta, zoom?: number) => void;
  hepsiniSigdir: (noktalar: Nokta[]) => void;
  pusulaSifirla: () => void;
  egimDegistir: () => void;
  yakinlastir: (yon: 1 | -1) => void;
  aci: () => { bearing: number; pitch: number };
};

type Props = {
  ref?: RefObject<HaritaApi | null>;
  teslimatlar: Siparis[];
  abonelikler: Abonelik[];
  seciliId: string | null;
  secimModu: boolean;
  secilenler: string[];
  rota: RotaSonucu | null;
  katmanlar: Katmanlar;
  kuryeKonumu: Nokta | null;
  kuryeYonu: number | null;
  onSecim: (id: string) => void;
  onHaritaTikla?: (nokta: Nokta) => void;
  onAciDegisti?: (bearing: number, pitch: number) => void;
  onHazir?: () => void;
};

const BOS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: [] as GeoJSON.Feature[],
};

function noktaVar(a: { lat: number | null; lng: number | null } | null) {
  return !!a && a.lat != null && a.lng != null;
}

/* ---------------- Kaynak ve katmanlar ---------------- */
function katmanlariKur(
harita: MapLibreMap,
secimRef: RefObject<(id: string) => void>,
tiklamaRef: RefObject<((nokta: Nokta) => void) | undefined>,
) {
  harita.addSource("teslimatlar", {
    type: "geojson",
    data: BOS_GEOJSON,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 56,
  });
  harita.addSource("yogunluk", { type: "geojson", data: BOS_GEOJSON });
  harita.addSource("abonelikler", { type: "geojson", data: BOS_GEOJSON });
  harita.addSource("rota", { type: "geojson", data: BOS_GEOJSON });

  /* Isı haritası — talep yoğunluğu */
  harita.addLayer({
    id: "yogunluk-katmani",
    type: "heatmap",
    source: "yogunluk",
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 17, 3],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(227,10,23,0)",
        0.2,
        "rgba(255,190,190,0.55)",
        0.45,
        "rgba(255,120,120,0.72)",
        0.7,
        "rgba(240,50,60,0.82)",
        1,
        "rgba(160,5,15,0.9)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 17, 60],
      "heatmap-opacity": 0.75,
    },
  });

  /* Rota — siyah gölge, kırmızı gövde, akan beyaz kesik çizgi */
  harita.addLayer({
    id: "rota-golge",
    type: "line",
    source: "rota",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#0e0e11",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 17, 16],
      "line-opacity": 0.14,
      "line-blur": 3,
    },
  });
  harita.addLayer({
    id: "rota-govde",
    type: "line",
    source: "rota",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#e30a17",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 17, 7],
      "line-opacity": 0.95,
    },
  });
  harita.addLayer({
    id: "rota-akis",
    type: "line",
    source: "rota",
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 17, 3],
      "line-opacity": 0.9,
      "line-dasharray": [0, 3.5, 1.5, 3.5],
    },
  });

  /* Abonelik pinleri — beyaz gövde, siyah halka */
  harita.addLayer({
    id: "abonelik-halka",
    type: "circle",
    source: "abonelikler",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 17, 11],
      "circle-color": "#ffffff",
      "circle-stroke-color": "#0e0e11",
      "circle-stroke-width": 3,
    },
  });
  harita.addLayer({
    id: "abonelik-cekirdek",
    type: "circle",
    source: "abonelikler",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 17, 3.5],
      "circle-color": "#e30a17",
    },
  });

  /* Kümeler */
  harita.addLayer({
    id: "kume-hale",
    type: "circle",
    source: "teslimatlar",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#e30a17",
      "circle-opacity": 0.16,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "point_count"],
        2,
        26,
        10,
        38,
        40,
        54,
      ],
    },
  });
  harita.addLayer({
    id: "kume",
    type: "circle",
    source: "teslimatlar",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#e30a17",
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "point_count"],
        2,
        17,
        10,
        23,
        40,
        31,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  harita.addLayer({
    id: "kume-sayi",
    type: "symbol",
    source: "teslimatlar",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 14,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  });

  /* Tekil teslimat pinleri */
  harita.addLayer({
    id: "teslimat-nabiz",
    type: "circle",
    source: "teslimatlar",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["in", ["get", "durum"], ["literal", ["bekliyor", "yolda"]]],
    ],
    paint: {
      "circle-radius": 12,
      "circle-color": ["get", "renk"],
      "circle-opacity": 0.25,
    },
  });
  harita.addLayer({
    id: "teslimat-nokta",
    type: "circle",
    source: "teslimatlar",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11,
        ["case", ["get", "aktif"], 9, 6],
        17,
        ["case", ["get", "aktif"], 16, 12],
      ],
      "circle-color": ["get", "renk"],
      "circle-stroke-color": [
        "case",
        ["get", "secili"],
        "#0e0e11",
        "#ffffff",
      ],
      "circle-stroke-width": ["case", ["get", "secili"], 4, 3],
    },
  });
  harita.addLayer({
    id: "teslimat-sira",
    type: "symbol",
    source: "teslimatlar",
    filter: [
      "all",
      ["!", ["has", "point_count"]],
      ["!=", ["get", "sira"], ""],
    ],
    layout: {
      "text-field": ["get", "sira"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#ffffff" },
  });
  harita.addLayer({
    id: "teslimat-etiket",
    type: "symbol",
    source: "teslimatlar",
    filter: ["!", ["has", "point_count"]],
    minzoom: 15,
    layout: {
      "text-field": ["get", "ad"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-max-width": 9,
    },
    paint: {
      "text-color": "#0e0e11",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  /* Etkileşim */
  const isaretci = (id: string) => {
    harita.on("mouseenter", id, () => {
      harita.getCanvas().style.cursor = "pointer";
    });
    harita.on("mouseleave", id, () => {
      harita.getCanvas().style.cursor = "";
    });
  };
  ["teslimat-nokta", "kume", "abonelik-halka"].forEach(isaretci);

  harita.on("click", "teslimat-nokta", (e: MapMouseEvent) => {
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["teslimat-nokta"],
    })[0];
    const id = ozellik?.properties?.id;
    if (typeof id === "string") secimRef.current(id);
  });

  harita.on("click", "kume", async (e: MapMouseEvent) => {
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["kume"],
    })[0];
    const kumeId = ozellik?.properties?.cluster_id;
    if (kumeId == null) return;
    const kaynak = harita.getSource("teslimatlar") as GeoJSONSource;
    const zoom = await kaynak.getClusterExpansionZoom(Number(kumeId));
    const koordinat = (ozellik.geometry as GeoJSON.Point).coordinates;
    harita.easeTo({
      center: [koordinat[0], koordinat[1]],
      zoom: zoom + 0.4,
      duration: 700,
    });
  });

  /* Pin dışına tıklama — konum düzeltme için */
  harita.on("click", (e: MapMouseEvent) => {
    if (!tiklamaRef.current) return;
    const uzerinde = harita.queryRenderedFeatures(e.point, {
      layers: ["teslimat-nokta", "kume", "abonelik-halka"].filter((k) =>
        harita.getLayer(k),
      ),
    });
    if (uzerinde.length === 0) {
      tiklamaRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }
  });

  /* Nabız ve akan çizgi animasyonu */
  let cerceve = 0;
  const tikla = () => {
    cerceve = requestAnimationFrame(tikla);
    const t = performance.now();
    const evre = (t % 2000) / 2000;
    if (harita.getLayer("teslimat-nabiz")) {
      harita.setPaintProperty(
        "teslimat-nabiz",
        "circle-radius",
        12 + evre * 26,
      );
      harita.setPaintProperty(
        "teslimat-nabiz",
        "circle-opacity",
        0.28 * (1 - evre),
      );
    }
    if (harita.getLayer("rota-akis")) {
      const kayma = (t % 700) / 700;
      harita.setPaintProperty("rota-akis", "line-dasharray", [
        kayma * 4,
        3.5,
        1.5,
        3.5,
      ]);
    }
  };
  cerceve = requestAnimationFrame(tikla);
  harita.once("remove", () => cancelAnimationFrame(cerceve));
}


export default function Harita({
  ref,
  teslimatlar,
  abonelikler,
  seciliId,
  secimModu,
  secilenler,
  rota,
  katmanlar,
  kuryeKonumu,
  kuryeYonu,
  onSecim,
  onHaritaTikla,
  onAciDegisti,
  onHazir,
}: Props) {
  const kapsayiciRef = useRef<HTMLDivElement>(null);
  const haritaRef = useRef<MapLibreMap | null>(null);
  const hazirRef = useRef(false);
  // Katmanlar kurulduğunda veri efektlerinin yeniden çalışması için state.
  const [hazir, setHazir] = useState(false);
  const kuryeMarkerRef = useRef<Marker | null>(null);
  // Güncel geri çağırımları harita olay dinleyicilerine taşımak için.
  const secimRef = useRef(onSecim);
  const tiklamaRef = useRef(onHaritaTikla);
  useEffect(() => {
    secimRef.current = onSecim;
    tiklamaRef.current = onHaritaTikla;
  });

  /* ---------------- Haritayı kur ---------------- */
  useEffect(() => {
    let iptal = false;
    let temizle: (() => void) | undefined;

    (async () => {
      const { Map: MapLibre } = await import("maplibre-gl");
      if (iptal || !kapsayiciRef.current || haritaRef.current) return;

      const harita = new MapLibre({
        container: kapsayiciRef.current,
        style:
          process.env.NEXT_PUBLIC_HARITA_STILI ??
          "https://tiles.openfreemap.org/styles/liberty",
        center: [
          Number(process.env.NEXT_PUBLIC_MERKEZ_LNG ?? 29.027),
          Number(process.env.NEXT_PUBLIC_MERKEZ_LAT ?? 40.9903),
        ],
        zoom: Number(process.env.NEXT_PUBLIC_MERKEZ_ZOOM ?? 14),
        pitch: 45,
        bearing: -12,
        attributionControl: { compact: true },
        dragRotate: true,
        pitchWithRotate: true,
        maxPitch: 75,
      });
      haritaRef.current = harita;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __harita?: MapLibreMap }).__harita = harita;
        harita.on("error", (e) =>
          console.error("[harita]", e.error?.message ?? e),
        );
      }

      harita.on("rotate", () =>
        onAciDegisti?.(harita.getBearing(), harita.getPitch()),
      );
      harita.on("pitch", () =>
        onAciDegisti?.(harita.getBearing(), harita.getPitch()),
      );

      // `load` ilk karolar inene kadar beklediği için katmanları stil
      // ayrıştırılır ayrıştırılmaz kuruyoruz.
      const kur = () => {
        if (iptal || hazirRef.current || !harita.getStyle()?.layers) return;
        markaStiliUygula(harita);
        ucBoyutluBinalarEkle(harita);
        katmanlariKur(harita, secimRef, tiklamaRef);
        hazirRef.current = true;
        setHazir(true);
        onHazir?.();
      };
      harita.on("styledata", kur);

      temizle = () => {
        kuryeMarkerRef.current?.remove();
        kuryeMarkerRef.current = null;
        harita.remove();
        haritaRef.current = null;
        hazirRef.current = false;
        setHazir(false);
      };
    })();

    return () => {
      iptal = true;
      temizle?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Veri güncellemeleri ---------------- */
  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const kaynak = harita.getSource("teslimatlar") as GeoJSONSource | undefined;
    const yogunluk = harita.getSource("yogunluk") as GeoJSONSource | undefined;
    if (!kaynak) return;

    const sirali = new Map(rota?.sira.map((id, i) => [id, i + 1]) ?? []);
    const secilenKume = new Set(secilenler);

    const ozellikler: GeoJSON.Feature[] = teslimatlar
      .filter((s) => noktaVar(s.adres))
      .filter((s) => katmanlar.teslimEdilenler || s.durum !== "teslim")
      .map((s) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.adres!.lng!, s.adres!.lat!],
        },
        properties: {
          id: s.id,
          durum: s.durum,
          renk: DURUM_RENK[s.durum],
          ad: s.musteri?.ad ?? "Müşteri",
          sira: sirali.has(s.id) ? String(sirali.get(s.id)) : "",
          secili: secilenKume.has(s.id) || seciliId === s.id,
          aktif: seciliId === s.id,
        },
      }));

    kaynak.setData({ type: "FeatureCollection", features: ozellikler });
    yogunluk?.setData({ type: "FeatureCollection", features: ozellikler });
  }, [hazir, teslimatlar, seciliId, secilenler, rota, katmanlar.teslimEdilenler]);

  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const kaynak = harita.getSource("abonelikler") as GeoJSONSource | undefined;
    kaynak?.setData({
      type: "FeatureCollection",
      features: abonelikler
        .filter((a) => noktaVar(a.adres))
        .map((a) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [a.adres!.lng!, a.adres!.lat!],
          },
          properties: { id: a.id, ad: a.musteri?.ad ?? "" },
        })),
    });
  }, [hazir, abonelikler]);

  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const kaynak = harita.getSource("rota") as GeoJSONSource | undefined;
    kaynak?.setData(
      rota && rota.geometri.length > 1
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: rota.geometri },
              },
            ],
          }
        : BOS_GEOJSON,
    );
  }, [hazir, rota]);

  /* ---------------- Katman görünürlüğü ---------------- */
  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const gorunur = (id: string, acik: boolean) => {
      if (harita.getLayer(id))
        harita.setLayoutProperty(id, "visibility", acik ? "visible" : "none");
    };
    gorunur("abonelik-halka", katmanlar.abonelikler);
    gorunur("abonelik-cekirdek", katmanlar.abonelikler);
    gorunur("yogunluk-katmani", katmanlar.isiHaritasi);
    ucBoyutluBinalariGoster(harita, katmanlar.ucBoyut);
  }, [hazir, katmanlar]);

  /* ---------------- Kurye imleci ---------------- */
  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !kuryeKonumu) return;
    let iptal = false;

    (async () => {
      const { Marker: MapLibreMarker } = await import("maplibre-gl");
      if (iptal || !haritaRef.current) return;

      if (!kuryeMarkerRef.current) {
        const kutu = document.createElement("div");
        kutu.className = "relative h-6 w-6";
        kutu.innerHTML = `
          <span class="absolute inset-0 rounded-full bg-[#e30a17]/25 animate-ping"></span>
          <span class="absolute inset-[5px] rounded-full bg-[#0e0e11] ring-[3px] ring-white shadow-[0_2px_10px_rgba(0,0,0,.35)]"></span>
          <svg class="kurye-yon absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2" viewBox="0 0 12 12" fill="none">
            <path d="M6 0 L10.5 10.5 L6 8 L1.5 10.5 Z" fill="#e30a17"/>
          </svg>`;
        kuryeMarkerRef.current = new MapLibreMarker({ element: kutu })
          .setLngLat([kuryeKonumu.lng, kuryeKonumu.lat])
          .addTo(harita);
      } else {
        kuryeMarkerRef.current.setLngLat([kuryeKonumu.lng, kuryeKonumu.lat]);
      }

      const ok = kuryeMarkerRef.current
        ?.getElement()
        .querySelector<SVGElement>(".kurye-yon");
      if (ok) {
        ok.style.transformOrigin = "50% 200%";
        ok.style.transition = "transform .4s cubic-bezier(.22,1,.36,1)";
        ok.style.transform = `translateX(-50%) rotate(${kuryeYonu ?? 0}deg)`;
      }
    })();

    return () => {
      iptal = true;
    };
  }, [kuryeKonumu, kuryeYonu]);

  /* ---------------- Dışa açılan harita komutları ---------------- */
  useImperativeHandle(
    ref,
    (): HaritaApi => ({
      ucur: (nokta, zoom = 16.5) => {
        haritaRef.current?.flyTo({
          center: [nokta.lng, nokta.lat],
          zoom,
          pitch: 55,
          duration: 1400,
          curve: 1.5,
          essential: true,
        });
      },
      hepsiniSigdir: (noktalar) => {
        const harita = haritaRef.current;
        if (!harita || noktalar.length === 0) return;
        if (noktalar.length === 1) {
          harita.flyTo({
            center: [noktalar[0].lng, noktalar[0].lat],
            zoom: 16,
            duration: 1200,
          });
          return;
        }
        const enler = noktalar.map((n) => n.lng);
        const boylar = noktalar.map((n) => n.lat);
        harita.fitBounds(
          [
            [Math.min(...enler), Math.min(...boylar)],
            [Math.max(...enler), Math.max(...boylar)],
          ],
          { padding: { top: 90, bottom: 340, left: 48, right: 48 }, duration: 1200 },
        );
      },
      pusulaSifirla: () =>
        haritaRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 600 }),
      egimDegistir: () => {
        const harita = haritaRef.current;
        if (!harita) return;
        harita.easeTo({
          pitch: harita.getPitch() > 20 ? 0 : 55,
          duration: 700,
        });
      },
      yakinlastir: (yon) =>
        haritaRef.current?.easeTo({
          zoom: (haritaRef.current?.getZoom() ?? 14) + yon,
          duration: 400,
        }),
      aci: () => ({
        bearing: haritaRef.current?.getBearing() ?? 0,
        pitch: haritaRef.current?.getPitch() ?? 0,
      }),
    }),
    [],
  );

  return (
    <div
      ref={kapsayiciRef}
      // maplibre-gl.css katmansız yüklendiği için Tailwind'in `absolute`
      // utility'sini ezip konteyneri sıfır yükseklikte bırakıyor; bu yüzden
      // konumlandırma satır içi stille veriliyor.
      style={{ position: "absolute", inset: 0 }}
      data-secim-modu={secimModu ? "acik" : "kapali"}
    />
  );
}
