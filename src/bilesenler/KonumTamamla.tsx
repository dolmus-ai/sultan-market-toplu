"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  adresKonumuYaz,
  adresiGeokodla,
  konumsuzAdresleriGetir,
  type KonumsuzAdres,
} from "@/lib/veri";
import {
  obekle,
  sonucGecerliMi,
  type CozulmusAdres,
} from "@/lib/adres-obek";
import { sakaryaCoz } from "@/lib/sakarya";

/**
 * Defterdeki tarif adreslerini haritaya oturtma.
 *
 * Defterde adreslerin çoğu tarif: "KEÇECİLERİN ORASI B A:D4", "SAKLI BAHÇE-2
 * E BLOK D:3". Geocoding bunları olduğu gibi aratınca ya boş dönüyor ya da
 * ilçe merkezine düşüyor. Burada üç aşama var ve kurye hepsini görüyor:
 *
 *  1. **Ayıkla** — önce Sakarya sözlüğü (`sakaryaCoz`): site adları,
 *     numaralı sokakların mahallesi, sabit noktalar; anahtarsız, anında.
 *     Sözlüğün çözemediği tarifler aranmıyor, listede kalıyor; market o
 *     kalem için yapay zekâya ödeme yapmak istemedi.
 *  2. **Ara** — aynı siteyi anlatan adresler tek gruba düşüyor ve site bir
 *     kez aranıyor. Hem ucuz (Geocoding istek başına faturalı) hem tutarlı:
 *     aynı sitenin daireleri haritada birbirinden ayrı düşmüyor.
 *  3. **Yaz** — marketten çok uzağa düşen sonuç kabul edilmiyor; kalanlar
 *     "elle konulacak" listesinde kalıyor, market haritadan düzeltiyor.
 *
 * İşlem yarıda kesilirse sorun olmuyor: yazılanlar yazılı kalıyor, kapatıp
 * yeniden açınca kalanlarla devam ediliyor.
 */

/** Aynı anda kaç geocoding isteği açık kalsın. */
const ESZAMANLI = 4;

type Durum =
  | { ad: "yukleniyor" }
  | { ad: "hazir"; adresler: KonumsuzAdres[]; sozlukle: number; kalan: number }
  | {
      ad: "calisiyor";
      asama: "ara";
      biten: number;
      toplam: number;
      oturan: number;
    }
  | {
      ad: "bitti";
      oturan: number;
      kalan: { adres: string; sebep: string }[];
      grup: number;
    }
  | { ad: "hata"; mesaj: string };

