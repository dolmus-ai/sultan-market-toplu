import type { Nokta, RotaSonucu } from "./tipler";

const DUNYA_YARICAP_M = 6_371_000;

/** İki nokta arasındaki kuş uçuşu mesafe (metre). */
export function haversine(a: Nokta, b: Nokta): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * DUNYA_YARICAP_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Kuş uçuşu mesafeleri, şehir içi dolambaç payıyla düzeltir. */
const SEHIR_ICI_KATSAYI = 1.35;
/** Motosiklet ortalama şehir içi hızı (m/sn) ≈ 22 km/s. */
const ORTALAMA_HIZ_MSN = 6.1;
/** Her durakta kapıda geçen ortalama süre. */
const DURAK_SURESI_SN = 90;

function mesafeMatrisi(noktalar: Nokta[]): number[][] {
  const n = noktalar.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversine(noktalar[i], noktalar[j]) * SEHIR_ICI_KATSAYI;
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

function rotaUzunlugu(sira: number[], m: number[][]): number {
  let toplam = 0;
  for (let i = 0; i < sira.length - 1; i++) toplam += m[sira[i]][sira[i + 1]];
  return toplam;
}

/** En yakın komşu ile kaba bir sıra kurar (0 numaralı nokta = başlangıç). */
function enYakinKomsu(m: number[][]): number[] {
  const n = m.length;
  const gezildi = new Array(n).fill(false);
  const sira = [0];
  gezildi[0] = true;
  for (let adim = 1; adim < n; adim++) {
    const son = sira[sira.length - 1];
    let enIyi = -1;
    let enIyiMesafe = Infinity;
    for (let j = 0; j < n; j++) {
      if (!gezildi[j] && m[son][j] < enIyiMesafe) {
        enIyiMesafe = m[son][j];
        enIyi = j;
      }
    }
    gezildi[enIyi] = true;
    sira.push(enIyi);
  }
  return sira;
}

/**
 * 2-opt iyileştirmesi: kesişen bacakları ters çevirerek toplam yolu kısaltır.
 * Başlangıç noktası (indeks 0) sabit kalır, tur açık uçludur (depoya dönüş yok).
 */
function ikiOpt(sira: number[], m: number[][], maksTur = 60): number[] {
  const yol = [...sira];
  let iyilesti = true;
  let tur = 0;
  while (iyilesti && tur++ < maksTur) {
    iyilesti = false;
    for (let i = 1; i < yol.length - 1; i++) {
      for (let k = i + 1; k < yol.length; k++) {
        const oncesi =
          m[yol[i - 1]][yol[i]] +
          (k + 1 < yol.length ? m[yol[k]][yol[k + 1]] : 0);
        const sonrasi =
          m[yol[i - 1]][yol[k]] +
          (k + 1 < yol.length ? m[yol[i]][yol[k + 1]] : 0);
        if (sonrasi < oncesi - 0.01) {
          const parca = yol.slice(i, k + 1).reverse();
          yol.splice(i, k - i + 1, ...parca);
          iyilesti = true;
        }
      }
    }
  }
  return yol;
}

/**
 * Tamamen tarayıcı/sunucu içinde çalışan rota optimizasyonu.
 * Dış servise ihtiyaç duymaz; yollar kuş uçuşu çizilir.
 */
export function yerelRotaCoz(
  baslangic: Nokta,
  duraklar: { id: string; nokta: Nokta }[],
): RotaSonucu {
  if (duraklar.length === 0) {
    return {
      sira: [],
      toplamMesafeM: 0,
      toplamSureSn: 0,
      geometri: [],
      motor: "yerel",
    };
  }

  const noktalar: Nokta[] = [baslangic, ...duraklar.map((d) => d.nokta)];
  const m = mesafeMatrisi(noktalar);
  const kaba = enYakinKomsu(m);
  const iyi = ikiOpt(kaba, m);
  const mesafe = rotaUzunlugu(iyi, m);

  return {
    sira: iyi.slice(1).map((i) => duraklar[i - 1].id),
    toplamMesafeM: mesafe,
    toplamSureSn: mesafe / ORTALAMA_HIZ_MSN + duraklar.length * DURAK_SURESI_SN,
    geometri: iyi.map((i) => [noktalar[i].lng, noktalar[i].lat]),
    motor: "yerel",
  };
}

/** Metreyi okunur mesafeye çevirir. */
export function mesafeYaz(metre: number): string {
  if (metre < 950) return `${Math.round(metre)} m`;
  return `${(metre / 1000).toLocaleString("tr-TR", {
    maximumFractionDigits: 1,
  })} km`;
}

/** Saniyeyi okunur süreye çevirir. */
export function sureYaz(saniye: number): string {
  const dk = Math.round(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  const saat = Math.floor(dk / 60);
  const kalan = dk % 60;
  return kalan === 0 ? `${saat} sa` : `${saat} sa ${kalan} dk`;
}
