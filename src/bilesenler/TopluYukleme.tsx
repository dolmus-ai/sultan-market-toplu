"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  abonelikEkle,
  abonelikKalemleriEkle,
  adresEkle,
  adresiGeokodla,
  adresKonumuYaz,
  mevcutMusterileriGetir,
  musteriEkle,
  urunleriGetir,
} from "@/lib/veri";
import { gunlerYaz } from "@/lib/bicim";
import type { Urun } from "@/lib/tipler";

type AbonelikPlani = {
  gunler: number[];
  kalemler: { ad: string; miktar: number }[];
  saat: string | null;
  tutar: number | null;
  not: string | null;
  kaynakSatir: number;
};

type Satir = {
  sira: number;
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
  abonelikler: AbonelikPlani[];
  hata: string | null;
};

type Onizleme = {
  ad: "onizleme";
  bicim: "musteri" | "abone";
  satirlar: Satir[];
  gecerli: number;
  hatali: number;
  abonelik: number;
  uyarilar: string[];
};

type Durum =
  | { ad: "bos" }
  | { ad: "okunuyor" }
  | Onizleme
  | {
      ad: "yukleniyor";
      /** "kayit" müşteri/adres/abonelik yazıyor, "konum" adresleri arıyor. */
      asama: "kayit" | "konum";
      toplam: number;
      biten: number;
    }
  | {
      ad: "bitti";
      eklenen: number;
      /** Zaten kayıtlı olduğu için yeniden açılmayan müşteri sayısı. */
      mevcut: number;
      abonelik: number;
      atlanan: number;
      konumlanan: number;
      konumNotu: string | null;
    }
  | { ad: "hata"; mesaj: string };

/** Abonelik saati yazılmamışsa kullanılan varsayılan. */
const VARSAYILAN_SAAT = "08:00";

/**
 * Aynı anda kaç adres aranacak.
 *
 * Google Geocoding saniyede onlarca isteğe izin veriyor; sınır bizim
 * tarafımızda: dörtten fazlası tarayıcının bağlantı havuzunu doldurup
 * arayüzü ağırlaştırıyor.
 */
const KONUM_ESZAMANLI = 4;

function anahtarla(m: string) {
  const harita: Record<string, string> = {
    "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
  };
  return m
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => harita[h] ?? h)
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Çizelgedeki sütun adını ürün kaydıyla eşler.
 *
 * Defterde "SÜT" yazıyor, üründe "Tam Yağlı Süt 1 L". Tam eşitlik aramak
 * çoğu satırı kaçırırdı; iki yönlü içerme kontrolü yapıyoruz. Eşleşme
 * bulunamazsa miktar kaybolmasın diye aboneliğin notuna yazılıyor.
 */
function urunBul(urunler: Urun[], ad: string): Urun | undefined {
  const a = anahtarla(ad);
  if (!a) return undefined;
  return (
    urunler.find((u) => anahtarla(u.ad) === a) ??
    urunler.find((u) => anahtarla(u.ad).includes(a)) ??
    urunler.find((u) => a.includes(anahtarla(u.ad)))
  );
}

/**
 * Müşteri dizin anahtarı: sadeleştirilmiş ad + telefonun rakamları.
 *
 * Telefon defterde "533 591 91 80", "5335919180" gibi farklı yazılabiliyor;
 * yalnızca rakamlara bakınca aynı kişi aynı anahtara düşüyor. Telefonu
 * olmayan kayıtlar için ad tek başına yetiyor.
 */
function musteriAnahtari(ad: string, telefon: string | null | undefined) {
  return `${anahtarla(ad)}|${(telefon ?? "").replace(/\D/g, "")}`;
}

function planBasligi(plan: AbonelikPlani): string {
  const adlar = plan.kalemler.map((k) => k.ad).filter(Boolean);
  if (adlar.length === 0) return "Abonelik";
  // Başlık satırda okunacak: iki kalemden sonrası sayıya dönüyor.
  return adlar.length <= 2
    ? adlar.join(" + ")
    : `${adlar[0]} +${adlar.length - 1}`;
}

