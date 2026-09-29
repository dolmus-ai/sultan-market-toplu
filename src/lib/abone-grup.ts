/**
 * Toplu konum düzeltme: defterden gelen konumsuz abonelikleri sitelerine göre
 * gruplar.
 *
 * Defterdeki adresler serbest metin: "DAYMINT AB 10", "KARAT 54 A BLOK D:11",
 * "ÜNBAY SERDİVAN KONAKLARI LA:3", "BU YAPI DİAMONT C BLOK D6". Aynı site
 * farklı yazılıyor (ÜNBAY / UNBAY SERDİVAN, DAYMINT / DİAMONT / DYMINT,
 * SAFİR PARK / SAFİRPARK). Metni site adı + birim (blok, kapı, daire)
 * olarak ayırıp site adlarını tek anahtara indiriyoruz; böylece bir siteye
 * tek konum yapıştırmak o sitedeki bütün aboneleri düzeltiyor.
 *
 * Tarif adresleri ("TRAFONUN ARKASINDAKİ PEMBE BİNA") hiçbir haritada
 * bulunamaz; tek kişilik grup olarak ayrılıyor.
 */

import { sadelestir } from "./site";

export type AyrisikAdres = {
  /** Site adı (defterdeki yazımıyla) — tarif adreslerinde boş. */
  site: string;
  bina: string | null;
  kat: string | null;
  daire: string | null;
  /** Site adından sonra kalan birim bilgisi: blok, giriş, şifre… */
  tarif: string | null;
  /** Site değil, yol tarifi ya da sokak adresi. */
  tarifMi: boolean;
};

const SITE_EKLERI = new Set([
  "SİTESİ",
  "SİTESİNİ",
  "SİT",
  "SİT.",
  "SİTE",
  "EVLERİ",
  "EVLER",
  "KONAKLARI",
  "KONAKLAR",
  "KONUTLARI",
  "VİLLALARI",
  "VİLALARI",
  "VİLLARI",
  "VİLLLALARI",
  "VİLLALR",
  "APT.",
  "APT",
  "APARTMANI",
]);

