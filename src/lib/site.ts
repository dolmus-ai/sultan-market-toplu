/**
 * Adres bulucu: Sakarya'daki siteleri ve apartmanları arar.
 *
 * Üç kaynak aynı biçime (`SiteAdayi`) çevriliyor: OSM ve Overture Maps'ten
 * derlenmiş statik liste (`public/veri/sakarya-siteler.json`,
 * `scripts/overture-cek.py` + `scripts/siteleri-derle.mjs`),
 * canlı arama (`/api/site-ara` — Nominatim, anahtar varsa Google Places) ve
 * haritaya elle konan pin. Kurye adayı haritada görüp onaylayınca `siteler`
 * tablosuna yazılıyor.
 */

import { haversine } from "./rota";
import type {
  KayitliSite,
  Nokta,
  SiteBlogu,
  SiteKaynagi,
  SiteTuru,
} from "./tipler";

/** Sakarya il sınırının kapsayan kutusu (OSM, admin_level=4). */
export const SAKARYA_KUTU = {
  guney: 40.2944,
  bati: 29.967,
  kuzey: 41.351,
  dogu: 31.0127,
};

export const SAKARYA_ILCELERI = [
  "Adapazarı",
  "Akyazı",
  "Arifiye",
  "Erenler",
  "Ferizli",
  "Geyve",
  "Hendek",
  "Karapürçek",
  "Karasu",
  "Kaynarca",
  "Kocaali",
  "Pamukova",
  "Sapanca",
  "Serdivan",
  "Söğütlü",
  "Taraklı",
] as const;

export type SiteAdayi = {
  /** Listede ve karşılaştırmada kullanılan kimlik: "osm:w123", "google:…". */
  anahtar: string;
  ad: string;
  tur: SiteTuru;
  ilce: string | null;
  mahalle: string | null;
  adres: string | null;
  lat: number;
  lng: number;
  bloklar: SiteBlogu[];
  kaynak: SiteKaynagi;
  kaynak_id: string | null;
};

/** Derleme dosyasının sıkıştırılmış satırı — betikteki alan adlarıyla. */
type DerlemeSatiri = {
  i: string;
  /** "ov": Overture Maps mekânı; yoksa OSM. */
  k?: "ov";
  a: string;
  t: "s" | "a";
  c: string;
  m: string;
  y: number;
  x: number;
  s?: string;
  b?: [string, number, number][];
};

export function derlemeyiCoz(veri: { kayitlar?: DerlemeSatiri[] }): SiteAdayi[] {
  return (veri.kayitlar ?? []).map((k) => {
    const kaynak: SiteKaynagi = k.k === "ov" ? "overture" : "osm";
    return {
      anahtar: `${kaynak}:${k.i}`,
      ad: k.a,
      tur: k.t === "a" ? "apartman" : "site",
      ilce: k.c || null,
      mahalle: k.m || null,
      adres: k.s ?? null,
      lat: k.y,
      lng: k.x,
      bloklar: (k.b ?? []).map(([ad, lat, lng]) => ({ ad, lat, lng })),
      kaynak,
      kaynak_id: k.i,
    };
  });
}

export function kayitliyiAdayaCevir(s: KayitliSite): SiteAdayi {
  return {
    anahtar: `kayit:${s.id}`,
    ad: s.ad,
    tur: s.tur,
    ilce: s.ilce,
    mahalle: s.mahalle,
    adres: s.adres,
    lat: s.lat,
    lng: s.lng,
    bloklar: s.bloklar ?? [],
    kaynak: s.kaynak,
    kaynak_id: s.kaynak_id,
  };
}

const HARF: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Arama için sadeleştirir: küçük harf, Türkçe harfleri ASCII'ye indirir,
 * noktalamayı atar. Kurye "sukur konak" yazınca "Şükür Konakları" bulunsun.
 */
export function sadelestir(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâîû]/g, (h) => HARF[h] ?? h)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SiteSuzgeci = {
  ilce?: string | null;
  tur?: SiteTuru | null;
  /** Sorgu boşken en yakından uzağa sıralamak için (kurye ya da market). */
  yakin?: Nokta | null;
};

/**
 * Listeyi sorguya göre süzer ve sıralar. Sorgudaki her sözcük adda,
 * mahallede, ilçede ya da blok adlarında geçmeli; adda geçenler öne çıkar.
 * Sorgu boşsa yalnızca süzgeç uygulanır: `yakin` verildiyse en yakından
 * uzağa, yoksa ilçe → ad sırası.
 */
