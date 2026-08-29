import { haversine } from "./rota";
import type { Nokta } from "./tipler";

export type Manevra =
  | "cikis"
  | "sol"
  | "sag"
  | "hafif-sol"
  | "hafif-sag"
  | "keskin-sol"
  | "keskin-sag"
  | "duz"
  | "u-donusu"
  | "gobek"
  | "varis";

export type Adim = {
  /** Ekranda gösterilecek yönerge. */
  tarif: string;
  /** Yön ikonu için sadeleştirilmiş manevra. */
  manevra: Manevra;
  /** Bu manevraya kadar gidilecek mesafe (metre). */
  mesafeM: number;
  /** Manevranın yapılacağı nokta. */
  nokta: Nokta;
  /** Girilecek yolun adı. */
  yol: string;
};

export type RotaSecenegi = {
  id: string;
  ad: string;
  mesafeM: number;
  sureSn: number;
  geometri: [number, number][];
  adimlar: Adim[];
  motor: "osrm" | "yerel";
};

/* ------------------------------------------------------------------ */
/* OSRM manevralarını Türkçeye çevir                                   */
/* ------------------------------------------------------------------ */

const YON: Record<string, { ad: string; manevra: Manevra }> = {
  left: { ad: "Sola dönün", manevra: "sol" },
  right: { ad: "Sağa dönün", manevra: "sag" },
  "slight left": { ad: "Hafif sola", manevra: "hafif-sol" },
  "slight right": { ad: "Hafif sağa", manevra: "hafif-sag" },
  "sharp left": { ad: "Keskin sola dönün", manevra: "keskin-sol" },
  "sharp right": { ad: "Keskin sağa dönün", manevra: "keskin-sag" },
  straight: { ad: "Düz devam edin", manevra: "duz" },
  uturn: { ad: "U dönüşü yapın", manevra: "u-donusu" },
};

type OsrmManevra = {
  type: string;
  modifier?: string;
  exit?: number;
};

export function manevrayiCevir(
  m: OsrmManevra,
  yol: string,
): { tarif: string; manevra: Manevra } {
  const yon = m.modifier ? YON[m.modifier] : undefined;
  const nereye = yol ? ` · ${yol}` : "";

  switch (m.type) {
    case "depart":
      return { tarif: `Yola çıkın${nereye}`, manevra: "cikis" };
    case "arrive":
      return { tarif: "Varış noktası", manevra: "varis" };
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return {
        tarif: m.exit
          ? `Göbekten ${m.exit}. çıkış${nereye}`
          : `Göbekten çıkın${nereye}`,
        manevra: "gobek",
      };
    case "merge":
      return {
        tarif: `${yon?.ad ?? "Akışa"} katılın${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    case "on ramp":
      return {
        tarif: `Bağlantı yoluna girin${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    case "off ramp":
      return {
        tarif: `Çıkışa girin${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    case "fork":
      return {
        tarif: `Yol ayrımında ${yon?.ad?.toLocaleLowerCase("tr") ?? "devam edin"}${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    case "end of road":
      return {
        tarif: `Yolun sonunda ${yon?.ad?.toLocaleLowerCase("tr") ?? "devam edin"}${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    case "new name":
    case "continue":
      return {
        tarif: `${yon?.ad ?? "Düz devam edin"}${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
    default:
      return {
        tarif: `${yon?.ad ?? "Devam edin"}${nereye}`,
        manevra: yon?.manevra ?? "duz",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Sürüş sırasında hesaplananlar                                       */
/* ------------------------------------------------------------------ */

/** Kurye ilerledikçe sıradaki adımı bulur. */
export function siradakiAdim(
  adimlar: Adim[],
  baslangicIndeksi: number,
  konum: Nokta,
): number {
  let i = Math.min(baslangicIndeksi, adimlar.length - 1);
  // Manevraya 35 m'den fazla yaklaşıldıysa bir sonrakine geç.
  while (i < adimlar.length - 1 && haversine(konum, adimlar[i].nokta) < 35) {
    i += 1;
  }
  return i;
}

/** Verilen adımdan itibaren kalan mesafe ve süre. */
export function kalanlar(
  secenek: RotaSecenegi,
  adimIndeksi: number,
  konum: Nokta | null,
): { mesafeM: number; sureSn: number } {
  const kalanAdimlar = secenek.adimlar.slice(adimIndeksi);
  const toplamAdim = secenek.adimlar.reduce((t, a) => t + a.mesafeM, 0) || 1;
  const kalanMesafe = kalanAdimlar.reduce((t, a) => t + a.mesafeM, 0);

  // Adım verisi yoksa kuş uçuşu mesafeye düş.
  const mesafe =
    kalanMesafe > 0
      ? kalanMesafe
      : konum
        ? haversine(konum, {
            lat: secenek.geometri.at(-1)![1],
            lng: secenek.geometri.at(-1)![0],
          })
        : secenek.mesafeM;

  return {
    mesafeM: mesafe,
    sureSn: secenek.sureSn * (mesafe / toplamAdim || 1),
  };
}

/** Varış saatini "14:35" biçiminde verir. */
export function varisSaati(sureSn: number): string {
  const t = new Date(Date.now() + sureSn * 1000);
  return t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
