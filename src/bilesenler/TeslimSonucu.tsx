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
      /** Tahsil edilen tutar ve yöntem — kasaya yalnızca `kasaya` ise işlenir. */
      tahsilat: { tutar: number; yontem: OdemeYontemi };
      /** Yöntem kuryenin elden para aldığı türden mi (nakit, kart). */
      kasaya: boolean;
      /** Ödemeyi yapan kişi. */
      odeyen: string;
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
  zorunlu = false,
  onGeriAl,
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
  /**
   * Pin haritada yeşile döndü: ödeme bilgisi girilmeden ekran kapanmaz.
   * Tek çıkış `onGeriAl` — teslim işareti kalkar, pin eski rengine döner.
   */
  zorunlu?: boolean;
  onGeriAl?: () => void;
}) {
  const planlanan = yontemler.find((y) => y.kod === siparis.odeme_yontemi) ?? null;

  const [odemeAlindi, setOdemeAlindi] = useState(baslangicOdeme === "alindi");
  // Yöntem, tutar ve ödeyen bilerek boş başlıyor: kurye her teslimatta
  // kendisi seçip yazsın. Planlanan değerler tek dokunuşluk öneri olarak duruyor.
  const [yontem, setYontem] = useState<OdemeYontemi>("");
  const [tutar, setTutar] = useState("");
  const [odeyen, setOdeyen] = useState("");
  const [kisi, setKisi] = useState("");
  const [denendi, setDenendi] = useState(false);
  const [odemeNotu, setOdemeNotu] = useState("");

  const [duzenle, setDuzenle] = useState(false);
  const [yeniYontem, setYeniYontem] = useState("");
  const [yontemIslemde, setYontemIslemde] = useState(false);

  const [sebep, setSebep] = useState<BasarisizlikSebebi>("adreste_yok");
  const [not, setNot] = useState("");
  const [yarinTekrar, setYarinTekrar] = useState(true);

  const sayisalTutar = Number(tutar.replace(/\s/g, "").replace(",", ".")) || 0;
  const fark = sayisalTutar - (siparis.tutar ?? 0);
  const paraAlinir = yontem ? paraAlinirMi(yontem, yontemler) : true;
  const musteriAdi = siparis.musteri?.ad?.trim() ?? "";

  const eksikler = odemeAlindi
    ? [
        !yontem && "ödeme yöntemi",
        sayisalTutar <= 0 && "tutar",
        !odeyen.trim() && "ödemeyi yapan",
      ].filter((x): x is string => !!x)
    : [
        !kisi.trim() && "kimden alınamadığı",
        !odemeNotu.trim() && "açıklama",
      ].filter((x): x is string => !!x);

  function kapat() {
    // Zorunlu kipte dışarı dokunmak ekranı kapatmaz.
    if (!zorunlu) onKapat();
  }

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
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
      onClick={kapat}
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ type: "spring", stiffness: 400, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

        <p className="text-[11px] font-black uppercase tracking-wider text-gri">
          {mod === "teslim" ? "Teslimatı kapat" : "Teslim edilemedi"}
        </p>
        <h2 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
          {siparis.musteri?.ad ?? "Müşteri"}
        </h2>
        {zorunlu && mod === "teslim" && (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-yesil/10 px-3 py-2.5 text-[12px] font-bold leading-snug text-yesil">
            <span className="text-[14px] leading-none">✓</span>
            Teslim işaretlendi. Ödeme bilgisini girmeden haritaya dönülemez.
          </p>
        )}

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
                      Ödeme yöntemi <Zorunlu />
                      {planlanan && (
                        <span className="ml-1 font-semibold">
                          · planlanan {planlanan.ad}
                        </span>
                      )}
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
                          aria-pressed={yontem === y.kod}
                          className={`min-h-11 rounded-hap px-4 py-2 text-[14px] font-bold transition-colors ${
                            yontem === y.kod
                              ? "bg-kontrast text-white"
                              : denendi && !yontem
                                ? "bg-kirmizi-sis text-kirmizi-koyu"
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

                  <div className="mt-4">
                    <p className="mb-2 text-[12px] font-bold text-gri">
                      Ödenen tutar <Zorunlu />
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={tutar}
                        onChange={(e) => setTutar(e.target.value)}
                        placeholder="0,00"
                        aria-label="Ödenen tutar"
                        aria-invalid={denendi && sayisalTutar <= 0}
                        className={`h-14 min-w-0 flex-1 rounded-2xl border bg-yuzey2 px-4 text-[19px] font-black outline-none placeholder:text-gri/40 focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12 ${
                          denendi && sayisalTutar <= 0 ? "border-kirmizi" : "border-cizgi"
                        }`}
                      />
                      <span className="text-[19px] font-black text-gri">₺</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold">
                      {(siparis.tutar ?? 0) > 0 ? (
                        <button
                          onClick={() => setTutar(String(siparis.tutar).replace(".", ","))}
                          className="rounded-hap bg-yuzey2 px-3 py-1.5 text-gri hover:bg-cizgi"
                        >
                          Sipariş tutarı {para(siparis.tutar ?? 0)}
                        </button>
                      ) : (
                        <span className="text-gri">Siparişte tutar yok — ödeneni yazın</span>
                      )}
                      {(siparis.tutar ?? 0) > 0 && sayisalTutar > 0 && Math.abs(fark) > 0.009 && (
                        <span className={fark > 0 ? "text-turuncu" : "text-kirmizi"}>
                          {fark > 0 ? "Fazla" : "Eksik"} {para(Math.abs(fark))}
                        </span>
                      )}
                    </div>
                    {yontem && !paraAlinir && (
                      <p className="mt-2 rounded-2xl bg-yuzey2 px-4 py-2.5 text-[12px] font-semibold text-gri">
                        Bu yöntemde kurye elden para almıyor; tutar kayda
                        geçer ama kasaya işlenmez.
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-[12px] font-bold text-gri">
                      Ödemeyi yapan <Zorunlu />
                    </p>
                    <input
                      value={odeyen}
                      onChange={(e) => setOdeyen(e.target.value)}
                      placeholder="Ödemeyi yapan kişinin adı"
                      aria-label="Ödemeyi yapan"
                      autoComplete="off"
                      aria-invalid={denendi && !odeyen.trim()}
                      className={`h-12 w-full rounded-2xl border bg-yuzey2 px-4 text-[16px] font-bold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey ${
                        denendi && !odeyen.trim() ? "border-kirmizi" : "border-cizgi"
                      }`}
                    />
                    {musteriAdi && odeyen.trim() !== musteriAdi && (
                      <button
                        onClick={() => setOdeyen(musteriAdi)}
                        className="mt-2 rounded-hap bg-yuzey2 px-3 py-1.5 text-[12px] font-semibold text-gri hover:bg-cizgi"
                      >
                        Müşterinin kendisi · {musteriAdi}
                      </button>
                    )}
                  </div>
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
                      Kimden alınamadı <Zorunlu />
                    </p>
                    <input
                      value={kisi}
                      onChange={(e) => setKisi(e.target.value)}
                      placeholder="Kapıdaki kişinin adı"
                      className="h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[16px] font-bold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-[12px] font-bold text-gri">
                      Açıklama <Zorunlu />
                    </p>
                    <textarea
                      value={odemeNotu}
                      onChange={(e) => setOdemeNotu(e.target.value)}
                      rows={3}
                      placeholder="Örn. üzeri yoktu, akşam kasadan ödeyecek"
                      className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[16px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <p className="mt-3 rounded-2xl bg-yuzey2 px-4 py-3 text-[13px] font-semibold text-gri">
                    Teslimat tamamlanacak, {para(siparis.tutar ?? 0)} borç olarak
                    kaydedilecek.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {denendi && eksikler.length > 0 && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="mt-4 overflow-hidden rounded-2xl bg-kirmizi-sis px-4 py-2.5 text-[13px] font-bold text-kirmizi-koyu"
                >
                  Eksik: {eksikler.join(", ")}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() => {
                setDenendi(true);
                if (eksikler.length > 0) return;
                onOnay(
                  odemeAlindi
                    ? {
                        tur: "teslim",
                        odemeAlindi: true,
                        tahsilat: { tutar: sayisalTutar, yontem },
                        kasaya: paraAlinir,
                        odeyen: odeyen.trim(),
                      }
                    : {
                        tur: "teslim",
                        odemeAlindi: false,
                        alinmayanKisi: kisi.trim(),
                        not: odemeNotu.trim(),
                      },
                );
              }}
              className={`mt-4 flex h-14 w-full items-center justify-center rounded-hap text-[15px] font-black text-white transition-colors disabled:opacity-60 ${
                eksikler.length > 0 ? "bg-yesil/55" : "bg-yesil"
              }`}
            >
              {islemde ? "Kaydediliyor…" : "✓ Kaydet ve teslimi tamamla"}
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

        {zorunlu && onGeriAl ? (
          <button
            onClick={onGeriAl}
            disabled={islemde}
            className="mt-2 flex min-h-12 w-full flex-col items-center justify-center rounded-hap py-1 text-[14px] font-bold text-kirmizi disabled:opacity-60"
          >
            Teslimi geri al
            <span className="text-[11px] font-semibold text-gri">
              Pin eski rengine döner, teslim edilmemiş sayılır
            </span>
          </button>
        ) : (
          <button
            onClick={onKapat}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-hap text-[14px] font-bold text-gri"
          >
            Vazgeç
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function Zorunlu() {
  return (
    <span className="text-kirmizi" aria-label="zorunlu">
      *
    </span>
  );
}
