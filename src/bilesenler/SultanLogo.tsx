"use client";

import { motion } from "motion/react";

/**
 * Sultan Market amblemi — mağaza tabelasındaki işaretin yeniden çizimi:
 * lacivert "S" kıvrımı, tepesinde kırmızı küre, altında üç kırmızı damla.
 *
 * Gerçek vektör dosyası eldeyse bu bileşenin içindeki path'leri
 * değiştirmek yeterli; uygulamanın kalanı buradan besleniyor.
 */

export const MARKA_LACIVERT = "#1b2836";
export const MARKA_KIRMIZI = "#e30a17";

export function SultanAmblem({
  boyut = 48,
  zeminli = true,
}: {
  boyut?: number;
  /** Lacivert yuvarlak zemin çizilsin mi? */
  zeminli?: boolean;
}) {
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Sultan Market"
    >
      {zeminli && <rect width="64" height="64" rx="18" fill={MARKA_LACIVERT} />}

      {/* S kıvrımı */}
      <path
        d="M42.5 20.5c-2.6-3.4-7-5.2-11.6-4.6-5.6.7-9.6 4.7-9.6 9.4 0 4.4 3.2 7 9.2 8.6 5.2 1.4 7 2.6 7 5 0 2.6-2.6 4.4-6.4 4.4-3.6 0-6.4-1.4-8.4-4"
        stroke={zeminli ? "#ffffff" : MARKA_LACIVERT}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tepedeki küre */}
      <circle cx="45.5" cy="15.5" r="5.5" fill={MARKA_KIRMIZI} />

      {/* Alttaki üç damla */}
      <circle cx="20" cy="44.5" r="3.6" fill={MARKA_KIRMIZI} />
      <circle cx="27.5" cy="49.5" r="3.1" fill={MARKA_KIRMIZI} />
      <circle cx="35" cy="53" r="2.6" fill={MARKA_KIRMIZI} />
    </svg>
  );
}

/** Tabeladaki gibi: kalın beyaz "SULTAN MARKET" + altında kırmızı şerit. */
export function SultanTabela({
  boyut = 1,
  ton = "koyu",
}: {
  /** 1 = 220px genişlik. */
  boyut?: number;
  ton?: "koyu" | "acik";
}) {
  const yazi = ton === "koyu" ? "#ffffff" : MARKA_LACIVERT;
  return (
    <div style={{ width: 220 * boyut }} className="select-none">
      <p
        className="whitespace-nowrap font-black leading-none tracking-[-0.02em]"
        style={{ fontSize: 34 * boyut, color: yazi }}
      >
        SULTAN <span style={{ letterSpacing: "-0.01em" }}>MARKET</span>
      </p>
      <div
        className="mt-2 rounded-full"
        style={{ height: 4 * boyut, background: MARKA_KIRMIZI }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Açılış animasyonu                                                   */
/* ------------------------------------------------------------------ */

const YAY = { type: "spring", stiffness: 260, damping: 20 } as const;

/**
 * Amblem çizilir, küre düşer, damlalar sırayla belirir, tabela açılır.
 * `onBitti` son kare oynadığında çağrılır.
 */
export function SultanAcilis({
  onBitti,
  boyut = 92,
}: {
  onBitti?: () => void;
  boyut?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <motion.svg
        width={boyut}
        height={boyut}
        viewBox="0 0 64 64"
        fill="none"
        initial={{ scale: 0.6, rotate: -14, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ ...YAY, delay: 0.05 }}
        role="img"
        aria-label="Sultan Market"
      >
        <motion.rect
          width="64"
          height="64"
          rx="18"
          fill={MARKA_LACIVERT}
          initial={{ rx: 32 }}
          animate={{ rx: 18 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* S kıvrımı çizilerek gelir */}
        <motion.path
          d="M42.5 20.5c-2.6-3.4-7-5.2-11.6-4.6-5.6.7-9.6 4.7-9.6 9.4 0 4.4 3.2 7 9.2 8.6 5.2 1.4 7 2.6 7 5 0 2.6-2.6 4.4-6.4 4.4-3.6 0-6.4-1.4-8.4-4"
          stroke="#ffffff"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.85, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Küre yukarıdan düşer */}
        <motion.circle
          cx="45.5"
          cy="15.5"
          r="5.5"
          fill={MARKA_KIRMIZI}
          initial={{ cy: -14, opacity: 0 }}
          animate={{ cy: 15.5, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.95 }}
        />

        {/* Damlalar sırayla */}
        {[
          { cx: 20, cy: 44.5, r: 3.6, g: 1.15 },
          { cx: 27.5, cy: 49.5, r: 3.1, g: 1.25 },
          { cx: 35, cy: 53, r: 2.6, g: 1.35 },
        ].map((d) => (
          <motion.circle
            key={d.cx}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={MARKA_KIRMIZI}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ originX: `${d.cx}px`, originY: `${d.cy}px` }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: d.g }}
          />
        ))}
      </motion.svg>

      {/* Tabela yazısı */}
      <div className="overflow-hidden">
        <motion.p
          className="whitespace-nowrap text-[30px] font-black leading-none tracking-[-0.02em] text-metin"
          initial={{ y: 34, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...YAY, delay: 1.1 }}
        >
          SULTAN MARKET
        </motion.p>
      </div>

      {/* Kırmızı şerit soldan sağa açılır */}
      <motion.div
        className="h-1 rounded-full bg-kirmizi"
        initial={{ width: 0 }}
        animate={{ width: 168 }}
        transition={{ duration: 0.55, delay: 1.35, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={onBitti}
      />
    </div>
  );
}
