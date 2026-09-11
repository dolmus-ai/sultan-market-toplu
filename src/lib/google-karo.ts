import type {
  IControl,
  LayerSpecification,
  Map as MapLibreMap,
  RasterTileSource,
  StyleSpecification,
} from "maplibre-gl";

import { PALETLER, type Palet, type Tema } from "./harita-stili";

/**
 * Google Map Tiles API — MapLibre'ın altına Google'ın 2B yol haritası karoları.
 *
 * Harita motoru MapLibre olarak kalıyor: pinler, kümeler, ısı haritası, rota
 * şeridi, 3B binalar ve tüm etkileşim aynı katmanlarla çiziliyor. Değişen
 * yalnızca zemin: OpenFreeMap vektör karoları yerine Google'ın raster
 * karoları geliyor. Google iki adımlı çalışıyor — önce bir oturum açılıyor
 * (harita türü, dil, bölge ve stil kuralları bu oturuma bağlı), sonra her
 * karo o oturum jetonuyla isteniyor. Oturum yaklaşık iki hafta geçerli; boşa
 * oturum açmamak için `localStorage`'a yazılıyor.
 *
 * Tema başına ayrı oturum var: Google'ın stil kuralları oturum açılırken
 * sabitleniyor, sonradan değiştirilemiyor. Gündüz/gece paleti
 * `harita-stili.ts` içindeki tek palet tablosundan türetiliyor; böylece
 * arayüz yüzeyleri, kendi katmanlarımız ve Google zemini aynı renk ailesinde
 * kalıyor.
 */

export type GoogleOturumu = {
  session: string;
  /** Unix saniye. */
  expiry: number;
};

/** Google'ın harita stil kuralı (Maps JavaScript API stiliyle aynı biçim). */
export type GoogleStilKurali = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

const OTURUM_SUNUCU = "https://tile.googleapis.com/v1/createSession";
const KARO_SUNUCU = "https://tile.googleapis.com/v1/2dtiles";
const GORUNUM_SUNUCU = "https://tile.googleapis.com/tile/v1/viewport";
/** Stil kuralları değişince önbellekteki eski oturumlar kullanılmasın. */
const STIL_SURUMU = "1";
const ONBELLEK_ONEKI = "google-karo-oturumu";
/** Süresine bundan az kalmış oturum yenilenir. */
const ASGARI_KALAN_SANIYE = 600;
/**
 * Google karolarının istendiği en yüksek yakınlık. Ötesinde MapLibre son
 * karoyu büyütüyor; ötesini istemek kapsama dışı bölgelerde 404 üretip
 * karoyu boş bırakıyordu.
 */
export const GOOGLE_AZAMI_ZOOM = 20;
/** 3B bina katmanının veri kaynağı için atıf metni. */
export const BINA_ATIFI = "Binalar © OpenMapTiles © OpenStreetMap";
const VARSAYILAN_TELIF = "Harita verileri © Google";

export class GoogleOturumHatasi extends Error {
  durum: number;
  constructor(durum: number, mesaj: string) {
    super(mesaj);
    this.name = "GoogleOturumHatasi";
    this.durum = durum;
  }
}

/* ---------------- Stil kuralları ---------------- */

/**
 * Paleti Google'ın stil diline çevirir. Google karolarında katman katman
 * boyama yok; yalnızca "şu tür öğenin geometrisi/yazısı şu renk" denebiliyor.
 * POI simgeleri kapalı: Liberty'de yarı saydam çiziliyorlardı, Google'da
 * saydamlık yok ve rengârenk simgeler teslimat pinleriyle yarışıyor.
 */
