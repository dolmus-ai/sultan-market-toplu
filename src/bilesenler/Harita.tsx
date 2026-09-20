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
  MapTouchEvent,
  Marker,
} from "maplibre-gl";
import { createPortal } from "react-dom";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  BINA_ATIFI,
  GoogleAtifi,
  googleHataMetni,
  googleKatmaniEkle,
  googleKatmaniGoster,
  googleOturumuAc,
  googleTemelStili,
  oturumuUnut,
} from "@/lib/google-karo";
import {
  markaStiliUygula,
  ucBoyutluBinalarEkle,
  ucBoyutluBinalariGoster,
} from "@/lib/harita-stili";
import { haritaDurumRengi } from "@/lib/bicim";
import type { Tema } from "@/lib/harita-stili";
import { SAKARYA_SINIRI } from "@/lib/alan";
import { MARKET } from "@/lib/market";
import {
  BINA_KARO_KAYNAGI,
  GOOGLE_HARITA_ANAHTARI,
  HARITA_STILI,
  MERKEZ,
} from "@/lib/ortam";
import type { RotaSecenegi } from "@/lib/navigasyon";
import type {
  Nokta,
  RotaSonucu,
  Siparis,
  Abonelik,
  KuryeKonumu,
  Sepet,
} from "@/lib/tipler";

export type Katmanlar = {
  abonelikler: boolean;
  sepetler: boolean;
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
  sepetler: Sepet[];
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
  /** Abonelik pinine dokunuldu. */
  onAbonelikSecim?: (id: string) => void;
  /** Sepet pinine dokunuldu. */
  onSepetSecim?: (id: string) => void;
  /** Pine uzun basıldı (masaüstünde basılı tutma, mobilde uzun dokunuş). */
  onUzunBasis?: (tur: "teslimat" | "abonelik" | "sepet", id: string) => void;
  /**
   * Haritada bir pinin üstünde duran balon. Konumlandırmayı MapLibre
   * yapıyor, içeriği React portal ile basılıyor.
   */
  balon?: { lat: number; lng: number; icerik: React.ReactNode } | null;
  onSecenekSec?: (id: string) => void;
  /** Kurye haritayı eliyle kaydırdığında — takip kilidini bırakmak için. */
  onKullaniciHareketi?: () => void;
  onHaritaTikla?: (nokta: Nokta) => void;
  onAciDegisti?: (bearing: number, pitch: number) => void;
  onHazir?: () => void;
};

/**
 * Kuryenin kendi imleci açık yeşil: teslimat pinleri kırmızı-siyah
 * ailesinden geldiği için "ben neredeyim" bir bakışta ayrılsın.
 */
const KURYE_RENGI = "#4ade80";

/**
 * maplibre-gl modül sözü, bir kez.
 *
 * `Marker` yalnızca kurye imleci için gerekiyor ve dinamik alınıyor. Sözü
 * saklamak art arda gelen konum güncellemelerinin aynı yüklemeye bağlanmasını
 * sağlıyor: hepsi sırayla çalışıyor, hiçbiri diğerini düşürmüyor.
 */
let maplibreSozu: Promise<typeof import("maplibre-gl")> | null = null;

/**
 * Anahtar varsa zemin Google Map Tiles API'den geliyor; yoksa OpenFreeMap
 * vektör stiline düşülüyor. Pinler, rota, kümeler ve öteki katmanlar iki
 * durumda da aynı MapLibre katmanları — değişen yalnızca altlık.
 */
const GOOGLE_MODU = GOOGLE_HARITA_ANAHTARI !== "";

/** Stil ayrıştırılana kadar bekler; katman eklemek ondan önce hata veriyor. */
function stilHazirOlunca(harita: MapLibreMap) {
  return new Promise<void>((coz) => {
    if (harita.getStyle()?.layers) return coz();
    harita.once("styledata", () => coz());
  });
}

