"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adresYaz, odemeAdi, para } from "@/lib/bicim";
import { teslimGecmisiListesi, type GecmisKayit } from "@/lib/veri";
import type { OdemeYontemiTanimi } from "@/lib/tipler";
import { MusteriAvatar } from "./Listeler";
import { teslimGunu } from "./TeslimGecmisi";

const SAYFA = 40;

function saatYaz(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function odemeDurumu(k: GecmisKayit): { metin: string; renk: string } {
  if (k.odeme_alindi === false) return { metin: "Ödeme alınmadı", renk: "text-turuncu" };
  if (k.odeme_yontemi === "veresiye") return { metin: "Veresiye", renk: "text-turuncu" };
  if (k.odeme_alindi) return { metin: "✓ Tahsil", renk: "text-yesil" };
  return { metin: "", renk: "text-gri" };
}

/**
 * Bütün önceki teslimatlar: tam ekran listedeki "Teslimat geçmişi"
 * düğmesiyle açılır. Kaynak silinmez teslim geçmişi; listeden silinmiş
 * siparişler de burada. Bir teslime dokununca ayrıntısı açılır; oradan
 * aynen ya da düzenleyerek yeniden teslimata alınır.
 */
export default function TeslimGecmisiEkrani({
  db,
  yontemler,
  islemde,
  onKapat,
  onAynenAl,
  onDuzenleyerekAl,
}: {
  db: SupabaseClient;
  yontemler: OdemeYontemiTanimi[];
  islemde: boolean;
  onKapat: () => void;
  onAynenAl: (k: GecmisKayit) => void;
  onDuzenleyerekAl: (k: GecmisKayit) => void;
}) {
  const [arama, setArama] = useState("");
  const [kayitlar, setKayitlar] = useState<GecmisKayit[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(0);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "hata">("yukleniyor");
  const [acikId, setAcikId] = useState<string | null>(null);

  // Arama değişince ilk sayfadan, yazarken 250 ms bekleyerek.
  useEffect(() => {
    let iptal = false;
    const zaman = setTimeout(() => {
      setDurum("yukleniyor");
      teslimGecmisiListesi(db, { arama, sayfa: 0, boyut: SAYFA })
        .then(({ kayitlar: k, toplam: t }) => {
          if (iptal) return;
          setKayitlar(k);
          setToplam(t);
          setSayfa(0);
          setDurum("hazir");
        })
        .catch(() => {
          if (!iptal) setDurum("hata");
        });
    }, arama ? 250 : 0);
    return () => {
      iptal = true;
      clearTimeout(zaman);
    };
  }, [db, arama]);

  async function dahaFazla() {
    const sonraki = sayfa + 1;
    setDurum("yukleniyor");
    try {
      const { kayitlar: k, toplam: t } = await teslimGecmisiListesi(db, {
        arama,
        sayfa: sonraki,
        boyut: SAYFA,
      });
      setKayitlar((o) => [...o, ...k]);
      setToplam(t);
      setSayfa(sonraki);
      setDurum("hazir");
    } catch {
      setDurum("hata");
    }
  }

  // Güne göre gruplar: "bugün", "dün", "12 Kas"…
  const gruplar = useMemo(() => {
    const g: { gun: string; kayitlar: GecmisKayit[] }[] = [];
    for (const k of kayitlar) {
      const gun = teslimGunu(k.teslim_zamani);
      const son = g[g.length - 1];
      if (son && son.gun === gun) son.kayitlar.push(k);
      else g.push({ gun, kayitlar: [k] });
    }
    return g;
  }, [kayitlar]);

  return (
    <motion.section
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 40 }}
      className="absolute inset-0 z-[48] flex flex-col bg-yuzey"
    >
      {/* Başlık */}
      <div className="shrink-0 space-y-2 border-b border-cizgi px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="flex items-center gap-2">
          <button
            onClick={onKapat}
            className="flex h-8 items-center gap-1 rounded-hap bg-yuzey2 px-3 text-[12px] font-bold text-gri"
          >
            ← Geri
          </button>
          <h2 className="flex-1 text-[16px] font-black tracking-tight">Teslimat geçmişi</h2>
          {durum !== "yukleniyor" && (
            <span className="text-[11px] font-semibold text-gri">{toplam} teslim</span>
          )}
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-gri">
            🔎
          </span>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Müşteri adı ya da telefon"
            className="h-9 w-full rounded-xl border border-cizgi bg-yuzey2 pl-9 pr-9 text-[12.5px] font-semibold outline-none placeholder:font-medium placeholder:text-gri focus:border-kirmizi"
          />
          {arama && (
            <button
              onClick={() => setArama("")}
              aria-label="Aramayı temizle"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[13px] font-black text-gri"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="ince-kaydirma min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        {durum === "hata" && kayitlar.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-gri">
            Geçmiş okunamadı. Bağlantını kontrol edip yeniden dene.
          </p>
        )}
        {durum === "hazir" && kayitlar.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-gri">
            {arama ? "Aramaya uyan teslim yok." : "Henüz teslim edilmiş sipariş yok."}
          </p>
        )}

        {gruplar.map((g) => (
          <div key={g.gun} className="mb-3">
            <p className="sticky top-0 z-10 bg-yuzey py-1.5 text-[10.5px] font-black uppercase tracking-wider text-gri">
              {g.gun} · {g.kayitlar.length}
            </p>
            <div className="overflow-hidden rounded-2xl border border-cizgi divide-y divide-cizgi bg-yuzey">
              {g.kayitlar.map((k) => (
                <GecmisSatiri
                  key={k.id}
                  kayit={k}
                  yontemler={yontemler}
                  acik={acikId === k.id}
                  islemde={islemde}
                  onAc={() => setAcikId((o) => (o === k.id ? null : k.id))}
                  onAynenAl={() => onAynenAl(k)}
                  onDuzenleyerekAl={() => onDuzenleyerekAl(k)}
                />
              ))}
            </div>
          </div>
        ))}

        {kayitlar.length < toplam && (
          <button
            onClick={() => void dahaFazla()}
            disabled={durum === "yukleniyor"}
            className="mt-1 h-10 w-full rounded-2xl bg-yuzey2 text-[12.5px] font-bold text-gri disabled:opacity-50"
          >
            {durum === "yukleniyor"
              ? "Yükleniyor…"
              : `Daha eski teslimler (${toplam - kayitlar.length})`}
          </button>
        )}
        {durum === "yukleniyor" && kayitlar.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-gri">Yükleniyor…</p>
        )}
      </div>
    </motion.section>
  );
}

