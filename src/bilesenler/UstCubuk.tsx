"use client";

import { useState, useSyncExternalStore } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
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
 *   bulanık amblem). Sağa kaydırınca aynı düğme bu kez solda açılır.
 *   Ters yöne kaydırmak ya da çubuğa dokunmak geri kapatır.
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
  /** Çıkış alanı hangi yanda açık: "sag" kart sola, "sol" kart sağa kaymış. */
  const [cikisAcik, setCikisAcik] = useState<"sag" | "sol" | null>(null);

  const x = useMotionValue(0);
  // Çıkış alanları yalnızca kart o yöne kaydıkça görünsün; kart yarı saydam.
  const sagGorunurluk = useTransform(x, [-CIKIS_GENISLIK, -12, 0], [1, 0.4, 0]);
  const solGorunurluk = useTransform(x, [0, 12, CIKIS_GENISLIK], [0, 0.4, 1]);
  const sagOlcek = useTransform(x, [-CIKIS_GENISLIK, 0], [1, 0.7]);
  const solOlcek = useTransform(x, [0, CIKIS_GENISLIK], [0.7, 1]);

  function birakildi(_: unknown, b: PanInfo) {
    const dikey = Math.abs(b.offset.y) > Math.abs(b.offset.x);
    if (dikey) {
      if (b.offset.y < -24 || b.velocity.y < -350) {
        setCikisAcik(null);
        setGizli(true);
      }
      return;
    }
    const sola = b.offset.x < -40 || b.velocity.x < -300;
    const saga = b.offset.x > 40 || b.velocity.x > 300;
    const geri = (yon: number) => yon * b.offset.x > 16 || yon * b.velocity.x > 300;
    if (cikisAcik === "sag") {
      if (geri(1)) setCikisAcik(null);
    } else if (cikisAcik === "sol") {
      if (geri(-1)) setCikisAcik(null);
    } else if (sola) setCikisAcik("sag");
    else if (saga) setCikisAcik("sol");
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
            {/* Kartın arkası: iki yanda bulanık amblemin önünde çıkış düğmesi */}
            <CikisAlani
              yan="sag"
              gorunurluk={sagGorunurluk}
              olcek={sagOlcek}
              acik={cikisAcik === "sag"}
              onCikis={onCikis}
            />
            <CikisAlani
              yan="sol"
              gorunurluk={solGorunurluk}
              olcek={solOlcek}
              acik={cikisAcik === "sol"}
              onCikis={onCikis}
            />

            {/* Kart: sola/sağa → çıkış, yukarı → sakla */}
            <motion.div
              drag
              dragDirectionLock
              dragConstraints={{
                left: -CIKIS_GENISLIK,
                right: CIKIS_GENISLIK,
                top: 0,
                bottom: 0,
              }}
              dragElastic={{ left: 0.12, right: 0.12, top: 0.6, bottom: 0.04 }}
              dragMomentum={false}
              onDragEnd={birakildi}
              animate={{
                x:
                  cikisAcik === "sag"
                    ? -CIKIS_GENISLIK
                    : cikisAcik === "sol"
                      ? CIKIS_GENISLIK
                      : 0,
              }}
              transition={YAY}
              onClickCapture={(e) => {
                // Çıkış açıkken karta dokunmak önce onu kapatsın.
                if (!cikisAcik) return;
                e.stopPropagation();
                setCikisAcik(null);
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

/** Kartın arkasındaki çıkış alanı: kırmızı zemin, bulanık amblem, düğme. */
function CikisAlani({
  yan,
  gorunurluk,
  olcek,
  acik,
  onCikis,
}: {
  yan: "sag" | "sol";
  gorunurluk: MotionValue<number>;
  olcek: MotionValue<number>;
  acik: boolean;
  onCikis: () => void;
}) {
  const sag = yan === "sag";
  return (
    <motion.div
      style={{ opacity: gorunurluk }}
      className={`absolute inset-y-0 flex w-[124px] items-center overflow-hidden rounded-[22px] from-kirmizi to-[#9f0710] ${
        sag ? "right-0 justify-end bg-gradient-to-br" : "left-0 justify-start bg-gradient-to-bl"
      }`}
    >
      <motion.div
        aria-hidden
        style={{ scale: olcek }}
        className={`pointer-events-none absolute top-1/2 -mt-[38px] opacity-60 blur-[5px] ${
          sag ? "right-3" : "left-3"
        }`}
      >
        <SultanAmblem boyut={76} />
      </motion.div>
      <button
        onClick={onCikis}
        tabIndex={acik ? 0 : -1}
        aria-hidden={!acik}
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
  );
}
