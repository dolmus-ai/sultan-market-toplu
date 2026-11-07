"use client";

import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  adresYaz,
  gunlerYaz,
  para,
  saat,
} from "@/lib/bicim";
import { haversine, mesafeYaz } from "@/lib/rota";
import { kayitTutari } from "@/lib/veri";
import { waNumarasi } from "@/lib/whatsapp";
import type { Abonelik, Nokta, Siparis } from "@/lib/tipler";
import { Etiket, MusteriAvatar } from "./Listeler";
import { Eylem, Kutu, WaSimge } from "./TeslimatDetay";

type Props = {
  abonelik: Abonelik;
  /** Bugün teslim günü mü. */
  bugun: boolean;
  /** Bu abonelikten bugün oluşan teslimat, varsa. */
  bugunkuTeslimat: Siparis | null;
  kuryeKonumu: Nokta | null;
  onKapat: () => void;
  onHaritada: () => void;
  onTeslimatAc: (id: string) => void;
  onDuzenle: () => void;
  onIslemler: () => void;
  onKonumDuzelt: () => void;
};

const SIKLIK_ETIKET: Record<Abonelik["siklik"], string> = {
  gunluk: "Her gün",
  haftalik: "Haftalık",
  iki_haftalik: "İki haftada bir",
  aylik: "Aylık",
};

const DURUM: Record<Abonelik["durum"], { metin: string; renk: string }> = {
  aktif: { metin: "Aktif", renk: "var(--color-yesil)" },
  duraklatildi: { metin: "Duraklatıldı", renk: "var(--color-turuncu)" },
  iptal: { metin: "İptal", renk: "var(--color-gri)" },
};

/**
 * Abonelik ayrıntısı. Tam ekran listede bir aboneliğe dokununca liste yerine
 * açılır; × ile listeye dönülür. Görünüm teslimat ayrıntısıyla aynı dilde.
 */
export default function AbonelikDetay({
  abonelik,
  bugun,
  bugunkuTeslimat,
  kuryeKonumu,
  onKapat,
  onHaritada,
  onTeslimatAc,
  onDuzenle,
  onIslemler,
  onKonumDuzelt,
}: Props) {
  const adres = abonelik.adres;
  const konumVar = adres?.lat != null && adres?.lng != null;
  const telefon = abonelik.musteri?.telefon;
  const waNo = waNumarasi(telefon);
  const mesafe =
    kuryeKonumu && konumVar
      ? haversine(kuryeKonumu, { lat: adres!.lat!, lng: adres!.lng! })
      : null;
  const durum = DURUM[abonelik.durum];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="space-y-2.5 pb-4"
    >
      {/* Başlık: baş harfler, ad, telefon */}
      <div className="flex items-center gap-3">
        <MusteriAvatar ad={abonelik.musteri?.ad} vurgu={bugun} boyut={42} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-[17px] font-extrabold leading-tight tracking-tight">
              {abonelik.musteri?.ad ?? "Müşteri"}
            </h2>
            {telefon && (
              <a
                href={`tel:${telefon.replace(/\s/g, "")}`}
                className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-gri underline-offset-2 active:underline"
              >
                {telefon}
              </a>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="font-bold" style={{ color: durum.renk }}>
              ● {durum.metin}
            </span>
            <span className="text-gri">· {SIKLIK_ETIKET[abonelik.siklik]}</span>
            {bugun && <Etiket ton="kirmizi">Bugün</Etiket>}
          </div>
        </div>
        <button
          onClick={onKapat}
          aria-label="Listeye dön"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yuzey2 text-[16px] font-bold text-gri active:scale-90"
        >
          ×
        </button>
      </div>

      {/* Adres kartı */}
      <div className="space-y-1.5 rounded-2xl bg-yuzey2 p-3">
        <p className="flex gap-2 text-[12.5px] font-semibold leading-snug">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-kirmizi">
            <path
              d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          {adres ? adresYaz(adres) : "Adres tanımsız"}
        </p>
        {adres?.tarif && (
          <p className="pl-[23px] text-[12px] leading-snug text-gri">{adres.tarif}</p>
        )}
        {adres?.kurye_notu && (
          <p className="rounded-xl bg-kirmizi/10 px-2.5 py-1.5 text-[12px] font-semibold text-kirmizi-koyu">
            🛵 {adres.kurye_notu}
            {adres.kapi_kodu ? ` · Kapı ${adres.kapi_kodu}` : ""}
          </p>
        )}
        {!konumVar && (
          <p className="text-[11.5px] font-bold text-turuncu">Konum tanımlı değil</p>
        )}
      </div>

      {/* Bilgi şeridi */}
      <div className="grid grid-cols-3 divide-x divide-cizgi rounded-2xl border border-cizgi bg-yuzey py-2">
        <Kutu ust="Tutar" alt={para(kayitTutari(abonelik))} vurgu />
        <Kutu ust="Günler" alt={gunlerYaz(abonelik.gunler)} />
        <Kutu
          ust={mesafe != null ? "Uzaklık" : "Saat"}
          alt={mesafe != null ? mesafeYaz(mesafe) : saat(abonelik.teslim_saati)}
        />
      </div>

      {/* Eylemler */}
      <div className="flex gap-2">
        {konumVar && (
          <Eylem onClick={onHaritada} etiket="Haritada" koyu>
            <path
              d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </Eylem>
        )}
        {telefon && (
          <Eylem href={`tel:${telefon.replace(/\s/g, "")}`} etiket="Ara">
            <path
              d="M5 4h3.5l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </Eylem>
        )}
        {waNo && (
          <Eylem href={`https://wa.me/${waNo}`} etiket="WhatsApp" wa>
            <WaSimge />
          </Eylem>
        )}
        <Eylem onClick={onDuzenle} etiket="Düzenle">
          <path
            d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </Eylem>
      </div>

      {/* Bugünkü teslimat: dokununca teslimat ayrıntısı açılır */}
      {bugunkuTeslimat && (
        <button
          onClick={() => onTeslimatAc(bugunkuTeslimat.id)}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-cizgi bg-yuzey px-3 py-2.5 text-left active:bg-yuzey2"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: DURUM_STIL[bugunkuTeslimat.durum].background }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold">Bugünkü teslimat</span>
            <span className="block text-[11px] text-gri">
              {DURUM_ETIKET[bugunkuTeslimat.durum]}
              {bugunkuTeslimat.planlanan_saat &&
                ` · ${saat(bugunkuTeslimat.planlanan_saat)}`}
            </span>
          </span>
          <span className="text-[14px] text-gri">›</span>
        </button>
      )}

      {/* Notlar */}
      {(abonelik.notlar || abonelik.musteri?.notlar) && (
        <div className="space-y-1 rounded-2xl border border-cizgi bg-yuzey px-3 py-2.5 text-[12px] text-gri">
          {abonelik.notlar && <p>🧾 {abonelik.notlar}</p>}
          {abonelik.musteri?.notlar && <p>👤 {abonelik.musteri.notlar}</p>}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onKonumDuzelt}
          className="flex h-10 flex-1 items-center justify-center rounded-xl bg-yuzey2 text-[11.5px] font-bold text-gri"
        >
          📍 Konumu düzelt
        </button>
        <button
          onClick={onIslemler}
          className="flex h-10 flex-1 items-center justify-center rounded-xl bg-yuzey2 text-[11.5px] font-bold text-gri"
        >
          ⋯ Diğer işlemler
        </button>
      </div>
    </motion.div>
  );
}
