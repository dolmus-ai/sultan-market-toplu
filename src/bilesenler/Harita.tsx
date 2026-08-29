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
import { haritaDurumRengi } from "@/lib/bicim";
import type { Tema } from "@/lib/harita-stili";
import { MARKET } from "@/lib/market";
import type { RotaSecenegi } from "@/lib/navigasyon";
import type {
  Nokta,
  RotaSonucu,
  Siparis,
  Abonelik,
  KuryeKonumu,
} from "@/lib/tipler";

export type Katmanlar = {
  abonelikler: boolean;
  teslimEdilenler: boolean;
  ucBoyut: boolean;
  isiHaritasi: boolean;
  karanlik: boolean;
};

export type HaritaApi = {
  ucur: (nokta: Nokta, zoom?: number) => void;
  hepsiniSigdir: (noktalar: Nokta[]) => void;
  pusulaSifirla: () => void;
  egimDegistir: () => void;
  yakinlastir: (yon: 1 | -1) => void;
  aci: () => { bearing: number; pitch: number };
  /** Bir rota çizgisinin tamamını ekrana sığdırır. */
  geometriyiSigdir: (geometri: [number, number][], altBosluk?: number) => void;
  /** Sürüş kamerası: kuryenin arkasından, eğik ve yakın. */
  surusKamerasi: (nokta: Nokta, bearing: number) => void;
};

