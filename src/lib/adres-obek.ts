/**
 * Çözülmüş adresleri gruplama ve doğrulama — saf mantık.
 *
 * `adres-zeka.ts` Claude SDK'sını çektiği için istemciye alınamıyor; gruplama
 * ve doğrulama ise tarayıcıda çalışıyor (obekleme istemcide yapılıyor ki
 * sunucu isteği kısa kalsın). Bu yüzden ayrı dosyada.
 */

import { MARKET } from "./market";

export type CozulmusAdres = {
  /** Çağıranın gönderdiği kimlik — sonucu geri eşlemek için. */
  id: string;
  /** Tekilleştirilmiş site / yapı / işletme adı. */
  yer: string | null;
  blok: string | null;
  kat: string | null;
  daire: string | null;
  sokak: string | null;
  /** Adres alanına karışmış telefon numarası. */
  telefon: string | null;
  /** Geocoding'e gidecek temiz sorgu. */
  sorgu: string;
  tur: "site" | "sokak" | "tarif";
  guven: "yuksek" | "orta" | "dusuk";
};

/**
 * Marketten bu kadar uzağa düşen sonuç yanlış kabul ediliyor (metre).
 *
 * `/api/geokod` zaten 80 km'lik bir eleme yapıyor; burası daha dar, çünkü
 * market Serdivan'a dağıtım yapıyor ve "Saklı Bahçe" adlı site Türkiye'nin
 * her yerinde var. 25 km Sakarya'nın dağıtım yapılan kısmını kapsıyor.
 */
export const AZAMI_UZAKLIK_M = 25_000;

/** Karşılaştırma için sadeleştirilmiş yer adı. */
export function yerAnahtari(ad: string): string {
  const harita: Record<string, string> = {
    "ç": "c",
    "ğ": "g",
    "ı": "i",
    "ö": "o",
    "ş": "s",
    "ü": "u",
  };
  return ad
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => harita[h] ?? h)
    .replace(/[^a-z0-9]/g, "");
}

/** İki kelime arasındaki düzenleme uzaklığı (Levenshtein). */
export function uzaklik(a: string, b: string): number {
  if (a === b) return 0;
  const satir = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let onceki = satir[0];
    satir[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tut = satir[j];
      satir[j] = Math.min(
        satir[j] + 1,
        satir[j - 1] + 1,
        onceki + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      onceki = tut;
    }
  }
  return satir[b.length];
}

/** Anahtardaki rakamlar, sırasıyla. */
function rakamlari(anahtar: string): string {
  return anahtar.replace(/\D/g, "");
}

export type Obek = {
  /** Grubun sorgusu — üyelerin en sık kullandığı hâli. */
  sorgu: string;
  /** Gruba adını veren tekilleştirilmiş yer. */
  yer: string | null;
  /** Bu gruba düşen adres kimlikleri. */
  idler: string[];
  /** Grubun en iyimser güveni. */
  guven: "yuksek" | "orta" | "dusuk";
  /** İlk üyenin türü; kaba sonucun kabul edilip edilmeyeceği buna bağlı. */
  tur: CozulmusAdres["tur"];
};

/**
 * Aynı yeri anlatan adresleri tek sorguda toplar.
 *
 * Önce sadeleştirilmiş yer adına göre, sonra birbirine bir harf uzaklıktaki
 * adlar birleştirilerek: defterde "vilaları"/"villaları" gibi tek harflik
 * farklar çok ve bunlar aynı site. Yer adı olmayanlar sorgularına göre
 * gruplanıyor, o da yoksa tek başına kalıyorlar.
 */