export function googleStilKurallari(P: Palet): GoogleStilKurali[] {
  return [
    { elementType: "geometry", stylers: [{ color: P.zemin }] },
    { elementType: "labels.text.fill", stylers: [{ color: P.yazi }] },
    { elementType: "labels.text.stroke", stylers: [{ color: P.hale }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: P.sinir }] },
    { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: P.zemin }] },
    { featureType: "landscape.natural.landcover", elementType: "geometry", stylers: [{ color: P.arazi }] },
    { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: P.bina }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: P.binaCizgi }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: P.arazi }] },
    { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: P.yaziSonuk }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: P.yesil }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: P.yaziSonuk }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: P.yolBeyaz }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: P.yolKenar }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: P.yazi }] },
    { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: P.yolIkincil }] },
    { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: P.otoyol }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: P.otoyolKenar }] },
    { featureType: "road.highway.controlled_access", elementType: "geometry.fill", stylers: [{ color: P.otoyol }] },
    { featureType: "road.highway.controlled_access", elementType: "geometry.stroke", stylers: [{ color: P.otoyolKenar }] },
    { featureType: "transit.line", elementType: "geometry", stylers: [{ color: P.demiryolu }] },
    { featureType: "transit.station", elementType: "geometry", stylers: [{ color: P.arazi }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: P.su }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: P.yaziSonuk }] },
  ];
}

/* ---------------- Oturum ---------------- */

export function karoAdresi(oturum: string, anahtar: string) {
  return `${KARO_SUNUCU}/{z}/{x}/{y}?session=${encodeURIComponent(oturum)}&key=${encodeURIComponent(anahtar)}`;
}

export function oturumGecerliMi(
  oturum: unknown,
  simdiSaniye = Date.now() / 1000,
): oturum is GoogleOturumu {
  if (!oturum || typeof oturum !== "object") return false;
  const { session, expiry } = oturum as Partial<GoogleOturumu>;
  return (
    typeof session === "string" &&
    session.length > 0 &&
    typeof expiry === "number" &&
    Number.isFinite(expiry) &&
    expiry - simdiSaniye > ASGARI_KALAN_SANIYE
  );
}

function onbellekAnahtari(tema: Tema) {
  return `${ONBELLEK_ONEKI}:${STIL_SURUMU}:${tema}`;
}

function onbellektenOku(tema: Tema): GoogleOturumu | null {
  try {
    const ham = localStorage.getItem(onbellekAnahtari(tema));
    if (!ham) return null;
    const veri: unknown = JSON.parse(ham);
    return oturumGecerliMi(veri) ? veri : null;
  } catch {
    return null;
  }
}

function onbellegeYaz(tema: Tema, oturum: GoogleOturumu) {
  try {
    localStorage.setItem(onbellekAnahtari(tema), JSON.stringify(oturum));
  } catch {
    /* özel pencere ya da dolu depo — oturum yalnızca bellekte kalır */
  }
}

/** Reddedilen ya da süresi geçmiş oturumu unutur; sonraki açılış yenisini ister. */
export function oturumuUnut(tema: Tema) {
  bekleyenler.delete(tema);
  try {
    localStorage.removeItem(onbellekAnahtari(tema));
  } catch {
    /* yok say */
  }
}

/** Aynı tema için art arda gelen istekler tek oturum açsın. */
const bekleyenler = new Map<Tema, Promise<GoogleOturumu>>();

