"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";

import { ODEME_ETIKET, para } from "@/lib/bicim";
import { mesafeYaz, sureYaz } from "@/lib/rota";
import type { OdemeYontemi, Tahsilat, Vardiya } from "@/lib/tipler";

/** Kuryenin elden aldığı — kasaya sayması gereken yöntemler. */
const NAKDE_SAYILAN: OdemeYontemi[] = ["nakit"];

export default function VardiyaOzeti({
  vardiya,
  tahsilatlar,
  teslimEdilen,
  basarisiz,
  toplamMesafeM,
  toplamSureSn,
  islemde,
  onKapat,
  onVardiyayiKapat,
}: {
  vardiya: Vardiya;
  tahsilatlar: Tahsilat[];
  teslimEdilen: number;
  basarisiz: number;
  toplamMesafeM: number;
  toplamSureSn: number;
  islemde: boolean;
  onKapat: () => void;
  onVardiyayiKapat: (nakit: number, notlar: string) => void;
}) {
  const ozet = useMemo(() => {
    const yonteme: Partial<Record<OdemeYontemi, number>> = {};
    let nakit = 0;
    let toplam = 0;
    for (const t of tahsilatlar) {
      yonteme[t.yontem] = (yonteme[t.yontem] ?? 0) + t.tutar;
      toplam += t.tutar;
      if (NAKDE_SAYILAN.includes(t.yontem)) nakit += t.tutar;
    }
    return { yonteme, nakit, toplam };
  }, [tahsilatlar]);

  const [nakit, setNakit] = useState(() => String(ozet.nakit.toFixed(2)));
  const [notlar, setNotlar] = useState("");
  const [kapatmaAcik, setKapatmaAcik] = useState(false);

  const sayilan = Number(nakit.replace(",", ".")) || 0;
  const fark = sayilan - ozet.nakit;

  // Vardiya süresi canlı ilerlesin (render sırasında saat okumadan).
  const [sure, setSure] = useState(0);
  useEffect(() => {
    const basi = new Date(vardiya.baslangic).getTime();
    const guncelle = () => setSure(Math.max(0, (Date.now() - basi) / 1000));
    guncelle();
    const sayac = setInterval(guncelle, 30_000);
    return () => clearInterval(sayac);
  }, [vardiya.baslangic]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px]"
      onClick={onKapat}
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[90%] w-full overflow-y-auto rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-gri">
              Vardiya özeti
            </p>
            <h2 className="mt-0.5 text-xl font-extrabold tracking-tight">
              {new Date(vardiya.baslangic).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              &apos;den beri · {sureYaz(sure)}
            </h2>
          </div>
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-lg font-bold text-gri"
          >
            ×
          </button>
        </div>

        {/* Sayılar */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Kutu ust="Teslim edilen" alt={String(teslimEdilen)} />
          <Kutu ust="Teslim edilemeyen" alt={String(basarisiz)} uyari={basarisiz > 0} />
          <Kutu ust="Yol" alt={mesafeYaz(toplamMesafeM)} />
          <Kutu ust="Sürüş" alt={sureYaz(toplamSureSn)} />
        </div>

        {/* Tahsilat dökümü */}
        <p className="mb-2 mt-5 text-[11px] font-black uppercase tracking-wider text-gri">
          Tahsilat · {tahsilatlar.length} kayıt
        </p>
        <ul className="divide-y divide-cizgi overflow-hidden rounded-[20px] border border-cizgi bg-yuzey">
          {(Object.keys(ozet.yonteme) as OdemeYontemi[]).map((y) => (
            <li key={y} className="flex items-center justify-between px-4 py-3">
              <span className="text-[14px] font-bold">{ODEME_ETIKET[y]}</span>
              <span className="text-[15px] font-black">
                {para(ozet.yonteme[y] ?? 0)}
              </span>
            </li>
          ))}
          {tahsilatlar.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gri">
              Henüz tahsilat yok.
            </li>
          )}
          <li className="flex items-center justify-between bg-yuzey2 px-4 py-3">
            <span className="text-[13px] font-black uppercase tracking-wide text-gri">
              Toplam
            </span>
            <span className="text-[17px] font-black">{para(ozet.toplam)}</span>
          </li>
        </ul>

        {/* Kasa teslimi */}
        {!kapatmaAcik ? (
          <button
            onClick={() => setKapatmaAcik(true)}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-hap bg-kontrast text-[15px] font-black text-white"
          >
            Vardiyayı bitir · Kasayı teslim et
          </button>
        ) : (
          <div className="mt-5 rounded-[22px] border border-cizgi bg-yuzey p-4">
            <p className="text-[12px] font-bold text-gri">
              Kasaya teslim edilen nakit
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={nakit}
                onChange={(e) => setNakit(e.target.value)}
                className="h-14 flex-1 rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[19px] font-black outline-none focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12"
              />
              <span className="text-[19px] font-black text-gri">₺</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-[12px] font-semibold">
              <span className="text-gri">
                Beklenen nakit {para(ozet.nakit)}
              </span>
              {Math.abs(fark) > 0.009 && (
                <span className={fark > 0 ? "text-turuncu" : "text-kirmizi"}>
                  {fark > 0 ? "Fazla" : "Eksik"} {para(Math.abs(fark))}
                </span>
              )}
            </div>

            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              rows={2}
              placeholder="Fark varsa açıklama…"
              className="mt-3 w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[14px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
            />

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() => onVardiyayiKapat(sayilan, notlar)}
              className="mt-3 flex h-14 w-full items-center justify-center rounded-hap bg-kirmizi text-[15px] font-black text-white shadow-kirmizi disabled:opacity-60"
            >
              {islemde ? "Kapatılıyor…" : "Vardiyayı kapat"}
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Kutu({
  ust,
  alt,
  uyari,
}: {
  ust: string;
  alt: string;
  uyari?: boolean;
}) {
  return (
    <div
      className={`rounded-[18px] border p-3 ${
        uyari ? "border-turuncu/40 bg-turuncu/10" : "border-cizgi bg-yuzey"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-gri">
        {ust}
      </p>
      <p className="mt-0.5 text-[19px] font-black">{alt}</p>
    </div>
  );
}
