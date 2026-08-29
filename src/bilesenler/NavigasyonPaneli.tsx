"use client";

import { AnimatePresence, motion } from "motion/react";

import { mesafeYaz, sureYaz } from "@/lib/rota";
import {
  varisSaati,
  type Adim,
  type Manevra,
  type RotaSecenegi,
} from "@/lib/navigasyon";
import type { Siparis } from "@/lib/tipler";

export type NavigasyonDurumu = "secim" | "surus";

type Props = {
  durum: NavigasyonDurumu;
  hedef: Siparis;
  secenekler: RotaSecenegi[];
  seciliId: string | null;
  yukleniyor: boolean;
  adim: Adim | null;
  sonrakiAdim: Adim | null;
  adimaKalanM: number;
  kalanMesafeM: number;
  kalanSureSn: number;
  vardi: boolean;
  /** Kamera kuryeyi takip ediyor mu? False ise "konuma dön" butonu çıkar. */
  takipAcik: boolean;
  sesAcik: boolean;
  onTakip: () => void;
  onSes: () => void;
  onSecenek: (id: string) => void;
  onBasla: () => void;
  onBitir: () => void;
  onTeslim: () => void;
  onHariciAc: () => void;
};

export default function NavigasyonPaneli({
  durum,
  hedef,
  secenekler,
  seciliId,
  yukleniyor,
  adim,
  sonrakiAdim,
  adimaKalanM,
  kalanMesafeM,
  kalanSureSn,
  vardi,
  takipAcik,
  sesAcik,
  onTakip,
  onSes,
  onSecenek,
  onBasla,
  onBitir,
  onTeslim,
  onHariciAc,
}: Props) {
  const secili = secenekler.find((s) => s.id === seciliId) ?? secenekler[0];

  return (
    <>
      {/* Üst: sıradaki manevra */}
      <AnimatePresence>
        {durum === "surus" && adim && (
          <motion.div
            key="manevra"
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-40 overflow-hidden rounded-[26px] bg-kirmizi text-white shadow-kirmizi"
          >
            <div className="flex items-center gap-3 p-4">
              <ManevraIkonu manevra={adim.manevra} />
              <div className="min-w-0 flex-1">
                <p className="text-[30px] font-black leading-none tracking-tight">
                  {mesafeYaz(adimaKalanM)}
                </p>
                <p className="mt-1.5 truncate text-[15px] font-bold leading-tight text-white/90">
                  {adim.yol || adim.tarif}
                </p>
              </div>
              <button
                onClick={onSes}
                aria-label={sesAcik ? "Sesli tarifi kapat" : "Sesli tarifi aç"}
                title={sesAcik ? "Sesli tarifi kapat" : "Sesli tarifi aç"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20"
              >
                <HoparlorIkonu acik={sesAcik} />
              </button>
              <button
                onClick={onBitir}
                aria-label="Navigasyonu bitir"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Bir sonraki manevra — Apple'daki ikinci satır */}
            {sonrakiAdim && sonrakiAdim.manevra !== "varis" && (
              <div className="flex items-center gap-3 border-t border-white/15 bg-black/15 px-4 py-2.5">
                <ManevraIkonu manevra={sonrakiAdim.manevra} kucuk />
                <p className="truncate text-[13px] font-semibold text-white/85">
                  Sonra: {sonrakiAdim.tarif}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sol altta "konuma dön" — kurye haritayı elle kaydırınca belirir */}
      <AnimatePresence>
        {durum === "surus" && !takipAcik && (
          <motion.button
            key="takip"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={onTakip}
            aria-label="Konumuma dön"
            title="Konumuma dön"
            className="absolute bottom-[190px] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-cizgi bg-yuzey/90 shadow-yuzen backdrop-blur-xl active:scale-95"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4.5 11.2 20 4.5l-6.7 15.5-2-6.3-6.8-2.5Z" fill="#e30a17" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Alt: rota seçimi veya sürüş özeti */}
      <motion.div
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 90, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="absolute inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-cizgi bg-yuzey/95 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-[0_-14px_50px_-16px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-gri">
              {durum === "secim" ? "Rota seç" : "Yolda"}
            </p>
            <p className="truncate text-[17px] font-extrabold">
              {hedef.musteri?.ad ?? "Teslimat"}
            </p>
            <p className="truncate text-[12px] font-medium text-gri">
              {hedef.adres?.adres_metni ?? ""}
            </p>
          </div>
          {durum === "secim" && (
            <button
              onClick={onBitir}
              aria-label="Kapat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-lg font-bold text-gri"
            >
              ×
            </button>
          )}
        </div>

        {yukleniyor ? (
          <div className="flex h-[92px] items-center justify-center gap-3 text-sm font-semibold text-gri">
            <motion.span
              className="h-4 w-4 rounded-full border-2 border-cizgi border-t-kirmizi"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            Rota hesaplanıyor…
          </div>
        ) : (
          <>
            {/* Özet */}
            {durum === "surus" ? (
              <div className="mb-3 grid grid-cols-3 items-end">
                <Sutun ust={varisSaati(kalanSureSn)} alt="varış" vurgu />
                <Sutun
                  ust={String(Math.max(1, Math.round(kalanSureSn / 60)))}
                  alt="dk."
                  hiza="orta"
                />
                <Sutun {...mesafeSutunu(kalanMesafeM)} hiza="sag" />
              </div>
            ) : (
              <div className="mb-3 flex items-end gap-4">
                <div>
                  <p className="text-[28px] font-black leading-none text-kirmizi">
                    {sureYaz(secili?.sureSn ?? 0)}
                  </p>
                  <p className="mt-1 text-[12px] font-bold text-gri">
                    {mesafeYaz(secili?.mesafeM ?? 0)} ·{" "}
                    {varisSaati(secili?.sureSn ?? 0)} varış
                  </p>
                </div>
                {secili?.motor === "yerel" && (
                  <p className="ml-auto max-w-[45%] text-right text-[11px] font-semibold leading-tight text-gri">
                    Yol ağı servisi kapalı — kuş uçuşu tahmin
                  </p>
                )}
              </div>
            )}

            {/* Alternatifler */}
            {durum === "secim" && secenekler.length > 1 && (
              <div className="ince-kaydirma -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {secenekler.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSecenek(s.id)}
                    className={`shrink-0 rounded-2xl border px-3.5 py-2 text-left transition-colors ${
                      s.id === seciliId
                        ? "border-kirmizi bg-kirmizi-sis"
                        : "border-cizgi bg-yuzey hover:bg-yuzey2"
                    }`}
                  >
                    <span className="block text-[11px] font-black uppercase tracking-wide text-gri">
                      {s.ad}
                    </span>
                    <span className="block text-[14px] font-black">
                      {sureYaz(s.sureSn)}
                    </span>
                    <span className="block text-[11px] font-semibold text-gri">
                      {mesafeYaz(s.mesafeM)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Eylemler */}
            <div className="flex gap-2">
              {durum === "secim" ? (
                <>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onBasla}
                    className="flex h-14 flex-1 items-center justify-center gap-2 rounded-hap bg-kirmizi text-[15px] font-black text-white shadow-kirmizi"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 11 21 3l-8 18-2-7-8-3Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Başla
                  </motion.button>
                  <button
                    onClick={onSes}
                    aria-label={sesAcik ? "Sesli tarifi kapat" : "Sesli tarifi aç"}
                    title={sesAcik ? "Sesli tarifi kapat" : "Sesli tarifi aç"}
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-hap border transition-colors ${
                      sesAcik
                        ? "border-kirmizi bg-kirmizi text-white"
                        : "border-cizgi bg-yuzey text-gri"
                    }`}
                  >
                    <HoparlorIkonu acik={sesAcik} />
                  </button>
                  <button
                    onClick={onHariciAc}
                    aria-label="Harici harita uygulamasında aç"
                    title="Harici harita uygulamasında aç"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-hap border border-cizgi bg-yuzey"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </>
              ) : vardi ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onTeslim}
                  className="flex h-14 flex-1 items-center justify-center rounded-hap bg-yesil text-[15px] font-black text-white"
                >
                  ✓ Teslim ettim
                </motion.button>
              ) : (
                <button
                  onClick={onBitir}
                  className="flex h-14 flex-1 items-center justify-center rounded-hap border border-cizgi bg-yuzey text-[15px] font-black"
                >
                  Navigasyonu bitir
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Sutun({
  ust,
  alt,
  vurgu,
  hiza = "sol",
}: {
  ust: string;
  alt: string;
  vurgu?: boolean;
  hiza?: "sol" | "orta" | "sag";
}) {
  const yon =
    hiza === "orta" ? "text-center" : hiza === "sag" ? "text-right" : "text-left";
  return (
    <div className={yon}>
      <p
        className={`text-[26px] font-black leading-none tracking-tight ${
          vurgu ? "text-kirmizi" : "text-metin"
        }`}
      >
        {ust}
      </p>
      <p className="mt-1 text-[12px] font-bold text-gri">{alt}</p>
    </div>
  );
}

/** "420" + "m" ya da "5,9" + "km" olarak ayırır. */
function mesafeSutunu(metre: number): { ust: string; alt: string } {
  if (metre < 950) return { ust: String(Math.round(metre)), alt: "m" };
  return {
    ust: (metre / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }),
    alt: "km",
  };
}

function HoparlorIkonu({ acik }: { acik: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {acik ? (
        <path
          d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="m16 9.5 5 5m0-5-5 5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

const DONUS_ACISI: Partial<Record<Manevra, number>> = {
  sol: -90,
  sag: 90,
  "hafif-sol": -40,
  "hafif-sag": 40,
  "keskin-sol": -135,
  "keskin-sag": 135,
  duz: 0,
  cikis: 0,
};

function ManevraIkonu({
  manevra,
  kucuk,
}: {
  manevra: Manevra;
  kucuk?: boolean;
}) {
  const kutu = kucuk ? "h-8 w-8 rounded-xl" : "h-12 w-12 rounded-2xl";
  const olcu = kucuk ? 18 : 26;
  const cerceve = `flex ${kutu} shrink-0 items-center justify-center bg-white/20`;

  if (manevra === "varis") {
    return (
      <span className={`${cerceve} ${kucuk ? "text-base" : "text-2xl"}`}>📍</span>
    );
  }

  if (manevra === "gobek") {
    return (
      <span className={cerceve}>
        <svg width={olcu} height={olcu} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="13" r="4.5" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 22v-4.5M16.5 13H21l-2.5-2.5M21 13l-2.5 2.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (manevra === "u-donusu") {
    return (
      <span className={cerceve}>
        <svg width={olcu} height={olcu} viewBox="0 0 24 24" fill="none">
          <path
            d="M8 21V10a4 4 0 0 1 8 0v11M4.5 13.5 8 10l3.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  // Dönüşler: Apple'daki gibi köşeli ok, açıya göre döndürülür.
  const aci = DONUS_ACISI[manevra] ?? 0;
  const donus = manevra === "sol" || manevra === "sag";

  return (
    <span className={cerceve}>
      <svg
        width={olcu}
        height={olcu}
        viewBox="0 0 24 24"
        fill="none"
        style={{ transform: donus ? undefined : `rotate(${aci}deg)` }}
      >
        {donus ? (
          <path
            d={
              manevra === "sol"
                ? "M18 21v-8a4 4 0 0 0-4-4H7M11 5 6 9l5 4"
                : "M6 21v-8a4 4 0 0 1 4-4h7M13 5l5 4-5 4"
            }
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M12 21V5M6 11l6-6 6 6"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}
