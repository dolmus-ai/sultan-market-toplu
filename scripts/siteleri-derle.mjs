/**
 * Sakarya'daki siteleri ve adlı apartmanları OpenStreetMap'ten ve Overture
 * Maps'ten derler, `public/veri/sakarya-siteler.json` dosyasına yazar.
 *
 *   python scripts/overture-cek.py             # (isteğe bağlı) Overture adayları
 *   node scripts/siteleri-derle.mjs            # önbellekteki ham veriyi kullan
 *   node scripts/siteleri-derle.mjs --tazele   # Overpass'tan yeniden indir
 *
 * Overture önbelleği yoksa yalnızca OSM kullanılır. Aynı site iki kaynakta
 * birden varsa OSM kaydı kalır (çizili alanı ve blokları var).
 *
 * Neden derleme betiği: Overpass herkese açık ve yavaş (il geneli sorgu
 * dakikalar sürüyor, sık sık 504/429 dönüyor). Kuryenin telefonu her açılışta
 * bunu bekleyemez; veriyi bir kez süzüp statik dosya olarak sunuyoruz.
 *
 * OSM ham verisi gürültülü: "B2-17", "41 nolu villa", "3. Blok" gibi blok
 * etiketleri kendi başına bina olarak geçiyor, il sınırına yakın Kocaeli
 * kayıtları kutuya taşıyor, sanayi siteleri ve yurtlar aynı sözcükleri
 * kullanıyor. Betik bunları ayıklıyor, blokları ait oldukları siteye
 * bağlıyor ve her kayda ilçe/mahalle yazıyor.
 *
 * Veri © OpenStreetMap katkıcıları (ODbL) · Overture Maps Foundation
 * (CDLA-Permissive-2.0).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const CIKTI = join(KOK, "public", "veri", "sakarya-siteler.json");
const ONBELLEK = join(tmpdir(), "sultan-osm");
const TAZELE = process.argv.includes("--tazele");

const SUNUCULAR = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const KIMLIK = "SultanMarketKurye/1.0 (site derleyici; Serdivan/Sakarya)";

const bekle = (ms) => new Promise((c) => setTimeout(c, ms));

async function overpass(ad, sorgu) {
  mkdirSync(ONBELLEK, { recursive: true });
  const dosya = join(ONBELLEK, `${ad}.json`);
  if (!TAZELE && existsSync(dosya)) return JSON.parse(readFileSync(dosya, "utf8"));

  for (let tur = 0; tur < 5; tur++) {
    for (const sunucu of SUNUCULAR) {
      const yanit = await fetch(sunucu, {
        method: "POST",
        body: new URLSearchParams({ data: sorgu }),
        headers: { "User-Agent": KIMLIK },
      }).catch(() => null);
      if (yanit?.status === 200) {
        const metin = await yanit.text();
        try {
          const veri = JSON.parse(metin);
          writeFileSync(dosya, metin);
          return veri;
        } catch {
          /* yarım yanıt — tekrar dene */
        }
      }
      console.warn(`  ${ad}: ${sunucu} → ${yanit?.status ?? "ağ hatası"}`);
      await bekle(4000 * (tur + 1));
    }
  }
  throw new Error(`${ad} indirilemedi`);
}

/* ---------------- Geometri ---------------- */

/** Bir ilişkinin tüm dış/iç çizgilerini kenar listesine çevirir. */
function kenarlar(iliski) {
  const liste = [];
  for (const uye of iliski.members ?? []) {
    if (uye.type !== "way" || !uye.geometry) continue;
    for (let i = 1; i < uye.geometry.length; i++) {
      const a = uye.geometry[i - 1];
      const b = uye.geometry[i];
      liste.push([a.lon, a.lat, b.lon, b.lat]);
    }
  }
  return liste;
}

/**
 * Tek-çift kuralıyla nokta-çokgen testi. Kenarlar sırasız da olsa doğru
 * çalışır; iç halkalar (delikler) kendiliğinden düşülür.
 */