/** Birimin başladığını gösteren sözcükler: buradan sonrası site adı değil. */
const BIRIM =
  /^(BLOK|BKOL|BLKOK|BOLK|BL\.?|NO|NO[:.].*|N[:.]\d.*|NUMARA|D[:.;].*|D\d+.*|DAİRE.*|K:.*|KAT.*|ŞİFRE.*|ŞİFRSİ.*|GİRİŞ.*|ZİL.*|\(.*|#.*|\d+\/.*|\d+[.,]?)$/;

/** "AB", "CB", "LA:3", "HA5", "A-B-6", "B1", "E:2" gibi blok/daire kodları. */
function kodMu(k: string): boolean {
  const s = k.replace(/[.,;]+$/, "");
  if (!s) return false;
  if (/^[A-ZÇĞİÖŞÜ]{1,2}$/.test(s)) return true;
  // Toplam harf en fazla 3: "PARK-2", "BAHÇE-2" sitenin adı, kod değil.
  const harf = s.replace(/[^A-ZÇĞİÖŞÜ]/g, "").length;
  return (
    s.length <= 7 &&
    harf <= 3 &&
    /^[A-ZÇĞİÖŞÜ]{1,3}([-:.]?[A-ZÇĞİÖŞÜ0-9]{1,3}){1,3}$/.test(s) &&
    /[\d:\-]/.test(s)
  );
}

/** Site adı yerine yol tarifi mi? */
const TARIF =
  /(YANI|YANINDA|KARŞI|KARŞISI|ARKASI|ARKASINDA|ÜSTÜ|ALTI|GEÇİNCE|GELMEDEN|SOKAĞI|SOKAGI|KOMŞU|ORASI|ORDAKİ|ORDA|BİTİŞİĞİ|YUKARI|SONUNDA|İLK SOL|İLK SAĞ|SOLDAKİ|SAĞDAKİ|MÜSTAKİL|DUBLEX|DUBLEKS|PEMBE|KIRMIZI|BEYAZ|SARI|TRAFO|ŞOK|BİM|MARKET|FIRIN|CAMİ|CAMİİ|KUAFÖR|DÜKKAN|İSTEYEN|ABİ|ABLA|AMCA|TEYZE|EVİ\b|EVİN)/;
const SOKAK_ADRESI = /(^|\s)(\d+\s*[.,]?\s*SOK|SOKAK|SOK\.|CAD\.|CADDE|MAH\.|MAHALLESİ|MAH\s)/;

const trBuyuk = (m: string) => m.toLocaleUpperCase("tr");

export function adresAyristir(ham: string): AyrisikAdres {
  const metin = trBuyuk(ham)
    .replace(/\(?\b0?5\d{2}\)?\s*\d{3}\s*\d{2}\s*\d{2}\b/g, " ") // telefon
    .replace(/\(\s*\)/g, " ")
    // "SİT.D BLOK" → "SİT. D BLOK"
    .replace(/\bSİT\.(?=[A-ZÇĞİÖŞÜ])/g, "SİT. ")
    .replace(/\s+/g, " ")
    .replace(/^[\s(),.:;-]+/, "")
    .trim();

  const bina = metin.match(/\bNO\s*[:.]?\s*(\d+\s*[A-ZÇĞİÖŞÜ]?)\b/)?.[1]?.replace(/\s/g, "") ?? null;
  const daire =
    metin.match(/(?:\bD|DAİRE)\s*[:.;]?\s*(\d+)/)?.[1] ??
    null;
  const kat = metin.match(/\b(?:K|KAT)\s*[:.]?\s*(\d+)/)?.[1] ?? null;

  const sozcukler = metin.split(" ");
  const site: string[] = [];
  let kapi: string | null = null;
  for (let i = 0; i < sozcukler.length; i++) {
    const k = sozcukler[i];
    if (i > 0 && (BIRIM.test(k) || kodMu(k))) {
      // Sitenin adındaki sayı ("KARAT 54", "REMLEY 127", "EMİRGAN 3")
      // birim değil; site ekinden sonra gelen sayı ise kapı numarası.
      const oncekiEk = SITE_EKLERI.has(sozcukler[i - 1]);
      if (/^\d{1,3}$/.test(k) && !oncekiEk && site.length === 1) {
        site.push(k);
        continue;
      }
      if (/^\d{1,3}$/.test(k) && oncekiEk) kapi = k;
      break;
    }
    // "AKKENT-16": iki haneli ek kapı numarası; "SİPAHİER-2" sitenin adı.
    const tire = k.match(/^(.+?)-(\d{2,})$/);
    if (tire) {
      site.push(tire[1]);
      kapi = tire[2];
      break;
    }
    site.push(k);
  }

  const siteMetni = site.join(" ").replace(/[.,:;-]+$/, "").trim();
  const kalan = metin.slice(site.join(" ").length).replace(/^[\s,.:;-]+/, "").trim();

  const ekVar = site.some((s) => SITE_EKLERI.has(s));
  const tarifMi =
    !siteMetni ||
    /^\d+$/.test(siteMetni.replace(/\s/g, "")) ||
    (!ekVar && (TARIF.test(siteMetni) || SOKAK_ADRESI.test(metin))) ||
    (TARIF.test(siteMetni) && siteMetni.split(" ").length > 4) ||
    siteMetni.length > 38;

  return {
    site: tarifMi ? "" : siteMetni,
    bina: bina ?? kapi,
    kat,
    daire,
    tarif: tarifMi ? ham.trim() : kalan || null,
    tarifMi,
  };
}

/** Anahtara katılmayan genel sözcükler (ayırt etmez). */
const ANAHTAR_DISI = new Set([
  "sitesi",
  "sitesini",
  "sit",
  "site",
  "evleri",
  "evler",
  "konaklari",
  "konaklar",
  "konutlari",
  "apt",
  "apartmani",
  "mah",
  "mahalle",
  "bu",
]);

/** Sık görülen yanlış yazımlar — mesafe ölçüsünün yakalayamadıkları. */
const ESADLAR: [RegExp, string][] = [
  [/^(diamont|dymint|daymnt|datymint|daymont|daymınt)/, "daymint"],
  [/^serdivan(unbay)/, "unbay"],
];

export function siteAnahtari(site: string): string {
  let k = sadelestir(site)
    .split(" ")
    .filter((s) => s && !ANAHTAR_DISI.has(s))
    .join("");
  // "yapi" öneki ("BU YAPI DAYMINT", "CNR YAPI KUVVE") yazıma göre gelip gidiyor.
  k = k.replace(/^(yapi)/, "").replace(/yapi(?=[a-z])/, "");
  for (const [desen, yerine] of ESADLAR) k = k.replace(desen, yerine);
  // "Serdivan" ön ya da ek olarak geliyor ("ÜNBAY SERDİVAN", "SERDİVAN ÜNBAY").
  const serdivansiz = k.replace(/serdivan/g, "");
  if (serdivansiz.length >= 4) k = serdivansiz;
  return k;
}

function mesafe(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const o = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let onceki = o[0];
    o[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const gecici = o[j];
      o[j] = Math.min(o[j] + 1, o[j - 1] + 1, onceki + (a[i - 1] === b[j - 1] ? 0 : 1));
      onceki = gecici;
    }
  }
  return o[b.length];
}

/** Türkçe baş harf büyük: "ÜNBAY SERDİVAN KONAKLARI" → "Ünbay Serdivan Konakları". */
export function basHarfBuyuk(m: string): string {
  return m
    .toLocaleLowerCase("tr")
    .split(" ")
    .map((k) => (k ? k[0].toLocaleUpperCase("tr") + k.slice(1) : k))
    .join(" ");
}

export type GrupUyesi<T> = { kayit: T; ham: string; adres: AyrisikAdres };

export type AboneGrubu<T> = {
  anahtar: string;
  /** Grubun en sık yazımından türetilen okunur ad. */
  ad: string;
  uyeler: GrupUyesi<T>[];
  tarifMi: boolean;
};

/**
 * Kayıtları site anahtarına göre gruplar; birbirine çok yakın anahtarları
 * ("safirpark" / "safipark", "narcicegivilalari" / "narcicegivillalari")
 * birleştirir. Büyük gruplar önde, tarif adresleri tek tek en sonda.
 */
export function aboneleriGrupla<T>(
  kayitlar: T[],
  hamAdres: (k: T) => string,
): AboneGrubu<T>[] {
  const siteler = new Map<string, GrupUyesi<T>[]>();
  const tarifler: GrupUyesi<T>[] = [];

  for (const kayit of kayitlar) {
    const ham = hamAdres(kayit) ?? "";
    const adres = adresAyristir(ham);
    const uye = { kayit, ham, adres };
    const anahtar = adres.tarifMi ? "" : siteAnahtari(adres.site);
    if (!anahtar || anahtar.length < 3) {
      tarifler.push({ ...uye, adres: { ...adres, tarifMi: true, site: "", tarif: ham.trim() } });
      continue;
    }
    const liste = siteler.get(anahtar) ?? [];
    liste.push(uye);
    siteler.set(anahtar, liste);
  }

  // "KARAT-54" gibi tireli yazımda sayı kapı sanılır; "karat"+"54" bir
  // anahtar olarak varsa (KARAT 54) o gruba katılır.
  for (const [k, uyeler] of [...siteler]) {
    const kalan: GrupUyesi<T>[] = [];
    for (const u of uyeler) {
      const eklenmis = u.adres.bina ? k + u.adres.bina.toLocaleLowerCase("tr") : "";
      if (eklenmis && eklenmis !== k && siteler.has(eklenmis)) {
        siteler.get(eklenmis)!.push({ ...u, adres: { ...u.adres, bina: null } });
      } else kalan.push(u);
    }
    if (kalan.length) siteler.set(k, kalan);
    else siteler.delete(k);
  }

  // Yakın anahtarları büyük olanın altında topla.
  const anahtarlar = [...siteler.keys()].sort(
    (a, b) => siteler.get(b)!.length - siteler.get(a)!.length,
  );
  const hedef = new Map<string, string>();
  for (const k of anahtarlar) {
    if (hedef.has(k)) continue;
    hedef.set(k, k);
    const esik = k.length >= 10 ? 2 : k.length >= 6 ? 1 : 0;
    if (!esik) continue;
    for (const d of anahtarlar) {
      // "sipahier1" ile "sipahier2" ayrı siteler: rakamlar aynı olmalı.
      const rakam = (x: string) => x.replace(/\D/g, "");
      if (!hedef.has(d) && rakam(d) === rakam(k) && mesafe(k, d) <= esik) {
        hedef.set(d, k);
      }
    }
  }
  const birlesik = new Map<string, GrupUyesi<T>[]>();
  for (const [k, uyeler] of siteler) {
    const h = hedef.get(k)!;
    birlesik.set(h, [...(birlesik.get(h) ?? []), ...uyeler]);
  }

  const gruplar: AboneGrubu<T>[] = [...birlesik].map(([anahtar, uyeler]) => {
    const say = new Map<string, number>();
    for (const u of uyeler) say.set(u.adres.site, (say.get(u.adres.site) ?? 0) + 1);
    // En sık yazım; eşitlikte anahtarla birebir örtüşen (yazım hatası ya da
    // takma ad olmayan) yazım önde: "DAYMINT", "BU YAPI DİAMONT"tan önce.
    const tam = (v: string) =>
      sadelestir(v.replace(/^BU YAPI\s+/, "")).replace(/\s/g, "").startsWith(anahtar) ? 1 : 0;
    const enSik = [...say].sort(
      (a, b) => b[1] - a[1] || tam(b[0]) - tam(a[0]) || b[0].length - a[0].length,
    )[0][0];
    return {
      anahtar,
      ad: basHarfBuyuk(
        enSik.replace(/^BU YAPI\s+/, "").replace(/\s+SİT\.?$/, " SİTESİ"),
      ),
      uyeler,
      tarifMi: false,
    };
  });
  gruplar.sort((a, b) => b.uyeler.length - a.uyeler.length || a.ad.localeCompare(b.ad, "tr"));

  return [
    ...gruplar,
    ...tarifler.map((u, i) => ({
      anahtar: `tarif:${i}`,
      ad: u.ham.trim() || "Adres yok",
      uyeler: [u],
      tarifMi: true,
    })),
  ];
}