function GecmisSatiri({
  kayit: k,
  yontemler,
  acik,
  islemde,
  onAc,
  onAynenAl,
  onDuzenleyerekAl,
}: {
  kayit: GecmisKayit;
  yontemler: OdemeYontemiTanimi[];
  acik: boolean;
  islemde: boolean;
  onAc: () => void;
  onAynenAl: () => void;
  onDuzenleyerekAl: () => void;
}) {
  const odeme = odemeDurumu(k);
  const tutar = k.odeme_tutari ?? k.tutar;
  const aynenOlur = k.musteri_id != null && k.adres_id != null;

  return (
    <div className={acik ? "bg-yuzey2/60" : ""}>
      <button
        onClick={onAc}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:bg-yuzey2"
      >
        <span className="flex w-9 shrink-0 justify-center">
          <MusteriAvatar ad={k.musteri_ad ?? undefined} durum="teslim" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-bold">
            {k.musteri_ad ?? "Müşteri"}
          </span>
          <span className="mt-1 block truncate text-[11px] text-gri">
            {saatYaz(k.teslim_zamani)}
            {k.adres ? ` · ${adresYaz(k.adres)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right leading-tight">
          <span className="block text-[13px] font-extrabold">
            {tutar != null ? para(tutar) : "—"}
          </span>
          {odeme.metin && (
            <span className={`mt-1 block text-[10px] font-bold ${odeme.renk}`}>
              {odeme.metin}
            </span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {acik && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-3 pb-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-yuzey px-3 py-2 text-[12px]">
                <Bilgi ad="Teslim">
                  {new Date(k.teslim_zamani).toLocaleString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Bilgi>
                {k.telefon && (
                  <Bilgi ad="Telefon">
                    <a
                      href={`tel:${k.telefon.replace(/\s/g, "")}`}
                      className="font-semibold underline-offset-2 active:underline"
                    >
                      {k.telefon}
                    </a>
                  </Bilgi>
                )}
                <Bilgi ad="Adres">
                  {k.adres ? adresYaz(k.adres) : "Adres kaydı yok"}
                  {k.adres?.tarif ? (
                    <span className="block text-gri">{k.adres.tarif}</span>
                  ) : null}
                </Bilgi>
                <Bilgi ad="Tutar">{k.tutar != null ? para(k.tutar) : "—"}</Bilgi>
                <Bilgi ad="Ödeme">
                  {[
                    k.odeme_tutari != null && k.odeme_tutari !== k.tutar
                      ? para(k.odeme_tutari)
                      : null,
                    k.odeme_yontemi ? odemeAdi(k.odeme_yontemi, yontemler) : null,
                    odeme.metin || null,
                    k.odeme_yapan,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Bilgi>
                {k.kaynak === "abonelik" && <Bilgi ad="Kaynak">Abonelikten</Bilgi>}
              </dl>

              <div className="flex gap-2">
                <button
                  onClick={onAynenAl}
                  disabled={islemde || !aynenOlur}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-kirmizi text-[12.5px] font-black text-white disabled:opacity-40"
                >
                  ↻ Aynen teslimata al
                </button>
                <button
                  onClick={onDuzenleyerekAl}
                  disabled={islemde}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-kontrast text-[12.5px] font-black text-white disabled:opacity-40"
                >
                  ✎ Düzenleyerek al
                </button>
              </div>
              {!aynenOlur && (
                <p className="text-[11px] text-gri">
                  Müşteri ya da adres kaydı artık yok; düzenleyerek yeniden açabilirsin.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bilgi({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-gri">{ad}</dt>
      <dd className="min-w-0 font-semibold">{children}</dd>
    </>
  );
}
