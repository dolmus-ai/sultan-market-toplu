"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Katmanlar } from "./Harita";

type Props = {
  bearing: number;
  pitch: number;
  katmanlar: Katmanlar;
  katmanPaneli: boolean;
  konumTakibi: boolean;
  onPusula: () => void;
  onEgim: () => void;
  onYakinlastir: (yon: 1 | -1) => void;
  onKonum: () => void;
  onKatmanPaneli: (acik: boolean) => void;
  onKatman: (anahtar: keyof Katmanlar) => void;
  /** Sayfanın iki parmakla yakınlaştırılması kilitli mi. */
  zoomKilitli: boolean;
  onZoomKilidi: () => void;
};

// Sepetler bölümü kaldırıldı: katmanı listede yok.
const KATMAN_ETIKET: Partial<
  Record<keyof Katmanlar, { ad: string; ikon: string }>
> = {
  abonelikler: { ad: "Abonelikler", ikon: "◎" },
  siteler: { ad: "Siteler", ikon: "▦" },
  teslimEdilenler: { ad: "Teslim edilenler", ikon: "✓" },
  ucBoyut: { ad: "3B binalar", ikon: "◪" },
  isiHaritasi: { ad: "Talep ısı haritası", ikon: "◍" },
  karanlik: { ad: "Karanlık harita", ikon: "◐" },
};

