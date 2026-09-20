/**
 * Excel dosyası üretme — şablon ve dışa aktarma.
 *
 * Sunucuda çalışıyor. Sebebi `toplu.ts` ile aynı: exceljs tarayıcıda Node
 * akışlarına ihtiyaç duyuyor ve kurye uygulamasının paketini kabartırdı.
 *
 * Abonelik çıktısı, marketin elindeki ABONE defterinin şeklinde yazılıyor:
 * bir sayfada abone listesi, bir sayfada haftalık çizelge. Böylece dosya
 * indirilip Excel'de düzenlenip aynı yerden geri yüklenebiliyor.
 */

import { GUN_KISA } from "./bicim";

export type DisaAktarTuru = "teslimatlar" | "abonelikler" | "sepetler";

/** Dışa aktarılacak kayıtların ihtiyaç duyulan alanları. */
type DisMusteri = { ad?: string | null; telefon?: string | null } | null;
type DisAdres = {
  adres_metni?: string | null;
  bina?: string | null;
  kat?: string | null;
  daire?: string | null;
  tarif?: string | null;
  lat?: number | null;
  lng?: number | null;
} | null;

export type DisTeslimat = {
  musteri: DisMusteri;
  adres: DisAdres;
  durum?: string | null;
  planlanan_tarih?: string | null;
  planlanan_saat?: string | null;
  odeme_yontemi?: string | null;
  tutar?: number | null;
  notlar?: string | null;
  kalemler?: { miktar: number; urun: { ad?: string | null } | null }[];
};

export type DisAbonelik = {
  musteri: DisMusteri;
  adres: DisAdres;
  baslik?: string | null;
  gunler?: number[] | null;
  teslim_saati?: string | null;
  durum?: string | null;
  tutar?: number | null;
  notlar?: string | null;
  kalemler?: { miktar: number; urun: { ad?: string | null } | null }[];
};

export type DisSepet = {
  musteri: DisMusteri;
  adres: DisAdres;
  durum?: string | null;
  tutar?: number | null;
  updated_at?: string | null;
  kalemler?: { miktar: number }[];
};

/** Gün numaralarını defterdeki gibi yazar: "PAZARTESİ&PERŞEMBE". */
const GUN_TAM = [
  "PAZARTESİ",
  "SALI",
  "ÇARŞAMBA",
  "PERŞEMBE",
  "CUMA",
  "CUMARTESİ",
  "PAZAR",
];

export function gunleriYaz(gunler: number[] | null | undefined): string {
  if (!gunler?.length) return "";
  return [...gunler]
    .sort((a, b) => a - b)
    .map((g) => GUN_TAM[g - 1] ?? GUN_KISA[g - 1] ?? "")
    .filter(Boolean)
    .join("&");
}

/**
 * Abone listesinin sütunları.
 *
 * İlk dördü defterdeki sırayla: ABONE NO, ad (başlığı bilerek boş), TEL,
 * ADRES. Sonrakiler kapı bilgisi ve koordinat — dosya indirilip düzenlenip
 * geri yüklendiğinde bunlar kaybolmasın diye. Marketin kendi defterinde
 * olmadıkları için fazladan sütun sayılıyorlar; içe aktarma ikisini de
 * okuyabiliyor.
 */
const SERVIS_BASLIK = [
  "ABONE NO",
  "",
  "TEL",
  "ADRES",
  "BİNA",
  "KAT",
  "DAİRE",
  "TARİF",
  "LAT",
  "LNG",
];
const SERVIS_GENISLIK = [11, 26, 18, 46, 8, 6, 8, 24, 11, 11];

function servisSatiri(no: number, musteri: DisMusteri, adres: DisAdres) {
  return [
    no,
    musteri?.ad ?? "",
    musteri?.telefon ?? "",
    adres?.adres_metni ?? "",
    adres?.bina ?? "",
    adres?.kat ?? "",
    adres?.daire ?? "",
    adres?.tarif ?? "",
    adres?.lat ?? "",
    adres?.lng ?? "",
  ];
}

function kalemleriYaz(
  kalemler: { miktar: number; urun?: { ad?: string | null } | null }[] | undefined,
): string {
  if (!kalemler?.length) return "";
  return kalemler
    .map((k) => `${k.miktar} ${k.urun?.ad ?? "kalem"}`)
    .join(", ");
}

type Kitap = import("exceljs").Workbook;
type Sayfa = import("exceljs").Worksheet;

async function kitapAc(): Promise<Kitap> {
  const ExcelJS = (await import("exceljs")).default;
  const kitap = new ExcelJS.Workbook();
  kitap.creator = "Sultan Market Kurye";
  kitap.created = new Date();
  return kitap;
}