type Props = {
  ref?: RefObject<HaritaApi | null>;
  teslimatlar: Siparis[];
  abonelikler: Abonelik[];
  seciliId: string | null;
  secimModu: boolean;
  secilenler: string[];
  rota: RotaSonucu | null;
  navigasyonSecenekleri: RotaSecenegi[];
  seciliSecenekId: string | null;
  katmanlar: Katmanlar;
  kuryeKonumu: Nokta | null;
  kuryeYonu: number | null;
  /** Vardiyadaki diğer kuryeler — aynı mahalleye iki kişi gitmesin. */
  digerKuryeler: (KuryeKonumu & { ad: string })[];
  onSecim: (id: string) => void;
  onSecenekSec?: (id: string) => void;
  /** Kurye haritayı eliyle kaydırdığında — takip kilidini bırakmak için. */
  onKullaniciHareketi?: () => void;
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

/**
 * fitBounds dolgusu kanvastan büyük olursa MapLibre çerçeveyi hiç
 * oturtmuyor ("Map cannot fit within canvas") ve kamera olduğu yerde
 * kalıyor. Kısa ekranlarda olan tam olarak bu; dolguyu kanvasa oranlıyoruz.
 */
function guvenliBosluk(
  harita: MapLibreMap,
  istenen: { top: number; bottom: number; left: number; right: number },
) {
  const kanvas = harita.getCanvas();
  const en = kanvas.clientWidth || 1;
  const boy = kanvas.clientHeight || 1;

  const dikeyOran = Math.min(1, (boy * 0.7) / (istenen.top + istenen.bottom));
  const yatayOran = Math.min(1, (en * 0.7) / (istenen.left + istenen.right));

  return {
    top: Math.floor(istenen.top * dikeyOran),
    bottom: Math.floor(istenen.bottom * dikeyOran),
    left: Math.floor(istenen.left * yatayOran),
    right: Math.floor(istenen.right * yatayOran),
  };
}

/** Marketi haritaya sabit bir işaretçi olarak koyar. */
async function marketiIsaretle(harita: MapLibreMap) {
  const { Marker } = await import("maplibre-gl");
  const kutu = document.createElement("div");
  kutu.className = "relative";
  kutu.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
      <div style="width:36px;height:36px;border-radius:13px;background:#16212e;
                  display:flex;align-items:center;justify-content:center;
                  box-shadow:0 4px 14px rgba(14,14,17,.4);border:2.5px solid #fff">
        <svg width="27" height="27" viewBox="0 0 64 64" fill="none">
          <path d="M13.6 28.2C10.4 24.6 11.6 19.4 16.2 17.8" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
          <path d="M11.8 28.4C21.4 24.2 44.6 24.2 54.2 28.4L46.6 45.4C39.2 48.4 27.4 48.4 20 45.4Z" fill="#fff"/>
          <path d="M15.6 34.2C24.2 31.2 43 31.2 50.6 34.2" stroke="#16212e" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M18.4 40.2C26 37.6 41.2 37.6 47.8 40.2" stroke="#16212e" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="25.5" cy="12.4" r="8.2" fill="#e30a17"/>
          <circle cx="26.5" cy="55" r="4.8" fill="#e30a17"/>
          <circle cx="43.5" cy="55" r="4.8" fill="#e30a17"/>
        </svg>
      </div>
      <span style="font:800 10px/1 ui-sans-serif,system-ui;color:#0e0e11;
                   background:rgba(255,255,255,.9);padding:3px 7px;border-radius:999px;
                   white-space:nowrap;box-shadow:0 1px 4px rgba(14,14,17,.12)">MARKET</span>
    </div>`;
  new Marker({ element: kutu, anchor: "bottom" })
    .setLngLat([MARKET.nokta.lng, MARKET.nokta.lat])
    .addTo(harita);
}

/* ---------------- Kaynak ve katmanlar ---------------- */
function katmanlariKur(
  harita: MapLibreMap,
  secimRef: RefObject<(id: string) => void>,
  tiklamaRef: RefObject<((nokta: Nokta) => void) | undefined>,
  secenekRef: RefObject<((id: string) => void) | undefined>,
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
  harita.addSource("navigasyon", { type: "geojson", data: BOS_GEOJSON });
  harita.addSource("kuryeler", { type: "geojson", data: BOS_GEOJSON });

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

  /* Navigasyon — seçilmeyen alternatifler soluk, seçili olan kırmızı */
  harita.addLayer({
    id: "nav-alternatif-kenar",
    type: "line",
    source: "navigasyon",
    filter: ["!", ["get", "secili"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "altKenar"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 17, 15],
      "line-opacity": 0.9,
    },
  });
  harita.addLayer({
    id: "nav-alternatif",
    type: "line",
    source: "navigasyon",
    filter: ["!", ["get", "secili"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "alt"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 17, 11],
      "line-opacity": 0.95,
    },
  });
  harita.addLayer({
    id: "nav-golge",
    type: "line",
    source: "navigasyon",
    filter: ["get", "secili"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#000000",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 14, 17, 26],
      "line-opacity": 0.22,
      "line-blur": 6,
      "line-translate": [0, 2],
    },
  });
  harita.addLayer({
    id: "nav-kenar",
    type: "line",
    source: "navigasyon",
    filter: ["get", "secili"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#7d060f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 10, 17, 19],
    },
  });
  harita.addLayer({
    id: "nav-aktif",
    type: "line",
    source: "navigasyon",
    filter: ["get", "secili"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#e30a17",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6.5, 17, 14],
    },
  });
  // Üstte ince açık kırmızı bir parlaklık — şerit hacim kazansın.
  harita.addLayer({
    id: "nav-parlak",
    type: "line",
    source: "navigasyon",
    filter: ["get", "secili"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ff5a67",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 17, 4.5],
      "line-opacity": 0.55,
      "line-translate": [0, -1.5],
    },
  });
  harita.addLayer({
    id: "nav-akis",
    type: "line",
    source: "navigasyon",
    filter: ["get", "secili"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 17, 2.6],
      "line-opacity": 0.75,
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

  /* Diğer kuryeler — soluk gri, adlarıyla */
  harita.addLayer({
    id: "kurye-hale",
    type: "circle",
    source: "kuryeler",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 17, 16],
      "circle-color": "#6b7280",
      "circle-opacity": 0.22,
    },
  });
  harita.addLayer({
    id: "kurye-nokta",
    type: "circle",
    source: "kuryeler",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 17, 7.5],
      "circle-color": "#6b7280",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
  harita.addLayer({
    id: "kurye-etiket",
    type: "symbol",
    source: "kuryeler",
    minzoom: 13,
    layout: {
      "text-field": ["get", "ad"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 10,
      "text-offset": [0, -1.5],
      "text-anchor": "bottom",
    },
    paint: {
      "text-color": "#6b7280",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
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
      "circle-stroke-color": ["case", ["get", "secili"], "#0e0e11", "#ffffff"],
      "circle-stroke-width": ["case", ["get", "secili"], 4, 3],
    },
  });
  harita.addLayer({
    id: "teslimat-sira",
    type: "symbol",
    source: "teslimatlar",
    filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "sira"], ""]],
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
  ["teslimat-nokta", "kume", "abonelik-halka", "nav-alternatif"].forEach(
    isaretci,
  );

  harita.on("click", "nav-alternatif", (e: MapMouseEvent) => {
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["nav-alternatif"],
    })[0];
    const id = ozellik?.properties?.id;
    if (typeof id === "string") secenekRef.current?.(id);
  });

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
  navigasyonSecenekleri,
  seciliSecenekId,
  katmanlar,
  kuryeKonumu,
  kuryeYonu,
  digerKuryeler,
  onSecim,
  onSecenekSec,
  onKullaniciHareketi,
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
  // Art arda gelen konum güncellemeleri aynı anda iki imleç oluşturmasın.
  const kuryeOlusuyorRef = useRef(false);
  // Güncel geri çağırımları harita olay dinleyicilerine taşımak için.
  const secimRef = useRef(onSecim);
  const tiklamaRef = useRef(onHaritaTikla);
  const secenekRef = useRef(onSecenekSec);
  const temaRef = useRef<Tema>(katmanlar.karanlik ? "karanlik" : "aydinlik");
  const onKullaniciHareketiRef = useRef(onKullaniciHareketi);
  useEffect(() => {
    secimRef.current = onSecim;
    tiklamaRef.current = onHaritaTikla;
    secenekRef.current = onSecenekSec;
    onKullaniciHareketiRef.current = onKullaniciHareketi;
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

      for (const olay of ["dragstart", "zoomstart", "rotatestart"] as const) {
        harita.on(olay, (e: { originalEvent?: unknown }) => {
          // Yalnızca elle yapılan hareketler takibi bırakır.
          if (e?.originalEvent) onKullaniciHareketiRef.current?.();
        });
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
        ucBoyutluBinalarEkle(harita);
        markaStiliUygula(harita, temaRef.current);
        katmanlariKur(harita, secimRef, tiklamaRef, secenekRef);
        marketiIsaretle(harita);
        hazirRef.current = true;
        setHazir(true);
        onHazir?.();
      };
      harita.on("styledata", kur);

      temizle = () => {
        kuryeMarkerRef.current?.remove();
        kuryeMarkerRef.current = null;
        kuryeOlusuyorRef.current = false;
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
    const renkler = haritaDurumRengi(katmanlar.karanlik);

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
          renk: renkler[s.durum],
          ad: s.musteri?.ad ?? "Müşteri",
          sira: sirali.has(s.id) ? String(sirali.get(s.id)) : "",
          secili: secilenKume.has(s.id) || seciliId === s.id,
          cerceve:
            secilenKume.has(s.id) || seciliId === s.id
              ? katmanlar.karanlik
                ? "#ffffff"
                : "#0e0e11"
              : katmanlar.karanlik
                ? "#101216"
                : "#ffffff",
          aktif: seciliId === s.id,
        },
      }));

    kaynak.setData({ type: "FeatureCollection", features: ozellikler });
    yogunluk?.setData({ type: "FeatureCollection", features: ozellikler });
  }, [
    hazir,
    teslimatlar,
    seciliId,
    secilenler,
    rota,
    katmanlar.teslimEdilenler,
    katmanlar.karanlik,
  ]);

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

  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const kaynak = harita.getSource("navigasyon") as GeoJSONSource | undefined;
    kaynak?.setData({
      type: "FeatureCollection",
      // Seçili olan en sonda çizilsin diye sıralıyoruz.
      features: [...navigasyonSecenekleri]
        .sort(
          (a, b) =>
            Number(a.id === seciliSecenekId) - Number(b.id === seciliSecenekId),
        )
        .map((s) => ({
          type: "Feature",
          properties: {
            id: s.id,
            secili: s.id === seciliSecenekId,
            alt: katmanlar.karanlik ? "#8e9bab" : "#a9b0ba",
            altKenar: katmanlar.karanlik ? "#5c6673" : "#8a919c",
          },
          geometry: { type: "LineString", coordinates: s.geometri },
        })),
    });
  }, [hazir, navigasyonSecenekleri, seciliSecenekId, katmanlar.karanlik]);

  /* Tema değişince harita paletini yeniden uygula. */
  useEffect(() => {
    const tema: Tema = katmanlar.karanlik ? "karanlik" : "aydinlik";
    temaRef.current = tema;
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;

    markaStiliUygula(harita, tema);

    // Kendi katmanlarımızın kontrastını da çevir.
    const karanlik = tema === "karanlik";
    if (harita.getLayer("teslimat-etiket")) {
      harita.setPaintProperty(
        "teslimat-etiket",
        "text-color",
        karanlik ? "#eef0f3" : "#0e0e11",
      );
      harita.setPaintProperty(
        "teslimat-etiket",
        "text-halo-color",
        karanlik ? "#101216" : "#ffffff",
      );
    }
    if (harita.getLayer("kurye-etiket")) {
      harita.setPaintProperty(
        "kurye-etiket",
        "text-color",
        karanlik ? "#aeb7c2" : "#6b7280",
      );
      harita.setPaintProperty(
        "kurye-etiket",
        "text-halo-color",
        karanlik ? "#101216" : "#ffffff",
      );
    }
    for (const katman of ["abonelik-halka", "kume", "kurye-nokta"]) {
      if (harita.getLayer(katman)) {
        harita.setPaintProperty(
          katman,
          "circle-stroke-color",
          karanlik ? "#e9ecf1" : "#ffffff",
        );
      }
    }
    if (harita.getLayer("abonelik-halka")) {
      harita.setPaintProperty(
        "abonelik-halka",
        "circle-color",
        karanlik ? "#101216" : "#ffffff",
      );
    }
  }, [hazir, katmanlar.karanlik]);

  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazirRef.current) return;
    const kaynak = harita.getSource("kuryeler") as GeoJSONSource | undefined;
    kaynak?.setData({
      type: "FeatureCollection",
      features: digerKuryeler.map((k) => ({
        type: "Feature",
        properties: { id: k.kurye_id, ad: k.ad },
        geometry: { type: "Point", coordinates: [k.lng, k.lat] },
      })),
    });
  }, [hazir, digerKuryeler]);

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
      if (kuryeOlusuyorRef.current) return;
      kuryeOlusuyorRef.current = true;
      try {
        const { Marker: MapLibreMarker } = await import("maplibre-gl");
        if (iptal || !haritaRef.current) return;

        if (!kuryeMarkerRef.current) {
          const kutu = document.createElement("div");
          kutu.style.cssText = "width:132px;height:132px;position:relative";
          // Koni ve nokta haritayla birlikte dönsün diye rotationAlignment: map.
          kutu.innerHTML = `
          <svg viewBox="-66 -66 132 132" width="132" height="132" style="overflow:visible">
            <defs>
              <radialGradient id="kurye-koni" cx="50%" cy="100%" r="100%">
                <stop offset="0%" stop-color="#e30a17" stop-opacity=".55"/>
                <stop offset="55%" stop-color="#e30a17" stop-opacity=".22"/>
                <stop offset="100%" stop-color="#e30a17" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <path class="kurye-koni" d="M0 0 L-30 -56 A63 63 0 0 1 30 -56 Z"
                  fill="url(#kurye-koni)"/>
            <circle cx="0" cy="0" r="17" fill="#e30a17" opacity=".18"/>
            <circle cx="0" cy="0" r="11" fill="#ffffff"/>
            <circle cx="0" cy="0" r="7.5" fill="#e30a17"/>
          </svg>`;

          kuryeMarkerRef.current = new MapLibreMarker({
            element: kutu,
            rotationAlignment: "map",
            pitchAlignment: "map",
          })
            .setLngLat([kuryeKonumu.lng, kuryeKonumu.lat])
            .addTo(harita);
        } else {
          kuryeMarkerRef.current.setLngLat([kuryeKonumu.lng, kuryeKonumu.lat]);
        }

        // Yön bilinmiyorsa koniyi gizle, imleci sade nokta olarak bırak.
        const koni = kuryeMarkerRef.current
          ?.getElement()
          .querySelector<SVGElement>(".kurye-koni");
        if (koni) koni.style.display = kuryeYonu == null ? "none" : "";
        kuryeMarkerRef.current?.setRotation(kuryeYonu ?? 0);
      } finally {
        kuryeOlusuyorRef.current = false;
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
          {
            padding: guvenliBosluk(harita, {
              top: 90,
              bottom: 340,
              left: 48,
              right: 48,
            }),
            duration: 1200,
          },
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
      geometriyiSigdir: (geometri, altBosluk = 300) => {
        const harita = haritaRef.current;
        if (!harita || geometri.length < 2) return;
        const enler = geometri.map((k) => k[0]);
        const boylar = geometri.map((k) => k[1]);
        harita.fitBounds(
          [
            [Math.min(...enler), Math.min(...boylar)],
            [Math.max(...enler), Math.max(...boylar)],
          ],
          {
            padding: guvenliBosluk(harita, {
              top: 110,
              bottom: altBosluk,
              left: 44,
              right: 44,
            }),
            pitch: 0,
            bearing: 0,
            duration: 1100,
          },
        );
      },
      surusKamerasi: (nokta, bearing) => {
        haritaRef.current?.easeTo({
          center: [nokta.lng, nokta.lat],
          zoom: 17.2,
          pitch: 62,
          bearing,
          duration: 900,
          essential: true,
        });
      },
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
