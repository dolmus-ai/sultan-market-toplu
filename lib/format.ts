import type { CariTip, HareketTur, OdemeYontemi } from "./types";

export const para = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(n);

export const tarihFmt = (d: string) =>
  new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const saatFmt = (d: string) =>
  new Date(d).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const bugun = () => {
  const d = new Date();
  const ay = String(d.getMonth() + 1).padStart(2, "0");
  const gun = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${ay}-${gun}`;
};

export const TUR_LABEL: Record<HareketTur, string> = {
  fatura: "Gelen Fatura",
  veresiye: "Veresiye",
  yapilan_odeme: "Yapılan Ödeme",
  gelen_odeme: "Gelen Ödeme",
};

export const YONTEM_LABEL: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  yemek_karti: "Yemek Kartı",
};

// Cari tipine göre "giriş" (borçlandıran) ve "ödeme" hareket türleri
export const girisTuru = (tip: CariTip): HareketTur =>
  tip === "satici" ? "fatura" : "veresiye";
export const odemeTuru = (tip: CariTip): HareketTur =>
  tip === "satici" ? "yapilan_odeme" : "gelen_odeme";

// Listelerde üçlü kolon başlıkları
export const girisBaslik = (tip: CariTip) =>
  tip === "satici" ? "Gelen Fatura" : "Veresiye";
export const odemeBaslik = (tip: CariTip) =>
  tip === "satici" ? "Yapılan Ödeme" : "Gelen Ödeme";

// Türkçe kurallarına göre büyük harf (i → İ); tüm kayıtlar büyük harfle tutulur
export const buyukHarf = (s: string) => s.toLocaleUpperCase("tr");

export const parseTutar = (s: string) => {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? NaN : Math.round(n * 100) / 100;
};

// Tutar alanlarında yazarken uygulanan biçim: binlik ayracı nokta, ondalık
// ayracı virgül (1234567,5 → 1.234.567,5). Rakam ve tek virgül dışındaki
// her şey atılır; ondalık en fazla 2 hane.
export const tutarFormatla = (ham: string) => {
  let s = ham.replace(/[^\d,]/g, "");
  const ilkVirgul = s.indexOf(",");
  if (ilkVirgul !== -1) {
    s = s.slice(0, ilkVirgul + 1) + s.slice(ilkVirgul + 1).replace(/,/g, "");
  }
  const [tamHam, ondalik] = s.split(",");
  const tam = tamHam.replace(/^0+(?=\d)/, "");
  const gruplu = tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return ondalik === undefined ? gruplu : `${gruplu},${ondalik.slice(0, 2)}`;
};

// Sayıyı tutar alanına yazılabilir biçimde verir (OCR/ses sonuçları için)
export const tutarYaz = (n: number) => tutarFormatla(String(n).replace(".", ","));