export default function TopluYukleme({
  db,
  onKapat,
  onBitti,
}: {
  db: SupabaseClient;
  onKapat: () => void;
  /** Yükleme bitince ana ekran verisini tazelemek için. */
  onBitti: (eklenen: number, abonelik: number) => void;
}) {
  const [durum, setDurum] = useState<Durum>({ ad: "bos" });
  const dosyaRef = useRef<HTMLInputElement>(null);

  async function dosyaSecildi(dosya: File) {
    setDurum({ ad: "okunuyor" });
    const form = new FormData();
    form.append("dosya", dosya);
    try {
      const yanit = await fetch("/api/toplu-musteri", {
        method: "POST",
        body: form,
      });
      const veri = await yanit.json();
      if (!yanit.ok) {
        setDurum({ ad: "hata", mesaj: veri?.hata ?? "Dosya okunamadı." });
        return;
      }
      setDurum({
        ad: "onizleme",
        bicim: (veri.bicim as "musteri" | "abone") ?? "musteri",
        satirlar: veri.satirlar as Satir[],
        gecerli: veri.gecerli as number,
        hatali: veri.hatali as number,
        abonelik: (veri.abonelik as number) ?? 0,
        uyarilar: (veri.uyarilar as string[]) ?? [],
      });
    } catch {
      setDurum({ ad: "hata", mesaj: "Sunucuya ulaşılamadı." });
    }
  }

  /**
   * Konumu olmayan adresleri arar ve koordinatı kaydeder.
   *
   * İlk yanıt Nominatim'den gelirse durduruluyor: Google anahtarı tanımlı
   * değil demektir ve yedek servis hem saniyede bir istek kabul ediyor
   * (binlerce adres saatler sürerdi) hem de bu tür site/blok adreslerini
   * çoğunlukla bulamıyor. Kayıtlar yerinde kalıyor, konum sonra eklenebiliyor.
   */
  async function konumlandir(
    hedefler: { adresId: string; metin: string }[],
  ): Promise<{ konumlanan: number; not: string | null }> {
    if (hedefler.length === 0) return { konumlanan: 0, not: null };
    setDurum({
      ad: "yukleniyor",
      asama: "konum",
      toplam: hedefler.length,
      biten: 0,
    });

    let biten = 0;
    let konumlanan = 0;
    let not: string | null = null;
    let durduruldu = false;

    const sira = [...hedefler];
    async function isci(ilkMi: boolean) {
      while (!durduruldu) {
        const is = sira.shift();
        if (!is) return;
        try {
          const sonuc = await adresiGeokodla(is.metin);
          if (sonuc) {
            if (ilkMi && sonuc.motor === "nominatim") {
              durduruldu = true;
              not =
                "Google adres servisi devrede değil; konumlar aranmadı. " +
                "Anahtar tanımlanınca adresler haritaya oturur.";
              return;
            }
            await adresKonumuYaz(db, is.adresId, sonuc.lat, sonuc.lng);
            konumlanan++;
          }
        } catch {
          /* bu adres konumlanamadı, sıradakine geç */
        }
        biten++;
        setDurum({
          ad: "yukleniyor",
          asama: "konum",
          toplam: hedefler.length,
          biten,
        });
        ilkMi = false;
      }
    }

    // İlk istek tek başına gidiyor: hangi servisin cevapladığını öğrenip
    // gerekirse kalan binlerce isteği hiç başlatmıyoruz.
    await isci(true);
    if (!durduruldu) {
      await Promise.all(
        Array.from({ length: KONUM_ESZAMANLI }, () => isci(false)),
      );
    }
    return { konumlanan, not };
  }

  async function yukle(onizleme: Onizleme) {
    const gecerliler = onizleme.satirlar.filter((s) => !s.hata);
    setDurum({
      ad: "yukleniyor",
      asama: "kayit",
      toplam: gecerliler.length,
      biten: 0,
    });

    // Ürün listesi yalnızca abonelik kurulacaksa gerekiyor.
    let urunler: Urun[] = [];
    if (onizleme.abonelik > 0) {
      try {
        urunler = await urunleriGetir(db);
      } catch {
        urunler = [];
      }
    }

    /*
     * Kayıtlı müşteriler dizini. Binlerce satırlık yükleme yarıda kesilirse
     * dosya baştan veriliyor; dizin olmadan girenler ikinci kez eklenirdi.
     * Bulunan müşteri yeniden açılmıyor, eksiği tamamlanıyor: aboneliği
     * yoksa kuruluyor, adresinin konumu yoksa aranıyor.
     */
    const dizin = new Map<string, Awaited<ReturnType<typeof mevcutMusterileriGetir>>[number]>();
    try {
      for (const m of await mevcutMusterileriGetir(db)) {
        dizin.set(musteriAnahtari(m.ad, m.telefon), m);
      }
    } catch {
      /* dizin okunamadı: yükleme yine çalışır, tekrar kaydı olabilir */
    }

    let eklenen = 0;
    let mevcutSayisi = 0;
    let abonelikSayisi = 0;
    let atlanan = 0;
    const konumsuz: { adresId: string; metin: string }[] = [];

    for (const [i, satir] of gecerliler.entries()) {
      try {
        const eski = dizin.get(musteriAnahtari(satir.ad, satir.telefon));

        let musteriId: string;
        let adresId: string;
        let adresKonumlu: boolean;
        let abonelikGerekli: boolean;

        if (eski?.adres_id) {
          musteriId = eski.musteri_id;
          adresId = eski.adres_id;
          adresKonumlu = eski.konumlu;
          abonelikGerekli = eski.abonelik_sayisi === 0;
          mevcutSayisi++;
        } else {
          const musteri = await musteriEkle(db, {
            ad: satir.ad,
            telefon: satir.telefon,
            notlar: satir.notlar,
          });
          const adres = await adresEkle(db, {
            musteri_id: musteri.id,
            adres_metni: satir.adres_metni,
            bina: satir.bina,
            kat: satir.kat,
            daire: satir.daire,
            tarif: satir.tarif,
            lat: satir.lat,
            lng: satir.lng,
          });
          musteriId = musteri.id;
          adresId = adres.id;
          adresKonumlu = satir.lat != null;
          abonelikGerekli = true;
          eklenen++;
        }

        // Konumu olmayan adres, ister yeni ister eski olsun, aranacak.
        if (!adresKonumlu) {
          konumsuz.push({ adresId, metin: satir.adres_metni });
        }

        for (const plan of abonelikGerekli ? satir.abonelikler : []) {
          // Eşleşen ürünler kalem olur; eşleşmeyenler nota yazılır ki
          // miktar bilgisi dosyadan uygulamaya geçerken kaybolmasın.
          const kalemler: { urun_id: string; miktar: number }[] = [];
          const eslesmeyen: string[] = [];
          for (const k of plan.kalemler) {
            const urun = urunBul(urunler, k.ad);
            if (urun) kalemler.push({ urun_id: urun.id, miktar: k.miktar });
            else eslesmeyen.push(`${k.miktar} ${k.ad}`);
          }

          const abonelik = await abonelikEkle(db, {
            musteri_id: musteriId,
            adres_id: adresId,
            baslik: planBasligi(plan),
            siklik: "haftalik",
            gunler: plan.gunler,
            teslim_saati: plan.saat ?? VARSAYILAN_SAAT,
            tutar: plan.tutar ?? 0,
            notlar: [plan.not, eslesmeyen.join(", ")]
              .filter(Boolean)
              .join(" · "),
          });
          if (kalemler.length) {
            try {
              await abonelikKalemleriEkle(db, abonelik.id, kalemler);
            } catch {
              /* abonelik ayakta, kalem yazılamadı */
            }
          }
          abonelikSayisi++;
        }
      } catch {
        atlanan++;
      }
      setDurum({
        ad: "yukleniyor",
        asama: "kayit",
        toplam: gecerliler.length,
        biten: i + 1,
      });
    }

    const { konumlanan, not } = await konumlandir(konumsuz);

    setDurum({
      ad: "bitti",
      eklenen,
      mevcut: mevcutSayisi,
      abonelik: abonelikSayisi,
      atlanan,
      konumlanan,
      konumNotu: not,
    });
    onBitti(eklenen + mevcutSayisi, abonelikSayisi);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px]"
      onClick={onKapat}
    >
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[90%] w-full overflow-y-auto rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

        <p className="text-[11px] font-black uppercase tracking-wider text-gri">
          Toplu yükleme
        </p>
        <h2 className="mt-0.5 text-xl font-extrabold tracking-tight">
          Excel&apos;den abone ve müşteri
        </h2>

        <input
          ref={dosyaRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const d = e.target.files?.[0];
            if (d) void dosyaSecildi(d);
            e.target.value = "";
          }}
        />

        <AnimatePresence mode="wait" initial={false}>
          {/* ---- Dosya seçimi ---- */}
          {(durum.ad === "bos" || durum.ad === "hata") && (
            <motion.div
              key="sec"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => dosyaRef.current?.click()}
                className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-cizgi bg-yuzey2 py-10"
              >
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className="text-4xl leading-none"
                >
                  📄
                </motion.span>
                <span className="text-[15px] font-black">Dosya seç</span>
                <span className="text-[12px] text-gri">.xlsx veya .csv</span>
              </motion.button>

              <a
                href="/api/toplu-musteri"
                download
                className="mt-3 flex h-12 w-full items-center justify-center rounded-hap bg-yuzey2 text-[13px] font-bold text-gri"
              >
                Örnek dosyayı indir
              </a>

              <div className="mt-3 space-y-2 px-1 text-[12px] leading-relaxed text-gri">
                <p>
                  <b>Abone defteri</b> — iki sayfa. <b>SERVİS</b> sayfasında
                  abone listesi (ABONE NO, ad, TEL, ADRES), <b>ÇİZELGE</b>
                  sayfasında haftalık plan (ABONE NO, GÜN ve ürün sütunları).
                  Her çizelge satırı bir abonelik kurar.
                </p>
                <p>
                  <b>Müşteri listesi</b> — tek sayfa, <b>Ad</b> ve{" "}
                  <b>Adres</b> sütunları zorunlu. Telefon, Bina, Kat, Daire,
                  Tarif, Lat, Lng ve Not isteğe bağlı.
                </p>
                <p>
                  Lat/Lng yazılmazsa adres haritada görünmez, sonradan
                  işaretlenebilir.
                </p>
              </div>

              {durum.ad === "hata" && (
                <p className="mt-3 rounded-2xl bg-kirmizi-sis px-4 py-3 text-[13px] font-bold text-kirmizi">
                  {durum.mesaj}
                </p>
              )}
            </motion.div>
          )}

          {/* ---- Okunuyor ---- */}
          {durum.ad === "okunuyor" && (
            <motion.div
              key="okunuyor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-14"
            >
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-9 w-9 rounded-full border-[3px] border-cizgi border-t-kirmizi"
              />
              <span className="text-[14px] font-bold text-gri">
                Dosya okunuyor…
              </span>
            </motion.div>
          )}

          {/* ---- Önizleme ---- */}
          {durum.ad === "onizleme" && (
            <motion.div
              key="onizleme"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <p className="mt-3 text-[12px] font-bold text-gri">
                {durum.bicim === "abone"
                  ? "Abone defteri tanındı."
                  : "Müşteri listesi tanındı."}
              </p>

              <div className="mt-2 flex gap-2">
                <Kutu sayi={durum.gecerli} etiket="Müşteri" ton="yesil" />
                {durum.bicim === "abone" && (
                  <Kutu sayi={durum.abonelik} etiket="Abonelik" ton="siyah" />
                )}
                <Kutu sayi={durum.hatali} etiket="Atlanacak" ton="kirmizi" />
              </div>

              {durum.uyarilar.map((u) => (
                <p
                  key={u}
                  className="mt-2 rounded-2xl bg-turuncu/10 px-3.5 py-2.5 text-[12px] font-bold text-turuncu"
                >
                  {u}
                </p>
              ))}

              <ul className="ince-kaydirma mt-3 max-h-56 divide-y divide-cizgi overflow-y-auto rounded-[20px] border border-cizgi bg-yuzey">
                {durum.satirlar.slice(0, 200).map((s) => (
                  <li key={s.sira} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="w-7 shrink-0 text-[11px] font-black text-gri">
                      {s.abone_no ?? s.sira}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">
                        {s.ad || "—"}
                      </span>
                      <span className="block truncate text-[11px] text-gri">
                        {s.adres_metni || "—"}
                      </span>
                      {s.abonelikler.map((p) => (
                        <span
                          key={p.kaynakSatir}
                          className="mt-0.5 block truncate text-[11px] font-bold text-kirmizi"
                        >
                          {gunlerYaz(p.gunler)}
                          {p.kalemler.length > 0 &&
                            ` · ${p.kalemler
                              .map((k) => `${k.miktar} ${k.ad}`)
                              .join(", ")}`}
                        </span>
                      ))}
                    </span>
                    {s.hata ? (
                      <span className="shrink-0 rounded-hap bg-kirmizi px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        {s.hata}
                      </span>
                    ) : (
                      s.lat == null && (
                        <span className="shrink-0 rounded-hap bg-kontrast px-2 py-0.5 text-[10px] font-black uppercase text-white">
                          Konum yok
                        </span>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {durum.satirlar.length > 200 && (
                <p className="mt-2 px-1 text-[12px] text-gri">
                  İlk 200 satır gösteriliyor; tamamı yüklenecek.
                </p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={durum.gecerli === 0}
                onClick={() => void yukle(durum)}
                className="mt-4 h-14 w-full rounded-hap bg-kirmizi text-[15px] font-black text-white disabled:opacity-50"
              >
                {durum.gecerli} müşteriyi yükle
                {durum.abonelik > 0 && ` · ${durum.abonelik} abonelik`}
              </motion.button>
            </motion.div>
          )}

          {/* ---- Yükleniyor ---- */}
          {durum.ad === "yukleniyor" && (
            <motion.div
              key="yukleniyor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-10"
            >
              <p className="text-center text-[11px] font-black uppercase tracking-wider text-gri">
                {durum.asama === "kayit" ? "1 / 2 · Kayıt" : "2 / 2 · Konum"}
              </p>
              <p className="mt-1 text-center text-[15px] font-black">
                {durum.biten} / {durum.toplam}
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-yuzey2">
                <motion.div
                  className="h-full rounded-full bg-kirmizi"
                  animate={{
                    width: `${durum.toplam ? (durum.biten / durum.toplam) * 100 : 0}%`,
                  }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="mt-3 text-center text-[13px] text-gri">
                {durum.asama === "kayit"
                  ? "Kaydediliyor, sayfayı kapatma."
                  : "Adresler haritada aranıyor, sayfayı kapatma."}
              </p>
            </motion.div>
          )}

          {/* ---- Bitti ---- */}
          {durum.ad === "bitti" && (
            <motion.div
              key="bitti"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-10 text-center"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 14 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yesil text-3xl text-white"
              >
                ✓
              </motion.span>
              <p className="mt-4 text-[17px] font-black">
                {durum.eklenen} müşteri eklendi
              </p>
              {durum.mevcut > 0 && (
                <p className="mt-1 text-[14px] font-bold text-gri">
                  {durum.mevcut} müşteri zaten kayıtlıydı, üstüne yazılmadı
                </p>
              )}
              {durum.abonelik > 0 && (
                <p className="mt-1 text-[14px] font-bold text-gri">
                  {durum.abonelik} abonelik kuruldu
                </p>
              )}
              {durum.konumlanan > 0 && (
                <p className="mt-1 text-[14px] font-bold text-gri">
                  {durum.konumlanan} adres haritaya oturdu
                </p>
              )}
              {durum.atlanan > 0 && (
                <p className="mt-1 text-[13px] font-semibold text-kirmizi">
                  {durum.atlanan} satır kaydedilemedi
                </p>
              )}
              {durum.konumNotu && (
                <p className="mt-3 rounded-2xl bg-turuncu/10 px-3.5 py-2.5 text-[12px] font-bold text-turuncu">
                  {durum.konumNotu}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={onKapat}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-hap text-[14px] font-bold text-gri"
        >
          {durum.ad === "bitti" ? "Kapat" : "Vazgeç"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function Kutu({
  sayi,
  etiket,
  ton,
}: {
  sayi: number;
  etiket: string;
  ton: "yesil" | "kirmizi" | "siyah";
}) {
  const renkler = {
    yesil: "text-yesil",
    kirmizi: "text-kirmizi",
    siyah: "text-metin",
  };
  return (
    <div className="flex-1 rounded-[20px] border border-cizgi bg-yuzey p-3 text-center">
      <p className={`text-[22px] font-black ${renkler[ton]}`}>{sayi}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gri">
        {etiket}
      </p>
    </div>
  );
}
