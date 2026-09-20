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
  /**
   * Çizelge sayfasının adı — "SÜT" gibi. Kalem adı okunamadığında aboneliğin
   * başlığı buradan geliyor ki listede neyin abonesi olduğu yazsın.
   */
  baslik: string | null;
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
  /**
   * Adres alanı gerçek adres değil, defterdeki takma ad ("ERDİNÇ AMCA ALT KAT").
   * Geokodlamaya gönderilirse alakasız bir noktaya oturur; aranmıyor.
   */
  konum_aranmasin?: boolean;
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

/**
 * Serbest not içine sıkışmış telefon numarasını ayırır.
 *
 * Defterde numarası olmayan abonenin telefonu çizelgenin başlıksız sütununa
 * yazılmış ("546 503 69 96"). Numara künyeye geçsin, notta kalabalık yapmasın.
 */
export function telefonAyikla(
  not: string | null,
): { telefon: string; kalan: string | null } | null {
  if (!not) return null;
  for (const parca of not.split(/[·,;]/)) {
    const t = parca.trim();
    if (!/^[\d\s()+-]+$/.test(t)) continue;
    const rakam = t.replace(/\D/g, "");
    if (rakam.length < 10 || rakam.length > 12) continue;
    const kalan =
      not
        .split(/[·,;]/)
        .map((p) => p.trim())
        .filter((p) => p && p !== t)
        .join(" · ") || null;
    return { telefon: t, kalan };
  }
  return null;
}

