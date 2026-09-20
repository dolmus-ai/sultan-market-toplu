/**
 * Excel/CSV dosyalarından müşteri, adres ve abonelik satırı çıkarma.
 *
 * Sunucuda çalışıyor: exceljs tarayıcıda Node akışlarına ihtiyaç duyuyor ve
 * kurye uygulamasının paketini gereksiz büyütürdü. API rotasından ayrı
 * durmasının sebebi tek başına sınanabilmesi.
 *
 * İki biçim tanınıyor:
 *
 * - **Müşteri listesi** — tek sayfa, "Ad" ve "Adres" başlıklı. Eski biçim.
 * - **Abone defteri** — marketin elindeki ABONE dosyasının şekli. Bir sayfada
 *   abone listesi (`ABONE NO`, ad, `TEL`, `ADRES`), başka bir sayfada haftalık
 *   teslim çizelgesi (`ABONE NO`, `GÜN`, `SÜT`, `YUMURTA`…). İkisi abone
 *   numarasından birleştiriliyor: her çizelge satırı bir aboneliğe dönüşüyor.
 */

export type AbonelikKalemiSatiri = { ad: string; miktar: number };

/** Çizelge sayfasındaki tek satır — bir aboneliğe karşılık gelir. */
export type AbonelikPlani = {
  /** ISO gün numaraları: Pazartesi 1 … Pazar 7. */
  gunler: number[];
  kalemler: AbonelikKalemiSatiri[];
  /** "08:00" — yazılmamışsa null, kayıtta varsayılana düşer. */
  saat: string | null;
  tutar: number | null;
  not: string | null;
  /** Çizelge sayfasındaki satır numarası — hatayı göstermek için. */
  kaynakSatir: number;
};

export type TopluSatir = {
  /** Dosyadaki satır numarası — hatayı kullanıcıya göstermek için. */
  sira: number;
  /** Abone defterindeki numara; müşteri listesinde boş. */
  abone_no: string | null;
  ad: string;
  telefon: string | null;
  adres_metni: string;
  bina: string | null;
  kat: string | null;
  daire: string | null;
  tarif: string | null;
  lat: number | null;
  lng: number | null;
  notlar: string | null;
  /** Bu müşteri için kurulacak abonelikler; müşteri listesinde boş. */
  abonelikler: AbonelikPlani[];
  hata: string | null;
};

export type TopluBicim = "musteri" | "abone";

export type TopluSonuc =
  | {
      tamam: true;
      bicim: TopluBicim;
      satirlar: TopluSatir[];
      gecerli: number;
      hatali: number;
      /** Kurulacak toplam abonelik sayısı. */
      abonelik: number;
      /** Kullanıcıya gösterilecek, yüklemeyi engellemeyen notlar. */
      uyarilar: string[];
    }
  | { tamam: false; hata: string };

export type Sayfa = { ad: string; satirlar: string[][] };

/** Başlık eşleştirme: Türkçe karakter, boşluk ve büyük/küçük harf farkını yok sayar. */
export function anahtarla(baslik: string): string {
  const harita: Record<string, string> = {
    "ç": "c",
    "ğ": "g",
    "ı": "i",
    "ö": "o",
    "ş": "s",
    "ü": "u",
  };
  return baslik
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => harita[h] ?? h)
    .replace(/[^a-z0-9]/g, "");
}

const ALAN_ADLARI: Record<string, string[]> = {
  abone_no: ["aboneno", "abonenumarasi", "abone", "abonekodu", "no1"],
  ad: ["ad", "adsoyad", "isim", "musteri", "musteriadi", "adisoyadi"],
  telefon: ["telefon", "tel", "gsm", "cep", "ceptelefonu", "telefonno"],
  adres_metni: ["adres", "adresmetni", "acikadres", "adres1", "mahalle"],
  bina: ["bina", "binano", "no", "kapino", "numara"],
  kat: ["kat"],
  daire: ["daire", "daireno", "d"],
  tarif: ["tarif", "adrestarifi", "aciklama", "izahat"],
  lat: ["lat", "enlem", "latitude"],
  lng: ["lng", "lon", "boylam", "longitude"],
  notlar: ["not", "notlar", "musterinotu"],
};

