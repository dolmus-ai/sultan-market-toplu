/**
 * Teslim / abonelik geçmişini dosyaya indirme: Excel, PDF, düz metin.
 *
 * Ekranda uygulanan süzgecin (arama, tarih aralığı, abonelik) aynısıyla
 * bütün kayıtlar çekiliyor; ekranda yalnızca ilk sayfa yüklü olsa da dosya
 * süzgece uyan her teslimi içeriyor.
 *
 * - Excel sunucuda (`/api/disa-aktar`, exceljs tarayıcı paketini kabartır).
 * - PDF tarayıcıda, pdf-lib ile; Türkçe harfler (ğ, ş, ı, İ) için DejaVu
 *   yazı tipi gömülüyor (`public/fontlar`). Kütüphane ve yazı tipi yalnızca
 *   PDF istenince yükleniyor.
 * - Metin dosyası tarayıcıda, UTF-8 (BOM'lu: Windows Not Defteri de doğru
 *   açsın).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { adresYaz, odemeAdi, para } from "./bicim";
import { teslimGecmisiListesi, type GecmisKayit } from "./veri";
import type { DisGecmis } from "./excel";
import type { OdemeYontemiTanimi } from "./tipler";

export type AktarBicimi = "xlsx" | "pdf" | "txt";

export type GecmisSuzgeci = {
  tur: "teslimat" | "abonelik";
  arama: string;
  baslangic: string | null;
  bitis: string | null;
  /** İnsan okur hâli: "Son 7 gün · arama: ayşe". */
  aciklama: string;
};

/** Bir dosyaya en çok bu kadar teslim yazılır. */
const AZAMI = 10_000;

/** Süzgece uyan bütün teslimler, en yenisi önce. */
export async function hepsiniGetir(
  db: SupabaseClient,
  s: GecmisSuzgeci,
): Promise<GecmisKayit[]> {
  const boyut = 1000;
  const tum: GecmisKayit[] = [];
  for (let sayfa = 0; tum.length < AZAMI; sayfa++) {
    const { kayitlar, toplam } = await teslimGecmisiListesi(db, {
      arama: s.arama,
      sayfa,
      boyut,
      sadeceAbonelik: s.tur === "abonelik",
      baslangic: s.baslangic,
      bitis: s.bitis,
    });
    tum.push(...kayitlar);
    if (kayitlar.length < boyut || tum.length >= toplam) break;
  }
  return tum.slice(0, AZAMI);
}

