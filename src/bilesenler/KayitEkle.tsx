"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { GUN_KISA, bugununTarihi, para } from "@/lib/bicim";
import {
  abonelikDuzenle,
  abonelikEkle,
  adresEkle,
  adresiGeokodla,
  musteriAdresleri,
  musteriEkle,
  musterileriAra,
  sepetDuzenle,
  sepetEkle,
  siparisDuzenle,
  siparisEkle,
} from "@/lib/veri";
import type {
  Abonelik,
  Adres,
  AbonelikSikligi,
  Musteri,
  OdemeYontemiTanimi,
  Sepet,
  Siparis,
} from "@/lib/tipler";

export type EklenenKayit =
  | { tur: "teslimat"; siparis: Siparis }
  | { tur: "abonelik"; abonelik: Abonelik }
  | { tur: "sepet"; sepet: Sepet };

/** Düzenleme kipinde açılırken verilen mevcut kayıt. */
export type DuzenlenenKayit = EklenenKayit;

type Adim = "musteri" | "adres" | "tur" | "detay";
type KayitTuru = "teslimat" | "abonelik" | "sepet";

const ADIM_SIRASI: Adim[] = ["musteri", "adres", "tur", "detay"];

const SIKLIKLAR: { deger: AbonelikSikligi; etiket: string }[] = [
  { deger: "gunluk", etiket: "Her gün" },
  { deger: "haftalik", etiket: "Haftalık" },
  { deger: "iki_haftalik", etiket: "İki haftada bir" },
  { deger: "aylik", etiket: "Aylık" },
];

const TURLER: { deger: KayitTuru; baslik: string; alt: string; simge: string }[] = [
  {
    deger: "teslimat",
    baslik: "Teslimat",
    alt: "Tek seferlik sipariş, bugüne ya da ileri bir güne",
    simge: "📦",
  },
  {
    deger: "abonelik",
    baslik: "Abonelik",
    alt: "Belirli günlerde kendiliğinden sipariş üretir",
    simge: "🔁",
  },
  {
    deger: "sepet",
    baslik: "Sepet",
    alt: "Müşteri toplamaya devam ediyor, henüz sipariş değil",
    simge: "🧺",
  },
];