/** Başlık satırını kalınlaştırır ve sütunları içeriğe göre genişletir. */
function sayfayiBicimle(sayfa: Sayfa, genislikler: number[]) {
  const baslik = sayfa.getRow(1);
  baslik.font = { bold: true };
  baslik.alignment = { vertical: "middle" };
  genislikler.forEach((g, i) => {
    sayfa.getColumn(i + 1).width = g;
  });
  sayfa.views = [{ state: "frozen", ySplit: 1 }];
}

async function yaz(kitap: Kitap): Promise<Buffer> {
  const tampon = await kitap.xlsx.writeBuffer();
  return Buffer.from(tampon as ArrayBuffer);
}

/* ------------------------------------------------------------------ */
/* Abone defteri biçimi                                                */
/* ------------------------------------------------------------------ */

/**
 * Abone listesi + çizelge sayfalarını yazar.
 *
 * Ad sütununun başlığı defterdeki gibi bilerek boş bırakılıyor; içe aktarma
 * o sütunu içeriğinden tanıyor. Çizelge sütunları kayıtlardaki ürünlerden
 * türetiliyor, böylece süt ve yumurta dışındaki kalemler de yerini buluyor.
 */
function aboneDefteriYaz(kitap: Kitap, abonelikler: DisAbonelik[]) {
  const servis = kitap.addWorksheet("SERVİS");
  servis.addRow(SERVIS_BASLIK);
  sayfayiBicimle(servis, SERVIS_GENISLIK);

  // Aynı müşterinin birden çok aboneliği tek abone satırına bağlanıyor.
  const aboneler = new Map<string, { no: number; abonelik: DisAbonelik }>();
  for (const a of abonelikler) {
    const anahtar = `${a.musteri?.ad ?? ""}|${a.adres?.adres_metni ?? ""}`;
    if (!aboneler.has(anahtar)) {
      aboneler.set(anahtar, { no: aboneler.size, abonelik: a });
    }
  }

  for (const { no, abonelik } of aboneler.values()) {
    servis.addRow(servisSatiri(no, abonelik.musteri, abonelik.adres));
  }

  // Çizelge sütunları: kayıtlarda geçen bütün ürün adları.
  const urunAdlari: string[] = [];
  for (const a of abonelikler) {
    for (const k of a.kalemler ?? []) {
      const ad = (k.urun?.ad ?? "").trim();
      if (ad && !urunAdlari.includes(ad)) urunAdlari.push(ad);
    }
  }

  const cizelge = kitap.addWorksheet("ÇİZELGE");
  cizelge.addRow(["ABONE NO", "GÜN", ...urunAdlari, "SAAT", "TUTAR", "NOT"]);
  sayfayiBicimle(cizelge, [
    11,
    24,
    ...urunAdlari.map(() => 12),
    9,
    11,
    30,
  ]);

  for (const a of abonelikler) {
    const anahtar = `${a.musteri?.ad ?? ""}|${a.adres?.adres_metni ?? ""}`;
    const abone = aboneler.get(anahtar);
    const miktarlar = urunAdlari.map((ad) => {
      const k = (a.kalemler ?? []).find((x) => (x.urun?.ad ?? "").trim() === ad);
      return k ? k.miktar : "";
    });
    cizelge.addRow([
      abone?.no ?? "",
      gunleriYaz(a.gunler),
      ...miktarlar,
      a.teslim_saati ?? "",
      a.tutar ?? 0,
      [a.baslik, a.notlar].filter(Boolean).join(" · "),
    ]);
  }
}

