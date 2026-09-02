import { notFound } from "next/navigation";

import KuryeUygulamasi from "@/bilesenler/KuryeUygulamasi";
import type {
  Abonelik,
  Kalem,
  Sepet,
  Siparis,
  SiparisDurumu,
  Urun,
} from "@/lib/tipler";

/**
 * Yalnızca geliştirme ortamında açılan, veritabanına dokunmayan önizleme.
 * Tasarımı ve harita etkileşimlerini giriş yapmadan denemek için.
 */
export const dynamic = "force-dynamic";

const URUNLER: Urun[] = [
  ["Tam Yağlı Süt 1 L", "Süt & Kahvaltı", "adet", 42.5, "🥛", 180],
  ["Yumurta 15'li", "Süt & Kahvaltı", "paket", 119.9, "🥚", 90],
  ["Beyaz Peynir 500 g", "Süt & Kahvaltı", "paket", 214, "🧀", 60],
  ["Domates", "Meyve & Sebze", "kg", 54.9, "🍅", 120],
  ["Muz", "Meyve & Sebze", "kg", 89.9, "🍌", 80],
  ["Avokado", "Meyve & Sebze", "adet", 74, "🥑", 40],
  ["Tam Buğday Ekmek", "Fırın", "adet", 28, "🍞", 150],
  ["Simit", "Fırın", "adet", 20, "🥯", 200],
  ["Su 5 L", "İçecek", "adet", 59, "💧", 300],
  ["Çay 1 kg", "İçecek", "paket", 368, "🍵", 55],
  ["Makarna 500 g", "Temel Gıda", "paket", 34.5, "🍝", 180],
  ["Çamaşır Deterjanı 3 L", "Temizlik", "adet", 389, "🧺", 45],
  ["Cips 150 g", "Atıştırmalık", "paket", 64, "🍟", 140],
  ["Dondurma 1 L", "Atıştırmalık", "adet", 186, "🍨", 44],
].map((u, i) => ({
  id: `urun-${i}`,
  ad: u[0] as string,
  kategori: u[1] as string,
  birim: u[2] as string,
  fiyat: u[3] as number,
  emoji: u[4] as string,
  stok: u[5] as number,
  gorsel_url: null,
  aktif: true,
}));

function kalem(no: number, urunSira: number, miktar: number): Kalem {
  const u = URUNLER[urunSira];
  return {
    id: `kalem-${no}-${urunSira}`,
    urun_id: u.id,
    miktar,
    birim_fiyat: u.fiyat,
    urun: { id: u.id, ad: u.ad, birim: u.birim, emoji: u.emoji, fiyat: u.fiyat },
  };
}

const MUSTERILER: [string, string, string, number, number, SiparisDurumu][] = [
  ["Ayşe Yıldırım", "0532 118 4471", "Arabacıalanı Mah. Orhangazi Sok. No 14", 40.7825, 30.354, "bekliyor"],
  ["Mehmet Korkmaz", "0533 240 9182", "Arabacıalanı Mah. Atatürk Cad. No 61", 40.7789, 30.3495, "yolda"],
  ["Zeynep Arslan", "0505 771 3320", "Arabacıalanı Mah. Şehit Ercan Sok. No 22", 40.7841, 30.3568, "bekliyor"],
  ["Elif Şahin", "0542 663 8814", "Arabacıalanı Mah. Cumhuriyet Sok. No 78", 40.7772, 30.3551, "hazirlaniyor"],
  ["Burak Demir", "0555 902 1147", "Bahçelievler Mah. Fatih Cad. No 35", 40.7803, 30.3462, "bekliyor"],
  ["Kerem Öztürk", "0530 815 6674", "Serdivan Mah. Üniversite Cad. No 27", 40.7856, 30.3502, "teslim"],
  ["Hakan Yılmaz", "0538 220 7761", "Bahçelievler Mah. Papatya Sok. No 118", 40.7735, 30.3625, "bekliyor"],
  ["Selin Tunç", "0553 664 1129", "Kemalpaşa Mah. Karaman Cad. No 8", 40.7702, 30.3567, "bekliyor"],
  ["Onur Aksoy", "0531 552 8836", "Kemalpaşa Mah. Sakarya Cad. No 16", 40.7688, 30.3452, "bekliyor"],
  ["Cem Polat", "0535 226 9948", "Kemalpaşa Mah. Çark Cad. No 70", 40.7805, 30.4028, "bekliyor"],
  ["Tolga Şen", "0539 447 6620", "Semerciler Mah. Uzunçarşı Cad. No 108", 40.7842, 30.4055, "bekliyor"],
  ["Barış Güneş", "0541 336 7702", "Maltepe Mah. Ankara Cad. No 47", 40.7889, 30.3945, "bekliyor"],
];