export default function HaritaKontrolleri({
  bearing,
  pitch,
  katmanlar,
  katmanPaneli,
  konumTakibi,
  onPusula,
  onEgim,
  onYakinlastir,
  onKonum,
  onKatmanPaneli,
  onKatman,
  zoomKilitli,
  onZoomKilidi,
}: Props) {
  /*
   * Haritanın sağı sade kalsın: yalnızca + / − hep görünür. Pusula, 3B,
   * katmanlar ve konum "diğer butonlar" düğmesiyle açılıyor.
   */
  const [digerAcik, setDigerAcik] = useState(false);
  const donuk = Math.abs(bearing) > 1 || pitch > 1;

  function digerDegistir() {
    if (digerAcik) onKatmanPaneli(false);
    setDigerAcik(!digerAcik);
  }

  return (
    <div className={`pointer-events-none absolute right-3 top-20 flex flex-col items-end gap-2 ${
        katmanPaneli ? "z-40" : "z-20"
      }`}>
      <Kume>
        <Dugme
          etiket="Yakınlaştır"
          onClick={() => onYakinlastir(1)}
          ust
        >
          <Cizgi yatay />
          <Cizgi />
        </Dugme>
        <div className="mx-1.5 h-px bg-cizgi" />
        <Dugme etiket="Uzaklaştır" onClick={() => onYakinlastir(-1)} alt>
          <Cizgi yatay />
        </Dugme>
      </Kume>

      <Kume>
        <Dugme
          etiket={digerAcik ? "Diğer butonları gizle" : "Diğer butonları göster"}
          onClick={digerDegistir}
          aktif={digerAcik}
          ust
          alt
        >
          <motion.span
            animate={{ rotate: digerAcik ? 90 : 0 }}
            className="text-[15px] font-black leading-none"
          >
            ⋯
          </motion.span>
          {/* Konum takibi açıkken ya da harita döndürülmüşken küçük işaret */}
          {!digerAcik && (konumTakibi || donuk) && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-kirmizi" />
          )}
        </Dugme>
      </Kume>

      <AnimatePresence>
      {digerAcik && (
      <motion.div
        key="diger"
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        className="flex flex-col items-end gap-2"
      >
      {/* Pusula — kuzeye döndürür */}
      <AnimatePresence>
        {digerAcik && (
          <motion.button
            key="pusula"
            initial={{ opacity: 0, scale: 0.6, x: 12 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            onClick={onPusula}
            aria-label="Kuzeye döndür"
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-cizgi bg-yuzey/85 shadow-yumusak backdrop-blur-xl active:scale-95"
          >
            <motion.svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              animate={{ rotate: -bearing }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
            >
              <path d="M12 3 L15.6 13 L12 11 L8.4 13 Z" fill="#e30a17" />
              <path d="M12 21 L8.4 11 L12 13 L15.6 11 Z" fill="currentColor" />
            </motion.svg>
          </motion.button>
        )}
      </AnimatePresence>

      <Kume>
        <Dugme
          etiket="Görünümü eğ"
          onClick={onEgim}
          aktif={pitch > 20}
          ust
          alt
        >
          <span className="text-[11px] font-extrabold leading-none">
            {pitch > 20 ? "3B" : "2B"}
          </span>
        </Dugme>
      </Kume>

      <Kume>
        <Dugme
          etiket="Katmanlar"
          onClick={() => onKatmanPaneli(!katmanPaneli)}
          aktif={katmanPaneli}
          ust
          alt
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3 21 8l-9 5-9-5 9-5Z"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
            <path
              d="m3.5 13 8.5 4.7L20.5 13"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Dugme>
      </Kume>

      <Kume>
        <Dugme
          etiket="Konumuma git"
          onClick={onKonum}
          aktif={konumTakibi}
          ust
          alt
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="3.4"
              fill={konumTakibi ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.9"
            />
            <path
              d="M12 2v3M12 19v3M2 12h3M19 12h3"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </Dugme>
      </Kume>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Katman paneli */}
      <AnimatePresence>
        {katmanPaneli && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 16 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="ince-kaydirma pointer-events-auto max-h-[52dvh] w-60 origin-top-right overflow-y-auto rounded-3xl border border-cizgi bg-yuzey/90 p-2 shadow-yuzen backdrop-blur-2xl"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-gri">
              Harita katmanları
            </p>
            {(Object.keys(KATMAN_ETIKET) as (keyof Katmanlar)[]).map((k) => (
              <button
                key={k}
                onClick={() => onKatman(k)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-yuzey2"
              >
                <span className="w-5 text-center text-[13.5px] text-gri">
                  {KATMAN_ETIKET[k]?.ikon}
                </span>
                <span className="flex-1 text-sm font-semibold">
                  {KATMAN_ETIKET[k]?.ad}
                </span>
                <span
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                    katmanlar[k] ? "bg-kirmizi" : "bg-cizgi"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 520, damping: 32 }}
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-yuzey shadow"
                    style={{ left: katmanlar[k] ? 18 : 2 }}
                  />
                </span>
              </button>
            ))}

            <p className="px-3 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-gri">
              Ekran
            </p>
            <button
              onClick={onZoomKilidi}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-yuzey2"
            >
              <span className="w-5 text-center text-[13.5px] text-gri">
                {zoomKilitli ? "🔒" : "🔓"}
              </span>
              <span className="flex-1 text-sm font-semibold">
                Yakınlaştırma kilidi
                <span className="block text-[10.5px] font-medium text-gri">
                  {zoomKilitli
                    ? "İki parmakla büyütme kapalı"
                    : "İki parmakla büyütülebilir"}
                </span>
              </span>
              <span
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  zoomKilitli ? "bg-kirmizi" : "bg-cizgi"
                }`}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 520, damping: 32 }}
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-yuzey shadow"
                  style={{ left: zoomKilitli ? 18 : 2 }}
                />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Kume({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto overflow-hidden rounded-[18px] border border-cizgi bg-yuzey/85 shadow-yumusak backdrop-blur-xl">
      {children}
    </div>
  );
}

function Dugme({
  children,
  etiket,
  onClick,
  aktif,
}: {
  children: React.ReactNode;
  etiket: string;
  onClick: () => void;
  aktif?: boolean;
  ust?: boolean;
  alt?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={etiket}
      title={etiket}
      className={`relative flex h-9 w-9 items-center justify-center transition-colors active:scale-90 ${
        aktif ? "bg-kirmizi text-white" : "text-metin hover:bg-yuzey2"
      }`}
    >
      {children}
    </button>
  );
}

function Cizgi({ yatay }: { yatay?: boolean }) {
  return (
    <span
      className={`absolute block rounded-full bg-current ${
        yatay ? "h-[2px] w-[13px]" : "h-[13px] w-[2px]"
      }`}
    />
  );
}
