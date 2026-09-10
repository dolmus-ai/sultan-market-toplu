/**
 * Excel/CSV dosyalarından müşteri + adres satırı çıkarma.
 *
 * Sunucuda çalışıyor: exceljs tarayıcıda Node akışlarına ihtiyaç duyuyor ve
 * kurye uygulamasının paketini gereksiz büyütürdü. API rotasından ayrı
 * durmasının sebebi tek başına sınanabilmesi.
 */

export type TopluSatir = {
  /** Dosyadaki satır numarası — hatayı kullanıcıya göstermek için. */
  sira: number;
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
  hata: string | null;
};

export type TopluSonuc =
  | { tamam: true; satirlar: TopluSatir[]; gecerli: number; hatali: number }
  | { tamam: false; hata: string };

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

export async function xlsxAyristir(tampon: Buffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const kitap = new ExcelJS.Workbook();
  await kitap.xlsx.load(tampon as unknown as ArrayBuffer);
  const sayfa = kitap.worksheets[0];
  if (!sayfa) return [];

  const satirlar: string[][] = [];
  sayfa.eachRow({ includeEmpty: false }, (satir) => {
    const hucreler: string[] = [];
    // `values` 1 tabanlı geliyor, ilk eleman boş.
    const degerler = satir.values as unknown[];
    for (let i = 1; i < degerler.length; i++) {
      const d = degerler[i];
      if (d == null) hucreler.push("");
      else if (typeof d === "object" && "text" in (d as object))
        hucreler.push(String((d as { text: unknown }).text ?? ""));
      else if (typeof d === "object" && "result" in (d as object))
        hucreler.push(String((d as { result: unknown }).result ?? ""));
      else hucreler.push(String(d));
    }
    satirlar.push(hucreler);
  });
  return satirlar;
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
      hata: !ad ? "Ad boş" : !adres ? "Adres boş" : null,
    };
  });

  return {
    tamam: true,
    satirlar,
    gecerli: satirlar.filter((s) => !s.hata).length,
    hatali: satirlar.filter((s) => s.hata).length,
  };
}

/** Dosya adına göre doğru ayrıştırıcıyı seçer. */
export async function dosyayiCoz(
  dosyaAdi: string,
  tampon: Buffer,
): Promise<TopluSonuc> {
  let ham: string[][];
  try {
    ham = dosyaAdi.toLocaleLowerCase("tr").endsWith(".csv")
      ? csvAyristir(tampon.toString("utf8"))
      : await xlsxAyristir(tampon);
  } catch {
    return {
      tamam: false,
      hata: "Dosya çözümlenemedi. Excel (.xlsx) veya CSV bekleniyor.",
    };
  }
  return satirlariCikar(ham);
}