export function alanEsle(basliklar: string[]): Record<string, number> {
  const eslesme: Record<string, number> = {};
  basliklar.forEach((baslik, i) => {
    const a = anahtarla(baslik);
    for (const [alan, adaylar] of Object.entries(ALAN_ADLARI)) {
      if (eslesme[alan] === undefined && adaylar.includes(a)) eslesme[alan] = i;
    }
  });
  return eslesme;
}

/* ------------------------------------------------------------------ */
/* Gün adları                                                          */
/* ------------------------------------------------------------------ */

/**
 * Markette gün adları kısaltılarak yazılıyor: "P.TESİ", "P.TSİ", "PERŞEMBE".
 * Anahtar hâlleri (nokta ve Türkçe harf atılmış) burada eşleniyor.
 * "cumartesi" ayrı anahtar olduğu için "cuma" ile karışmıyor.
 */
const GUN_ADLARI: Record<string, number> = {
  pazartesi: 1, ptesi: 1, ptsi: 1, pzt: 1, pts: 1, pzts: 1,
  sali: 2, sal: 2, sl: 2,
  carsamba: 3, car: 3, crs: 3, crsmb: 3,
  persembe: 4, per: 4, prs: 4, prsmb: 4,
  cuma: 5, cum: 5, cm: 5,
  cumartesi: 6, cmt: 6, cts: 6, cmrt: 6,
  pazar: 7, paz: 7, pz: 7,
};