/** Açılış stili: Google modunda yerel temel stil, değilse yedek stil adresi. */
function acilisStili(tema: Tema) {
  return GOOGLE_MODU
    ? googleTemelStili(tema, BINA_KARO_KAYNAGI, window.location.origin)
    : HARITA_STILI;
}

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
  // İşaretçinin kutusu tam olarak simge kadar (36x36) ve `anchor: "center"`
  // ile ortalanıyor; böylece simgenin merkezi marketin gerçek koordinatına
  // oturuyor. Etiket akıştan çıkarılıp altına asılıyor — kutunun boyuna
  // katılsaydı MapLibre kutunun altını noktaya hizalar ve simge, yakınlık
  // azaldıkça büyüyen bir payla kuzeye kayardı (z14'te ~250 m).
  const kutu = document.createElement("div");
  kutu.style.cssText = "position:relative;width:36px;height:36px";
  kutu.innerHTML = `
    <div style="position:relative;width:36px;height:36px">
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
      <span style="position:absolute;top:calc(100% + 3px);left:50%;
                   transform:translateX(-50%);
                   font:800 10px/1 ui-sans-serif,system-ui;color:#0e0e11;
                   background:rgba(255,255,255,.9);padding:3px 7px;border-radius:999px;
                   white-space:nowrap;box-shadow:0 1px 4px rgba(14,14,17,.12)">MARKET</span>
    </div>`;
  new Marker({ element: kutu, anchor: "center" })
    .setLngLat([MARKET.nokta.lng, MARKET.nokta.lat])
    .addTo(harita);
}