export function obekle(cozumler: CozulmusAdres[]): Obek[] {
  const gruplar = new Map<string, Obek & { sayac: Map<string, number> }>();

  const guvenSirasi = { yuksek: 3, orta: 2, dusuk: 1 } as const;

  for (const c of cozumler) {
    if (!c.sorgu) continue;
    const ham = c.yer ? yerAnahtari(c.yer) : `sorgu:${yerAnahtari(c.sorgu)}`;

    // Bir harf farkla yazılmış aynı yer varsa ona katıl.
    let anahtar = ham;
    if (!gruplar.has(ham)) {
      for (const mevcut of gruplar.keys()) {
        if (
          Math.abs(mevcut.length - ham.length) <= 1 &&
          ham.length >= 6 &&
          // Rakamlar birebir aynı olmalı: "emirgan4" ile "emirgan6" arasında
          // da bir harf var ama bunlar ayrı siteler.
          rakamlari(mevcut) === rakamlari(ham) &&
          uzaklik(mevcut, ham) <= 1
        ) {
          anahtar = mevcut;
          break;
        }
      }
    }

    const grup = gruplar.get(anahtar) ?? {
      sorgu: c.sorgu,
      yer: c.yer,
      idler: [],
      guven: c.guven,
      tur: c.tur,
      sayac: new Map<string, number>(),
    };
    grup.idler.push(c.id);
    grup.sayac.set(c.sorgu, (grup.sayac.get(c.sorgu) ?? 0) + 1);
    if (guvenSirasi[c.guven] > guvenSirasi[grup.guven]) grup.guven = c.guven;
    gruplar.set(anahtar, grup);
  }

  return [...gruplar.values()].map((g) => {
    // Grubun sorgusu: üyelerin en çok yazdığı hâl.
    let enIyi = g.sorgu;
    let enCok = 0;
    for (const [sorgu, adet] of g.sayac) {
      if (adet > enCok) {
        enCok = adet;
        enIyi = sorgu;
      }
    }
    return { sorgu: enIyi, yer: g.yer, idler: g.idler, guven: g.guven, tur: g.tur };
  });
}

/** İki nokta arası metre (haversine). */
export function metre(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const r = (d: number) => (d * Math.PI) / 180;
  const dl = r(b.lat - a.lat);
  const dg = r(b.lng - a.lng);
  const s =
    Math.sin(dl / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Geocoding sonucunu kabul edip etmeyeceğimiz.
 *
 * İki eleme var: marketten çok uzaktaki nokta (arama başka şehirdeki aynı
 * adlı siteyi bulmuş olabiliyor) ve yalnızca kaba eşleşme (ilçe merkezine
 * düşmüş, bina bulunamamış). İkisi de kuryeyi yanlış kapıya götürür.
 */
export function sonucGecerliMi(
  sonuc: {
    lat: number;
    lng: number;
    /** `/api/geokod` sokak/mahalle düzeyinde kaldıysa true döndürüyor. */
    kaba?: boolean;
  },
  tur: CozulmusAdres["tur"] = "site",
): { tamam: boolean; sebep?: string } {
  const uzak = metre(MARKET.nokta, { lat: sonuc.lat, lng: sonuc.lng });
  if (uzak > AZAMI_UZAKLIK_M) {
    return {
      tamam: false,
      sebep: `Market ${Math.round(uzak / 1000)} km uzakta`,
    };
  }
  /*
   * Kaba sonuç yalnızca sokak sorgusunda anlamlı: "317. Sokak" arayıp sokağın
   * ortasını almak doğru cevap. Site adı arayıp sokak düzeyinde kalmak ise
   * "siteyi bulamadım, civara attım" demek; öyle pin kuryeyi yanıltır.
   */
  if (sonuc.kaba && tur !== "sokak") {
    return { tamam: false, sebep: "Site bulunamadı, yalnızca civarı" };
  }
  return { tamam: true };
}

/**
 * İşin Claude tarafının kaba maliyeti (USD).
 *
 * Fiyatlar Claude Opus 5 için milyon token başına 5 / 25 USD. Adres başına
 * ~25 giriş, ~60 çıkış token'ı ölçüldü; sistem istemi önbellekten okunduğu
 * için istek başına payı küçük.
 */
export function maliyetTahmini(adet: number): number {
  const giris = (adet * 25) / 1_000_000;
  const cikis = (adet * 60) / 1_000_000;
  return giris * 5 + cikis * 25;
}
