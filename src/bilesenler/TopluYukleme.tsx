"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adresEkle, musteriEkle } from "@/lib/veri";

type Satir = {
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

type Durum =
  | { ad: "bos" }
  | { ad: "okunuyor" }
  | { ad: "onizleme"; satirlar: Satir[]; gecerli: number; hatali: number }
  | { ad: "yukleniyor"; toplam: number; biten: number }
  | { ad: "bitti"; eklenen: number; atlanan: number }
  | { ad: "hata"; mesaj: string };

/** Kullanıcının indirebileceği örnek dosya — beklenen sütun başlıkları. */
const ORNEK_CSV = [
  "Ad;Telefon;Adres;Bina;Kat;Daire;Tarif;Lat;Lng;Not",
  "Ayşe Yıldırım;0532 118 4471;Arabacıalanı Mah. Orhangazi Sok.;14;1;2;Beyaz bina;40.7825;30.3540;",
  "Mehmet Korkmaz;0533 240 9182;Arabacıalanı Mah. Atatürk Cad.;61;2;3;;;;Zil çalışmıyor",
].join("\n");

export default function TopluYukleme({
  db,
  onKapat,
  onBitti,
}: {
  db: SupabaseClient;
  onKapat: () => void;
  /** Yükleme bitince ana ekran verisini tazelemek için. */
  onBitti: (eklenen: number) => void;
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
        satirlar: veri.satirlar as Satir[],
        gecerli: veri.gecerli as number,
        hatali: veri.hatali as number,
      });
    } catch {
      setDurum({ ad: "hata", mesaj: "Sunucuya ulaşılamadı." });
    }
  }

  async function yukle(satirlar: Satir[]) {
    const gecerliler = satirlar.filter((s) => !s.hata);
    setDurum({ ad: "yukleniyor", toplam: gecerliler.length, biten: 0 });

    let eklenen = 0;
    let atlanan = 0;
    for (const [i, satir] of gecerliler.entries()) {
      try {
        const musteri = await musteriEkle(db, {
          ad: satir.ad,
          telefon: satir.telefon,
          notlar: satir.notlar,
        });
        await adresEkle(db, {
          musteri_id: musteri.id,
          adres_metni: satir.adres_metni,
          bina: satir.bina,
          kat: satir.kat,
          daire: satir.daire,
          tarif: satir.tarif,
          lat: satir.lat,
          lng: satir.lng,
        });
        eklenen++;
      } catch {
        atlanan++;
      }
      setDurum({ ad: "yukleniyor", toplam: gecerliler.length, biten: i + 1 });
    }

    setDurum({ ad: "bitti", eklenen, atlanan });
    onBitti(eklenen);
  }

  function ornekIndir() {
    // BOM, Excel'in Türkçe karakterleri doğru açması için.
    const bag = URL.createObjectURL(
      new Blob(["﻿" + ORNEK_CSV], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = bag;
    a.download = "sultan-market-musteri-sablonu.csv";
    a.click();
    URL.revokeObjectURL(bag);
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
          Excel&apos;den müşteri ve adres
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

              <button
                onClick={ornekIndir}
                className="mt-3 w-full rounded-hap bg-yuzey2 py-3 text-[13px] font-bold text-gri"
              >
                Örnek dosyayı indir
              </button>

              <p className="mt-3 px-1 text-[12px] leading-relaxed text-gri">
                İlk satır başlık olmalı. <b>Ad</b> ve <b>Adres</b> zorunlu;
                Telefon, Bina, Kat, Daire, Tarif, Lat, Lng ve Not isteğe bağlı.
                Lat/Lng yazılmazsa adres haritada görünmez, sonra
                işaretlenebilir.
              </p>

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
              <div className="mt-4 flex gap-2">
                <Kutu sayi={durum.gecerli} etiket="Yüklenecek" ton="yesil" />
                <Kutu sayi={durum.hatali} etiket="Atlanacak" ton="kirmizi" />
              </div>

              <ul className="ince-kaydirma mt-3 max-h-56 divide-y divide-cizgi overflow-y-auto rounded-[20px] border border-cizgi bg-yuzey">
                {durum.satirlar.slice(0, 200).map((s) => (
                  <li key={s.sira} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="w-7 shrink-0 text-[11px] font-black text-gri">
                      {s.sira}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">
                        {s.ad || "—"}
                      </span>
                      <span className="block truncate text-[11px] text-gri">
                        {s.adres_metni || "—"}
                      </span>
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
                onClick={() => void yukle(durum.satirlar)}
                className="mt-4 h-14 w-full rounded-hap bg-kirmizi text-[15px] font-black text-white disabled:opacity-50"
              >
                {durum.gecerli} müşteriyi yükle
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
              <p className="text-center text-[15px] font-black">
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
                Müşteriler kaydediliyor, sayfayı kapatma.
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
              {durum.atlanan > 0 && (
                <p className="mt-1 text-[13px] font-semibold text-kirmizi">
                  {durum.atlanan} satır kaydedilemedi
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
  ton: "yesil" | "kirmizi";
}) {
  return (
    <div className="flex-1 rounded-[20px] border border-cizgi bg-yuzey p-3 text-center">
      <p
        className={`text-[22px] font-black ${
          ton === "yesil" ? "text-yesil" : "text-kirmizi"
        }`}
      >
        {sayi}
      </p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gri">
        {etiket}
      </p>
    </div>
  );
}
