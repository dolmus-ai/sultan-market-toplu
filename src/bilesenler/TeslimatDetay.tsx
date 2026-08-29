"use client";

import { useState } from "react";
import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  ODEME_ETIKET,
  adresYaz,
  para,
  saat,
} from "@/lib/bicim";
import { mesafeYaz } from "@/lib/rota";
import { haversine } from "@/lib/rota";
import { KalemListesi, Etiket } from "./Listeler";
import type { Nokta, Siparis, SiparisDurumu } from "@/lib/tipler";

type Props = {
  siparis: Siparis;
  kuryeKonumu: Nokta | null;
  onKapat: () => void;
  onDurum: (durum: SiparisDurumu) => void;
  onNavigasyon: () => void;
  onKonumDuzelt: () => void;
  islemde: boolean;
};

const SONRAKI_ADIM: Partial<
  Record<SiparisDurumu, { durum: SiparisDurumu; etiket: string }>
> = {
  bekliyor: { durum: "hazirlaniyor", etiket: "Hazırlığa aldım" },
  hazirlaniyor: { durum: "yolda", etiket: "Yola çıktım" },
  yolda: { durum: "teslim", etiket: "Teslim ettim" },
};

export default function TeslimatDetay({
  siparis,
  kuryeKonumu,
  onKapat,
  onDurum,
  onNavigasyon,
  onKonumDuzelt,
  islemde,
}: Props) {
  const [notAcik, setNotAcik] = useState(false);
  const adres = siparis.adres;
  const konumVar = adres?.lat != null && adres?.lng != null;
  const sonraki = SONRAKI_ADIM[siparis.durum];

  const mesafe =
    kuryeKonumu && konumVar
      ? haversine(kuryeKonumu, { lat: adres!.lat!, lng: adres!.lng! })
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="space-y-3 pb-4"
    >
      {/* Başlık */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-extrabold tracking-tight">
              {siparis.musteri?.ad ?? "Müşteri"}
            </h2>
            <span
              className="rounded-hap px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide"
              style={DURUM_STIL[siparis.durum]}
            >
              {DURUM_ETIKET[siparis.durum]}
            </span>
            {siparis.kaynak === "abonelik" && <Etiket>Abonelik</Etiket>}
          </div>
          <p className="mt-1 text-[13px] text-gri">
            {adres ? adresYaz(adres) : "Adres tanımsız"}
          </p>
          {adres?.tarif && (
            <p className="mt-1.5 rounded-2xl bg-yuzey2 px-3 py-2 text-[13px] font-medium">
              📍 {adres.tarif}
            </p>
          )}
        </div>
        <button
          onClick={onKapat}
          aria-label="Kapat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-lg font-bold text-gri transition-colors hover:bg-cizgi"
        >
          ×
        </button>
      </div>

      {/* Hızlı bilgiler */}
      <div className="grid grid-cols-3 gap-2">
        <Kutu ust="Tutar" alt={para(siparis.tutar)} vurgu />
        <Kutu
          ust="Ödeme"
          alt={
            siparis.odeme_yontemi ? ODEME_ETIKET[siparis.odeme_yontemi] : "—"
          }
        />
        <Kutu
          ust={mesafe != null ? "Uzaklık" : "Saat"}
          alt={
            mesafe != null ? mesafeYaz(mesafe) : saat(siparis.planlanan_saat)
          }
        />
      </div>

      {/* Eylemler */}
      <div className="flex gap-2">
        {konumVar && (
          <button
            onClick={onNavigasyon}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-hap bg-kontrast text-[14px] font-bold text-white active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 11 21 3l-8 18-2-7-8-3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            Navigasyon
          </button>
        )}
        {siparis.musteri?.telefon && (
          <a
            href={`tel:${siparis.musteri.telefon.replace(/\s/g, "")}`}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-hap border border-cizgi bg-yuzey text-[14px] font-bold active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 4h3.5l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            Ara
          </a>
        )}
      </div>

      {/* Sepet */}
      <div>
        <p className="mb-2 mt-1 text-[11px] font-black uppercase tracking-wider text-gri">
          Sepet · {siparis.kalemler?.length ?? 0} kalem
        </p>
        <KalemListesi kalemler={siparis.kalemler ?? []} />
      </div>

      {/* Notlar */}
      {(siparis.notlar || siparis.musteri?.notlar) && (
        <div className="rounded-[20px] border border-cizgi bg-yuzey p-3.5">
          <button
            onClick={() => setNotAcik(!notAcik)}
            className="flex w-full items-center justify-between text-[13px] font-bold"
          >
            Notlar
            <span className="text-gri">{notAcik ? "−" : "+"}</span>
          </button>
          {notAcik && (
            <div className="mt-2 space-y-1.5 text-[13px] text-gri">
              {siparis.notlar && <p>🧾 {siparis.notlar}</p>}
              {siparis.musteri?.notlar && <p>👤 {siparis.musteri.notlar}</p>}
            </div>
          )}
        </div>
      )}

      {/* Durum ilerletme */}
      <div className="flex gap-2 pt-1">
        {sonraki && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={islemde}
            onClick={() => onDurum(sonraki.durum)}
            className="flex h-14 flex-1 items-center justify-center rounded-hap bg-kirmizi text-[15px] font-black text-white shadow-kirmizi transition-colors hover:bg-kirmizi-koyu disabled:opacity-60"
          >
            {islemde ? "Kaydediliyor…" : sonraki.etiket}
          </motion.button>
        )}
        {siparis.durum === "teslim" && (
          <div className="flex h-14 flex-1 items-center justify-center rounded-hap bg-yesil/10 text-[15px] font-black text-yesil">
            ✓ Teslim edildi
          </div>
        )}
        <button
          onClick={onKonumDuzelt}
          className="flex h-14 shrink-0 items-center justify-center rounded-hap border border-cizgi bg-yuzey px-4 text-[13px] font-bold active:scale-[0.98]"
        >
          Konumu düzelt
        </button>
      </div>
    </motion.div>
  );
}

function Kutu({
  ust,
  alt,
  vurgu,
}: {
  ust: string;
  alt: string;
  vurgu?: boolean;
}) {
  return (
    <div
      className={`rounded-[18px] border p-3 ${
        vurgu ? "border-kirmizi/25 bg-kirmizi-sis" : "border-cizgi bg-yuzey"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-gri">
        {ust}
      </p>
      <p
        className={`mt-0.5 truncate text-[15px] font-black ${
          vurgu ? "text-kirmizi-koyu" : ""
        }`}
      >
        {alt}
      </p>
    </div>
  );
}
