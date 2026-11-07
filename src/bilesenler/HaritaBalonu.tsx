"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

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
    // Veresiye para alınmış gibi yeşil görünmesin: borç turuncu.
    if (s.odeme_alindi === true && s.odeme_yontemi === "veresiye")
      return {
        metin: [
          "Veresiye",
          s.odeme_tutari != null ? para(s.odeme_tutari) : null,
          s.odeme_yapan,
        ]
          .filter(Boolean)
          .join(" · "),
        ton: "turuncu",
      };
    if (s.odeme_alindi === true)
      return {
        metin: [
          s.odeme_tutari != null ? para(s.odeme_tutari) : null,
          `${odemeAdi(s.odeme_yontemi, yontemler)} ile alındı`,
          s.odeme_yapan,
        ]
          .filter(Boolean)
          .join(" · "),
        ton: "yesil",
      };
    if (s.odeme_alindi === false)
      return {
        metin: `Ödeme alınmadı · ${s.odeme_alinmayan_kisi || s.musteri?.ad || "—"}`,
        ton: "turuncu",
      };
    return { metin: "Teslim edildi · ödeme girilmedi", ton: "notr" };
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

/** Parmakla rahat basılsın diye tüm düğmeler en az 40 piksel yüksekliğinde. */
const DUGME = "h-10 rounded-hap text-[11px] font-black";

export default function HaritaBalonu({
  kayit,
  yontemler,
  islemde = false,
  onKapat,
  onOdemeAl,
  onOdemeAlinmadi,
  onSiparise,
  onSil,
  onDetay,
}: {
  kayit: BalonKayit;
  yontemler: OdemeYontemiTanimi[];
  islemde?: boolean;
  onKapat: () => void;
  /** Ödeme almak için teslim ekranını açar. */
  onOdemeAl: (siparis: Siparis) => void;
  /** Teslim ekranını "alınamadı" seçeneğiyle açar: kimden ve neden. */
  onOdemeAlinmadi: (siparis: Siparis) => void;
  /** Sepeti güne ait teslimata çevirir. */
  onSiparise?: (sepet: Sepet) => void;
  /** Kaydı tamamen kaldırır. */
  onSil?: () => void;
  /** Alt paneldeki ayrıntıya götürür. */
  onDetay: () => void;
}) {
  const [silOnay, setSilOnay] = useState(false);

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
  // Teslim edilmiş sipariş silinemez: tahsilat kaydı ona bağlı.
  const silinebilir =
    onSil != null &&
    !(kayit.tur === "teslimat" && kayit.siparis.durum === "teslim");

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
      className="w-[264px] max-w-[calc(100vw-32px)] rounded-[20px] border border-cizgi bg-yuzey/95 p-3 shadow-yuzen backdrop-blur-xl"
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-black leading-tight">
            {ortak.musteri?.ad ?? "Müşteri"}
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-gri">
            {ortak.adres ? adresYaz(ortak.adres) : turEtiketi}
          </span>
        </span>
        <button
          onClick={onKapat}
          aria-label="Balonu kapat"
          className="-mr-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-black text-gri active:bg-yuzey2"
        >
          ×
        </button>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-black leading-none">
          {para(tutar)}
        </span>
        <span className="shrink-0 rounded-hap bg-kontrast px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          {turEtiketi}
        </span>
      </div>

      {/* Ödeme satırı — balonun asıl derdi bu */}
      <p
        className={`mt-2 rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
          odeme ? TON_SINIFI[odeme.ton] : TON_SINIFI.notr
        }`}
      >
        {odeme
          ? odeme.metin
          : kayit.tur === "abonelik"
            ? `${gunlerYaz(kayit.abonelik.gunler)} · ${saat(kayit.abonelik.teslim_saati)} · bugün teslimat yok`
            : "Açık sepet · henüz sipariş değil"}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {silOnay ? (
          <motion.div
            key="onay"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-2.5"
          >
            <p className="text-center text-[11px] font-bold text-kirmizi-koyu">
              Bu kayıt silinsin mi?
            </p>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => setSilOnay(false)}
                className={`${DUGME} flex-1 bg-yuzey2 text-gri`}
              >
                Vazgeç
              </button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                disabled={islemde}
                onClick={onSil}
                className={`${DUGME} flex-[1.4] bg-kirmizi text-white disabled:opacity-60`}
              >
                {islemde ? "Siliniyor…" : "Sil"}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="eylemler"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-2.5 space-y-1.5"
          >
            {odemeAlinabilir && siparis && (
              <div className="flex gap-1.5">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onOdemeAl(siparis)}
                  className={`${DUGME} flex-1 bg-yesil text-white`}
                >
                  Ödeme al
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onOdemeAlinmadi(siparis)}
                  className={`${DUGME} flex-1 bg-turuncu text-white`}
                >
                  Alınamadı
                </motion.button>
              </div>
            )}

            {kayit.tur === "sepet" && onSiparise && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                disabled={islemde || !kayit.sepet.adres_id}
                onClick={() => onSiparise(kayit.sepet)}
                className={`${DUGME} w-full bg-kirmizi text-white disabled:opacity-50`}
              >
                {islemde ? "Çevriliyor…" : "Siparişe çevir"}
              </motion.button>
            )}

            <div className="flex gap-1.5">
              {silinebilir && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSilOnay(true)}
                  aria-label="Kaydı sil"
                  className={`${DUGME} w-10 shrink-0 bg-yuzey2 text-[13.5px] text-kirmizi`}
                >
                  🗑
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onDetay}
                className={`${DUGME} flex-1 bg-yuzey2 text-gri`}
              >
                Detay
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
