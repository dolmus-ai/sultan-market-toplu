"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { ODEME_ETIKET, SEBEP_ETIKET, para } from "@/lib/bicim";
import type {
  BasarisizlikSebebi,
  OdemeYontemi,
  Siparis,
} from "@/lib/tipler";

export type TeslimSonuc =
  | {
      tur: "teslim";
      tahsilat: { tutar: number; yontem: OdemeYontemi } | null;
    }
  | {
      tur: "basarisiz";
      sebep: BasarisizlikSebebi;
      not: string;
      yarinTekrar: boolean;
    };

const ODEME_SECENEKLERI: OdemeYontemi[] = [
  "nakit",
  "kredi_karti",
  "yemek_karti",
  "veresiye",
  "online",
];

const SEBEPLER: BasarisizlikSebebi[] = [
  "adreste_yok",
  "kapi_acilmadi",
  "musteri_reddetti",
  "adres_yanlis",
  "odeme_yok",
  "diger",
];

/** Tahsilat gerektirmeyen ödeme yöntemleri — kurye elden para almaz. */
const PARA_ALINMAZ: OdemeYontemi[] = ["veresiye", "online"];

export default function TeslimSonucu({
  siparis,
  mod,
  islemde,
  onKapat,
  onOnay,
}: {
  siparis: Siparis;
  mod: "teslim" | "basarisiz";
  islemde: boolean;
  onKapat: () => void;
  onOnay: (sonuc: TeslimSonuc) => void;
}) {
  const [yontem, setYontem] = useState<OdemeYontemi>(
    siparis.odeme_yontemi ?? "nakit",
  );
  const [tutar, setTutar] = useState(String(siparis.tutar ?? 0));
  const [sebep, setSebep] = useState<BasarisizlikSebebi>("adreste_yok");
  const [not, setNot] = useState("");
  const [yarinTekrar, setYarinTekrar] = useState(true);

  const paraAlinir = !PARA_ALINMAZ.includes(yontem);
  const sayisalTutar = Number(tutar.replace(",", ".")) || 0;
  const fark = sayisalTutar - (siparis.tutar ?? 0);

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
        className="ince-kaydirma max-h-[88%] w-full overflow-y-auto rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

        <p className="text-[11px] font-black uppercase tracking-wider text-gri">
          {mod === "teslim" ? "Teslimatı kapat" : "Teslim edilemedi"}
        </p>
        <h2 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
          {siparis.musteri?.ad ?? "Müşteri"}
        </h2>

        {mod === "teslim" ? (
          <>
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-bold text-gri">
                Ödeme yöntemi
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ODEME_SECENEKLERI.map((y) => (
                  <button
                    key={y}
                    onClick={() => setYontem(y)}
                    className={`rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      yontem === y
                        ? "bg-kontrast text-white"
                        : "bg-yuzey2 text-gri"
                    }`}
                  >
                    {ODEME_ETIKET[y]}
                  </button>
                ))}
              </div>
            </div>

            {paraAlinir ? (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-bold text-gri">
                  Tahsil edilen tutar
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tutar}
                    onChange={(e) => setTutar(e.target.value)}
                    className="h-14 flex-1 rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[19px] font-black outline-none focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12"
                  />
                  <span className="text-[19px] font-black text-gri">₺</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] font-semibold">
                  <span className="text-gri">
                    Sipariş tutarı {para(siparis.tutar ?? 0)}
                  </span>
                  {Math.abs(fark) > 0.009 && (
                    <span
                      className={fark > 0 ? "text-turuncu" : "text-kirmizi"}
                    >
                      {fark > 0 ? "Fazla" : "Eksik"} {para(Math.abs(fark))}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-yuzey2 px-4 py-3 text-[13px] font-semibold text-gri">
                {yontem === "veresiye"
                  ? "Veresiye — kasadan takip edilecek, kurye para almıyor."
                  : "Online ödenmiş — kurye para almıyor."}
              </p>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() =>
                onOnay({
                  tur: "teslim",
                  tahsilat: paraAlinir
                    ? { tutar: sayisalTutar, yontem }
                    : { tutar: 0, yontem },
                })
              }
              className="mt-5 flex h-14 w-full items-center justify-center rounded-hap bg-yesil text-[15px] font-black text-white disabled:opacity-60"
            >
              {islemde ? "Kaydediliyor…" : "✓ Teslim ettim"}
            </motion.button>
          </>
        ) : (
          <>
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-bold text-gri">Sebep</p>
              <div className="flex flex-wrap gap-1.5">
                {SEBEPLER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSebep(s)}
                    className={`rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      sebep === s
                        ? "bg-kontrast text-white"
                        : "bg-yuzey2 text-gri"
                    }`}
                  >
                    {SEBEP_ETIKET[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[12px] font-bold text-gri">
                Not (isteğe bağlı)
              </p>
              <textarea
                value={not}
                onChange={(e) => setNot(e.target.value)}
                rows={2}
                placeholder="Örn. komşuya bıraktım, akşam tekrar denesinler"
                className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[14px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
              />
            </div>

            <button
              onClick={() => setYarinTekrar(!yarinTekrar)}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-cizgi bg-yuzey px-4 py-3 text-left"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                  yarinTekrar
                    ? "border-kirmizi bg-kirmizi text-white"
                    : "border-cizgi"
                }`}
              >
                {yarinTekrar && <span className="text-xs font-black">✓</span>}
              </span>
              <span className="flex-1 text-[14px] font-bold">
                Yarın tekrar denensin
              </span>
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() =>
                onOnay({ tur: "basarisiz", sebep, not, yarinTekrar })
              }
              className="mt-5 flex h-14 w-full items-center justify-center rounded-hap bg-turuncu text-[15px] font-black text-white disabled:opacity-60"
            >
              {islemde ? "Kaydediliyor…" : "Kaydet"}
            </motion.button>
          </>
        )}

        <button
          onClick={onKapat}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-hap text-[14px] font-bold text-gri"
        >
          Vazgeç
        </button>
      </motion.div>
    </motion.div>
  );
}