const TESLIMATLAR: Siparis[] = MUSTERILER.map(
  ([ad, telefon, adres, lat, lng, durum], i) => {
    const kalemler = [
      kalem(i, i % URUNLER.length, 1 + (i % 3)),
      kalem(i, (i + 4) % URUNLER.length, 1 + (i % 2)),
      kalem(i, (i + 8) % URUNLER.length, 2),
    ];
    return {
      id: `siparis-${i}`,
      musteri_id: `musteri-${i}`,
      adres_id: `adres-${i}`,
      kaynak: i % 3 === 0 ? "abonelik" : "manuel",
      abonelik_id: null,
      kurye_id: null,
      durum,
      oncelik: i === 2 || i === 9 ? 1 : 0,
      planlanan_tarih: new Date().toISOString().slice(0, 10),
      planlanan_saat: `${String(8 + i).padStart(2, "0")}:30:00`,
      teslim_zamani: null,
      odeme_yontemi: (["nakit", "kredi_karti", "veresiye", "online"] as const)[
        i % 4
      ],
      tutar: kalemler.reduce((t, k) => t + k.miktar * k.birim_fiyat, 0),
      notlar: i === 0 ? "Kapıda bırakma, zile basmayın" : null,
      basarisizlik_sebebi: null,
      basarisizlik_notu: null,
      deneme_sayisi: 0,
      created_at: new Date().toISOString(),
      musteri: { id: `musteri-${i}`, ad, telefon, notlar: null },
      adres: {
        id: `adres-${i}`,
        musteri_id: `musteri-${i}`,
        baslik: "Ev",
        adres_metni: adres,
        bina: null,
        kat: String(1 + (i % 8)),
        daire: String(2 + i),
        tarif: i % 4 === 0 ? "Beyaz bina, demir kapı" : null,
        kurye_notu: i === 1 ? "Zil çalışmıyor, arayın" : null,
        kapi_kodu: i === 3 ? "1204" : null,
        lat,
        lng,
        konum_dogrulandi: true,
      },
      kalemler,
    };
  },
);

const ABONELIKLER: Abonelik[] = [0, 3, 6, 9].map((i) => ({
  id: `abonelik-${i}`,
  musteri_id: `musteri-${i}`,
  adres_id: `adres-${i}`,
  baslik: ["Kahvaltılık paketi", "Ofis çay-kahve", "Günlük simit", "Meyve sepeti"][
    i / 3
  ],
  siklik: "haftalik",
  gunler: [1, 2, 3, 4, 5, 6, 7],
  teslim_saati: "08:30:00",
  baslangic: "2026-01-01",
  bitis: null,
  durum: "aktif",
  notlar: null,
  musteri: TESLIMATLAR[i].musteri,
  adres: TESLIMATLAR[i].adres,
  kalemler: TESLIMATLAR[i].kalemler.map((k) => ({
    id: k.id,
    miktar: k.miktar,
    urun: k.urun,
  })),
}));

const SEPETLER: Sepet[] = [1, 4, 7].map((i) => ({
  id: `sepet-${i}`,
  musteri_id: `musteri-${i}`,
  adres_id: `adres-${i}`,
  durum: "acik",
  updated_at: new Date().toISOString(),
  musteri: TESLIMATLAR[i].musteri,
  adres: TESLIMATLAR[i].adres,
  kalemler: TESLIMATLAR[i].kalemler.map((k) => ({
    id: `s-${k.id}`,
    miktar: k.miktar,
    urun: k.urun,
  })),
}));

export default function OnizlemeSayfasi() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <KuryeUygulamasi
      kurye={{
        id: "onizleme",
        ad: "Önizleme",
        telefon: null,
        arac_tipi: "motosiklet",
        plaka: "34 SM 1907",
        vardiyada: true,
      }}
      baslangicTeslimatlar={TESLIMATLAR}
      baslangicAbonelikler={ABONELIKLER}
      baslangicSepetler={SEPETLER}
    />
  );
}