export default function KonumTamamla({
  db,
  onKapat,
  onBitti,
}: {
  db: SupabaseClient;
  onKapat: () => void;
  /** Konum yazıldıysa ana ekrandaki harita tazelensin. */
  onBitti: (oturan: number) => void;
}) {
  const [durum, setDurum] = useState<Durum>({ ad: "yukleniyor" });
  /*
   * Kapatıldıktan sonra gelen cevaplar durumu ellemesin. Bayrak her
   * bağlanmada yeniden açılıyor: React geliştirmede efektleri iki kez
   * çalıştırıyor (bağlan → temizle → bağlan) ve temizlik bayrağı kapatıyor;
   * açılmazsa bileşen ilk ekranda donup kalıyor.
   */
  const yasiyor = useRef(true);
  useEffect(() => {
    yasiyor.current = true;
    return () => {
      yasiyor.current = false;
    };
  }, []);

  useEffect(() => {
    konumsuzAdresleriGetir(db)
      .then((adresler) => {
        if (!yasiyor.current) return;
        // Sözlük ne kadarını çözüyor — kurye baştan bilsin.
        const sozlukle = adresler.filter((a) => {
          const c = sakaryaCoz(a.id, a.adres_metni);
          return c.sorgu !== "" && c.guven !== "dusuk";
        }).length;
        setDurum({
          ad: "hazir",
          adresler,
          sozlukle,
          kalan: adresler.length - sozlukle,
        });
      })
      .catch(() => {
        if (yasiyor.current) {
          setDurum({ ad: "hata", mesaj: "Adresler okunamadı." });
        }
      });
  }, [db]);

  async function calistir(adresler: KonumsuzAdres[]) {
    /* --------- 1) Ayıkla: önce sözlük --------- */
    const cozumler: CozulmusAdres[] = [];
    const kalanlar: KonumsuzAdres[] = [];
    for (const a of adresler) {
      const c = sakaryaCoz(a.id, a.adres_metni);
      // Düşük güven (yalnızca mahalle) aranmıyor: mahalle ortasına pin
      // koymak konumsuzluktan beter, kurye yanlış yere gider.
      if (c.sorgu && c.guven !== "dusuk") cozumler.push(c);
      else kalanlar.push(a);
    }

    /*
     * Sözlüğün çözemediği tarifler yapay zekâya gitmiyor — market o kalemi
     * ödemek istemedi. Doğrudan "elle konulacaklar" listesine düşüyorlar;
     * `/api/adres-zeka` ucu duruyor, istenirse buradan yeniden bağlanır.
     */

    if (!yasiyor.current) return;
    if (cozumler.length === 0) {
      setDurum({ ad: "hata", mesaj: "Hiçbir adres çözümlenemedi." });
      return;
    }

    /* --------- 2) Grupla ve ara --------- */
    const gruplar = obekle(cozumler);
    const metinler = new Map(adresler.map((a) => [a.id, a.adres_metni]));
    const kalan: { adres: string; sebep: string }[] = [];
    let oturan = 0;
    let biten = 0;

    /*
     * Hiçbir gruba giremeyenler: tarifte aranabilir bir yer adı yok
     * ("Keçecilerin orası", "Tahsin abilerin eski ev") ya da öbek çözülemedi.
     * Rapordan düşmemeleri gerekiyor — elle konulacaklar tam olarak bunlar.
     */
    const gruplanan = new Set(gruplar.flatMap((g) => g.idler));
    for (const adres of adresler) {
      if (gruplanan.has(adres.id)) continue;
      const cozum = cozumler.find((c) => c.id === adres.id);
      kalan.push({
        adres: adres.adres_metni,
        sebep: cozum
          ? "Tarifte aranabilir bir yer adı yok"
          : "Sözlükte yok — haritadan elle işaretlenecek",
      });
    }

    const sira = [...gruplar];
    async function isci() {
      for (;;) {
        const grup = sira.shift();
        if (!grup || !yasiyor.current) return;
        let sebep = "Arama sonuç vermedi";
        try {
          const sonuc = await adresiGeokodla(grup.sorgu);
          if (sonuc) {
            const gecerli = sonucGecerliMi(sonuc, grup.tur);
            if (gecerli.tamam) {
              // Gruptaki herkes aynı noktayı alıyor.
              for (const id of grup.idler) {
                try {
                  await adresKonumuYaz(db, id, sonuc.lat, sonuc.lng);
                  oturan++;
                } catch {
                  /* bu adres yazılamadı, diğerleri sürsün */
                }
              }
              sebep = "";
            } else {
              sebep = gecerli.sebep ?? "Sonuç kabul edilmedi";
            }
          }
        } catch {
          sebep = "Arama yapılamadı";
        }
        if (sebep) {
          for (const id of grup.idler) {
            kalan.push({ adres: metinler.get(id) ?? "", sebep });
          }
        }
        biten++;
        if (yasiyor.current) {
          setDurum({
            ad: "calisiyor",
            asama: "ara",
            biten,
            toplam: gruplar.length,
            oturan,
          });
        }
      }
    }
    await Promise.all(Array.from({ length: ESZAMANLI }, () => isci()));

    if (!yasiyor.current) return;
    setDurum({ ad: "bitti", oturan, kalan, grup: gruplar.length });
    onBitti(oturan);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6"
      onClick={onKapat}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-cizgi bg-yuzey px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 sm:rounded-[28px]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-cizgi sm:hidden" />

        <p className="text-[11px] font-black uppercase tracking-wide text-gri">
          Adres
        </p>
        <h2 className="mt-0.5 text-[24px] font-black leading-tight">
          Haritaya oturt
        </h2>

        <AnimatePresence mode="wait">
          {durum.ad === "yukleniyor" && (
            <motion.p
              key="yukleniyor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-[14px] font-semibold text-gri"
            >
              Konumu olmayan adresler okunuyor…
            </motion.p>
          )}

          {durum.ad === "hazir" && (
            <motion.div
              key="hazir"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {durum.adresler.length === 0 ? (
                <p className="mt-4 text-[14px] font-semibold text-gri">
                  Bütün adreslerin konumu var. Yapılacak bir şey yok.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-[14px] font-semibold leading-relaxed text-gri">
                    <b className="text-kontrast">
                      {durum.adresler.length} adresin
                    </b>{" "}
                    konumu yok. <b className="text-kontrast">{durum.sozlukle}</b>{" "}
                    tanesi Sakarya sözlüğüyle çözülüyor — site adları, numaralı
                    sokakların mahallesi, sabit noktalar. Aynı siteyi anlatanlar
                    tek seferde bulunup hepsine yazılacak.
                  </p>
                  <p className="mt-2 text-[13px] font-semibold leading-relaxed text-gri">
                    Kalan <b className="text-kontrast">{durum.kalan}</b> tarif
                    (&ldquo;Keçecilerin orası&rdquo; gibi) aranmıyor; işlem bitince listede
                    çıkar, haritadan elle işaretlersiniz.
                  </p>

                  <div className="mt-4 rounded-[20px] border border-cizgi bg-yuzey p-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-gri">
                      Örnek
                    </p>
                    {durum.adresler.slice(0, 3).map((a) => (
                      <p
                        key={a.id}
                        className="mt-1 truncate text-[13px] font-semibold"
                      >
                        {a.adres_metni}
                      </p>
                    ))}
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => calistir(durum.adresler)}
                    className="mt-5 w-full rounded-hap bg-kirmizi py-4 text-[15px] font-black text-white"
                  >
                    Başlat
                  </motion.button>
                </>
              )}
            </motion.div>
          )}

          {durum.ad === "calisiyor" && (
            <motion.div
              key="calisiyor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4"
            >
              <p className="text-[14px] font-bold">Konumlar aranıyor…</p>
              <p className="mt-1 text-[13px] font-semibold text-gri">
                {durum.biten} / {durum.toplam} yer · {durum.oturan} adres oturdu
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-yuzey2">
                <motion.div
                  className="h-full rounded-full bg-kirmizi"
                  animate={{
                    width: `${durum.toplam ? (durum.biten / durum.toplam) * 100 : 0}%`,
                  }}
                  transition={{ type: "spring", stiffness: 180, damping: 28 }}
                />
              </div>
              <p className="mt-3 text-[12px] font-semibold text-gri">
                Kapatabilirsiniz; yazılan konumlar kalır, kalanlarla sonra
                devam edebilirsiniz.
              </p>
            </motion.div>
          )}

          {durum.ad === "bitti" && (
            <motion.div
              key="bitti"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <p className="text-[15px] font-black">
                {durum.oturan} adres haritaya oturdu
              </p>
              <p className="mt-1 text-[13px] font-semibold text-gri">
                {durum.grup} ayrı yer arandı.
                {durum.kalan.length > 0 &&
                  ` ${durum.kalan.length} adres bulunamadı.`}
              </p>

              {durum.kalan.length > 0 && (
                <div className="mt-4 max-h-56 overflow-y-auto rounded-[20px] border border-cizgi bg-yuzey p-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gri">
                    Elle konulacaklar
                  </p>
                  {durum.kalan.slice(0, 60).map((k, i) => (
                    <p key={i} className="mt-1.5 text-[12px] font-semibold">
                      <span className="block truncate">{k.adres}</span>
                      <span className="text-gri">{k.sebep}</span>
                    </p>
                  ))}
                  {durum.kalan.length > 60 && (
                    <p className="mt-2 text-[12px] font-semibold text-gri">
                      …ve {durum.kalan.length - 60} tane daha.
                    </p>
                  )}
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onKapat}
                className="mt-5 w-full rounded-hap bg-kontrast py-4 text-[15px] font-black text-white"
              >
                Kapat
              </motion.button>
            </motion.div>
          )}

          {durum.ad === "hata" && (
            <motion.div
              key="hata"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4"
            >
              <p className="rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-[13px] font-semibold leading-relaxed">
                {durum.mesaj}
              </p>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onKapat}
                className="mt-5 w-full rounded-hap bg-kontrast py-4 text-[15px] font-black text-white"
              >
                Kapat
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