function icinde(kenarListesi, x, y) {
  let ic = false;
  for (const [x1, y1, x2, y2] of kenarListesi) {
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) ic = !ic;
  }
  return ic;
}

function kutu(kenarListesi) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x1, y1, x2, y2] of kenarListesi) {
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  return { minX, minY, maxX, maxY };
}

function bolge(iliski) {
  const k = kenarlar(iliski);
  return { ad: iliski.tags?.name ?? "", kenar: k, kutu: kutu(k) };
}

function bolgeBul(bolgeler, x, y) {
  for (const b of bolgeler) {
    const { minX, minY, maxX, maxY } = b.kutu;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (icinde(b.kenar, x, y)) return b.ad;
  }
  return null;
}

function metre(a, b) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b.y - a.y) * r;
  const dLng = (b.x - a.x) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.y * r) * Math.cos(b.y * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------- Ad süzgeçleri ---------------- */

/**
 * Site sözcükleri. "evler" ve "kent" yalnızca ayrı sözcük olarak: JS'in
 * `\b`'si Türkçe harfleri sözcük saymıyor, "Beşevler" içindeki "evler"i
 * yakalıyordu.
 */
const SITE_SOZCUK =
  /(sitesi|konutlar[ıi]|konaklar[ıi]|(?:^|\s)evleri?(?:\s|$)|villalar[ıi]|villas|residence|rezidans|residans|rezidens|toki|tokİ|kooperatif|yaşam|yasam|(?:^|\s)kent(?:\s|$)|towers|suites|hills|loft)/i;
const APARTMAN_SOZCUK = /(apartman[ıi]?|\bapt\b|\bapt\.)/i;

/** Konut olmayan ama aynı sözcükleri taşıyan yerler. */
const DISLA =
  /(mahallesi|mah\.|baraj|gölet|yaylas|proje alan|sanayi|mezarl|muhtarl|metro|inşaat|insaat|cami|mescid|üniversite|fakülte|yurdu|\byurt|okul|lise|hastane|spor|stad|kavşa|otopark|arsası|anıt|kaplıca tesis|otel|hotel|pansiyon|lojman|belediye|karakol|fabrika|depo|oto\b|galeri|market|avm|çarşı|pazar)/i;

const KONUT_DISI_BINA = new Set([
  "university",
  "hospital",
  "school",
  "commercial",
  "industrial",
  "retail",
  "office",
  "warehouse",
  "church",
  "mosque",
  "public",
  "government",
  "hotel",
  "dormitory",
]);

/**
 * Blok etiketi mi? "B2-17", "A13", "G25", "41 nolu villa", "D Blok",
 * "15.Blok", "DK-25 Blok", "B1 112 Blok", "1652 S-12", "12.Ada", "Blok 5".
 */
function blokMu(ad) {
  const a = ad.trim();
  return (
    /nolu villa/i.test(a) ||
    /^blok\s*[\w-]+$/i.test(a) ||
    /^[A-ZÇĞİÖŞÜ]{0,3}\d{0,3}[-\s.]?\d{1,4}\s*\.?\s*(blok|ada)?$/i.test(a) ||
    /^[A-ZÇĞİÖŞÜ]{1,3}(\d{1,3})?\s*[-\s]?\s*\d{0,4}\s*\.?\s*blok$/i.test(a) ||
    /^\d{1,4}\s*\.?\s*(blok|ada)$/i.test(a) ||
    /^\d{3,5}\s+[A-Z]-\d+$/i.test(a) ||
    /^[A-ZÇĞİÖŞÜ]{1,2}\d{1,3}[-\s]?[A-Z]$/.test(a) ||
    /^villa\s*\d+$/i.test(a) ||
    /^villam?\s*\d+$/i.test(a)
  );
}

/** "Dora Sitesi 3. Blok" → { site: "Dora Sitesi", blok: "3. Blok" }. */
function siteVeBlok(ad) {
  const m = ad.match(/^(.*?(?:sitesi|konutları|evleri|rezidans|residence))\s*[-,]?\s*(.+blok.*|[A-Z]\s*blok)$/i);
  return m ? { site: m[1].trim(), blok: m[2].trim() } : null;
}

function duzelt(ad) {
  return ad
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\d]+/u, "")
    .replace(/\bSİTESİ\b/g, "Sitesi")
    .replace(/\bsitesi\b/g, "Sitesi")
    .replace(/\bApt\b\.?/g, "Apt.")
    .trim();
}

