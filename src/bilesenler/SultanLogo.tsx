"use client";

import { motion } from "motion/react";

/**
 * Sultan Market amblemi — mağaza tabelasındaki işaretin yeniden çizimi:
 * yandan görünen alışveriş arabası; tepesinde kırmızı küre, sepet gövdesi
 * koyu, altında iki kırmızı tekerlek.
 *
 * Gerçek vektör dosyası eldeyse yalnızca bu dosyadaki path'leri değiştirmek
 * yeterli; üst çubuk, giriş ekranı, hata ekranı ve harita pini buradan besleniyor.
 */

export const MARKA_LACIVERT = "#16212e";
export const MARKA_KIRMIZI = "#e30a17";

/* Ortak geometri — animasyonlu ve durağan sürümler aynı yolları kullanır. */
const SAP = "M13.6 28.2C10.4 24.6 11.6 19.4 16.2 17.8";
const SEPET =
  "M11.8 28.4C21.4 24.2 44.6 24.2 54.2 28.4L46.6 45.4C39.2 48.4 27.4 48.4 20 45.4Z";
const AG_1 = "M15.6 34.2C24.2 31.2 43 31.2 50.6 34.2";
const AG_2 = "M18.4 40.2C26 37.6 41.2 37.6 47.8 40.2";
const KURE = { cx: 25.5, cy: 12.4, r: 7.9 };
const TEKERLEKLER = [
  { cx: 26.5, cy: 55, r: 4.5 },
  { cx: 43.5, cy: 55, r: 4.5 },
];

export function SultanAmblem({
  boyut = 48,
  zeminli = true,
}: {
  boyut?: number;
  /** Lacivert yuvarlak zemin çizilsin mi? */
  zeminli?: boolean;
}) {
  const arabaRengi = zeminli ? "#ffffff" : MARKA_LACIVERT;

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

      <path
        d={SAP}
        stroke={arabaRengi}
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d={SEPET} fill={arabaRengi} />
      <path
        d={AG_1}
        stroke={zeminli ? MARKA_LACIVERT : "#ffffff"}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d={AG_2}
        stroke={zeminli ? MARKA_LACIVERT : "#ffffff"}
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      <circle {...KURE} fill={MARKA_KIRMIZI} />
      {TEKERLEKLER.map((t) => (
        <circle key={t.cx} {...t} fill={MARKA_KIRMIZI} />
      ))}
    </svg>
  );
}

/** Tabeladaki gibi: kalın "SULTAN MARKET" + altında kırmızı şerit. */
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
        SULTAN MARKET
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
 * Zemin oturur, sap çizilir, sepet açılır, tel örgü çizilir, küre düşer,
 * tekerlekler sırayla yerine oturur. `onBitti` son kare oynadığında çağrılır.
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
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Sap çizilir */}
        <motion.path
          d={SAP}
          stroke="#ffffff"
          strokeWidth="4.6"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35, ease: "easeOut" }}
        />

        {/* Sepet tabandan açılır */}
        <motion.path
          d={SEPET}
          fill="#ffffff"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          style={{ originX: "32px", originY: "47px" }}
          transition={{ ...YAY, delay: 0.55 }}
        />

        {/* Tel örgü çizgileri */}
        {[AG_1, AG_2].map((d, i) => (
          <motion.path
            key={d}
            d={d}
            stroke={MARKA_LACIVERT}
            strokeWidth="2.6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, delay: 0.85 + i * 0.1 }}
          />
        ))}

        {/* Küre yukarıdan düşer */}
        <motion.circle
          cx={KURE.cx}
          r={KURE.r}
          fill={MARKA_KIRMIZI}
          initial={{ cy: -14, opacity: 0 }}
          animate={{ cy: KURE.cy, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 14,
            delay: 1.05,
          }}
        />

        {/* Tekerlekler sırayla oturur */}
        {TEKERLEKLER.map((t, i) => (
          <motion.circle
            key={t.cx}
            cx={t.cx}
            cy={t.cy}
            r={t.r}
            fill={MARKA_KIRMIZI}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ originX: `${t.cx}px`, originY: `${t.cy}px` }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 15,
              delay: 1.2 + i * 0.12,
            }}
          />
        ))}
      </motion.svg>

      {/* Tabela yazısı */}
      <div className="overflow-hidden">
        <motion.p
          className="whitespace-nowrap text-[26px] font-black leading-none tracking-[-0.02em] text-metin"
          initial={{ y: 34, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...YAY, delay: 1.35 }}
        >
          SULTAN MARKET
        </motion.p>
      </div>

      {/* Kırmızı şerit soldan sağa açılır */}
      <motion.div
        className="h-1 rounded-full bg-kirmizi"
        initial={{ width: 0 }}
        animate={{ width: 168 }}
        transition={{ duration: 0.55, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={onBitti}
      />
    </div>
  );
}
