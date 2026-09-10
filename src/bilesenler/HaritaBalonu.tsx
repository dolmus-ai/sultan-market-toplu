"use client";

import { motion } from "motion/react";

import { adresYaz, gunlerYaz, odemeAdi, para, saat } from "@/lib/bicim";
import { kayitTutari } from "@/lib/veri";
import type {
  Abonelik,
  OdemeYontemiTanimi,
  Sepet,
  Siparis,
} from "@/lib/tipler";

/** Haritada bir pine dokunulduğunda gösterilen kayıt. */
export type BalonKayit =
  | { tur: "teslimat"; siparis: Siparis }
  | {
      tur: "abonelik";
      abonelik: Abonelik;
      /** Bu abonelikten bugün üretilmiş sipariş — ödeme bilgisi ondan gelir. */
      bugunku: Siparis | null;
    }
  | { tur: "sepet"; sepet: Sepet };

type Ton = "yesil" | "turuncu" | "notr";

/** Siparişin ödeme durumunu tek satırda anlatır. */
function odemeSatiri(
  s: Siparis,
  yontemler: OdemeYontemiTanimi[],
): { metin: string; ton: Ton } {
  if (s.durum === "teslim") {
    if (s.odeme_alindi === true)
      return {
        metin: `${odemeAdi(s.odeme_yontemi, yontemler)} ile alındı`,
        ton: "yesil",
      };
    if (s.odeme_alindi === false)
      return {
        metin: `Ödeme alınmadı · ${s.odeme_alinmayan_kisi || s.musteri?.ad || "—"}`,
        ton: "turuncu",
      };
    return { metin: "Teslim edildi", ton: "notr" };
  }
  return {
    metin: `Ödeme: ${odemeAdi(s.odeme_yontemi, yontemler)}`,
    ton: "notr",
  };
}

const TON_SINIFI: Record<Ton, string> = {
  yesil: "bg-yesil/12 text-yesil",
  turuncu: "bg-turuncu/12 text-turuncu",
  notr: "bg-yuzey2 text-gri",
};

export default function HaritaBalonu({
  kayit,
  yontemler,
  onKapat,
  onOdemeAl,
  onDetay,
}: {
  kayit: BalonKayit;
  yontemler: OdemeYontemiTanimi[];
  onKapat: () => void;
  /** Ödeme almak için teslim ekranını açar. */
  onOdemeAl: (siparis: Siparis) => void;
  /** Alt paneldeki ayrıntıya götürür. */
  onDetay: () => void;
}) {
  const siparis =
    kayit.tur === "teslimat"
      ? kayit.siparis
      : kayit.tur === "abonelik"
        ? kayit.bugunku
        : null;

  const ortak =
    kayit.tur === "teslimat"
      ? kayit.siparis
      : kayit.tur === "abonelik"
        ? kayit.abonelik
        : kayit.sepet;

  const tutar =
    kayit.tur === "teslimat"
      ? kayit.siparis.tutar
      : kayit.tur === "abonelik"
        ? kayitTutari(kayit.abonelik)
        : kayitTutari(kayit.sepet);

  const odeme = siparis ? odemeSatiri(siparis, yontemler) : null;
  const odemeAlinabilir = siparis != null && siparis.durum !== "teslim";

  const turEtiketi =
    kayit.tur === "teslimat"
      ? "Teslimat"
      : kayit.tur === "abonelik"
        ? "Abonelik"
        : "Sepet";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={(e) => e.stopPropagation()}
      className="w-[248px] rounded-[20px] border border-cizgi bg-yuzey/95 p-3 shadow-yuzen backdrop-blur-xl"
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-black leading-tight">
            {ortak.musteri?.ad ?? "Müşteri"}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-gri">
            {ortak.adres ? adresYaz(ortak.adres) : turEtiketi}
          </span>
        </span>
        <button
          onClick={onKapat}
          aria-label="Balonu kapat"
          className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] font-black text-gri hover:bg-yuzey2"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[19px] font-black leading-none">
          {para(tutar)}
        </span>
        <span className="shrink-0 rounded-hap bg-kontrast px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          {turEtiketi}
        </span>
      </div>

      {/* Ödeme satırı — balonun asıl derdi bu */}
      <p
        className={`mt-2 rounded-xl px-2.5 py-1.5 text-[12px] font-bold ${
          odeme ? TON_SINIFI[odeme.ton] : TON_SINIFI.notr
        }`}
      >
        {odeme
          ? odeme.metin
          : kayit.tur === "abonelik"
            ? `${gunlerYaz(kayit.abonelik.gunler)} · ${saat(kayit.abonelik.teslim_saati)} · bugün teslimat yok`
            : "Açık sepet · henüz sipariş değil"}
      </p>

      <div className="mt-2.5 flex gap-1.5">
        {odemeAlinabilir && siparis && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => onOdemeAl(siparis)}
            className="flex-[2] rounded-hap bg-yesil py-2.5 text-[12px] font-black text-white"
          >
            Ödeme al
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onDetay}
          className="flex-1 rounded-hap bg-yuzey2 py-2.5 text-[12px] font-black text-gri"
        >
          Detay
        </motion.button>
      </div>
    </motion.div>
  );
}