/* ---------------- Overture adları ---------------- */

const ILCELER =
  "Adapazarı|Akyazı|Arifiye|Erenler|Ferizli|Geyve|Hendek|Karapürçek|Karasu|Kaynarca|Kocaali|Pamukova|Sapanca|Serdivan|Söğütlü|Taraklı|Sakarya|Adapazari|Turkey|Türkiye";

/** Site olmayan Overture kayıtları: havuz, sahil, satış ofisi, tatil tesisi… */
const OVERTURE_DISLA =
  /(havuz|sahil|plaj|satış ofis|satis ofis|kamelya|sosyal tesis|bungalov|bungalow|kamp|tatil köy|[iı]n[şs]aat alan|şantiye|santiye|kereste|esnaf|kuran|kütüphane|mezar|kırathane|kulübe|dağ evi|kiralık|satılık|emlak|gayrimenkul|inşaat|yapı\b|müteahhit|lojistik|nakliye|tarım|pancar|tırcı|kamyon|taşıyıcı|\bs\.?s\.?\s)/i;

/** Bozuk büyük-küçük harfi ("DoĞAkent SİTesİ", "ÇAMLIK SİTESİ") düzeltir. */
function harfDuzelt(ad) {
  const tuhaf = (k) =>
    k.length > 1 &&
    (k === k.toLocaleUpperCase("tr") || /\p{Ll}\p{Lu}/u.test(k));
  if (!ad.split(" ").some(tuhaf)) return ad;
  return ad
    .split(" ")
    .map((k) =>
      /^\d/.test(k) || k.length <= 1
        ? k
        : k[0].toLocaleUpperCase("tr") + k.slice(1).toLocaleLowerCase("tr"),
    )
    .join(" ");
}

/**
 * Overture (çoğu Meta işletme sayfası) adlarını site adına indirger:
 * "pudo Vadipark Sitesi" → "Vadipark Sitesi", "Zeytinli Evler Sapanca" →
 * "Zeytinli Evler", "Toki Evleri Akyazı Sakarya" → "Toki Evleri".
 */