/** "PERŞEMBE&P.TSİ" → [1, 4]. Tanınmayan parçalar atlanır. */
export function gunleriCoz(metin: string | undefined | null): number[] {
  if (!metin) return [];
  const bulunan = new Set<number>();
  for (const parca of metin.split(/[&,/+]|\bve\b/i)) {
    const g = GUN_ADLARI[anahtarla(parca)];
    if (g) bulunan.add(g);
  }
  return [...bulunan].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Ayrıştırıcılar                                                      */
/* ------------------------------------------------------------------ */

/** Tırnak içindeki ayırıcıları koruyan küçük CSV ayrıştırıcı. */
export function csvAyristir(metin: string): string[][] {
  const temiz = metin.replace(/^﻿/, "");
  const ilkSatir = temiz.split(/\r?\n/, 1)[0] ?? "";
  // Türkçe Excel noktalı virgülle yazıyor; hangisi çoksa ayırıcı odur.
  const ayirici =
    (ilkSatir.match(/;/g)?.length ?? 0) > (ilkSatir.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const satirlar: string[][] = [];
  let hucre = "";
  let satir: string[] = [];
  let tirnakta = false;

  for (let i = 0; i < temiz.length; i++) {
    const k = temiz[i];
    if (tirnakta) {
      if (k === '"') {
        if (temiz[i + 1] === '"') {
          hucre += '"';
          i++;
        } else tirnakta = false;
      } else hucre += k;
      continue;
    }
    if (k === '"') tirnakta = true;
    else if (k === ayirici) {
      satir.push(hucre);
      hucre = "";
    } else if (k === "\n") {
      satir.push(hucre);
      satirlar.push(satir);
      satir = [];
      hucre = "";
    } else if (k !== "\r") hucre += k;
  }
  if (hucre !== "" || satir.length) {
    satir.push(hucre);
    satirlar.push(satir);
  }
  return satirlar;
}

function hucreMetni(d: unknown): string {
  if (d == null) return "";
  if (typeof d === "object" && "text" in (d as object))
    return String((d as { text: unknown }).text ?? "");
  if (typeof d === "object" && "result" in (d as object))
    return String((d as { result: unknown }).result ?? "");
  if (typeof d === "object" && "richText" in (d as object))
    return ((d as { richText: { text?: string }[] }).richText ?? [])
      .map((p) => p.text ?? "")
      .join("");
  return String(d);
}

/** Çalışma kitabındaki bütün sayfaları ham hücre dizisi olarak verir. */
export async function xlsxSayfalariCoz(tampon: Buffer): Promise<Sayfa[]> {
  const ExcelJS = (await import("exceljs")).default;
  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(tampon as unknown as ArrayBuffer);

  const sayfalar: Sayfa[] = [];
  kitap.eachSheet((sayfa) => {
    const satirlar: string[][] = [];
    // Boş satırlar da alınıyor: satır numarası dosyadakiyle aynı kalsın.
    sayfa.eachRow({ includeEmpty: true }, (satir) => {
      const hucreler: string[] = [];
      // `values` 1 tabanlı geliyor, ilk eleman boş.
      const degerler = satir.values as unknown[];
      for (let i = 1; i < degerler.length; i++) {
        hucreler.push(hucreMetni(degerler[i]));
      }
      satirlar.push(hucreler);
    });
    sayfalar.push({ ad: sayfa.name, satirlar });
  });
  return sayfalar;
}

/** Eski çağrı biçimi: yalnızca ilk sayfa. */
export async function xlsxAyristir(tampon: Buffer): Promise<string[][]> {
  const sayfalar = await xlsxSayfalariCoz(tampon);
  return sayfalar[0]?.satirlar ?? [];
}

function sayi(deger: string | undefined): number | null {
  const t = deger?.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function metin(deger: string | undefined): string | null {
  const t = deger?.trim();
  return t ? t : null;
}

/** "8:30", "08:30:00" → "08:30". Anlaşılmayan değer null. */
export function saatCoz(deger: string | undefined): string | null {
  const t = deger?.trim();
  if (!t) return null;
  const e = /^(\d{1,2})[:.](\d{2})/.exec(t);
  if (!e) return null;
  const sa = Number(e[1]);
  const dk = Number(e[2]);
  if (sa > 23 || dk > 59) return null;
  return `${String(sa).padStart(2, "0")}:${String(dk).padStart(2, "0")}`;
}

function doluSatirlar(satirlar: string[][]): { satir: string[]; sira: number }[] {
  return satirlar
    .map((satir, i) => ({ satir, sira: i + 1 }))
    .filter((s) => s.satir.some((h) => h.trim() !== ""));
}

/* ------------------------------------------------------------------ */
/* Müşteri listesi (eski biçim)                                        */
/* ------------------------------------------------------------------ */

/** Ham hücrelerden müşteri satırlarını çıkarır; başlık satırını kendi bulur. */
export function satirlariCikar(hamSatirlar: string[][]): TopluSonuc {
  const dolu = hamSatirlar.filter((s) => s.some((h) => h.trim() !== ""));
  if (dolu.length < 2) {
    return {
      tamam: false,
      hata: "Dosyada başlık satırı ve en az bir kayıt olmalı.",
    };
  }

  const eslesme = alanEsle(dolu[0]);
  if (eslesme.ad === undefined || eslesme.adres_metni === undefined) {
    return {
      tamam: false,
      hata:
        "Başlık satırında en az 'Ad' ve 'Adres' sütunları olmalı. " +
        `Bulunanlar: ${dolu[0].filter(Boolean).join(", ") || "—"}`,
    };
  }

  const al = (satir: string[], alan: string) =>
    eslesme[alan] === undefined ? undefined : satir[eslesme[alan]];

  const satirlar: TopluSatir[] = dolu.slice(1).map((satir, i) => {
    const ad = metin(al(satir, "ad"));
    const adres = metin(al(satir, "adres_metni"));
    const lat = sayi(al(satir, "lat"));
    const lng = sayi(al(satir, "lng"));
    // Yarım koordinat haritada yanlış yere pin koyar; ikisi birlikte olmalı.
    const konumTam = lat != null && lng != null;
    return {
      sira: i + 2,
      abone_no: metin(al(satir, "abone_no")),
      ad: ad ?? "",
      telefon: metin(al(satir, "telefon")),
      adres_metni: adres ?? "",
      bina: metin(al(satir, "bina")),
      kat: metin(al(satir, "kat")),
      daire: metin(al(satir, "daire")),
      tarif: metin(al(satir, "tarif")),
      lat: konumTam ? lat : null,
      lng: konumTam ? lng : null,
      notlar: metin(al(satir, "notlar")),
      abonelikler: [],
      hata: !ad ? "Ad boş" : !adres ? "Adres boş" : null,
    };
  });

  return {
    tamam: true,
    bicim: "musteri",
    satirlar,
    gecerli: satirlar.filter((s) => !s.hata).length,
    hatali: satirlar.filter((s) => s.hata).length,
    abonelik: 0,
    uyarilar: [],
  };
}

/* ------------------------------------------------------------------ */
/* Abone defteri                                                       */
/* ------------------------------------------------------------------ */

/** Abone listesi sayfası mı: abone numarası ve adres sütunu birlikte. */
export function aboneSayfasiMi(basliklar: string[]): boolean {
  const e = alanEsle(basliklar);
  return e.abone_no !== undefined && e.adres_metni !== undefined;
}

/** Çizelge sayfası mı: gün sütunu ve abone numarası birlikte. */
export function cizelgeSayfasiMi(basliklar: string[]): boolean {
  const anahtarlar = basliklar.map(anahtarla);
  return anahtarlar.includes("gun") && anahtarlar.some((a) => a === "aboneno");
}

/**
 * Çizelgede ürün sayılmayan sütunlar. Geri kalan her sütun başlığı bir ürün
 * adı, hücresi de miktarı kabul ediliyor; böylece markette yeni bir kalem
 * açıldığında kod değişmeden içeri giriyor.
 */
const CIZELGE_DISI = new Set([
  "aboneno",
  "abone",
  "gun",
  "gunler",
  "saat",
  "teslimsaati",
  "tutar",
  "fiyat",
  "toplam",
  "kar",
  "baslik",
  "ad",
  "adres",
  "not",
  "notlar",
  "aciklama",
  "tel",
  "telefon",
  "",
]);

/**
 * Adı yazılmamış sütunu bulur.
 *
 * Markette tutulan defterde müşteri adının başlığı boş: `ABONE NO | | TEL |
 * ADRES`. Başlığı boş olan sütunlardan hangisinin ad olduğunu içeriğinden
 * anlıyoruz — sayı değil harf içeren, çoğunlukla dolu olan sütun.
 */
export function adSutunuBul(
  basliklar: string[],
  ornekler: string[][],
  kullanilan: Set<number>,
): number | undefined {
  let enIyi: { sutun: number; oran: number } | undefined;
  for (let s = 0; s < basliklar.length; s++) {
    if (kullanilan.has(s) || anahtarla(basliklar[s]) !== "") continue;
    const degerler = ornekler.map((r) => (r[s] ?? "").trim()).filter(Boolean);
    if (degerler.length === 0) continue;
    const harfli = degerler.filter((d) => /\p{L}/u.test(d)).length;
    const oran = harfli / degerler.length;
    // Doluluk da önemli: tek bir hücresi dolu artık sütun ad sanılmasın.
    // Ad sütunu satırların en az yarısında doludur; defterde 1217 abonenin
    // yalnızca 17'sinin adı boştu.
    const doluluk = degerler.length / Math.max(ornekler.length, 1);
    if (oran >= 0.7 && doluluk >= 0.5 && (!enIyi || oran > enIyi.oran)) {
      enIyi = { sutun: s, oran };
    }
  }
  return enIyi?.sutun;
}

function cizelgeyiCoz(
  sayfa: Sayfa,
): { plan: AbonelikPlani; aboneNo: string }[] {
  const dolu = doluSatirlar(sayfa.satirlar);
  if (dolu.length < 2) return [];
  const basliklar = dolu[0].satir;
  const eslesme = alanEsle(basliklar);
  const gunSutun = basliklar.findIndex((b) => anahtarla(b) === "gun");
  const notSutun = basliklar.findIndex((b) =>
    ["not", "notlar", "aciklama"].includes(anahtarla(b)),
  );
  const saatSutun = basliklar.findIndex((b) =>
    ["saat", "teslimsaati"].includes(anahtarla(b)),
  );
  const tutarSutun = basliklar.findIndex((b) =>
    ["tutar", "fiyat"].includes(anahtarla(b)),
  );

  const urunSutunlari = basliklar
    .map((b, i) => ({ ad: b.trim(), i }))
    .filter((s) => !CIZELGE_DISI.has(anahtarla(s.ad)) && s.i !== gunSutun);

  const sonuc: { plan: AbonelikPlani; aboneNo: string }[] = [];
  for (const { satir, sira } of dolu.slice(1)) {
    const aboneNo = (satir[eslesme.abone_no ?? 0] ?? "").trim();
    // Toplam satırı veride değil raporda; abone sayılmamalı.
    if (anahtarla(aboneNo) === "toplam") continue;

    const gunler = gunleriCoz(satir[gunSutun]);
    const kalemler = urunSutunlari
      .map((s) => ({ ad: s.ad, miktar: sayi(satir[s.i]) ?? 0 }))
      .filter((k) => k.miktar > 0);

    // Ne gün ne miktar varsa satır boş sayılır.
    if (gunler.length === 0 && kalemler.length === 0) continue;

    sonuc.push({
      aboneNo,
      plan: {
        gunler,
        kalemler,
        saat: saatSutun >= 0 ? saatCoz(satir[saatSutun]) : null,
        tutar: tutarSutun >= 0 ? sayi(satir[tutarSutun]) : null,
        not: notSutun >= 0 ? metin(satir[notSutun]) : null,
        kaynakSatir: sira,
      },
    });
  }
  return sonuc;
}

/** Abone listesi + çizelge sayfalarını tek listede birleştirir. */
export function aboneDefteriCoz(sayfalar: Sayfa[]): TopluSonuc {
  const aboneSayfasi = sayfalar.find((s) => {
    const dolu = doluSatirlar(s.satirlar);
    return dolu.length >= 2 && aboneSayfasiMi(dolu[0].satir);
  });
  if (!aboneSayfasi) {
    return { tamam: false, hata: "Abone listesi sayfası bulunamadı." };
  }

  const dolu = doluSatirlar(aboneSayfasi.satirlar);
  const basliklar = dolu[0].satir;
  const eslesme = alanEsle(basliklar);
  const kayitlar = dolu.slice(1);

  // Ad sütununun başlığı boş olabilir; içeriğinden bul.
  if (eslesme.ad === undefined) {
    const adSutun = adSutunuBul(
      basliklar,
      kayitlar.slice(0, 200).map((k) => k.satir),
      new Set(Object.values(eslesme)),
    );
    if (adSutun !== undefined) eslesme.ad = adSutun;
  }

  const cizelge = sayfalar
    .filter((s) => {
      const d = doluSatirlar(s.satirlar);
      return d.length >= 2 && cizelgeSayfasiMi(d[0].satir);
    })
    .flatMap(cizelgeyiCoz);

  const planlar = new Map<string, AbonelikPlani[]>();
  for (const { aboneNo, plan } of cizelge) {
    const anahtar = anahtarla(aboneNo);
    if (!anahtar) continue;
    const liste = planlar.get(anahtar) ?? [];
    liste.push(plan);
    planlar.set(anahtar, liste);
  }

  const al = (satir: string[], alan: string) =>
    eslesme[alan] === undefined ? undefined : satir[eslesme[alan]];

  const kullanilanPlan = new Set<string>();
  const satirlar: TopluSatir[] = kayitlar.map(({ satir, sira }) => {
    const aboneNo = metin(al(satir, "abone_no"));
    const ad = metin(al(satir, "ad"));
    const adres = metin(al(satir, "adres_metni"));
    const lat = sayi(al(satir, "lat"));
    const lng = sayi(al(satir, "lng"));
    const konumTam = lat != null && lng != null;

    const anahtar = aboneNo ? anahtarla(aboneNo) : "";
    const adAnahtar = ad ? anahtarla(ad) : "";
    // Çizelgede numara yerine ad yazılmış olabilir; ikisini de deniyoruz.
    const abonelikler = planlar.get(anahtar) ?? planlar.get(adAnahtar) ?? [];
    if (abonelikler.length) {
      kullanilanPlan.add(planlar.has(anahtar) ? anahtar : adAnahtar);
    }

    return {
      sira,
      abone_no: aboneNo,
      // Adı yazılmamış aboneyi numarasıyla anıyoruz; kayıt kaybolmasın.
      ad: ad ?? (aboneNo ? `Abone ${aboneNo}` : ""),
      telefon: metin(al(satir, "telefon")),
      adres_metni: adres ?? "",
      bina: metin(al(satir, "bina")),
      kat: metin(al(satir, "kat")),
      daire: metin(al(satir, "daire")),
      tarif: metin(al(satir, "tarif")),
      lat: konumTam ? lat : null,
      lng: konumTam ? lng : null,
      notlar: metin(al(satir, "notlar")),
      abonelikler,
      hata: !adres ? "Adres boş" : null,
    };
  });

  const uyarilar: string[] = [];
  const eslesmeyen = [...planlar.keys()].filter((a) => !kullanilanPlan.has(a));
  if (eslesmeyen.length) {
    uyarilar.push(
      `${eslesmeyen.length} çizelge satırının abonesi listede bulunamadı, ` +
        "bu abonelikler kurulmayacak.",
    );
  }

  return {
    tamam: true,
    bicim: "abone",
    satirlar,
    gecerli: satirlar.filter((s) => !s.hata).length,
    hatali: satirlar.filter((s) => s.hata).length,
    abonelik: satirlar
      .filter((s) => !s.hata)
      .reduce((t, s) => t + s.abonelikler.length, 0),
    uyarilar,
  };
}

/* ------------------------------------------------------------------ */
/* Giriş noktası                                                       */
/* ------------------------------------------------------------------ */

/** Dosya adına göre doğru ayrıştırıcıyı seçer. */
export async function dosyayiCoz(
  dosyaAdi: string,
  tampon: Buffer,
): Promise<TopluSonuc> {
  if (dosyaAdi.toLocaleLowerCase("tr").endsWith(".csv")) {
    try {
      return satirlariCikar(csvAyristir(tampon.toString("utf8")));
    } catch {
      return { tamam: false, hata: "Dosya çözümlenemedi. CSV bekleniyor." };
    }
  }

  let sayfalar: Sayfa[];
  try {
    sayfalar = await xlsxSayfalariCoz(tampon);
  } catch {
    return {
      tamam: false,
      hata: "Dosya çözümlenemedi. Excel (.xlsx) veya CSV bekleniyor.",
    };
  }

  // Abone defteri mi? Önce ona bakıyoruz: o biçim abonelikleri de kuruyor.
  const abone = sayfalar.some((s) => {
    const dolu = doluSatirlar(s.satirlar);
    return dolu.length >= 2 && aboneSayfasiMi(dolu[0].satir);
  });
  if (abone) return aboneDefteriCoz(sayfalar);

  const ilkDolu = sayfalar.find((s) => doluSatirlar(s.satirlar).length >= 2);
  return satirlariCikar(ilkDolu?.satirlar ?? []);
}