/* ---------------- Kaynak ve katmanlar ---------------- */
function katmanlariKur(
  harita: MapLibreMap,
  secimRef: RefObject<(id: string) => void>,
  tiklamaRef: RefObject<((nokta: Nokta) => void) | undefined>,
  secenekRef: RefObject<((id: string) => void) | undefined>,
  abonelikRef: RefObject<((id: string) => void) | undefined>,
  sepetRef: RefObject<((id: string) => void) | undefined>,
  uzunRef: RefObject<
    ((tur: "teslimat" | "abonelik" | "sepet", id: string) => void) | undefined
  >,
) {
  /**
   * Uzun basış, uzun basıştan sonra gelen "click" olayını yutmak için
   * paylaşılan bayrak: yoksa hem teslim işaretlenir hem balon açılırdı.
   */
  const basim = { uzunOldu: false };
  harita.addSource("teslimatlar", {
    type: "geojson",
    data: BOS_GEOJSON,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 56,
  });
  harita.addSource("yogunluk", { type: "geojson", data: BOS_GEOJSON });
  harita.addSource("abonelikler", { type: "geojson", data: BOS_GEOJSON });
  harita.addSource("sepetler", { type: "geojson", data: BOS_GEOJSON });
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

  /* Sepet pinleri — beyaz gövde, siyah halka, turuncu çekirdek */
  harita.addLayer({
    id: "sepet-halka",
    type: "circle",
    source: "sepetler",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 6, 17, 11],
      "circle-color": "#ffffff",
      "circle-stroke-color": "#0e0e11",
      "circle-stroke-width": 3,
    },
  });
  harita.addLayer({
    id: "sepet-cekirdek",
    type: "circle",
    source: "sepetler",
    layout: { visibility: "none" },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 17, 3.5],
      "circle-color": "#f59e0b",
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
  [
    "teslimat-nokta",
    "kume",
    "abonelik-halka",
    "sepet-halka",
    "nav-alternatif",
  ].forEach(
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
    if (basim.uzunOldu) return;
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["teslimat-nokta"],
    })[0];
    const id = ozellik?.properties?.id;
    if (typeof id === "string") secimRef.current(id);
  });

  harita.on("click", "abonelik-halka", (e: MapMouseEvent) => {
    if (basim.uzunOldu) return;
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["abonelik-halka"],
    })[0];
    const id = ozellik?.properties?.id;
    if (typeof id === "string") abonelikRef.current?.(id);
  });

  harita.on("click", "sepet-halka", (e: MapMouseEvent) => {
    if (basim.uzunOldu) return;
    const ozellik = harita.queryRenderedFeatures(e.point, {
      layers: ["sepet-halka"],
    })[0];
    const id = ozellik?.properties?.id;
    if (typeof id === "string") sepetRef.current?.(id);
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

  /**
   * Uzun basış: masaüstünde fareyi basılı tutma, mobilde parmağı bekletme.
   * Parmak kayarsa (harita sürükleniyorsa) iptal oluyor.
   */
  function uzunBasisKur(
    katmanId: string,
    tur: "teslimat" | "abonelik" | "sepet",
  ) {
    let sayac: number | null = null;
    let baslangic: { x: number; y: number } | null = null;

    const iptal = () => {
      if (sayac != null) window.clearTimeout(sayac);
      sayac = null;
      baslangic = null;
    };

    const basla = (e: MapMouseEvent | MapTouchEvent) => {
      const nokta = "point" in e ? e.point : null;
      if (!nokta) return;
      const ozellik = harita.queryRenderedFeatures(nokta, {
        layers: [katmanId],
      })[0];
      const id = ozellik?.properties?.id;
      if (typeof id !== "string") return;

      baslangic = { x: nokta.x, y: nokta.y };
      basim.uzunOldu = false;
      sayac = window.setTimeout(() => {
        basim.uzunOldu = true;
        uzunRef.current?.(tur, id);
        // Bayrak bir sonraki tıklamayı yutup kendini sıfırlıyor.
        window.setTimeout(() => {
          basim.uzunOldu = false;
        }, 400);
        iptal();
      }, 480);
    };

    harita.on("mousedown", katmanId, basla);
    harita.on("touchstart", katmanId, basla);

    // Parmak/fare 8 pikselden fazla kayarsa bu bir sürükleme, uzun basış değil.
    const kaydiMi = (e: MapMouseEvent | MapTouchEvent) => {
      if (!baslangic || !("point" in e)) return;
      if (
        Math.abs(e.point.x - baslangic.x) > 8 ||
        Math.abs(e.point.y - baslangic.y) > 8
      )
        iptal();
    };

    harita.on("mousemove", kaydiMi);
    harita.on("touchmove", kaydiMi);
    harita.on("mouseup", iptal);
    harita.on("touchend", iptal);
    harita.on("touchcancel", iptal);
    harita.on("dragstart", iptal);
    harita.on("zoomstart", iptal);
  }

  uzunBasisKur("teslimat-nokta", "teslimat");
  uzunBasisKur("abonelik-halka", "abonelik");
  uzunBasisKur("sepet-halka", "sepet");

  /* Pin dışına tıklama — konum düzeltme için */
  harita.on("click", (e: MapMouseEvent) => {
    if (!tiklamaRef.current) return;
    const uzerinde = harita.queryRenderedFeatures(e.point, {
      layers: [
        "teslimat-nokta",
        "kume",
        "abonelik-halka",
        "sepet-halka",
      ].filter((k) =>
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
  sepetler,
  seciliId,
  secimModu,
  secilenler,
  rota,
  navigasyonSecenekleri,
  seciliSecenekId,
  katmanlar,
  kuryeKonumu,
  digerKuryeler,
  onSecim,
  onAbonelikSecim,
  onSepetSecim,
  onUzunBasis,
  balon,
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
  const [yuklenemedi, setYuklenemedi] = useState(false);
  const sayacRef = useRef<number | null>(null);
  /** +/- düğmeleriyle hedeflenen zoom; animasyon bitince sıfırlanır. */
  const hedefZoomRef = useRef<number | null>(null);
  /** Kuryenin "K" rozeti — ekrana göre hizalı, dönmeyen ayrı işaretçi. */
  const kuryeHarfRef = useRef<Marker | null>(null);
  // Güncel geri çağırımları harita olay dinleyicilerine taşımak için.
  const secimRef = useRef(onSecim);
  const tiklamaRef = useRef(onHaritaTikla);
  const secenekRef = useRef(onSecenekSec);
  const abonelikRef = useRef(onAbonelikSecim);
  const sepetRef = useRef(onSepetSecim);
  const uzunRef = useRef(onUzunBasis);
  const temaRef = useRef<Tema>(katmanlar.karanlik ? "karanlik" : "aydinlik");
  const onKullaniciHareketiRef = useRef(onKullaniciHareketi);
  /** Google oturumu açılamayınca gösterilen sebep. */
  const [googleHatasi, setGoogleHatasi] = useState<string | null>(null);
  const atifRef = useRef<GoogleAtifi | null>(null);
  // Karo isteği reddedilince (yanlış alan adı kısıtı gibi) uyarı bir kez çıksın.
  const googleKaroHatasiRef = useRef(false);
  /**
   * Google karolarını geçerli temaya göre kurar: oturumu (önbellekten ya da
   * ağdan) alır, kaynak ve katmanı ekler, öteki temanın karolarını gizler.
   * Oturum açılamazsa harita pinleriyle çalışmaya devam eder; kullanıcıya
   * sebep ve "yeniden dene" gösterilir. Efektler bunu ref üzerinden
   * çağırıyor: durum güncellemeleri hep ağ yanıtından sonra geliyor.
   */
  const googleKarolariYukle = async (yenile = false) => {
    const harita = haritaRef.current;
    if (!harita || !GOOGLE_MODU) return;
    const tema = temaRef.current;
    try {
      const oturum = await googleOturumuAc(GOOGLE_HARITA_ANAHTARI, tema, {
        yenile,
      });
      if (haritaRef.current !== harita) return;
      await stilHazirOlunca(harita);
      if (haritaRef.current !== harita) return;
      googleKatmaniEkle(harita, tema, oturum, GOOGLE_HARITA_ANAHTARI);
      // Bu arada tema değişmiş olabilir; görünen hep güncel tema olsun.
      googleKatmaniGoster(harita, temaRef.current);
      atifRef.current?.oturumAyarla(oturum);
      setGoogleHatasi(null);
      setYuklenemedi(false);
    } catch (hata) {
      console.error("[harita] Google karoları kurulamadı", hata);
      if (haritaRef.current !== harita) return;
      setGoogleHatasi(googleHataMetni(hata));
      setYuklenemedi(true);
    }
  };
  const googleYukleRef = useRef(googleKarolariYukle);
  useEffect(() => {
    secimRef.current = onSecim;
    tiklamaRef.current = onHaritaTikla;
    secenekRef.current = onSecenekSec;
    onKullaniciHareketiRef.current = onKullaniciHareketi;
    abonelikRef.current = onAbonelikSecim;
    sepetRef.current = onSepetSecim;
    uzunRef.current = onUzunBasis;
    googleYukleRef.current = googleKarolariYukle;
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
        // Google modunda stil yerel bir nesne: MapLibre 5 nesne stili bir
        // sonraki karede ayrıştırıyor, `styledata` dinleyicimiz yetişiyor.
        style: acilisStili(temaRef.current),
        center: [MERKEZ.lng, MERKEZ.lat],
        zoom: MERKEZ.zoom,
        pitch: 45,
        bearing: -12,
        // Google modunda atıf ve logo kendi denetimimizden geliyor.
        attributionControl: GOOGLE_MODU ? false : { compact: true },
        dragRotate: true,
        pitchWithRotate: true,
        maxPitch: 75,
        /*
         * Kurye Sakarya dışına çıkmıyor; harita da çıkmasın. MapLibre
         * görüntüyü kutunun içinde tutuyor ve uzaklaşmayı da kendiliğinden
         * kısıtlıyor: viewport kutuyu aşamıyor. Bu kısıt ekran ölçüsüne göre
         * hesaplanıyor, yani telefonda ve masaüstünde ayrı ayrı doğru
         * davranıyor — elle bir `minZoom` vermeye gerek yok, verilen değer
         * MapLibre'ın kendi sınırının altında kalıp hiç devreye girmiyordu.
         */
        maxBounds: SAKARYA_SINIRI,
      });
      haritaRef.current = harita;
      // Liberty stili, sprite'ında bulunmayan POI ikonlarına atıf yapıyor
      // (atm, office, gate…). MapLibre her biri için uyarı basıyor; boş bir
      // görsel verip susturuyoruz — o ikonlar zaten çizilemiyor.
      const bosGorsel = { width: 1, height: 1, data: new Uint8Array(4) };
      harita.on("styleimagemissing", (olay) => {
        if (!harita.hasImage(olay.id)) harita.addImage(olay.id, bosGorsel);
      });

      // Hata kaydı üretimde de açık: stil ya da karo sunucusuna
      // ulaşılamadığında ekran sessizce boş kalmasın, konsolda sebebi olsun.
      (window as unknown as { __harita?: MapLibreMap }).__harita = harita;
      harita.on("error", (e) => {
        console.error("[harita]", e.error?.message ?? e);
        // Google karosu 401/403 dönüyorsa anahtar bu alan adına izinli
        // değil ya da oturum düşmüş: sessiz boş harita yerine sebebi söyle.
        const hata = e.error as { status?: number; url?: string } | undefined;
        if (
          GOOGLE_MODU &&
          !googleKaroHatasiRef.current &&
          hata?.url?.includes("tile.googleapis.com") &&
          (hata.status === 401 || hata.status === 403)
        ) {
          googleKaroHatasiRef.current = true;
          oturumuUnut(temaRef.current);
          setGoogleHatasi(
            `Google karoları reddedildi (HTTP ${hata.status}). Anahtarın bu alan adına izinli olduğundan emin olun.`,
          );
          setYuklenemedi(true);
        }
      });

      for (const olay of ["dragstart", "zoomstart", "rotatestart"] as const) {
        harita.on(olay, (e: { originalEvent?: unknown }) => {
          // Yalnızca elle yapılan hareketler takibi bırakır.
          if (e?.originalEvent) onKullaniciHareketiRef.current?.();
        });
      }

      harita.on("zoomend", () => {
        hedefZoomRef.current = null;
      });
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
        // Bu geri çağırım stil yüklenirken çalışıyor: içeriden fırlayan bir
        // hata stilin yüklenmesini yarıda kesiyor ve harita komple ölüyor.
        // O yüzden burada hiçbir hata dışarı sızmıyor.
        try {
          ucBoyutluBinalarEkle(harita);
          markaStiliUygula(harita, temaRef.current);
          katmanlariKur(
            harita,
            secimRef,
            tiklamaRef,
            secenekRef,
            abonelikRef,
            sepetRef,
            uzunRef,
          );
          marketiIsaretle(harita);
        } catch (hata) {
          console.error("[harita] katmanlar kurulamadı", hata);
          return;
        }
        hazirRef.current = true;
        setHazir(true);
        setYuklenemedi(false);
        if (sayacRef.current) window.clearTimeout(sayacRef.current);
        onHazir?.();
      };
      harita.on("styledata", kur);
      // Olay çoktan geçmişse (ör. önbellekten anında gelen stil) elle dene.
      kur();

      if (GOOGLE_MODU) {
        const atif = new GoogleAtifi(GOOGLE_HARITA_ANAHTARI);
        atifRef.current = atif;
        // Alt panel haritanın alt kenarını her durumda örtüyor; logo üst
        // çubuğun altında, sağdaki pusulayla aynı hizada duruyor.
        harita.addControl(atif, "top-left");
        void googleYukleRef.current();
      }

      // Stil inmezse MapLibre hiçbir katman kuramaz ve ekran bomboş kalır;
      // sebebi ağ engeli de olabilir, sunucu arızası da. Belirli bir süre
      // sonra hazır değilsek kullanıcıya söyleyip yeniden deneme veriyoruz.
      sayacRef.current = window.setTimeout(() => {
        if (!hazirRef.current) setYuklenemedi(true);
      }, 8000);

      temizle = () => {
        if (sayacRef.current) window.clearTimeout(sayacRef.current);
        kuryeHarfRef.current?.remove();
        kuryeHarfRef.current = null;
        atifRef.current = null;
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
    const kaynak = harita.getSource("sepetler") as GeoJSONSource | undefined;
    kaynak?.setData({
      type: "FeatureCollection",
      features: sepetler
        .filter((s) => noktaVar(s.adres))
        .map((s) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [s.adres!.lng!, s.adres!.lat!],
          },
          properties: { id: s.id, ad: s.musteri?.ad ?? "" },
        })),
    });
  }, [hazir, sepetler]);

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
    // Google zemini tema başına ayrı oturum/karo; gerekiyorsa açıp değiştir.
    if (GOOGLE_MODU) void googleYukleRef.current();

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
    gorunur("sepet-halka", katmanlar.sepetler);
    gorunur("sepet-cekirdek", katmanlar.sepetler);
    gorunur("yogunluk-katmani", katmanlar.isiHaritasi);
    ucBoyutluBinalariGoster(harita, katmanlar.ucBoyut);
    // Bina verisi OpenStreetMap'ten; katman açıkken atfı da görünsün.
    atifRef.current?.ekAtifAyarla(
      katmanlar.ucBoyut && harita.getLayer("bina-3b") ? BINA_ATIFI : "",
    );
  }, [hazir, katmanlar]);

  /* ---------------- Kurye imleci ---------------- */
  /*
   * Tek `then` zinciri, iptal bayrağı yok.
   *
   * Eskiden bu efekt async'ti: bir konum güncellemesi işaretçiyi kurarken
   * ikincisi geliyor, birincinin temizliği "iptal" diyor, ikincisi de
   * "zaten kuruluyor" deyip dönüyordu — imleç hiç çizilmiyordu ve bağımlılık
   * değişmediği için bir daha denenmiyordu. Şimdi modül sözü bir kez
   * alınıyor; art arda gelen güncellemeler aynı söze bağlanıyor ve sırayla
   * çalışıyor, ilki kuruyor sonrakiler yerini güncelliyor.
   */
  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !kuryeKonumu) return;

    maplibreSozu ??= import("maplibre-gl");
    void maplibreSozu.then(({ Marker: MapLibreMarker }) => {
      // Harita sökülmüşse yapacak bir şey yok.
      if (!haritaRef.current) return;
      {
        if (!kuryeHarfRef.current) {
          /*
           * Yalnızca "K" rozeti. Eskiden altında yön konisi ve saydam yeşil
           * bir halka vardı; halka haritada büyük yeşil bir leke gibi
           * duruyordu, kurye "altımdaki yeşil bölge ne" diye sordu. Rozet
           * ekrana göre hizalı: harita dönünce ya da eğilince dik kalıyor.
           */
          const harfKutu = document.createElement("div");
          harfKutu.style.cssText = "width:34px;height:34px";
          harfKutu.innerHTML = `
          <svg viewBox="-17 -17 34 34" width="34" height="34">
            <circle cx="0" cy="0" r="14" fill="#ffffff"/>
            <circle cx="0" cy="0" r="11.2" fill="${KURYE_RENGI}"/>
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
                  fill="#ffffff"
                  style="font:900 13px/1 ui-sans-serif,system-ui,'Segoe UI',sans-serif;
                         letter-spacing:.5px;paint-order:stroke">K</text>
          </svg>`;

          kuryeHarfRef.current = new MapLibreMarker({ element: harfKutu })
            .setLngLat([kuryeKonumu.lng, kuryeKonumu.lat])
            .addTo(harita);
        } else {
          kuryeHarfRef.current.setLngLat([kuryeKonumu.lng, kuryeKonumu.lat]);
        }
      }
    });
    // `hazir` şart: konum haritadan önce geliyor, efekt boş haritada dönüyor
    // ve konum sabitse (masaüstünde IP tahmini öyle) bir daha hiç çalışmıyor,
    // imleç de hiç çizilmiyordu.
  }, [hazir, kuryeKonumu]);

  /**
   * Balon bir MapLibre işaretçisine bağlanıyor: konumu harita hesaplıyor,
   * içeriği React portal ile basılıyor. Böylece harita kaydırılıp
   * yakınlaştırıldığında balon pinin üstünde kalıyor.
   */
  const balonMarkerRef = useRef<Marker | null>(null);
  const [balonKap, setBalonKap] = useState<HTMLElement | null>(null);
  const balonVar = balon != null;

  useEffect(() => {
    const harita = haritaRef.current;
    if (!harita || !hazir || !balonVar) return;

    let iptal = false;
    (async () => {
      const { Marker: MapLibreMarker } = await import("maplibre-gl");
      if (iptal || !haritaRef.current || balonMarkerRef.current) return;
      const kutu = document.createElement("div");
      kutu.style.cssText = "pointer-events:auto";
      balonMarkerRef.current = new MapLibreMarker({
        element: kutu,
        anchor: "bottom",
        offset: [0, -16],
      })
        .setLngLat([0, 0])
        .addTo(haritaRef.current);
      setBalonKap(kutu);
    })();

    return () => {
      iptal = true;
      balonMarkerRef.current?.remove();
      balonMarkerRef.current = null;
      setBalonKap(null);
    };
  }, [hazir, balonVar]);

  useEffect(() => {
    if (!balon) return;
    balonMarkerRef.current?.setLngLat([balon.lng, balon.lat]);
  }, [balon]);

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
      yakinlastir: (yon) => {
        const harita = haritaRef.current;
        if (!harita) return;
        // Animasyon sürerken art arda basılırsa ara değerden değil,
        // hedeflenen zoomdan devam et; yoksa hızlı dokunuşlar adım yutuyor.
        const taban =
          harita.isZooming() && hedefZoomRef.current != null
            ? hedefZoomRef.current
            : harita.getZoom();
        const hedef = Math.min(
          harita.getMaxZoom(),
          Math.max(harita.getMinZoom(), taban + yon),
        );
        // easeTo önce süren animasyonu durdurup `zoomend` fırlatıyor; hedef
        // ondan sonra yazılmalı ki sıfırlanmasın.
        harita.easeTo({ zoom: hedef, duration: 400 });
        hedefZoomRef.current = hedef;
      },
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

  function stiliYenidenYukle() {
    const harita = haritaRef.current;
    if (!harita) return;
    setYuklenemedi(false);
    setGoogleHatasi(null);
    googleKaroHatasiRef.current = false;
    // Temel stil kurulduysa yalnızca Google oturumunu tazelemek yeter.
    if (GOOGLE_MODU && hazirRef.current) {
      oturumuUnut(temaRef.current);
      void googleKarolariYukle(true);
      return;
    }
    hazirRef.current = false;
    setHazir(false);
    harita.setStyle(acilisStili(temaRef.current));
    if (sayacRef.current) window.clearTimeout(sayacRef.current);
    sayacRef.current = window.setTimeout(() => {
      if (!hazirRef.current) setYuklenemedi(true);
    }, 8000);
    if (GOOGLE_MODU) {
      oturumuUnut(temaRef.current);
      void googleKarolariYukle(true);
    }
  }

  return (
    <>
      <div
        ref={kapsayiciRef}
        // maplibre-gl.css katmansız yüklendiği için Tailwind'in `absolute`
        // utility'sini ezip konteyneri sıfır yükseklikte bırakıyor; bu yüzden
        // konumlandırma satır içi stille veriliyor.
        style={{
          position: "absolute",
          inset: 0,
          // Uzun basışta tarayıcının kendi menüsü açılmasın.
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        data-secim-modu={secimModu ? "acik" : "kapali"}
      />
      {balonKap && balon ? createPortal(balon.icerik, balonKap) : null}
      {yuklenemedi && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-[22px] border border-cizgi bg-yuzey p-5 text-center shadow-lg">
            <p className="text-[15px] font-black">Harita yüklenemedi</p>
            <p className="mt-1 text-[13px] text-gri">
              {googleHatasi ??
                "Harita sunucusuna ulaşılamıyor. Teslimat listesi çalışmaya devam ediyor; bağlantını kontrol edip yeniden deneyebilirsin."}
            </p>
            <button
              onClick={stiliYenidenYukle}
              className="mt-4 w-full rounded-hap bg-kirmizi px-4 py-2.5 text-[14px] font-black text-white"
            >
              Yeniden dene
            </button>
          </div>
        </div>
      )}
    </>
  );
}
