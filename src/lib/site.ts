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
  /** Önizlemede Google Haritalar eşleştirmesinin durumu (kaydedilmez). */
  dogrulama?: GoogleDogrulama | { durum: "sorguluyor" };
  /** Google eşleşince pinin taşındığı yerden önceki nokta — geri almak için. */
  eskiKonum?: Nokta;
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

/** Site adlarında ayırt edici olmayan sözcükler — eşleştirmede sayılmaz. */
const GENEL_SOZCUKLER = new Set([
  "sitesi",
  "site",
  "konaklari",
  "konaklar",
  "konutlari",
  "konutlar",
  "evleri",
  "evler",
  "apartmani",
  "apartman",
  "apt",
  "villalari",
  "villa",
  "residence",
  "rezidans",
  "blok",
  "bloklari",
  "sakarya",
  "serdivan",
  "adapazari",
]);

/**
 * İki site adının aynı yeri anlatma olasılığı (0–1): ayırt edici
 * sözcüklerin ne kadarı ortak. "Ünbay Serdivan Konakları" ile "Ünbay
 * Konakları" 1, "Işık Sitesi" ile "Doğa Sitesi" 0.
 */
export function adBenzerligi(a: string, b: string): number {
  const sozcukler = (m: string) =>
    new Set(
      sadelestir(m)
        .split(" ")
        .filter((k) => k.length > 1 && !GENEL_SOZCUKLER.has(k)),
    );
  const x = sozcukler(a);
  const y = sozcukler(b);
  if (x.size === 0 || y.size === 0) return sadelestir(a) === sadelestir(b) ? 1 : 0;
  let ortak = 0;
  for (const k of x) {
    if (y.has(k) || [...y].some((t) => t.startsWith(k) || k.startsWith(t))) ortak++;
  }
  return ortak / Math.min(x.size, y.size);
}

export type KonumCozumu =
  | { tamam: true; nokta: Nokta }
  | { tamam: false; hata: string };

/** "40°46'28.4\"N" gibi derece-dakika-saniye bileşenini ondalığa çevirir. */
function dmsOndalik(d: string, m: string, s: string, yon: string): number {
  const deger = Number(d) + Number(m || 0) / 60 + Number((s || "0").replace(",", ".")) / 3600;
  return /[SWG]/i.test(yon) ? -deger : deger;
}

/**
 * Elle yapıştırılan konumu okur — Google Haritalar'dan kopyalanan her biçim:
 *
 * - Sağ tıkla kopyalanan koordinat: `40.7745487, 30.3439116`
 * - Türkçe ondalık: `40,7745487 30,3439116`
 * - Derece-dakika-saniye: `40°46'28.4"N 30°20'38.1"E`
 * - Adres çubuğundaki bağlantı: `…/place/…/@40.77,30.34,17z/data=…!3d40.7745487!4d30.3439116…`
 *   Bağlantıda `!3d…!4d…` yerin kendisi, `@…` ise haritanın o anki ortası;
 *   önce yer okunur.
 *
 * Kısa paylaşım bağlantıları (`maps.app.goo.gl/…`) konum içermez.
 * Nokta Sakarya dışındaysa reddedilir.
 */
export function konumCoz(ham: string): KonumCozumu {
  const metin = ham.trim();
  if (!metin) return { tamam: false, hata: "Konum ya da bağlantı yapıştırın." };

  if (/goo\.gl\/|maps\.app\./i.test(metin) && !/[!@]\d/.test(metin)) {
    return {
      tamam: false,
      hata: "Kısa bağlantıda konum yok. Google Haritalar'da haritaya sağ tıklayıp koordinatı kopyalayın ya da adres çubuğundaki uzun bağlantıyı yapıştırın.",
    };
  }

  const aday = (lat: number, lng: number): KonumCozumu | null => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Sıra ters yapıştırılmışsa (boylam, enlem) düzelt: Sakarya'da enlem ~40–41, boylam ~30–31.
    const nokta = sakaryadaMi({ lat, lng })
      ? { lat, lng }
      : sakaryadaMi({ lat: lng, lng: lat })
        ? { lat: lng, lng: lat }
        : null;
    if (!nokta) {
      return {
        tamam: false,
        hata: `Bu konum Sakarya sınırları dışında (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
      };
    }
    return { tamam: true, nokta };
  };

  // Bağlantıdaki yerin kendisi: !3d<enlem>!4d<boylam>
  const yer = metin.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (yer) return aday(Number(yer[1]), Number(yer[2]))!;

  // Sorgu parametreleri: ?q=, query=, ll=, destination=, center=
  const sorgu = metin.match(
    /[?&](?:q|query|ll|destination|daddr|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (sorgu) return aday(Number(sorgu[1]), Number(sorgu[2]))!;

  // Haritanın ortası: @<enlem>,<boylam>
  const merkez = metin.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (merkez) return aday(Number(merkez[1]), Number(merkez[2]))!;

  // Derece-dakika-saniye
  const dms = [
    ...metin.matchAll(/(\d{1,3})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*["″]?\s*([NSEWKDGB])/gi),
  ];
  if (dms.length >= 2) {
    const [a, b] = dms;
    const enlemIlk = /[NSKG]/i.test(a[4]);
    const x = dmsOndalik(a[1], a[2], a[3], a[4]);
    const y = dmsOndalik(b[1], b[2], b[3], b[4]);
    return aday(enlemIlk ? x : y, enlemIlk ? y : x)!;
  }

  // Düz sayı çifti: nokta ondalıklı "40.77, 30.34" ya da virgül ondalıklı "40,77 30,34"
  const noktali = metin.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
  if (noktali) return aday(Number(noktali[1]), Number(noktali[2]))!;
  const virgullu = metin.match(/(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)/);
  if (virgullu) {
    return aday(
      Number(virgullu[1].replace(",", ".")),
      Number(virgullu[2].replace(",", ".")),
    )!;
  }

  return {
    tamam: false,
    hata: "Konum okunamadı. Örnek: 40.7745487, 30.3439116 ya da Google Haritalar bağlantısı.",
  };
}

/** `/api/site-dogrula` yanıtı: adayın Google Haritalar'daki karşılığı. */
export type GoogleDogrulama =
  | { durum: "anahtarsiz" }
  | { durum: "bulunamadi" }
  | { durum: "hata" }
  | {
      durum: "eslesti";
      lat: number;
      lng: number;
      ad: string;
      adres: string | null;
      motor: "places" | "geocoding";
      /** Adayın eski noktasına uzaklık (metre). */
      fark: number;
    };

export const KAYNAK_ETIKET: Record<SiteKaynagi, string> = {
  osm: "OpenStreetMap",
  overture: "Overture Maps",
  nominatim: "Canlı arama",
  google: "Google Haritalar",
  elle: "Haritadan",
};
