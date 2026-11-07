"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "motion/react";

export type PanelDurumu = "kapali" | "yari" | "acik";

type Props = {
  durum: PanelDurumu;
  onDurum: (d: PanelDurumu) => void;
  /** Liste tam ekran mı (sağdan sola güçlü kaydırmayla açılır). */
  tamEkran: boolean;
  onTamEkran: (acik: boolean) => void;
  baslik: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Alt panelin en çok açıldığı yükseklik (ekranın oranı). Yukarı kaydırınca
 * panel buraya kadar çıkar; üstte harita görünmeye devam eder.
 */
const ACIK_ORANI = 0.62;
/** Pin ya da teslimat ayrıntısı açılınca kullanılan ara yükseklik. */
const YARI_ORANI = 0.46;
/** Kapalıyken görünen şerit: tutamak + sekme satırı. */
const KAPALI_GORUNEN_PX = 64;

/**
 * Sağdan sola güçlü kaydırma: yeterince uzun, yatay ve hızlı bir hareket.
 * Instagram/Snapchat'teki sohbet ekranını açan hareket gibi.
 */
function useSolaKaydirma(onAc: () => void) {
  const bas = useRef<{ x: number; y: number; t: number } | null>(null);
  const onAcRef = useRef(onAc);
  useEffect(() => {
    onAcRef.current = onAc;
  });

  return {
    onPointerDown(e: React.PointerEvent) {
      bas.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      const bitti = (b: PointerEvent) => {
        window.removeEventListener("pointerup", bitti);
        window.removeEventListener("pointercancel", bitti);
        const ilk = bas.current;
        bas.current = null;
        if (!ilk) return;
        // Sola doğru hareket pozitif sayılır.
        const dx = ilk.x - b.clientX;
        const dy = b.clientY - ilk.y;
        const sure = Math.max(1, performance.now() - ilk.t);
        const yatay = dx > 1.4 * Math.abs(dy);
        const guclu = dx > 110 || (dx > 55 && dx / sure > 0.45);
        if (yatay && guclu) onAcRef.current();
      };
      window.addEventListener("pointerup", bitti);
      window.addEventListener("pointercancel", bitti);
    },
  };
}

export default function AltPanel({
  durum,
  onDurum,
  tamEkran,
  onTamEkran,
  baslik,
  children,
}: Props) {
  const kontrol = useDragControls();
  const [ekran, setEkran] = useState(800);
  const kaydirma = useSolaKaydirma(() => onTamEkran(true));

  useEffect(() => {
    const olc = () => setEkran(window.innerHeight);
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, []);

  const { yukseklik, duraklar } = useMemo(() => {
    const h = Math.round(ekran * ACIK_ORANI);
    return {
      yukseklik: h,
      duraklar: {
        acik: 0,
        yari: Math.round(h - ekran * YARI_ORANI),
        kapali: Math.round(h - KAPALI_GORUNEN_PX),
      } as Record<PanelDurumu, number>,
    };
  }, [ekran]);

  function birakildi(_: unknown, bilgi: PanInfo) {
    const su = duraklar[durum] + bilgi.offset.y;
    const hiz = bilgi.velocity.y;
    const tahmin = su + hiz * 0.18;

    // Sürüklerken iki durak var: aşağıda (harita) ya da açık (harita üstte
    // görünmeye devam eder). Hızlı fiske yönü belirler.
    if (Math.abs(hiz) > 400) {
      onDurum(hiz < 0 ? "acik" : "kapali");
      return;
    }
    const secenekler = (Object.entries(duraklar) as [PanelDurumu, number][]).filter(
      ([ad]) => ad !== "yari" || durum === "yari",
    );
    const en = secenekler.reduce(
      (iyi, [ad, y]) =>
        Math.abs(y - tahmin) < Math.abs(duraklar[iyi] - tahmin) ? ad : iyi,
      durum,
    );
    onDurum(en);
  }

  return (
    <>
      {/*
        Sağ kenar şeridi: haritada yatay sürükleme haritayı kaydırdığı için
        tam ekran listeyi ekranın sağ kenarından sola kaydırarak açıyoruz.
        Şerit dar (12 px): sağdaki harita düğmeleri kenardan 12 px içeride.
      */}
      {!tamEkran && (
        <div
          {...kaydirma}
          aria-hidden
          className="absolute bottom-20 right-0 top-[18%] z-[25] w-3 touch-none"
        />
      )}

      <motion.section
        drag="y"
        dragListener={false}
        dragControls={kontrol}
        dragConstraints={{ top: 0, bottom: duraklar.kapali }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={birakildi}
        animate={{ y: duraklar[durum] }}
        transition={{ type: "spring", stiffness: 420, damping: 42, mass: 0.9 }}
        style={{ height: yukseklik }}
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[24px] border-t border-cizgi bg-yuzey/92 shadow-[0_-14px_50px_-16px_rgba(14,14,17,0.28)] backdrop-blur-2xl"
      >
        {/* Tutamak + başlık: yukarı/aşağı sürüklenir, sola güçlü kaydırma tam ekran açar */}
        <div
          onPointerDown={(e) => {
            kaydirma.onPointerDown(e);
            kontrol.start(e);
          }}
          onClick={() => onDurum(durum === "kapali" ? "acik" : durum)}
          className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2 active:cursor-grabbing"
        >
          <div className="relative mb-2 flex items-center justify-center">
            <div className="h-1.5 w-10 rounded-full bg-cizgi" />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTamEkran(true);
              }}
              aria-label="Listeyi tam ekran aç"
              title="Tam ekran liste (ya da sola kaydır)"
              className="absolute -top-1 right-0 flex h-6 items-center gap-1 rounded-hap px-2 text-[10px] font-bold text-gri hover:bg-yuzey2"
            >
              Tam ekran ⤢
            </button>
          </div>
          {!tamEkran && baslik}
        </div>

        <div className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {!tamEkran && children}
        </div>
      </motion.section>

      {/* Tam ekran liste: sağdan kayarak gelir, sağa kaydırınca kapanır. */}
      <AnimatePresence>
        {tamEkran && (
          <motion.section
            key="tam-ekran"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.9 }}
            onDragEnd={(_, b) => {
              if (b.offset.x > 90 || b.velocity.x > 450) onTamEkran(false);
            }}
            style={{ touchAction: "pan-y" }}
            className="absolute inset-0 z-40 flex flex-col bg-yuzey shadow-yuzen"
          >
            <div className="shrink-0 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
              <div className="mb-2 flex items-center justify-end gap-2">
                <span className="text-[10.5px] font-semibold text-gri">
                  Sağa kaydırarak da kapanır
                </span>
                <button
                  onClick={() => onTamEkran(false)}
                  className="flex h-8 items-center gap-1 rounded-hap bg-yuzey2 px-3 text-[12px] font-bold text-gri"
                >
                  Harita →
                </button>
              </div>
              {baslik}
            </div>
            <div className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              {children}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