function overtureAdi(ham) {
  let ad = ham
    .replace(/^pudo\s+/i, "")
    .replace(/^[^\p{L}\d]+/u, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*[|/,-]\s*(kocaeli|sakarya).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const sonrakiIlce = new RegExp(`(\\s+(${ILCELER}))+$`, "i");
  ad = ad.replace(sonrakiIlce, "").trim();
  // "X Sitesi Parkı" / "… Havuzbaşı" → sitenin kendisi.
  ad = ad.replace(/\s+(park[ıi]|bahçesi)$/i, "").trim();
  // Müteahhit öneki: "Suev İnşaat Aslı Kent Sitesi" → "Aslı Kent Sitesi".
  // JS'in /i bayrağı "İ"yi "i" saymadığı için iki biçim de yazılı.
  const onekli = ad.match(/^.*?(?:[İIi]n[şs]aat|\bIns\.?|\bYap[ıi])\s+(.+)$/);
  if (onekli && SITE_SOZCUK.test(onekli[1]) && onekli[1].length >= 6) ad = onekli[1];
  return harfDuzelt(duzelt(ad));
}

/** Overture serbest adresinden il/ülke kuyruğunu atar. */
function overtureAdresi(adres) {
  if (!adres) return null;
  const temiz = adres
    .replace(/,?\s*(türkiye|turkey)$/i, "")
    .replace(/,?\s*\d{5}\s*.*$/, "")
    .trim();
  return temiz.length >= 5 ? temiz : null;
}

/** Arama ve tekilleştirme anahtarı. */
function anahtar(ad) {
  return ad
    .toLocaleLowerCase("tr")
    .replace(/[.,'’"()-]/g, " ")
    .replace(/\b(sitesi|konutları|evleri|apartmanı|apt|apartman)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- Derleme ---------------- */

async function main() {
  console.log("Sakarya il sınırı…");
  const il = (await overpass(
    "il",
    `[out:json][timeout:120];rel["boundary"="administrative"]["admin_level"="4"]["name"="Sakarya"];out geom;`,
  )).elements[0];
  const ilBolge = bolge(il);
  const b = il.bounds;

  console.log("İlçe ve mahalle sınırları…");
  const ilceler = (await overpass(
    "ilce",
    `[out:json][timeout:170];rel["boundary"="administrative"]["admin_level"="4"]["name"="Sakarya"];map_to_area->.il;rel["boundary"="administrative"]["admin_level"="6"](area.il);out geom;`,
  )).elements.map(bolge);
  const mahalleler = (await overpass(
    "mahalle",
    `[out:json][timeout:170];rel["boundary"="administrative"]["admin_level"="4"]["name"="Sakarya"];map_to_area->.il;rel["boundary"="administrative"]["admin_level"="8"](area.il);out geom;`,
  )).elements.map(bolge);
  // Sınırı çizilmemiş mahalleler için en yakın yer noktası.
  const yerNoktalari = (await overpass(
    "yerler",
    `[out:json][timeout:170];node["place"~"^(suburb|neighbourhood|quarter|village)$"]["name"](${b.minlat},${b.minlon},${b.maxlat},${b.maxlon});out;`,
  )).elements
    .filter((e) => icinde(ilBolge.kenar, e.lon, e.lat))
    .map((e) => ({ ad: e.tags.name, x: e.lon, y: e.lat }));

  console.log("Siteler ve apartmanlar…");
  const ham = [];
  const N = 3;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const s = b.minlat + ((b.maxlat - b.minlat) * i) / N;
      const n = b.minlat + ((b.maxlat - b.minlat) * (i + 1)) / N;
      const w = b.minlon + ((b.maxlon - b.minlon) * j) / N;
      const e = b.minlon + ((b.maxlon - b.minlon) * (j + 1)) / N;
      const bb = `${s},${w},${n},${e}`;
      const parca = await overpass(
        `konut-${i}-${j}`,
        `[out:json][timeout:170];(
          nwr["name"~"(Sitesi|Konutları|Konakları|Evleri|Evler|Residence|Rezidans|Residans|Blokları|Villaları|Yaşam|TOKİ|Toki|Apartmanı|Apt|Kooperatif|Kent)",i]["highway"!~"."]["amenity"!~"."]["shop"!~"."]["office"!~"."]["craft"!~"."](${bb});
          nwr["landuse"="residential"]["name"](${bb});
          nwr["residential"]["name"](${bb});
          nwr["building"~"^(apartments|residential|house|terrace|semidetached_house)$"]["name"](${bb});
        );out center tags;`,
      );
      ham.push(...parca.elements);
      console.log(`  parça ${i}-${j}: ${parca.elements.length}`);
    }
  }

  /* 1) İl içindekileri ayır, türlerine böl */
  const gorulenId = new Set();
  const adaylar = [];
  const bloklar = [];
  for (const e of ham) {
    const id = `${e.type[0]}${e.id}`;
    if (gorulenId.has(id)) continue;
    gorulenId.add(id);

    const t = e.tags ?? {};
    const x = e.lon ?? e.center?.lon;
    const y = e.lat ?? e.center?.lat;
    if (x == null || y == null || !t.name) continue;
    if (!icinde(ilBolge.kenar, x, y)) continue;

    const ad = duzelt(t.name);
    if (DISLA.test(ad)) continue;
    if (KONUT_DISI_BINA.has(t.building)) continue;
    if (t.leisure || t.amenity || t.shop || t.office) continue;
    if (t.landuse && t.landuse !== "residential") continue;
    if (t.place && !/^(neighbourhood|quarter)$/.test(t.place)) continue;

    const bolunmus = siteVeBlok(ad);
    if (bolunmus) {
      bloklar.push({ ad: bolunmus.blok, site: bolunmus.site, x, y });
      continue;
    }
    if (blokMu(ad)) {
      bloklar.push({ ad, site: null, x, y });
      continue;
    }

    const alan = e.type !== "node";
    const siteSozcuk = SITE_SOZCUK.test(ad);
    const konutAlani = t.landuse === "residential" || !!t.residential;
    let tur;
    if (siteSozcuk || konutAlani) tur = "site";
    else if (APARTMAN_SOZCUK.test(ad) || /^(apartments|residential)$/.test(t.building ?? ""))
      tur = "apartman";
    else continue; // "house" + sıradan ad: kişi adı, dükkân vb.

    // Konut alanı olarak çizilmiş ama adı mahalle adıyla aynı olanlar
    // site değil, mahallenin kendisi ("Bahçelievler", "Yenikent").
    if (konutAlani && !siteSozcuk && !APARTMAN_SOZCUK.test(ad)) {
      const mah = mahalleler.some(
        (m) => anahtar(m.ad).replace(/ mahallesi$/, "") === anahtar(ad),
      );
      if (mah) continue;
    }

    adaylar.push({
      id,
      ad,
      tur,
      x,
      y,
      alan,
      sokak: t["addr:street"] ?? null,
      no: t["addr:housenumber"] ?? null,
      kaynak: "osm",
    });
  }

  /* 1b) Overture Maps mekânları (scripts/overture-cek.py çalıştırıldıysa) */
  const overtureDosya = join(ONBELLEK, "overture.json");
  let overtureSay = 0;
  if (existsSync(overtureDosya)) {
    const { kayitlar } = JSON.parse(readFileSync(overtureDosya, "utf8"));
    for (const k of kayitlar) {
      if (!icinde(ilBolge.kenar, k.x, k.y)) continue;
      const ad = overtureAdi(k.ad);
      // Sınamalar Türkçe küçük harfle: /i bayrağı "İ"yi "i" ile eşlemiyor.
      const kucukAd = ad.toLocaleLowerCase("tr");
      if (!ad || ad.length < 4 || DISLA.test(kucukAd) || OVERTURE_DISLA.test(kucukAd))
        continue;
      if (blokMu(ad)) continue;
      const siteSozcuk = SITE_SOZCUK.test(ad);
      const apartman = APARTMAN_SOZCUK.test(ad);
      if (!siteSozcuk && !apartman) continue;
      adaylar.push({
        id: k.id,
        ad,
        tur: siteSozcuk ? "site" : "apartman",
        x: k.x,
        y: k.y,
        alan: false,
        sokak: overtureAdresi(k.adres),
        no: null,
        kaynak: "overture",
      });
      overtureSay++;
    }
    console.log(`  Overture: ${overtureSay} aday il içinde`);
  } else {
    console.log("  Overture önbelleği yok — yalnızca OSM (python scripts/overture-cek.py)");
  }

  /*
   * 2) Aynı siteyi bir kez tut. Öncelik: OSM alanı > OSM noktası > Overture.
   * Overture adları daha serbest ("Şükür Konakları Sapanca"), bu yüzden
   * biri diğerini içeriyorsa ve 300 m içindeyse de aynı sayılıyor.
   */
  const oncelik = (a) => (a.kaynak === "osm" ? (a.alan ? 0 : 1) : 2);
  adaylar.sort((a, b2) => oncelik(a) - oncelik(b2));
  const tekil = [];
  for (const a of adaylar) {
    const ka = anahtar(a.ad);
    const es = tekil.find((t) => {
      const kt = anahtar(t.ad);
      const m = metre(t, a);
      if (kt === ka && m < 450) return true;
      if (a.kaynak !== "overture" || m >= 300) return false;
      return kt.length >= 4 && ka.length >= 4 && (kt.includes(ka) || ka.includes(kt));
    });
    if (es) {
      es.sokak ??= a.sokak;
      es.no ??= a.no;
      continue;
    }
    tekil.push({ ...a, bloklar: [] });
  }

  /* 3) Blokları sitelerine bağla: önce ad, sonra 350 m içindeki en yakın site */
  let bagli = 0;
  for (const bl of bloklar) {
    let hedef = null;
    if (bl.site) {
      hedef = tekil.find((t) => anahtar(t.ad) === anahtar(bl.site) && metre(t, bl) < 800);
    }
    if (!hedef) {
      let enYakin = Infinity;
      for (const t of tekil) {
        if (t.tur !== "site") continue;
        const m = metre(t, bl);
        if (m < 350 && m < enYakin) {
          enYakin = m;
          hedef = t;
        }
      }
    }
    if (!hedef) continue;
    if (!hedef.bloklar.some((x) => x.ad === bl.ad)) {
      hedef.bloklar.push({ ad: bl.ad, x: bl.x, y: bl.y });
      bagli++;
    }
  }

  /* 4) İlçe ve mahalle */
  const sonuc = tekil.map((t) => {
    const ilce = bolgeBul(ilceler, t.x, t.y);
    let mahalle = bolgeBul(mahalleler, t.x, t.y);
    if (!mahalle) {
      let enYakin = 2500;
      for (const y of yerNoktalari) {
        const m = metre(t, y);
        if (m < enYakin) {
          enYakin = m;
          mahalle = y.ad;
        }
      }
    }
    const yuvarla = (v) => Math.round(v * 1e6) / 1e6;
    return {
      i: t.id,
      ...(t.kaynak === "overture" ? { k: "ov" } : {}),
      a: t.ad,
      t: t.tur === "site" ? "s" : "a",
      c: ilce ?? "",
      m: mahalle ? mahalle.replace(/\s+Mahallesi$/i, "") : "",
      y: yuvarla(t.y),
      x: yuvarla(t.x),
      ...(t.sokak ? { s: t.no ? `${t.sokak} No:${t.no}` : t.sokak } : {}),
      ...(t.bloklar.length
        ? {
            b: t.bloklar
              .sort((p, q) => p.ad.localeCompare(q.ad, "tr", { numeric: true }))
              .map((bl) => [bl.ad, yuvarla(bl.y), yuvarla(bl.x)]),
          }
        : {}),
    };
  });

  sonuc.sort(
    (p, q) =>
      p.c.localeCompare(q.c, "tr") ||
      p.t.localeCompare(q.t) ||
      p.a.localeCompare(q.a, "tr", { numeric: true }),
  );

  mkdirSync(dirname(CIKTI), { recursive: true });
  writeFileSync(
    CIKTI,
    JSON.stringify({
      kaynak:
        "© OpenStreetMap katkıcıları (ODbL) · Overture Maps Foundation (CDLA-Permissive-2.0)",
      tarih: new Date().toISOString().slice(0, 10),
      kayitlar: sonuc,
    }),
  );

  const say = (tur) => sonuc.filter((s) => s.t === tur).length;
  const ilceSay = {};
  for (const s of sonuc) ilceSay[s.c || "?"] = (ilceSay[s.c || "?"] ?? 0) + 1;
  console.log(
    `\n${sonuc.length} kayıt · ${say("s")} site · ${say("a")} apartman · ${bagli} blok bağlandı`,
  );
  console.log(
    `OSM ${sonuc.filter((s) => !s.k).length} · Overture ${sonuc.filter((s) => s.k === "ov").length}`,
  );
  console.log(ilceSay);
  console.log(`→ ${CIKTI}`);
}

main().catch((hata) => {
  console.error(hata);
  process.exit(1);
});