/** Kullanıcının indirip dolduracağı örnek abone defteri. */
export async function aboneSablonu(): Promise<Buffer> {
  const kitap = await kitapAc();

  const servis = kitap.addWorksheet("SERVİS");
  servis.addRow(SERVIS_BASLIK);
  sayfayiBicimle(servis, SERVIS_GENISLIK);
  servis.addRow([0, "ELİF EKİCİ", "533 591 91 80", "ÜNBAY KONAKLARI MB BLOK D:1"]);
  servis.addRow([1, "LEYLA FINDIKLI", "533 777 4358", "ÇİĞDEM EVLER B BLOK D:3", "", "", "", "", 40.7825, 30.354]);
  servis.addRow([2, "İSMAİL GÖKÇE", "533 393 5593", "ASLANLI KONAKLARI B1"]);

  const cizelge = kitap.addWorksheet("ÇİZELGE");
  cizelge.addRow(["ABONE NO", "GÜN", "SÜT", "YUMURTA", "SAAT", "TUTAR", "NOT"]);
  sayfayiBicimle(cizelge, [11, 24, 12, 12, 9, 11, 30]);
  cizelge.addRow([0, "PAZARTESİ&PERŞEMBE", 5, 0, "08:00", 250, "Kapıya bırak"]);
  cizelge.addRow([2, "PERŞEMBE", 3, 1, "09:00", 180, ""]);

  const bilgi = kitap.addWorksheet("AÇIKLAMA");
  bilgi.getColumn(1).width = 100;
  bilgi.addRow(["Nasıl doldurulur?"]);
  bilgi.getRow(1).font = { bold: true };
  [
    "",
    "SERVİS sayfası — abone listesi. Her satır bir müşteri ve adresidir.",
    "  • ABONE NO: müşteriyi çizelgeye bağlayan numara.",
    "  • 2. sütun: müşteri adı (başlığı boş bırakılabilir).",
    "  • TEL: telefon. ADRES: açık adres — zorunlu.",
    "  • BİNA, KAT, DAİRE, TARİF, LAT, LNG isteğe bağlıdır.",
    "",
    "ÇİZELGE sayfası — haftalık teslim planı. Her satır bir abonelik kurar.",
    "  • ABONE NO: SERVİS sayfasındaki numara.",
    "  • GÜN: PAZARTESİ, PERŞEMBE… Birden çoksa & ile yazın.",
    "  • Ürün sütunları: sütun başlığı ürün adı, hücre miktardır.",
    "  • SAAT, TUTAR, NOT isteğe bağlıdır.",
    "",
    "Adresin haritada görünmesi için konum gerekir. Yüklemeden sonra",
    "uygulamadan 'Adresten bul' ile aranabilir ya da haritadan işaretlenir.",
  ].forEach((s) => bilgi.addRow([s]));

  return yaz(kitap);
}

/* ------------------------------------------------------------------ */
/* Dışa aktarma                                                        */
/* ------------------------------------------------------------------ */

export async function teslimatlariYaz(kayitlar: DisTeslimat[]): Promise<Buffer> {
  const kitap = await kitapAc();
  const sayfa = kitap.addWorksheet("TESLİMATLAR");
  sayfa.addRow([
    "MÜŞTERİ", "TEL", "ADRES", "BİNA", "KAT", "DAİRE", "TARİF",
    "DURUM", "TARİH", "SAAT", "TUTAR", "ÖDEME", "ÜRÜNLER", "NOT", "LAT", "LNG",
  ]);
  sayfayiBicimle(sayfa, [24, 16, 46, 8, 6, 8, 24, 13, 12, 8, 11, 13, 28, 26, 11, 11]);

  for (const k of kayitlar) {
    sayfa.addRow([
      k.musteri?.ad ?? "",
      k.musteri?.telefon ?? "",
      k.adres?.adres_metni ?? "",
      k.adres?.bina ?? "",
      k.adres?.kat ?? "",
      k.adres?.daire ?? "",
      k.adres?.tarif ?? "",
      k.durum ?? "",
      k.planlanan_tarih ?? "",
      k.planlanan_saat ?? "",
      k.tutar ?? 0,
      k.odeme_yontemi ?? "",
      kalemleriYaz(k.kalemler),
      k.notlar ?? "",
      k.adres?.lat ?? "",
      k.adres?.lng ?? "",
    ]);
  }
  return yaz(kitap);
}

export async function abonelikleriYaz(kayitlar: DisAbonelik[]): Promise<Buffer> {
  const kitap = await kitapAc();
  aboneDefteriYaz(kitap, kayitlar);
  return yaz(kitap);
}

export async function sepetleriYaz(kayitlar: DisSepet[]): Promise<Buffer> {
  const kitap = await kitapAc();
  const sayfa = kitap.addWorksheet("SEPETLER");
  sayfa.addRow([
    "MÜŞTERİ", "TEL", "ADRES", "DURUM", "KALEM", "TUTAR", "GÜNCELLEME", "LAT", "LNG",
  ]);
  sayfayiBicimle(sayfa, [24, 16, 46, 16, 8, 11, 20, 11, 11]);

  for (const k of kayitlar) {
    sayfa.addRow([
      k.musteri?.ad ?? "",
      k.musteri?.telefon ?? "",
      k.adres?.adres_metni ?? "",
      k.durum ?? "",
      k.kalemler?.length ?? 0,
      k.tutar ?? 0,
      k.updated_at ?? "",
      k.adres?.lat ?? "",
      k.adres?.lng ?? "",
    ]);
  }
  return yaz(kitap);
}

/** Dosya adı: "sultan-market-abonelikler-2026-09-20.xlsx". */
export function dosyaAdi(tur: DisaAktarTuru, tarih = new Date()): string {
  const g = tarih.toISOString().slice(0, 10);
  return `sultan-market-${tur}-${g}.xlsx`;
}