export async function googleOturumuAc(
  anahtar: string,
  tema: Tema,
  { yenile = false }: { yenile?: boolean } = {},
): Promise<GoogleOturumu> {
  if (!yenile) {
    const eldeki = onbellektenOku(tema);
    if (eldeki) return eldeki;
    const bekleyen = bekleyenler.get(tema);
    if (bekleyen) return bekleyen;
  }

  const istek = (async () => {
    const yanit = await fetch(
      `${OTURUM_SUNUCU}?key=${encodeURIComponent(anahtar)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapType: "roadmap",
          language: "tr-TR",
          region: "TR",
          // 2x karo: aynı alanı 512 piksele çiziyor, telefon ekranında net.
          scale: "scaleFactor2x",
          highDpi: true,
          styles: googleStilKurallari(PALETLER[tema]),
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!yanit.ok) {
      let mesaj = yanit.statusText;
      try {
        const govde = (await yanit.json()) as { error?: { message?: string } };
        mesaj = govde?.error?.message ?? mesaj;
      } catch {
        /* gövde JSON değil */
      }
      throw new GoogleOturumHatasi(yanit.status, mesaj);
    }
    const veri = (await yanit.json()) as {
      session?: string;
      expiry?: string | number;
    };
    const oturum: GoogleOturumu = {
      session: String(veri.session ?? ""),
      expiry: Number(veri.expiry),
    };
    if (!oturumGecerliMi(oturum)) {
      throw new GoogleOturumHatasi(0, "Google geçersiz bir oturum döndürdü.");
    }
    onbellegeYaz(tema, oturum);
    return oturum;
  })();

  bekleyenler.set(tema, istek);
  try {
    return await istek;
  } finally {
    bekleyenler.delete(tema);
  }
}

/** Oturum açılamayınca kullanıcıya gösterilecek açıklama. */
export function googleHataMetni(hata: unknown): string {
  if (hata instanceof GoogleOturumHatasi) {
    if (hata.durum === 401 || hata.durum === 403) {
      return `Google Haritalar anahtarı kabul edilmedi (HTTP ${hata.durum}). Anahtarın "Map Tiles API" için etkin ve bu alan adına izinli olduğundan emin olun.`;
    }
    if (hata.durum === 429) {
      return "Google Haritalar kotası aşıldı (HTTP 429). Biraz sonra yeniden deneyebilirsin.";
    }
    const kod = hata.durum ? ` (HTTP ${hata.durum})` : "";
    return `Google Haritalar oturumu açılamadı${kod}: ${hata.message}`;
  }
  return "Google Haritalar sunucusuna ulaşılamadı. Bağlantını kontrol edip yeniden deneyebilirsin.";
}

/* ---------------- MapLibre stili ve katmanları ---------------- */

/**
 * Haritanın açılış stili. Google karoları burada yok: oturum ağdan geliyor
 * ve gelmezse harita yine de kurulup pinleri göstersin istiyoruz. Karolar
 * hazır olunca `googleKatmaniEkle` ile zeminin üstüne, binaların altına
 * giriyor. Yazı tipleri kendi sunucumuzdan: Google karoları glyph vermiyor.
 */
export function googleTemelStili(
  tema: Tema,
  binaKarolari: string,
  kokAdres: string,
): StyleSpecification {
  const P = PALETLER[tema];
  const kaynaklar: StyleSpecification["sources"] = {};
  const katmanlar: LayerSpecification[] = [
    {
      id: "zemin",
      type: "background",
      paint: { "background-color": P.zemin },
    },
  ];

  if (binaKarolari) {
    kaynaklar.binalar = {
      type: "vector",
      url: binaKarolari,
      attribution: BINA_ATIFI,
    };
    katmanlar.push({
      id: "bina-3b",
      type: "fill-extrusion",
      source: "binalar",
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
    });
  }

  return {
    version: 8,
    glyphs: `${kokAdres}/maplibre/fonts/{fontstack}/{range}.pbf`,
    sources: kaynaklar,
    layers: katmanlar,
  };
}

function googleKatmanId(tema: Tema) {
  return `google-${tema}`;
}

/**
 * Temanın Google karo kaynağını ve katmanını ekler (varsa oturum adresini
 * tazeler). Katman zeminin hemen üstüne, kendi katmanlarımızın altına giriyor.
 */
export function googleKatmaniEkle(
  harita: MapLibreMap,
  tema: Tema,
  oturum: GoogleOturumu,
  anahtar: string,
) {
  const id = googleKatmanId(tema);
  const adres = karoAdresi(oturum.session, anahtar);

  const mevcut = harita.getSource(id) as RasterTileSource | undefined;
  if (!mevcut) {
    harita.addSource(id, {
      type: "raster",
      tiles: [adres],
      tileSize: 256,
      minzoom: 0,
      maxzoom: GOOGLE_AZAMI_ZOOM,
      attribution: "© Google",
    });
  } else if (!mevcut.tiles?.includes(adres)) {
    mevcut.setTiles([adres]);
  }

  if (!harita.getLayer(id)) {
    const katmanlar = (harita.getStyle()?.layers ?? []) as LayerSpecification[];
    const once = katmanlar.find(
      (k) => k.id !== "zemin" && !k.id.startsWith("google-"),
    )?.id;
    harita.addLayer(
      {
        id,
        type: "raster",
        source: id,
        layout: { visibility: "none" },
        paint: { "raster-fade-duration": 300 },
      },
      once,
    );
  }
}

/** Yalnızca seçili temanın karolarını gösterir; ötekinin karoları inmez. */
export function googleKatmaniGoster(harita: MapLibreMap, tema: Tema) {
  for (const t of Object.keys(PALETLER) as Tema[]) {
    const id = googleKatmanId(t);
    if (harita.getLayer(id)) {
      harita.setLayoutProperty(
        id,
        "visibility",
        t === tema ? "visible" : "none",
      );
    }
  }
}

/* ---------------- Atıf ---------------- */

/**
 * Google'ın kullanım şartı: haritada Google logosu ve görünen bölgeye ait
 * telif metni durmalı. Metin her harita hareketinde viewport ucundan
 * alınıyor; MapLibre'ın kendi atıf kutusu bunu yapamadığı için ayrı bir
 * denetim. 3B binalar açıkken OpenStreetMap atfı da buraya ekleniyor.
 */
export class GoogleAtifi implements IControl {
  private anahtar: string;
  private harita: MapLibreMap | null = null;
  private kutu: HTMLElement | null = null;
  private yazi: HTMLElement | null = null;
  private oturum: GoogleOturumu | null = null;
  private telif = VARSAYILAN_TELIF;
  private ek = "";
  private sayac: number | null = null;
  private istek: AbortController | null = null;

  constructor(anahtar: string) {
    this.anahtar = anahtar;
  }

  onAdd(harita: MapLibreMap) {
    this.harita = harita;
    const kutu = document.createElement("div");
    kutu.className = "maplibregl-ctrl google-atif";
    const logo = document.createElement("img");
    logo.src = "/ikon/google.svg";
    logo.alt = "Google";
    logo.className = "google-atif-logo";
    const yazi = document.createElement("span");
    yazi.className = "google-atif-yazi";
    kutu.append(logo, yazi);
    this.kutu = kutu;
    this.yazi = yazi;
    this.ciz();
    harita.on("moveend", this.planla);
    return kutu;
  }

  onRemove() {
    this.harita?.off("moveend", this.planla);
    if (this.sayac != null) window.clearTimeout(this.sayac);
    this.istek?.abort();
    this.kutu?.remove();
    this.harita = null;
    this.kutu = null;
    this.yazi = null;
  }

  oturumAyarla(oturum: GoogleOturumu) {
    this.oturum = oturum;
    this.planla();
  }

  ekAtifAyarla(metin: string) {
    if (this.ek === metin) return;
    this.ek = metin;
    this.ciz();
  }

  private planla = () => {
    if (this.sayac != null) window.clearTimeout(this.sayac);
    this.sayac = window.setTimeout(() => {
      this.sayac = null;
      void this.telifiGetir();
    }, 700);
  };

  private async telifiGetir() {
    const harita = this.harita;
    if (!harita || !this.oturum) return;
    this.istek?.abort();
    const istek = new AbortController();
    this.istek = istek;

    const sinir = harita.getBounds();
    const p = new URLSearchParams({
      session: this.oturum.session,
      key: this.anahtar,
      zoom: String(Math.max(0, Math.round(harita.getZoom()))),
      north: String(sinir.getNorth()),
      south: String(sinir.getSouth()),
      east: String(sinir.getEast()),
      west: String(sinir.getWest()),
    });
    try {
      const yanit = await fetch(`${GORUNUM_SUNUCU}?${p}`, {
        signal: istek.signal,
      });
      if (!yanit.ok) return;
      const veri = (await yanit.json()) as { copyright?: string };
      if (istek.signal.aborted) return;
      this.telif = veri.copyright?.trim() || VARSAYILAN_TELIF;
      this.ciz();
    } catch {
      /* iptal ya da ağ hatası — eldeki metin kalır */
    }
  }

  private ciz() {
    if (!this.yazi) return;
    this.yazi.textContent = [this.telif, this.ek].filter(Boolean).join(" · ");
  }
}
