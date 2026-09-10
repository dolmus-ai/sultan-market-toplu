"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SEBEP_ETIKET, para, paraAlinirMi } from "@/lib/bicim";
import type {
  BasarisizlikSebebi,
  OdemeYontemi,
  OdemeYontemiTanimi,
  Siparis,
} from "@/lib/tipler";

export type TeslimSonuc =
  | {
      tur: "teslim";
      odemeAlindi: true;
      tahsilat: { tutar: number; yontem: OdemeYontemi };
    }
  | {
      tur: "teslim";
      odemeAlindi: false;
      /** Ödemenin alınamadığı kişi — kapıdaki kişi müşteriden farklı olabiliyor. */
      alinmayanKisi: string;
      not: string;
    }
  | {
      tur: "basarisiz";
      sebep: BasarisizlikSebebi;
      not: string;
      yarinTekrar: boolean;
    };

const SEBEPLER: BasarisizlikSebebi[] = [
  "adreste_yok",
  "kapi_acilmadi",
  "musteri_reddetti",
  "adres_yanlis",
  "odeme_yok",
  "diger",
];

export default function TeslimSonucu({
  siparis,
  mod,
  islemde,
  yontemler,
  baslangicOdeme = "alindi",
  onYontemEkle,
  onYontemKaldir,
  onKapat,
  onOnay,
}: {
  siparis: Siparis;
  mod: "teslim" | "basarisiz";
  islemde: boolean;
  /** Listelenecek aktif ödeme yöntemleri. */
  yontemler: OdemeYontemiTanimi[];
  /** Ekran hangi seçenekle açılsın — haritadan "Alınamadı" ile gelinebiliyor. */
  baslangicOdeme?: "alindi" | "alinmadi";
  onYontemEkle: (ad: string) => Promise<void>;
  onYontemKaldir: (kod: string) => Promise<void>;
  onKapat: () => void;
  onOnay: (sonuc: TeslimSonuc) => void;
}) {
  const varsayilanYontem =
    siparis.odeme_yontemi && yontemler.some((y) => y.kod === siparis.odeme_yontemi)
      ? siparis.odeme_yontemi
      : (yontemler[0]?.kod ?? "nakit");

  const [odemeAlindi, setOdemeAlindi] = useState(baslangicOdeme === "alindi");
  const [yontem, setYontem] = useState<OdemeYontemi>(varsayilanYontem);
  const [tutar, setTutar] = useState(String(siparis.tutar ?? 0));
  const [kisi, setKisi] = useState(siparis.musteri?.ad ?? "");
  const [odemeNotu, setOdemeNotu] = useState("");

  const [duzenle, setDuzenle] = useState(false);
  const [yeniYontem, setYeniYontem] = useState("");
  const [yontemIslemde, setYontemIslemde] = useState(false);

  const [sebep, setSebep] = useState<BasarisizlikSebebi>("adreste_yok");
  const [not, setNot] = useState("");
  const [yarinTekrar, setYarinTekrar] = useState(true);

  const sayisalTutar = Number(tutar.replace(",", ".")) || 0;
  const fark = sayisalTutar - (siparis.tutar ?? 0);
  const paraAlinir = paraAlinirMi(yontem, yontemler);

  async function yontemEkle() {
    const ad = yeniYontem.trim();
    if (!ad || yontemIslemde) return;
    setYontemIslemde(true);
    try {
      await onYontemEkle(ad);
      setYeniYontem("");
    } finally {
      setYontemIslemde(false);
    }
  }

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
            {/* Ödeme alındı mı — akışın ilk kararı */}
            <div className="relative mt-4 flex gap-1 rounded-hap bg-yuzey2 p-1">
              {[
                { deger: true, etiket: "Ödeme alındı" },
                { deger: false, etiket: "Alınamadı" },
              ].map((s) => (
                <button
                  key={String(s.deger)}
                  onClick={() => setOdemeAlindi(s.deger)}
                  className="relative flex-1 rounded-hap px-3 py-2.5 text-[14px] font-black"
                >
                  {odemeAlindi === s.deger && (
                    <motion.span
                      layoutId="odeme-secim"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      className={`absolute inset-0 rounded-hap ${
                        s.deger ? "bg-yesil" : "bg-turuncu"
                      }`}
                    />
                  )}
                  <span
                    className={`relative ${
                      odemeAlindi === s.deger ? "text-white" : "text-gri"
                    }`}
                  >
                    {s.etiket}
                  </span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {odemeAlindi ? (
                <motion.div
                  key="alindi"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-[12px] font-bold text-gri">
                      Ödeme yöntemi
                    </p>
                    <button
                      onClick={() => setDuzenle(!duzenle)}
                      className="text-[12px] font-bold text-kirmizi"
                    >
                      {duzenle ? "Bitti" : "Düzenle"}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {yontemler.map((y) => (
                      <motion.div key={y.kod} layout className="relative">
                        <button
                          onClick={() => setYontem(y.kod)}
                          className={`rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                            yontem === y.kod
                              ? "bg-kontrast text-white"
                              : "bg-yuzey2 text-gri"
                          }`}
                        >
                          {y.ad}
                        </button>
                        {duzenle && yontemler.length > 1 && (
                          <motion.button
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            onClick={() => onYontemKaldir(y.kod)}
                            aria-label={`${y.ad} yöntemini kaldır`}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-kirmizi text-[11px] font-black text-white"
                          >
                            ×
                          </motion.button>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  <AnimatePresence initial={false}>
                    {duzenle && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex gap-2">
                          <input
                            value={yeniYontem}
                            onChange={(e) => setYeniYontem(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void yontemEkle();
                            }}
                            placeholder="Yeni yöntem — örn. Havale"
                            className="h-11 flex-1 rounded-2xl border border-cizgi bg-yuzey2 px-3.5 text-[14px] font-semibold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                          />
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => void yontemEkle()}
                            disabled={!yeniYontem.trim() || yontemIslemde}
                            className="h-11 shrink-0 rounded-2xl bg-kontrast px-4 text-[14px] font-black text-white disabled:opacity-40"
                          >
                            Ekle
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
                          <span className={fark > 0 ? "text-turuncu" : "text-kirmizi"}>
                            {fark > 0 ? "Fazla" : "Eksik"} {para(Math.abs(fark))}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl bg-yuzey2 px-4 py-3 text-[13px] font-semibold text-gri">
                      Bu yöntemde kurye elden para almıyor; kasaya işlenmez.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="alinmadi"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="mt-4">
                    <p className="mb-2 text-[12px] font-bold text-gri">
                      Kimden alınamadı
                    </p>
                    <input
                      value={kisi}
                      onChange={(e) => setKisi(e.target.value)}
                      placeholder="Kapıdaki kişinin adı"
                      className="h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[15px] font-bold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-[12px] font-bold text-gri">
                      Açıklama
                    </p>
                    <textarea
                      value={odemeNotu}
                      onChange={(e) => setOdemeNotu(e.target.value)}
                      rows={3}
                      placeholder="Örn. üzeri yoktu, akşam kasadan ödeyecek"
                      className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[14px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <p className="mt-3 rounded-2xl bg-yuzey2 px-4 py-3 text-[13px] font-semibold text-gri">
                    Teslimat tamamlanacak, {para(siparis.tutar ?? 0)} borç olarak
                    kaydedilecek.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde || (!odemeAlindi && !kisi.trim())}
              onClick={() =>
                onOnay(
                  odemeAlindi
                    ? {
                        tur: "teslim",
                        odemeAlindi: true,
                        tahsilat: {
                          tutar: paraAlinir ? sayisalTutar : 0,
                          yontem,
                        },
                      }
                    : {
                        tur: "teslim",
                        odemeAlindi: false,
                        alinmayanKisi: kisi.trim(),
                        not: odemeNotu.trim(),
                      },
                )
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