export default function KayitEkle({
  db,
  yontemler,
  kuryeKonumu,
  duzenlenen,
  onKapat,
  onEklendi,
}: {
  db: SupabaseClient;
  yontemler: OdemeYontemiTanimi[];
  /** Kuryenin anlık konumu — adres işaretlemek için. */
  kuryeKonumu: { lat: number; lng: number } | null;
  /** Doluysa akış doğrudan detay adımında, düzenleme kipinde açılır. */
  duzenlenen?: DuzenlenenKayit | null;
  onKapat: () => void;
  onEklendi: (kayit: EklenenKayit, mesaj: string) => void;
}) {
  const duzenleme = duzenlenen != null;
  const [adim, setAdim] = useState<Adim>(duzenlenen ? "detay" : "musteri");
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /* --- Müşteri --- */
  const [arama, setArama] = useState("");
  const [sonuclar, setSonuclar] = useState<Musteri[]>([]);
  const [musteri, setMusteri] = useState<Musteri | null>(null);
  const [yeniMusteri, setYeniMusteri] = useState({ ad: "", telefon: "", notlar: "" });
  const [musteriModu, setMusteriModu] = useState<"ara" | "yeni">("ara");

  /* --- Adres --- */
  const [adresler, setAdresler] = useState<Adres[]>([]);
  const [adres, setAdres] = useState<Adres | null>(null);
  const [yeniAdres, setYeniAdres] = useState({
    baslik: "Ev",
    adres_metni: "",
    bina: "",
    kat: "",
    daire: "",
    tarif: "",
  });
  const [konum, setKonum] = useState<{ lat: number; lng: number } | null>(null);

  /* --- Kayıt --- */
  const [tur, setTur] = useState<KayitTuru>(duzenlenen?.tur ?? "teslimat");
  const [tutar, setTutar] = useState(() => {
    if (duzenlenen?.tur === "teslimat") return String(duzenlenen.siparis.tutar);
    if (duzenlenen?.tur === "abonelik") return String(duzenlenen.abonelik.tutar);
    if (duzenlenen?.tur === "sepet") return String(duzenlenen.sepet.tutar);
    return "";
  });
  const [tarih, setTarih] = useState(
    duzenlenen?.tur === "teslimat"
      ? duzenlenen.siparis.planlanan_tarih
      : bugununTarihi(),
  );
  const [saat, setSaat] = useState(() => {
    if (duzenlenen?.tur === "teslimat")
      return duzenlenen.siparis.planlanan_saat?.slice(0, 5) ?? "";
    if (duzenlenen?.tur === "abonelik")
      return duzenlenen.abonelik.teslim_saati.slice(0, 5);
    return "";
  });
  const [yontem, setYontem] = useState(
    (duzenlenen?.tur === "teslimat" ? duzenlenen.siparis.odeme_yontemi : null) ??
      yontemler[0]?.kod ??
      "nakit",
  );
  const [acil, setAcil] = useState(
    duzenlenen?.tur === "teslimat" ? duzenlenen.siparis.oncelik > 0 : false,
  );
  const [not, setNot] = useState(
    (duzenlenen?.tur === "teslimat"
      ? duzenlenen.siparis.notlar
      : duzenlenen?.tur === "abonelik"
        ? duzenlenen.abonelik.notlar
        : null) ?? "",
  );
  const [baslik, setBaslik] = useState(
    duzenlenen?.tur === "abonelik" ? duzenlenen.abonelik.baslik : "Abonelik",
  );
  const [siklik, setSiklik] = useState<AbonelikSikligi>(
    duzenlenen?.tur === "abonelik" ? duzenlenen.abonelik.siklik : "haftalik",
  );
  const [gunler, setGunler] = useState<number[]>(
    duzenlenen?.tur === "abonelik" && duzenlenen.abonelik.gunler.length
      ? duzenlenen.abonelik.gunler
      : [1, 2, 3, 4, 5],
  );

  /* Adresten koordinat arama */
  const [geokod, setGeokod] = useState<
    | { durum: "bos" | "araniyor" | "yok" }
    | { durum: "bulundu"; ad: string; kaba: boolean }
  >({ durum: "bos" });

  /* Müşteri araması — yazarken 250 ms bekliyor. */
  useEffect(() => {
    if (musteriModu !== "ara") return;
    let iptal = false;
    const zaman = setTimeout(() => {
      musterileriAra(db, arama)
        .then((liste) => {
          if (!iptal) setSonuclar(liste);
        })
        .catch(() => {
          if (!iptal) setSonuclar([]);
        });
    }, 250);
    return () => {
      iptal = true;
      clearTimeout(zaman);
    };
  }, [db, arama, musteriModu]);

  const sayisalTutar = Number(tutar.replace(",", ".")) || 0;

  function ileri() {
    setHata(null);
    const i = ADIM_SIRASI.indexOf(adim);
    if (i < ADIM_SIRASI.length - 1) setAdim(ADIM_SIRASI[i + 1]);
  }

  function geri() {
    setHata(null);
    if (duzenleme) return onKapat();
    const i = ADIM_SIRASI.indexOf(adim);
    if (i > 0) setAdim(ADIM_SIRASI[i - 1]);
    else onKapat();
  }

  /** Yazılan adresi haritada arar; bulursa konumu işaretler. */
  async function konumuAdrestenBul(): Promise<{ lat: number; lng: number } | null> {
    const metin = yeniAdres.adres_metni.trim();
    if (metin.length < 5) return null;
    // Kapı numarası ayrı kutuya yazıldıysa aramaya kat: sokak ortası yerine
    // kapıya düşsün. Metinde zaten "No" geçiyorsa ikinci kez ekleme.
    const bina = yeniAdres.bina.trim();
    const sorgu =
      bina && !/\bno\s*[:.]?\s*\d/i.test(metin) ? `${metin} No:${bina}` : metin;
    setGeokod({ durum: "araniyor" });
    const sonuc = await adresiGeokodla(sorgu);
    if (!sonuc) {
      setGeokod({ durum: "yok" });
      return null;
    }
    setKonum({ lat: sonuc.lat, lng: sonuc.lng });
    setGeokod({ durum: "bulundu", ad: sonuc.ad, kaba: !!sonuc.kaba });
    return sonuc;
  }

  /** Müşteri adımını kapatır: seçileni ya da yeni açılanı kullanır. */
  async function musteriyiOnayla() {
    setHata(null);
    if (musteriModu === "ara") {
      if (!musteri) return setHata("Bir müşteri seçin ya da yeni müşteri açın.");
      setIslemde(true);
      try {
        const liste = await musteriAdresleri(db, musteri.id);
        setAdresler(liste);
        setAdres(liste[0] ?? null);
        ileri();
      } catch {
        setHata("Adresler okunamadı.");
      } finally {
        setIslemde(false);
      }
      return;
    }

    if (!yeniMusteri.ad.trim()) return setHata("Müşteri adı gerekli.");
    setIslemde(true);
    try {
      const kayit = await musteriEkle(db, yeniMusteri);
      setMusteri(kayit);
      setAdresler([]);
      setAdres(null);
      ileri();
    } catch {
      setHata("Müşteri kaydedilemedi.");
    } finally {
      setIslemde(false);
    }
  }

  async function adresiOnayla() {
    setHata(null);
    if (adres) return ileri();
    if (!musteri) return setHata("Önce müşteri seçin.");
    if (!yeniAdres.adres_metni.trim()) return setHata("Adres metni gerekli.");

    setIslemde(true);
    try {
      // Kurye konumu işaretlemediyse adresi haritada aramayı deniyoruz;
      // yoksa kayıt haritada hiç görünmüyor.
      const nokta = konum ?? (await konumuAdrestenBul());
      const kayit = await adresEkle(db, {
        musteri_id: musteri.id,
        ...yeniAdres,
        lat: nokta?.lat ?? null,
        lng: nokta?.lng ?? null,
      });
      setAdresler((o) => [...o, kayit]);
      setAdres(kayit);
      ileri();
    } catch {
      setHata("Adres kaydedilemedi.");
    } finally {
      setIslemde(false);
    }
  }

  async function kaydet() {
    setHata(null);
    setIslemde(true);
    try {
      if (duzenlenen?.tur === "teslimat") {
        const siparis = await siparisDuzenle(db, duzenlenen.siparis.id, {
          tutar: sayisalTutar,
          planlanan_tarih: tarih,
          planlanan_saat: saat ? `${saat}:00` : null,
          odeme_yontemi: yontem,
          oncelik: acil ? 1 : 0,
          notlar: not.trim() || null,
        });
        onEklendi({ tur: "teslimat", siparis }, "Teslimat güncellendi");
        return;
      }
      if (duzenlenen?.tur === "abonelik") {
        const abonelik = await abonelikDuzenle(db, duzenlenen.abonelik.id, {
          baslik,
          siklik,
          gunler: siklik === "gunluk" ? [1, 2, 3, 4, 5, 6, 7] : gunler,
          teslim_saati: `${saat || "09:00"}:00`,
          tutar: sayisalTutar,
          notlar: not.trim() || null,
        });
        onEklendi({ tur: "abonelik", abonelik }, "Abonelik güncellendi");
        return;
      }
      if (duzenlenen?.tur === "sepet") {
        const sepet = await sepetDuzenle(db, duzenlenen.sepet.id, {
          tutar: sayisalTutar,
        });
        onEklendi({ tur: "sepet", sepet }, "Sepet güncellendi");
        return;
      }

      if (!musteri || !adres) {
        setHata("Müşteri ve adres gerekli.");
        return;
      }

      if (tur === "teslimat") {
        const siparis = await siparisEkle(db, {
          musteri_id: musteri.id,
          adres_id: adres.id,
          tutar: sayisalTutar,
          planlanan_tarih: tarih,
          planlanan_saat: saat ? `${saat}:00` : null,
          odeme_yontemi: yontem,
          oncelik: acil ? 1 : 0,
          notlar: not,
        });
        onEklendi({ tur, siparis }, `${musteri.ad} için teslimat açıldı`);
      } else if (tur === "abonelik") {
        const abonelik = await abonelikEkle(db, {
          musteri_id: musteri.id,
          adres_id: adres.id,
          baslik,
          siklik,
          gunler: siklik === "gunluk" ? [1, 2, 3, 4, 5, 6, 7] : gunler,
          teslim_saati: `${saat || "09:00"}:00`,
          tutar: sayisalTutar,
          notlar: not,
        });
        onEklendi({ tur, abonelik }, `${musteri.ad} için abonelik açıldı`);
      } else {
        const sepet = await sepetEkle(db, {
          musteri_id: musteri.id,
          adres_id: adres.id,
          tutar: sayisalTutar,
        });
        onEklendi({ tur, sepet }, `${musteri.ad} için sepet açıldı`);
      }
    } catch {
      setHata("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
    } finally {
      setIslemde(false);
    }
  }

  const adimNo = ADIM_SIRASI.indexOf(adim);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px]"
      onClick={onKapat}
    >
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="ince-kaydirma max-h-[90%] w-full overflow-y-auto rounded-t-[28px] border-t border-cizgi bg-yuzey px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4"
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-cizgi" />

        {/* Adım göstergesi — düzenlemede tek adım var */}
        <div hidden={duzenleme} className="mb-4 flex items-center gap-1.5">
          {ADIM_SIRASI.map((a, i) => (
            <motion.span
              key={a}
              layout
              className={`h-1.5 rounded-full transition-colors ${
                i <= adimNo ? "bg-kirmizi" : "bg-cizgi"
              }`}
              style={{ flex: i === adimNo ? 3 : 1 }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {/* ---------------- Müşteri ---------------- */}
          {adim === "musteri" && (
            <Sayfa anahtar="musteri">
              <Baslik ust="1 / 4" ana="Müşteri" />

              <div className="mt-3 flex gap-1 rounded-hap bg-yuzey2 p-1">
                {(["ara", "yeni"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMusteriModu(m)}
                    className="relative flex-1 rounded-hap px-3 py-2 text-[13px] font-black"
                  >
                    {musteriModu === m && (
                      <motion.span
                        layoutId="musteri-modu"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        className="absolute inset-0 rounded-hap bg-kontrast"
                      />
                    )}
                    <span
                      className={`relative ${
                        musteriModu === m ? "text-white" : "text-gri"
                      }`}
                    >
                      {m === "ara" ? "Kayıtlı müşteri" : "Yeni müşteri"}
                    </span>
                  </button>
                ))}
              </div>

              {musteriModu === "ara" ? (
                <>
                  <Alan etiket="Ara">
                    <input
                      value={arama}
                      onChange={(e) => setArama(e.target.value)}
                      placeholder="Ad ya da telefon"
                      className={GIRDI}
                    />
                  </Alan>
                  <div className="mt-2 space-y-1.5">
                    {sonuclar.map((m) => (
                      <motion.button
                        key={m.id}
                        layout
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setMusteri(m)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${
                          musteri?.id === m.id
                            ? "border-kirmizi bg-kirmizi-sis"
                            : "border-cizgi bg-yuzey"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold">
                            {m.ad}
                          </span>
                          <span className="block truncate text-[12px] text-gri">
                            {m.telefon ?? "Telefon yok"}
                          </span>
                        </span>
                      </motion.button>
                    ))}
                    {sonuclar.length === 0 && (
                      <p className="px-1 py-4 text-center text-[13px] text-gri">
                        Eşleşen müşteri yok. Yeni müşteri açabilirsin.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Alan etiket="Ad soyad">
                    <input
                      value={yeniMusteri.ad}
                      onChange={(e) =>
                        setYeniMusteri({ ...yeniMusteri, ad: e.target.value })
                      }
                      placeholder="Örn. Ayşe Yıldırım"
                      className={GIRDI}
                    />
                  </Alan>
                  <Alan etiket="Telefon">
                    <input
                      value={yeniMusteri.telefon}
                      onChange={(e) =>
                        setYeniMusteri({ ...yeniMusteri, telefon: e.target.value })
                      }
                      inputMode="tel"
                      placeholder="0532 000 00 00"
                      className={GIRDI}
                    />
                  </Alan>
                  <Alan etiket="Not">
                    <input
                      value={yeniMusteri.notlar}
                      onChange={(e) =>
                        setYeniMusteri({ ...yeniMusteri, notlar: e.target.value })
                      }
                      placeholder="İsteğe bağlı"
                      className={GIRDI}
                    />
                  </Alan>
                </>
              )}
            </Sayfa>
          )}

          {/* ---------------- Adres ---------------- */}
          {adim === "adres" && (
            <Sayfa anahtar="adres">
              <Baslik ust="2 / 4" ana="Adres" alt={musteri?.ad} />

              {adresler.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {adresler.map((a) => (
                    <motion.button
                      key={a.id}
                      layout
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setAdres(adres?.id === a.id ? null : a)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left ${
                        adres?.id === a.id
                          ? "border-kirmizi bg-kirmizi-sis"
                          : "border-cizgi bg-yuzey"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-black">
                          {a.baslik}
                        </span>
                        <span className="block text-[12px] text-gri">
                          {a.adres_metni}
                        </span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}

              <AnimatePresence initial={false}>
                {!adres && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Alan etiket="Başlık">
                      <input
                        value={yeniAdres.baslik}
                        onChange={(e) =>
                          setYeniAdres({ ...yeniAdres, baslik: e.target.value })
                        }
                        placeholder="Ev, İş…"
                        className={GIRDI}
                      />
                    </Alan>
                    <Alan etiket="Adres">
                      <textarea
                        value={yeniAdres.adres_metni}
                        onChange={(e) =>
                          setYeniAdres({ ...yeniAdres, adres_metni: e.target.value })
                        }
                        rows={2}
                        placeholder="Mahalle, sokak"
                        className={`${GIRDI} h-auto resize-none py-3`}
                      />
                    </Alan>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(["bina", "kat", "daire"] as const).map((alan) => (
                        <input
                          key={alan}
                          value={yeniAdres[alan]}
                          onChange={(e) =>
                            setYeniAdres({ ...yeniAdres, [alan]: e.target.value })
                          }
                          placeholder={
                            alan === "bina" ? "Bina no" : alan === "kat" ? "Kat" : "Daire"
                          }
                          className={GIRDI}
                        />
                      ))}
                    </div>
                    <Alan etiket="Tarif">
                      <input
                        value={yeniAdres.tarif}
                        onChange={(e) =>
                          setYeniAdres({ ...yeniAdres, tarif: e.target.value })
                        }
                        placeholder="Beyaz bina, demir kapı"
                        className={GIRDI}
                      />
                    </Alan>

                    <div className="mt-3 flex gap-2">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => void konumuAdrestenBul()}
                        disabled={
                          geokod.durum === "araniyor" ||
                          yeniAdres.adres_metni.trim().length < 5
                        }
                        className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-2xl border border-cizgi bg-yuzey text-[14px] font-bold text-gri disabled:opacity-50"
                      >
                        {geokod.durum === "araniyor" ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                              className="h-4 w-4 rounded-full border-2 border-cizgi border-t-kirmizi"
                            />
                            Aranıyor…
                          </>
                        ) : (
                          "🔎 Adresten bul"
                        )}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setKonum(kuryeKonumu);
                          setGeokod({ durum: "bos" });
                        }}
                        disabled={!kuryeKonumu}
                        className="h-12 flex-1 rounded-2xl border border-cizgi bg-yuzey text-[14px] font-bold text-gri disabled:opacity-50"
                      >
                        📍 Kapıdayım
                      </motion.button>
                    </div>

                    <AnimatePresence initial={false}>
                      {konum && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 overflow-hidden rounded-2xl border border-yesil bg-yesil/10 px-3.5 py-2.5 text-[12px] font-bold text-yesil"
                        >
                          {geokod.durum === "bulundu" && geokod.kaba
                            ? "≈ Yaklaşık konum — kapı bulunamadı, haritadan düzeltin"
                            : "✓ Konum işaretlendi"}
                          {geokod.durum === "bulundu" && (
                            <span className="mt-0.5 block font-semibold opacity-80">
                              {geokod.ad}
                            </span>
                          )}
                        </motion.p>
                      )}
                      {!konum && geokod.durum === "yok" && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="mt-2 rounded-2xl bg-yuzey2 px-3.5 py-2.5 text-[12px] font-semibold text-gri"
                        >
                          Adres haritada bulunamadı. Mahalle ve ilçeyi yazmayı
                          ya da kapıdayken &quot;Kapıdayım&quot;a basmayı dene.
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <p className="mt-1.5 px-1 text-[11px] text-gri">
                      Konum işaretlenmezse kaydederken adres kendiliğinden
                      haritada aranır; bulunamazsa kayıt haritada görünmez ve
                      sonradan düzeltilebilir.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Sayfa>
          )}

          {/* ---------------- Kayıt türü ---------------- */}
          {adim === "tur" && (
            <Sayfa anahtar="tur">
              <Baslik ust="3 / 4" ana="Ne ekleniyor?" alt={musteri?.ad} />
              <div className="mt-3 space-y-2">
                {TURLER.map((t) => (
                  <motion.button
                    key={t.deger}
                    layout
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setTur(t.deger);
                      ileri();
                    }}
                    className="flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3.5 text-left hover:bg-yuzey2"
                  >
                    <span className="text-2xl leading-none">{t.simge}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-black">
                        {t.baslik}
                      </span>
                      <span className="block text-[12px] text-gri">{t.alt}</span>
                    </span>
                    <span className="text-gri">›</span>
                  </motion.button>
                ))}
              </div>
            </Sayfa>
          )}

          {/* ---------------- Detay ---------------- */}
          {adim === "detay" && (
            <Sayfa anahtar="detay">
              <Baslik
                ust={duzenleme ? "Düzenle" : "4 / 4"}
                ana={TURLER.find((t) => t.deger === tur)?.baslik ?? "Detay"}
                alt={musteri?.ad ?? undefined}
              />

              <Alan etiket="Tutar">
                <div className="flex items-center gap-2">
                  <input
                    value={tutar}
                    onChange={(e) => setTutar(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className={`${GIRDI} text-[19px] font-black`}
                  />
                  <span className="text-[19px] font-black text-gri">₺</span>
                </div>
                {sayisalTutar > 0 && (
                  <p className="mt-1 px-1 text-[12px] font-semibold text-gri">
                    {para(sayisalTutar)}
                  </p>
                )}
              </Alan>

              {tur === "teslimat" && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Alan etiket="Tarih">
                      <input
                        type="date"
                        value={tarih}
                        onChange={(e) => setTarih(e.target.value)}
                        className={GIRDI}
                      />
                    </Alan>
                    <Alan etiket="Saat">
                      <input
                        type="time"
                        value={saat}
                        onChange={(e) => setSaat(e.target.value)}
                        className={GIRDI}
                      />
                    </Alan>
                  </div>

                  <Alan etiket="Ödeme yöntemi">
                    <div className="flex flex-wrap gap-1.5">
                      {yontemler.map((y) => (
                        <button
                          key={y.kod}
                          onClick={() => setYontem(y.kod)}
                          className={`rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                            yontem === y.kod
                              ? "bg-kontrast text-white"
                              : "bg-yuzey2 text-gri"
                          }`}
                        >
                          {y.ad}
                        </button>
                      ))}
                    </div>
                  </Alan>

                  <button
                    onClick={() => setAcil(!acil)}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-cizgi bg-yuzey px-4 py-3 text-left"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                        acil ? "border-kirmizi bg-kirmizi text-white" : "border-cizgi"
                      }`}
                    >
                      {acil && <span className="text-xs font-black">✓</span>}
                    </span>
                    <span className="flex-1 text-[14px] font-bold">Acil</span>
                  </button>
                </>
              )}

              {tur === "abonelik" && (
                <>
                  <Alan etiket="Başlık">
                    <input
                      value={baslik}
                      onChange={(e) => setBaslik(e.target.value)}
                      placeholder="Örn. Kahvaltılık paketi"
                      className={GIRDI}
                    />
                  </Alan>

                  <Alan etiket="Sıklık">
                    <div className="flex flex-wrap gap-1.5">
                      {SIKLIKLAR.map((s) => (
                        <button
                          key={s.deger}
                          onClick={() => setSiklik(s.deger)}
                          className={`rounded-hap px-3.5 py-2 text-[13px] font-bold transition-colors ${
                            siklik === s.deger
                              ? "bg-kontrast text-white"
                              : "bg-yuzey2 text-gri"
                          }`}
                        >
                          {s.etiket}
                        </button>
                      ))}
                    </div>
                  </Alan>

                  <AnimatePresence initial={false}>
                    {siklik !== "gunluk" && siklik !== "aylik" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <Alan etiket="Günler">
                          <div className="flex gap-1.5">
                            {GUN_KISA.map((g, i) => {
                              const gun = i + 1;
                              const secili = gunler.includes(gun);
                              return (
                                <button
                                  key={g}
                                  onClick={() =>
                                    setGunler((o) =>
                                      o.includes(gun)
                                        ? o.filter((x) => x !== gun)
                                        : [...o, gun].sort((a, b) => a - b),
                                    )
                                  }
                                  className={`flex-1 rounded-xl py-2.5 text-[12px] font-black transition-colors ${
                                    secili
                                      ? "bg-kirmizi text-white"
                                      : "bg-yuzey2 text-gri"
                                  }`}
                                >
                                  {g}
                                </button>
                              );
                            })}
                          </div>
                        </Alan>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Alan etiket="Teslim saati">
                    <input
                      type="time"
                      value={saat}
                      onChange={(e) => setSaat(e.target.value)}
                      className={GIRDI}
                    />
                  </Alan>
                </>
              )}

              {tur !== "sepet" && (
                <Alan etiket="Not">
                  <textarea
                    value={not}
                    onChange={(e) => setNot(e.target.value)}
                    rows={2}
                    placeholder="İsteğe bağlı"
                    className={`${GIRDI} h-auto resize-none py-3`}
                  />
                </Alan>
              )}
            </Sayfa>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hata && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 rounded-2xl bg-kirmizi-sis px-4 py-3 text-[13px] font-bold text-kirmizi"
            >
              {hata}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-5 flex gap-2">
          <button
            onClick={geri}
            className="h-13 flex-1 rounded-hap bg-yuzey2 py-3.5 text-[14px] font-bold text-gri"
          >
            {adim === "musteri" ? "Vazgeç" : "Geri"}
          </button>
          {adim !== "tur" && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={islemde}
              onClick={() => {
                if (adim === "musteri") void musteriyiOnayla();
                else if (adim === "adres") void adresiOnayla();
                else void kaydet();
              }}
              className="flex-[2] rounded-hap bg-kirmizi py-3.5 text-[14px] font-black text-white disabled:opacity-60"
            >
              {islemde ? "Kaydediliyor…" : adim === "detay" ? "Kaydet" : "Devam"}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Küçük parçalar                                                      */
/* ------------------------------------------------------------------ */

const GIRDI =
  "h-12 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[15px] font-semibold outline-none placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey";

function Sayfa({
  anahtar,
  children,
}: {
  anahtar: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={anahtar}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function Baslik({ ust, ana, alt }: { ust: string; ana: string; alt?: string }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-wider text-gri">
        {ust}
      </p>
      <h2 className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
        {ana}
      </h2>
      {alt && <p className="truncate text-[13px] text-gri">{alt}</p>}
    </div>
  );
}

function Alan({
  etiket,
  children,
}: {
  etiket: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block px-1 text-[12px] font-bold text-gri">
        {etiket}
      </span>
      {children}
    </label>
  );
}
