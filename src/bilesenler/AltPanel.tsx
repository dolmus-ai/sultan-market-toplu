"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useDragControls, type PanInfo } from "motion/react";

export type PanelDurumu = "kapali" | "yari" | "acik";

type Props = {
  durum: PanelDurumu;
  onDurum: (d: PanelDurumu) => void;
  baslik: React.ReactNode;
  children: React.ReactNode;
};

const PANEL_YUKSEKLIK_ORANI = 0.9;

export default function AltPanel({ durum, onDurum, baslik, children }: Props) {
  const kontrol = useDragControls();
  const [ekran, setEkran] = useState(800);

  useEffect(() => {
    const olc = () => setEkran(window.innerHeight);
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, []);

  const { yukseklik, duraklar } = useMemo(() => {
    const h = Math.round(ekran * PANEL_YUKSEKLIK_ORANI);
    return {
      yukseklik: h,
      duraklar: {
        acik: 0,
        yari: Math.round(h - ekran * 0.46),
        kapali: Math.round(h - 132),
      } as Record<PanelDurumu, number>,
    };
  }, [ekran]);

  function birakildi(_: unknown, bilgi: PanInfo) {
    const su = duraklar[durum] + bilgi.offset.y;
    const hiz = bilgi.velocity.y;
    const tahmin = su + hiz * 0.18;

    const en = (Object.entries(duraklar) as [PanelDurumu, number][]).reduce(
      (iyi, [ad, y]) =>
        Math.abs(y - tahmin) < Math.abs(duraklar[iyi] - tahmin) ? ad : iyi,
      durum,
    );
    onDurum(en);
  }

  return (
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
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] border-t border-cizgi bg-white/92 shadow-[0_-14px_50px_-16px_rgba(14,14,17,0.28)] backdrop-blur-2xl"
    >
      {/* Tutamak + başlık: sürüklenebilir bölge */}
      <div
        onPointerDown={(e) => kontrol.start(e)}
        onClick={() => onDurum(durum === "kapali" ? "yari" : durum)}
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-3 active:cursor-grabbing"
      >
        <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-cizgi" />
        {baslik}
      </div>

      <div className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {children}
      </div>
    </motion.section>
  );
}
