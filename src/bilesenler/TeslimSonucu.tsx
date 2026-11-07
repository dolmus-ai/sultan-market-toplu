"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SEBEP_ETIKET, para, paraAlinirMi } from "@/lib/bicim";
import { fotoKucult } from "@/lib/foto";
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
      /** İsteğe bağlı teslim fotoğrafı. */
      foto?: Blob | null;
    }
  | {
      tur: "teslim";
      odemeAlindi: false;
      /** Ödemenin alınamadığı kişi — kapıdaki kişi müşteriden farklı olabiliyor. */
      alinmayanKisi: string;
      not: string;
      foto?: Blob | null;
    }
  | {
      tur: "basarisiz";
      sebep: BasarisizlikSebebi;
      not: string;
      yarinTekrar: boolean;
      foto?: Blob | null;
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

  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);

  const [sebep, setSebep] = useState<BasarisizlikSebebi>("adreste_yok");
  const [not, setNot] = useState("");
  const [yarinTekrar, setYarinTekrar] = useState(true);

  const sayisalTutar = Number(tutar.replace(/\s/g, "").replace(",", ".")) || 0;
  const fark = sayisalTutar - (siparis.tutar ?? 0);
  const paraAlinir = yontem ? paraAlinirMi(yontem, yontemler) : true;
  const musteriAdi = siparis.musteri?.ad?.trim() ?? "";
  // Veresiyede para el değiştirmiyor: tutar borç, kişi borcu üstlenen.
  const veresiye = yontem === "veresiye";

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

  // Hızlı kapat: tutar siparişin tamamı, ödeyen müşterinin kendisi. Tek
  // dokunuşla teslim kapanır; farklı bir durum varsa aşağıdaki form duruyor.
  const hizliKapatilir = (siparis.tutar ?? 0) > 0 && musteriAdi !== "";
  const hizliYontemler = [...yontemler]
    .sort((a, b) =>
      a.kod === siparis.odeme_yontemi ? -1 : b.kod === siparis.odeme_yontemi ? 1 : 0,
    )
    .slice(0, 4);

  function hizliKapat(kod: OdemeYontemi) {
    onOnay({
      tur: "teslim",
      odemeAlindi: true,
      tahsilat: { tutar: siparis.tutar, yontem: kod },
      kasaya: paraAlinirMi(kod, yontemler),
      odeyen: musteriAdi,
      foto: foto?.blob ?? null,
    });
  }

  function kapat() {
    // Zorunlu kipte dışarı dokunmak ekranı kapatmaz.
    if (!zorunlu) onKapat();
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

        <p className="text-[10.5px] font-black uppercase tracking-wider text-gri">
          {mod === "teslim" ? "Teslimatı kapat" : "Teslim edilemedi"}
        </p>
        <h2 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
          {siparis.musteri?.ad ?? "Müşteri"}
        </h2>
        {zorunlu && mod === "teslim" && (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-yesil/10 px-3 py-2.5 text-[11px] font-bold leading-snug text-yesil">
            <span className="text-[12.5px] leading-none">✓</span>
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
                  className="relative flex-1 rounded-hap px-3 py-2.5 text-[12.5px] font-black"
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
                  {hizliKapatilir && (
                    <div className="mt-3 rounded-2xl border border-yesil/30 bg-yesil/5 p-2.5">
                      <p className="text-[11px] font-bold text-gri">
                        Hızlı kapat · {para(siparis.tutar)} tamamı ·{" "}
                        {musteriAdi}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {hizliYontemler.map((y) => (
                          <motion.button
                            key={y.kod}
                            whileTap={{ scale: 0.96 }}
                            disabled={islemde}
                            onClick={() => hizliKapat(y.kod)}
                            className={`min-h-9 rounded-hap px-3.5 text-[12px] font-black disabled:opacity-60 ${
                              y.kod === "veresiye"
                                ? "bg-turuncu text-white"
                                : "bg-yesil text-white"
                            }`}
                          >
                            ✓ {y.kod === "veresiye" ? "Veresiye yaz" : `${y.ad} aldım`}
                          </motion.button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10.5px] font-semibold text-gri">
                        Farklı tutar ya da kişi için aşağıyı doldurun.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gri">
                      Ödeme yöntemi <Zorunlu />
                      {planlanan && (
                        <span className="ml-1 font-semibold">
                          · planlanan {planlanan.ad}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {yontemler.map((y) => (
                      <motion.div key={y.kod} layout className="relative">
                        <button
                          onClick={() => setYontem(y.kod)}
                          aria-pressed={yontem === y.kod}
                          className={`min-h-11 rounded-hap px-4 py-2 text-[12.5px] font-bold transition-colors ${
                            yontem === y.kod
                              ? "bg-kontrast text-white"
                              : denendi && !yontem
                                ? "bg-kirmizi-sis text-kirmizi-koyu"
                                : "bg-yuzey2 text-gri"
                          }`}
                        >
                          {y.ad}
                        </button>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold text-gri">
                      {veresiye ? "Veresiye tutarı" : "Ödenen tutar"} <Zorunlu />
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
                        className={`h-14 min-w-0 flex-1 rounded-2xl border bg-yuzey2 px-4 text-[17px] font-black outline-none placeholder:text-gri/40 focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12 ${
                          denendi && sayisalTutar <= 0 ? "border-kirmizi" : "border-cizgi"
                        }`}
                      />
                      <span className="text-[17px] font-black text-gri">₺</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
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
                      <p className="mt-2 rounded-2xl bg-yuzey2 px-4 py-2.5 text-[11px] font-semibold text-gri">
                        {veresiye
                          ? "Para alınmadı; tutar bu kişinin borcu olarak yazılır, kasaya işlenmez."
                          : "Bu yöntemde kurye elden para almıyor; tutar kayda geçer ama kasaya işlenmez."}
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold text-gri">
                      {veresiye ? "Veresiye yazılan kişi" : "Ödemeyi yapan"} <Zorunlu />
                    </p>
                    <input
                      value={odeyen}
                      onChange={(e) => setOdeyen(e.target.value)}
                      placeholder={
                        veresiye ? "Borcu üstlenen kişinin adı" : "Ödemeyi yapan kişinin adı"
                      }
                      aria-label="Ödemeyi yapan"
                      autoComplete="off"
                      aria-invalid={denendi && !odeyen.trim()}
                      className={`h-12 w-full rounded-2xl border bg-yuzey2 px-4 text-[14px] font-bold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey ${
                        denendi && !odeyen.trim() ? "border-kirmizi" : "border-cizgi"
                      }`}
                    />
                    {musteriAdi && odeyen.trim() !== musteriAdi && (
                      <button
                        onClick={() => setOdeyen(musteriAdi)}
                        className="mt-2 rounded-hap bg-yuzey2 px-3 py-1.5 text-[11px] font-semibold text-gri hover:bg-cizgi"
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
                    <p className="mb-2 text-[11px] font-bold text-gri">
                      Kimden alınamadı <Zorunlu />
                    </p>
                    <input
                      value={kisi}
                      onChange={(e) => setKisi(e.target.value)}
                      placeholder="Kapıdaki kişinin adı"
                      className="h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[14px] font-bold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-bold text-gri">
                      Açıklama <Zorunlu />
                    </p>
                    <textarea
                      value={odemeNotu}
                      onChange={(e) => setOdemeNotu(e.target.value)}
                      rows={3}
                      placeholder="Örn. üzeri yoktu, akşam kasadan ödeyecek"
                      className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[14px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
                    />
                  </div>

                  <p className="mt-3 rounded-2xl bg-yuzey2 px-4 py-3 text-[12px] font-semibold text-gri">
                    Teslimat tamamlanacak, {para(siparis.tutar ?? 0)} borç olarak
                    kaydedilecek.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <FotoAlani foto={foto} onFoto={setFoto} />

            <AnimatePresence initial={false}>
              {denendi && eksikler.length > 0 && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="mt-4 overflow-hidden rounded-2xl bg-kirmizi-sis px-4 py-2.5 text-[12px] font-bold text-kirmizi-koyu"
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
                        foto: foto?.blob ?? null,
                      }
                    : {
                        tur: "teslim",
                        odemeAlindi: false,
                        alinmayanKisi: kisi.trim(),
                        not: odemeNotu.trim(),
                        foto: foto?.blob ?? null,
                      },
                );
              }}
              className={`mt-4 flex h-14 w-full items-center justify-center rounded-hap text-[13.5px] font-black text-white transition-colors disabled:opacity-60 ${
                eksikler.length > 0 ? "bg-yesil/55" : "bg-yesil"
              }`}
            >
              {islemde ? "Kaydediliyor…" : "✓ Kaydet ve teslimi tamamla"}
            </motion.button>
          </>
        ) : (
          <>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold text-gri">Sebep</p>
              <div className="flex flex-wrap gap-1.5">
                {SEBEPLER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSebep(s)}
                    className={`rounded-hap px-3.5 py-2 text-[12px] font-bold transition-colors ${
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
              <p className="mb-2 text-[11px] font-bold text-gri">
                Not (isteğe bağlı)
              </p>
              <textarea
                value={not}
                onChange={(e) => setNot(e.target.value)}
                rows={2}
                placeholder="Örn. komşuya bıraktım, akşam tekrar denesinler"
                className="w-full resize-none rounded-2xl border border-cizgi bg-yuzey2 px-4 py-3 text-[12.5px] font-medium outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey"
              />
            </div>

            <FotoAlani foto={foto} onFoto={setFoto} />

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
              <span className="flex-1 text-[12.5px] font-bold">
                Yarın tekrar denensin
              </span>
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() =>
                onOnay({
                  tur: "basarisiz",
                  sebep,
                  not,
                  yarinTekrar,
                  foto: foto?.blob ?? null,
                })
              }
              className="mt-5 flex h-14 w-full items-center justify-center rounded-hap bg-turuncu text-[13.5px] font-black text-white disabled:opacity-60"
            >
              {islemde ? "Kaydediliyor…" : "Kaydet"}
            </motion.button>
          </>
        )}

        {zorunlu && onGeriAl ? (
          <button
            onClick={onGeriAl}
            disabled={islemde}
            className="mt-2 flex min-h-12 w-full flex-col items-center justify-center rounded-hap py-1 text-[12.5px] font-bold text-kirmizi disabled:opacity-60"
          >
            Teslimi geri al
            <span className="text-[10.5px] font-semibold text-gri">
              Pin eski rengine döner, teslim edilmemiş sayılır
            </span>
          </button>
        ) : (
          <button
            onClick={onKapat}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-hap text-[12.5px] font-bold text-gri"
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

/** İsteğe bağlı teslim fotoğrafı: kamera açılır, küçültülüp önizlenir. */
function FotoAlani({
  foto,
  onFoto,
}: {
  foto: { blob: Blob; url: string } | null;
  onFoto: (f: { blob: Blob; url: string } | null) => void;
}) {
  const girdi = useRef<HTMLInputElement>(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);

  async function secildi(dosya: File | undefined) {
    if (!dosya) return;
    setHazirlaniyor(true);
    try {
      const blob = await fotoKucult(dosya);
      if (foto) URL.revokeObjectURL(foto.url);
      onFoto({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setHazirlaniyor(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        ref={girdi}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void secildi(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {foto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto.url}
            alt="Teslim fotoğrafı"
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
          <span className="flex-1 text-[11px] font-bold text-gri">
            Fotoğraf eklendi
          </span>
          <button
            onClick={() => {
              URL.revokeObjectURL(foto.url);
              onFoto(null);
            }}
            className="rounded-hap bg-yuzey2 px-3 py-1.5 text-[11px] font-bold text-gri"
          >
            Kaldır
          </button>
        </>
      ) : (
        <button
          onClick={() => girdi.current?.click()}
          disabled={hazirlaniyor}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-cizgi text-[12px] font-bold text-gri disabled:opacity-60"
        >
          📷 {hazirlaniyor ? "Hazırlanıyor…" : "Fotoğraf ekle (isteğe bağlı)"}
        </button>
      )}
    </div>
  );
}