function zamanYaz(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function odemeDurumu(k: GecmisKayit) {
  if (k.odeme_alindi === false) return "Alınmadı";
  if (k.odeme_yontemi === "veresiye") return "Veresiye";
  if (k.odeme_alindi) return "Tahsil edildi";
  return "";
}

/** Dosyalara giden düz satır. */
function satira(k: GecmisKayit, yontemler: OdemeYontemiTanimi[]): DisGecmis {
  return {
    teslim: zamanYaz(k.teslim_zamani),
    musteri: k.musteri_ad ?? "",
    telefon: k.telefon ?? "",
    adres: k.adres ? adresYaz(k.adres) : "",
    tarif: k.adres?.tarif ?? "",
    kaynak: k.kaynak === "abonelik" ? "Abonelik" : "Teslimat",
    tutar: k.tutar,
    odenen: k.odeme_tutari,
    odeme: k.odeme_yontemi ? odemeAdi(k.odeme_yontemi, yontemler) : "",
    odeme_durumu: odemeDurumu(k),
    odeyen: k.odeme_yapan ?? "",
  };
}

function baslikYaz(s: GecmisSuzgeci) {
  return s.tur === "abonelik" ? "Abonelik geçmişi" : "Teslimat geçmişi";
}

function dosyaAdi(s: GecmisSuzgeci, bicim: AktarBicimi) {
  const g = new Date();
  const gun = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, "0")}-${String(g.getDate()).padStart(2, "0")}`;
  const ad = s.tur === "abonelik" ? "abonelik-gecmisi" : "teslimat-gecmisi";
  return `sultan-market-${ad}-${gun}.${bicim}`;
}

function indir(blob: Blob, ad: string) {
  const bag = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = bag;
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(bag), 4000);
}

/* ---------------- Metin ---------------- */

function metinYaz(
  satirlar: DisGecmis[],
  s: GecmisSuzgeci,
): string {
  const toplam = satirlar.reduce((t, k) => t + (k.odenen ?? k.tutar ?? 0), 0);
  const cizgi = "-".repeat(60);
  const parcalar = [
    `SULTAN MARKET · ${baslikYaz(s).toLocaleUpperCase("tr-TR")}`,
    s.aciklama,
    `Oluşturma: ${zamanYaz(new Date().toISOString())}`,
    `${satirlar.length} teslim · toplam ${para(toplam)}`,
    cizgi,
  ];
  for (const k of satirlar) {
    parcalar.push(
      `${k.teslim}  ${k.musteri}${k.telefon ? `  (${k.telefon})` : ""}`,
      `  ${k.adres}${k.tarif ? ` — ${k.tarif}` : ""}`,
      `  ${[
        k.tutar != null ? para(k.tutar) : null,
        k.odenen != null && k.odenen !== k.tutar ? `ödenen ${para(k.odenen)}` : null,
        k.odeme || null,
        k.odeme_durumu || null,
        k.odeyen ? `ödeyen: ${k.odeyen}` : null,
        k.kaynak === "Abonelik" ? "abonelik" : null,
      ]
        .filter(Boolean)
        .join(" · ")}`,
      cizgi,
    );
  }
  return parcalar.join("\r\n");
}

/* ---------------- PDF ---------------- */

async function pdfYaz(satirlar: DisGecmis[], s: GecmisSuzgeci): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkit, normal, kalin] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit").then((m) => m.default),
    fetch("/fontlar/DejaVuSans.ttf").then((r) => r.arrayBuffer()),
    fetch("/fontlar/DejaVuSans-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);

  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const yazi = await belge.embedFont(normal, { subset: true });
  const koyu = await belge.embedFont(kalin, { subset: true });
  belge.setTitle(`Sultan Market · ${baslikYaz(s)}`);

  // A4 dikey, pt.
  const G = 595.28;
  const Y = 841.89;
  const KENAR = 36;
  const gri = rgb(0.42, 0.42, 0.45);
  const kirmizi = rgb(0.89, 0.04, 0.09);
  const cizgiRengi = rgb(0.88, 0.88, 0.9);

  // Sütunlar: teslim, müşteri + adres, ödeme, tutar.
  const sutun = { teslim: KENAR, musteri: KENAR + 78, odeme: G - KENAR - 170, tutar: G - KENAR };
  const musteriGenislik = sutun.odeme - sutun.musteri - 8;

  /** Metni verilen genişliğe sığacak şekilde kısaltır. */
  const sigdir = (m: string, boyut: number, genislik: number, f = yazi) => {
    if (f.widthOfTextAtSize(m, boyut) <= genislik) return m;
    let k = m;
    while (k.length > 1 && f.widthOfTextAtSize(`${k}…`, boyut) > genislik) k = k.slice(0, -1);
    return `${k}…`;
  };

  let sayfa = belge.addPage([G, Y]);
  let y = Y - KENAR;
  let sayfaNo = 1;

  const ustBilgi = (ilk: boolean) => {
    if (ilk) {
      sayfa.drawText("SULTAN MARKET", { x: KENAR, y: y - 14, size: 16, font: koyu });
      sayfa.drawRectangle({ x: KENAR, y: y - 22, width: 128, height: 2.5, color: kirmizi });
      sayfa.drawText(baslikYaz(s), { x: KENAR, y: y - 42, size: 12, font: koyu });
      sayfa.drawText(sigdir(s.aciklama, 9, G - 2 * KENAR), {
        x: KENAR, y: y - 56, size: 9, font: yazi, color: gri,
      });
      const toplam = satirlar.reduce((t, k) => t + (k.odenen ?? k.tutar ?? 0), 0);
      sayfa.drawText(`${satirlar.length} teslim · toplam ${para(toplam)}`, {
        x: KENAR, y: y - 69, size: 9, font: koyu,
      });
      y -= 86;
    }
    sayfa.drawText("TESLİM", { x: sutun.teslim, y, size: 7.5, font: koyu, color: gri });
    sayfa.drawText("MÜŞTERİ · ADRES", { x: sutun.musteri, y, size: 7.5, font: koyu, color: gri });
    sayfa.drawText("ÖDEME", { x: sutun.odeme, y, size: 7.5, font: koyu, color: gri });
    const t = "TUTAR";
    sayfa.drawText(t, {
      x: sutun.tutar - koyu.widthOfTextAtSize(t, 7.5), y, size: 7.5, font: koyu, color: gri,
    });
    y -= 6;
    sayfa.drawLine({ start: { x: KENAR, y }, end: { x: G - KENAR, y }, thickness: 0.8, color: cizgiRengi });
    y -= 12;
  };

  const altBilgi = () => {
    const m = `Sayfa ${sayfaNo} · ${zamanYaz(new Date().toISOString())}`;
    sayfa.drawText(m, {
      x: G - KENAR - yazi.widthOfTextAtSize(m, 7.5), y: KENAR - 14, size: 7.5, font: yazi, color: gri,
    });
  };

  ustBilgi(true);
  const SATIR = 36;
  for (const k of satirlar) {
    if (y - SATIR < KENAR) {
      altBilgi();
      sayfa = belge.addPage([G, Y]);
      sayfaNo++;
      y = Y - KENAR;
      ustBilgi(false);
    }
    const [gun, saat] = k.teslim.split(" ");
    sayfa.drawText(gun ?? "", { x: sutun.teslim, y, size: 8.5, font: koyu });
    sayfa.drawText(saat ?? "", { x: sutun.teslim, y: y - 11, size: 8, font: yazi, color: gri });

    sayfa.drawText(
      sigdir(`${k.musteri}${k.telefon ? `  ${k.telefon}` : ""}`, 9, musteriGenislik, koyu),
      { x: sutun.musteri, y, size: 9, font: koyu },
    );
    sayfa.drawText(
      sigdir(`${k.adres}${k.tarif ? ` — ${k.tarif}` : ""}`, 8, musteriGenislik),
      { x: sutun.musteri, y: y - 11, size: 8, font: yazi, color: gri },
    );
    if (k.kaynak === "Abonelik") {
      sayfa.drawText("abonelik", { x: sutun.musteri, y: y - 21, size: 7, font: yazi, color: kirmizi });
    }

    sayfa.drawText(sigdir(k.odeme || "—", 8.5, 100), { x: sutun.odeme, y, size: 8.5, font: yazi });
    sayfa.drawText(sigdir([k.odeme_durumu, k.odeyen].filter(Boolean).join(" · "), 7.5, 100), {
      x: sutun.odeme, y: y - 11, size: 7.5, font: yazi, color: gri,
    });

    const tutar = k.odenen ?? k.tutar;
    const tm = tutar != null ? para(tutar) : "—";
    sayfa.drawText(tm, { x: sutun.tutar - koyu.widthOfTextAtSize(tm, 9.5), y, size: 9.5, font: koyu });

    y -= SATIR - 8;
    sayfa.drawLine({ start: { x: KENAR, y }, end: { x: G - KENAR, y }, thickness: 0.4, color: cizgiRengi });
    y -= 10;
  }
  altBilgi();
  return belge.save();
}

/* ---------------- Ortak giriş ---------------- */

/**
 * Süzgece uyan geçmişi istenen biçimde indirir. İndirilen teslim sayısını
 * döndürür (0: süzgece uyan kayıt yok, dosya inmedi).
 */
export async function gecmisiIndir(
  db: SupabaseClient,
  s: GecmisSuzgeci,
  bicim: AktarBicimi,
  yontemler: OdemeYontemiTanimi[],
): Promise<number> {
  const kayitlar = await hepsiniGetir(db, s);
  if (kayitlar.length === 0) return 0;
  const satirlar = kayitlar.map((k) => satira(k, yontemler));
  const ad = dosyaAdi(s, bicim);

  if (bicim === "txt") {
    const metin = `﻿${metinYaz(satirlar, s)}`;
    indir(new Blob([metin], { type: "text/plain;charset=utf-8" }), ad);
  } else if (bicim === "pdf") {
    const bayt = await pdfYaz(satirlar, s);
    indir(new Blob([bayt as BlobPart], { type: "application/pdf" }), ad);
  } else {
    const yanit = await fetch("/api/disa-aktar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tur: s.tur === "abonelik" ? "abonelik-gecmisi" : "teslim-gecmisi",
        kayitlar: satirlar,
        baslik: `Sultan Market · ${baslikYaz(s)}`,
        suzgec: s.aciklama,
      }),
    });
    if (!yanit.ok) throw new Error("excel");
    indir(await yanit.blob(), ad);
  }
  return kayitlar.length;
}
