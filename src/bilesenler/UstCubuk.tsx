"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";

import { SultanAmblem } from "./SultanLogo";

/** Sola kaydırınca açılan çıkış alanının genişliği (px). */
const CIKIS_GENISLIK = 104;
const GIZLI_ANAHTARI = "sultan-ust-cubuk-gizli";
const YAY = { type: "spring", stiffness: 420, damping: 36 } as const;

/*
 * Gizlilik tercihi bu cihazda saklanır. Sunucu çiziminde hep "görünür";
 * hidrasyon bitince kayıtlı tercih okunur, uyuşmazlık olmaz. Depolama
 * kapalıysa tercih yalnızca bu oturumda bellekte tutulur.
 */
let bellekteGizli = false;
const dinleyiciler = new Set<() => void>();
function gizliOku(): boolean {
  try {
    return localStorage.getItem(GIZLI_ANAHTARI) === "1";
  } catch {
    return bellekteGizli;
  }
}
function gizliYaz(deger: boolean) {
  bellekteGizli = deger;
  try {
    localStorage.setItem(GIZLI_ANAHTARI, deger ? "1" : "0");
  } catch {
    /* depolama kapalıysa bellekteki değer yeter */
  }
  dinleyiciler.forEach((f) => f());
}
function gizliDinle(f: () => void) {
  dinleyiciler.add(f);
  return () => {
    dinleyiciler.delete(f);
  };
}

/**
 * Kaydırılabilen üst çubuk.
 *
 * - Yukarı kaydırınca saklanır; yerinde küçük bir sekme kalır, ona dokunmak
 *   ya da aşağı çekmek çubuğu geri getirir. Tercih bu cihazda hatırlanır.
 * - Sola kaydırınca arkasındaki "Çıkış yap" düğmesi görünür (arkasında
 *   bulanık amblem). Sağa kaydırmak ya da çubuğa dokunmak geri kapatır.
 */
export default function UstCubuk({
  children,
  onCikis,
}: {
  children: React.ReactNode;
  onCikis: () => void;
}) {
  const gizli = useSyncExternalStore(gizliDinle, gizliOku, () => false);
  const setGizli = gizliYaz;
  const [cikisAcik, setCikisAcik] = useState(false);

  const x = useMotionValue(0);
  // Çıkış alanı yalnızca kart kaydıkça görünsün; kart yarı saydam.
  const cikisGorunurluk = useTransform(x, [-CIKIS_GENISLIK, -12, 0], [1, 0.4, 0]);
  const amblemOlcek = useTransform(x, [-CIKIS_GENISLIK, 0], [1, 0.7]);

  function birakildi(_: unknown, b: PanInfo) {
    const dikey = Math.abs(b.offset.y) > Math.abs(b.offset.x);
    if (dikey) {
      if (b.offset.y < -24 || b.velocity.y < -350) {
        setCikisAcik(false);
        setGizli(true);
      }
      return;
    }
    if (b.offset.x < -40 || b.velocity.x < -300) setCikisAcik(true);
    else if (b.offset.x > 16 || b.velocity.x > 300) setCikisAcik(false);
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[calc(env(safe-area-inset-top)+12px)]">
      <AnimatePresence initial={false} mode="popLayout">
        {!gizli ? (
          <motion.div
            key="kart"
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={YAY}
            className="pointer-events-auto relative"
          >
            {/* Kartın arkası: bulanık amblemin önünde çıkış düğmesi */}
            <motion.div
              style={{ opacity: cikisGorunurluk }}
              className="absolute inset-y-0 right-0 flex w-[124px] items-center justify-end overflow-hidden rounded-[22px] bg-gradient-to-br from-kirmizi to-[#9f0710]"
            >
              <motion.div
                aria-hidden
                style={{ scale: amblemOlcek }}
                className="pointer-events-none absolute right-3 top-1/2 -mt-[38px] opacity-60 blur-[5px]"
              >
                <SultanAmblem boyut={76} />
              </motion.div>
              <button
                onClick={onCikis}
                tabIndex={cikisAcik ? 0 : -1}
                aria-label="Çıkış yap"
                className="relative flex h-full w-[104px] flex-col items-center justify-center gap-0.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 15l4-3-4-3M20 12H10"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[11px] font-black">Çıkış yap</span>
              </button>
            </motion.div>

            {/* Kart: sola → çıkış, yukarı → sakla */}
            <motion.div
              drag
              dragDirectionLock
              dragConstraints={{ left: -CIKIS_GENISLIK, right: 0, top: 0, bottom: 0 }}
              dragElastic={{ left: 0.12, right: 0.04, top: 0.6, bottom: 0.04 }}
              dragMomentum={false}
              onDragEnd={birakildi}
              animate={{ x: cikisAcik ? -CIKIS_GENISLIK : 0 }}
              transition={YAY}
              onClickCapture={(e) => {
                // Çıkış açıkken karta dokunmak önce onu kapatsın.
                if (!cikisAcik) return;
                e.stopPropagation();
                setCikisAcik(false);
              }}
              style={{ x, touchAction: "none" }}
              className="relative"
            >
              {children}
            </motion.div>
          </motion.div>
        ) : (
          <motion.button
            key="sekme"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={YAY}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, b) => {
              if (b.offset.y > 16 || b.velocity.y > 300) setGizli(false);
            }}
            onClick={() => setGizli(false)}
            aria-label="Üst çubuğu göster"
            title="Üst çubuğu göster (ya da aşağı çek)"
            style={{ touchAction: "none" }}
            className="pointer-events-auto mx-auto flex h-8 items-center gap-1.5 rounded-hap border border-cizgi bg-yuzey/85 pl-1 pr-2.5 shadow-yumusak backdrop-blur-2xl"
          >
            <SultanAmblem boyut={22} />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-gri">
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </header>
  );
}
