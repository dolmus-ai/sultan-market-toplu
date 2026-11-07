"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { OdemeYontemiTanimi } from "@/lib/tipler";

/**
 * Yönetim menüsü.
 *
 * Kuryenin sahada her gün kullanmadığı işler — Excel, toplu silme, adres
 * oturtma, ödeme yöntemi tanımları — ana ekrandan buraya taşındı. Hiçbiri
 * kaldırılmadı; yalnızca kuryenin önünden çekildi.
 */
export default function YonetimMenusu({
  sekmeAdi,
  yontemler,
  indiriliyor,
  onExcelIndir,
  onTopluYukle,
  onAdresOturt,
  onTopluSec,
  onYontemEkle,
  onYontemKaldir,
  onKapat,
}: {
  /** Açık sekmenin adı — Excel ve toplu seçim bu listeye uygulanır. */
  sekmeAdi: string;
  yontemler: OdemeYontemiTanimi[];
  indiriliyor: boolean;
  onExcelIndir: () => void;
  onTopluYukle: () => void;
  onAdresOturt: () => void;
  onTopluSec: () => void;
  onYontemEkle: (ad: string) => Promise<void>;
  onYontemKaldir: (kod: string) => Promise<void>;
  onKapat: () => void;
}) {
  const [yontemAcik, setYontemAcik] = useState(false);
  const [yeniYontem, setYeniYontem] = useState("");
  const [yontemIslemde, setYontemIslemde] = useState(false);

  async function yontemEkle() {
    const ad = yeniYontem.trim();
    if (!ad || yontemIslemde) return;
    setYontemIslemde(true);
    try {
      await onYontemEkle(ad);
      setYeniYontem("");
    } finally {
      setYontemIslemde(false);
    }
  }

  const satirlar = [
    {
      simge: "⤓",
      baslik: indiriliyor ? "İndiriliyor…" : `Excel'e indir · ${sekmeAdi}`,
      alt: "Açık listenin tamamı (arama açıksa yalnızca eşleşenler)",
      tikla: onExcelIndir,
    },
    {
      simge: "📄",
      baslik: "Excel'den toplu yükle",
      alt: "Müşteri ve adresleri tek dosyada aktar",
      tikla: onTopluYukle,
    },
    {
      simge: "📍",
      baslik: "Adresleri haritaya oturt",
      alt: "Defterdeki tarifleri konuma çevir",
      tikla: onAdresOturt,
    },
    {
      simge: "☑️",
      baslik: `Toplu seç · sil / Excel`,
      alt: `${sekmeAdi} listesinde birden çok kaydı seç`,
      tikla: onTopluSec,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onKapat}
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-[24px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-cizgi" />
        <h2 className="text-lg font-extrabold tracking-tight">Yönetim</h2>

        {satirlar.map((s) => (
          <motion.button
            key={s.simge}
            whileTap={{ scale: 0.98 }}
            disabled={s.simge === "⤓" && indiriliyor}
            onClick={s.tikla}
            className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-cizgi bg-yuzey p-3 text-left hover:bg-yuzey2 disabled:opacity-60"
          >
            <span className="w-6 text-center text-lg leading-none">{s.simge}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black">{s.baslik}</span>
              <span className="block text-[11px] text-gri">{s.alt}</span>
            </span>
            <span className="text-gri">›</span>
          </motion.button>
        ))}

        {/* Ödeme yöntemleri — eskiden teslim ekranındaki "Düzenle" */}
        <div className="mt-2 rounded-2xl border border-cizgi bg-yuzey p-3">
          <button
            onClick={() => setYontemAcik(!yontemAcik)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="w-6 text-center text-lg leading-none">💳</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black">
                Ödeme yöntemleri
              </span>
              <span className="block text-[11px] text-gri">
                {yontemler.map((y) => y.ad).join(" · ") || "Tanımlı yöntem yok"}
              </span>
            </span>
            <span className="text-gri">{yontemAcik ? "−" : "+"}</span>
          </button>

          <AnimatePresence initial={false}>
            {yontemAcik && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {yontemler.map((y) => (
                    <span
                      key={y.kod}
                      className="flex items-center gap-1 rounded-hap bg-yuzey2 py-1 pl-3 pr-1 text-[12px] font-bold"
                    >
                      {y.ad}
                      {yontemler.length > 1 && (
                        <button
                          onClick={() => void onYontemKaldir(y.kod)}
                          aria-label={`${y.ad} yöntemini kaldır`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-black text-kirmizi hover:bg-cizgi"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={yeniYontem}
                    onChange={(e) => setYeniYontem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void yontemEkle();
                    }}
                    placeholder="Yeni yöntem — örn. Havale"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-cizgi bg-yuzey2 px-3 text-[12.5px] font-semibold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                  />
                  <button
                    onClick={() => void yontemEkle()}
                    disabled={!yeniYontem.trim() || yontemIslemde}
                    className="h-10 shrink-0 rounded-xl bg-kontrast px-4 text-[12.5px] font-black text-white disabled:opacity-40"
                  >
                    Ekle
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onKapat}
          className="mt-2 flex h-10 w-full items-center justify-center rounded-hap text-[12.5px] font-bold text-gri"
        >
          Kapat
        </button>
      </motion.div>
    </motion.div>
  );
}