export function siteAra(
  liste: SiteAdayi[],
  sorgu: string,
  suzgec: SiteSuzgeci = {},
  sinir = 60,
): SiteAdayi[] {
  const sozcukler = sadelestir(sorgu).split(" ").filter(Boolean);
  const uygun = liste.filter(
    (s) =>
      (!suzgec.ilce || s.ilce === suzgec.ilce) &&
      (!suzgec.tur || s.tur === suzgec.tur),
  );

  if (sozcukler.length === 0) {
    const yakin = suzgec.yakin;
    if (yakin) {
      return uygun
        .map((s) => ({ s, m: haversine(yakin, s) }))
        .sort((a, b) => a.m - b.m)
        .slice(0, sinir)
        .map((x) => x.s);
    }
    return [...uygun]
      .sort(
        (a, b) =>
          (a.ilce ?? "").localeCompare(b.ilce ?? "", "tr") ||
          a.ad.localeCompare(b.ad, "tr", { numeric: true }),
      )
      .slice(0, sinir);
  }

  const tam = sozcukler.join(" ");
  const puanli: { s: SiteAdayi; puan: number }[] = [];
  for (const s of uygun) {
    const ad = sadelestir(s.ad);
    const adSozcukleri = ad.split(" ");
    const cevre = sadelestir(
      [s.mahalle, s.ilce, s.adres, ...s.bloklar.map((b) => b.ad)]
        .filter(Boolean)
        .join(" "),
    );

    let puan = 0;
    let hepsi = true;
    for (const k of sozcukler) {
      if (adSozcukleri.some((a) => a.startsWith(k))) puan += 20;
      else if (ad.includes(k)) puan += 10;
      else if (cevre.includes(k)) puan += 3;
      else {
        hepsi = false;
        break;
      }
    }
    if (!hepsi) continue;
    if (ad === tam) puan += 200;
    else if (ad.startsWith(tam)) puan += 100;
    puanli.push({ s, puan });
  }

  return puanli
    .sort(
      (a, b) =>
        b.puan - a.puan || a.s.ad.localeCompare(b.s.ad, "tr", { numeric: true }),
    )
    .slice(0, sinir)
    .map((p) => p.s);
}

export function sakaryadaMi(n: Nokta): boolean {
  const k = SAKARYA_KUTU;
  return n.lat >= k.guney && n.lat <= k.kuzey && n.lng >= k.bati && n.lng <= k.dogu;
}

/**
 * Aday haritada zaten var mı? Aynı kaynak kimliği ya da aynı ad + 150 m
 * içinde. OSM'deki bir siteyi Google'dan tekrar bulan kurye ikinci pin
 * açmasın diye ad karşılaştırması sadeleştirilmiş hâl üzerinden.
 */
export function kayitliEsi(
  aday: Pick<SiteAdayi, "ad" | "lat" | "lng" | "kaynak" | "kaynak_id">,
  kayitlilar: KayitliSite[],
): KayitliSite | null {
  const ad = sadelestir(aday.ad);
  return (
    kayitlilar.find(
      (k) =>
        (aday.kaynak_id != null &&
          k.kaynak === aday.kaynak &&
          k.kaynak_id === aday.kaynak_id) ||
        (sadelestir(k.ad) === ad && haversine(k, aday) < 150),
    ) ?? null
  );
}

/**
 * Kayıt formuna yazılacak adres: "Şükür Konakları, B Blok, İstiklal Mah.,
 * Serdivan/Sakarya". Geokod servisi de bu biçimi anlıyor.
 */
export function siteAdresMetni(
  site: Pick<SiteAdayi, "ad" | "mahalle" | "ilce" | "adres">,
  blok?: string | null,
): string {
  const mahalle = site.mahalle
    ? /mah/i.test(site.mahalle)
      ? site.mahalle
      : `${site.mahalle} Mah.`
    : null;
  return [
    site.ad,
    blok || null,
    site.adres,
    mahalle,
    `${site.ilce ? `${site.ilce}/` : ""}Sakarya`,
  ]
    .filter(Boolean)
    .join(", ");
}

export const KAYNAK_ETIKET: Record<SiteKaynagi, string> = {
  osm: "OpenStreetMap",
  overture: "Overture Maps",
  nominatim: "Canlı arama",
  google: "Google Haritalar",
  elle: "Haritadan",
};