function cizelgeyiCoz(
  sayfa: Sayfa,
): { plan: AbonelikPlani; aboneNo: string }[] {
  const dolu = doluSatirlar(sayfa.satirlar);
  if (dolu.length < 2) return [];
  const basliklar = dolu[0].satir;
  const eslesme = alanEsle(basliklar);
  const aboneSutun = eslesme.abone_no ?? 0;
  const gunSutun = basliklar.findIndex((b) => anahtarla(b) === "gun");
  const saatSutun = basliklar.findIndex((b) =>
    ["saat", "teslimsaati"].includes(anahtarla(b)),
  );
  const tutarSutun = basliklar.findIndex((b) =>
    ["tutar", "fiyat"].includes(anahtarla(b)),
  );

  // Başlık satırı veri satırlarından kısa olabiliyor: SÜT sayfasında notlar
  // hiç başlığı olmayan 6. sütunda duruyor.
  const enGenis = Math.max(
    basliklar.length,
    ...dolu.map((d) => d.satir.length),
  );

  /*
   * Başlıksız sütun ürün sayılamaz — adı yok ki kalem olsun. İçindekiler
   * serbest not: "her hafta süt istiyor", bir de telefon numarası.
   */
  const notSutunlari: number[] = [];
  for (let i = 0; i < enGenis; i++) {
    if ([aboneSutun, gunSutun, saatSutun, tutarSutun].includes(i)) continue;
    const a = anahtarla(basliklar[i] ?? "");
    if (a === "" || ["not", "notlar", "aciklama"].includes(a)) {
      notSutunlari.push(i);
    }
  }

  const urunSutunlari = basliklar
    .map((b, i) => ({ ad: b.trim(), i }))
    .filter((s) => !CIZELGE_DISI.has(anahtarla(s.ad)) && s.i !== gunSutun);

  const sayfaAdi = metin(sayfa.ad);
  const sonuc: { plan: AbonelikPlani; aboneNo: string }[] = [];

  for (const { satir, sira } of dolu.slice(1)) {
    const aboneNo = (satir[aboneSutun] ?? "").trim();
    // Toplam satırı veride değil raporda; abone sayılmamalı.
    if (anahtarla(aboneNo) === "toplam") continue;

    const gunler = gunleriCoz(satir[gunSutun]);
    const kalemler = urunSutunlari
      .map((s) => ({ ad: s.ad, miktar: sayi(satir[s.i]) ?? 0 }))
      .filter((k) => k.miktar > 0);
    const not =
      notSutunlari
        .map((i) => metin(satir[i]))
        .filter(Boolean)
        .join(" · ") || null;

    // Ne gün, ne miktar, ne not varsa satır boş sayılır.
    if (gunler.length === 0 && kalemler.length === 0 && !not) continue;

    /*
     * Numarası yazılmamış satır bir öncekinin devamı. Defterde iki türlü
     * karşımıza çıkıyor: aboneye ikinci bir gün ekleniyor ("PERŞEMBE&P.TSİ"
     * alt satırda), ya da adet bir satır aşağı kaymış oluyor. Eskiden bu
     * satırlar sessizce düşüyordu; artık üstteki aboneliğe katılıyor.
     */
    const onceki = sonuc[sonuc.length - 1];
    if (!aboneNo) {
      if (!onceki) continue;
      for (const g of gunler) {
        if (!onceki.plan.gunler.includes(g)) onceki.plan.gunler.push(g);
      }
      onceki.plan.gunler.sort((a, b) => a - b);
      for (const k of kalemler) {
        const ayni = onceki.plan.kalemler.find((x) => x.ad === k.ad);
        if (ayni) ayni.miktar += k.miktar;
        else onceki.plan.kalemler.push(k);
      }
      if (not) {
        onceki.plan.not = [onceki.plan.not, not].filter(Boolean).join(" · ");
      }
      continue;
    }

    sonuc.push({
      aboneNo,
      plan: {
        gunler,
        kalemler,
        baslik: sayfaAdi,
        saat: saatSutun >= 0 ? saatCoz(satir[saatSutun]) : null,
        tutar: tutarSutun >= 0 ? sayi(satir[tutarSutun]) : null,
        not,
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
  // Anahtar sadeleştirilmiş hâl; listede bulunmayan aboneyi kendi adıyla
  // kaydedebilmek için defterde yazdığı gibi de tutuluyor.
  const etiketler = new Map<string, string>();
  for (const { aboneNo, plan } of cizelge) {
    const anahtar = anahtarla(aboneNo);
    if (!anahtar) continue;
    const liste = planlar.get(anahtar) ?? [];
    liste.push(plan);
    planlar.set(anahtar, liste);
    if (!etiketler.has(anahtar)) etiketler.set(anahtar, aboneNo.trim());
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
    const cizelgeden = planlar.get(anahtar) ?? planlar.get(adAnahtar) ?? [];
    if (cizelgeden.length) {
      kullanilanPlan.add(planlar.has(anahtar) ? anahtar : adAnahtar);
    }

    /*
     * Defterdeki herkes abone: SERVİS sayfası zaten servis listesi. Çizelgede
     * satırı olmayanlara günsüz bir abonelik açılıyor — kayıt abonelikler
     * listesinde ve haritada görünsün diye. Günü boş olduğu için kendiliğinden
     * sipariş üretmiyor (`abonelikBugunMu` haftalıkta günlere bakıyor);
     * markette teslim planı belli olunca gün işaretlenmesi yetiyor.
     */
    const abonelikler: AbonelikPlani[] = cizelgeden.length
      ? cizelgeden
      : [
          {
            gunler: [],
            kalemler: [],
            baslik: null,
            saat: null,
            tutar: null,
            not: null,
            kaynakSatir: sira,
          },
        ];

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

  /*
   * Çizelgede olup abone listesinde olmayanlar. Defterde numara yerine
   * tarif yazılmış oluyor ("ERDİNÇ AMCA ALT KAT"); marketin bildiği tek
   * künye bu. Eskiden bu satırlar tümden düşüyordu — artık kendi müşterisi
   * olarak kaydediliyorlar, adres alanına da aynı tarif yazılıyor.
   */
  const eslesmeyen = [...planlar.keys()].filter((a) => !kullanilanPlan.has(a));
  let sonSira = satirlar.reduce((e, s) => Math.max(e, s.sira), 0);
  for (const anahtar of eslesmeyen) {
    const kendiPlanlari = planlar.get(anahtar) ?? [];
    const etiket = etiketler.get(anahtar) ?? anahtar;
    // Not alanına düşmüş telefon numarasını künyeye taşı.
    let telefon: string | null = null;
    for (const plan of kendiPlanlari) {
      const bulunan = telefonAyikla(plan.not);
      if (!bulunan) continue;
      telefon ??= bulunan.telefon;
      plan.not = bulunan.kalan;
    }
    sonSira += 1;
    satirlar.push({
      sira: sonSira,
      abone_no: null,
      ad: etiket,
      telefon,
      adres_metni: etiket,
      bina: null,
      kat: null,
      daire: null,
      tarif: "Adresi deftere yazılmamış, çizelgedeki tarifle kaydedildi.",
      lat: null,
      lng: null,
      notlar: null,
      abonelikler: kendiPlanlari,
      konum_aranmasin: true,
      hata: null,
    });
  }
  if (eslesmeyen.length) {
    uyarilar.push(
      `${eslesmeyen.length} çizelge satırının abonesi listede yoktu; ` +
        "adresleri boş, çizelgedeki adlarıyla kaydedilecek.",
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
