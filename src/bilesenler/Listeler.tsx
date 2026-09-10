"use client";

import { motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  adresYaz,
  gecikmeYaz,
  gunlerYaz,
  miktarYaz,
  para,
  saat,
} from "@/lib/bicim";
import { kayitTutari } from "@/lib/veri";
import type { Abonelik, Sepet, Siparis } from "@/lib/tipler";

/* ------------------------------------------------------------------ */
/* Teslimat satırı                                                     */
/* ------------------------------------------------------------------ */

export function TeslimatSatiri({
  siparis,
  sira,
  secili,
  secimModu,
  isaretli,
  gecikme,
  binaSayisi,
  onTikla,
  onIslemler,
}: {
  siparis: Siparis;
  sira?: number;
  secili: boolean;
  secimModu: boolean;
  isaretli: boolean;
  /** Planlanan saate göre gecikme (dk); pozitifse gecikmiş. */
  gecikme?: number | null;
  /** Aynı binadaki toplam teslimat sayısı (1'den büyükse rozet çıkar). */
  binaSayisi?: number;
  onTikla: () => void;
  /** Verilirse satırın sağında işlem menüsü düğmesi çıkar. */
  onIslemler?: () => void;
}) {
  const kalemSayisi = siparis.kalemler?.length ?? 0;
  const konumYok = siparis.adres?.lat == null;

  return (
    <motion.button
      layout
      onClick={onTikla}
      whileTap={{ scale: 0.985 }}
      className={`flex w-full items-center gap-3 rounded-[20px] border p-3 text-left transition-colors ${
        secili || isaretli
          ? "border-kirmizi bg-kirmizi-sis"
          : "border-cizgi bg-yuzey hover:bg-yuzey2"
      }`}
    >
      {/* Sıra veya durum göstergesi */}
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        {secimModu ? (
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
              isaretli
                ? "border-kirmizi bg-kirmizi text-white"
                : "border-cizgi bg-yuzey"
            }`}
          >
            {isaretli && <span className="text-xs font-black">✓</span>}
          </span>
        ) : sira ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-kontrast text-sm font-black text-white">
            {sira}
          </span>
        ) : (
          <span
            className="h-3.5 w-3.5 rounded-full ring-4 ring-yuzey"
            style={{ background: DURUM_STIL[siparis.durum].background }}
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold">
            {siparis.musteri?.ad ?? "Müşteri"}
          </span>
          {siparis.kaynak === "abonelik" && <Etiket>Abonelik</Etiket>}
          {siparis.oncelik > 0 && <Etiket ton="kirmizi">Acil</Etiket>}
          {gecikme != null && gecikme > 0 && (
            <Etiket ton="kirmizi">{gecikmeYaz(gecikme)} geç</Etiket>
          )}
          {(binaSayisi ?? 0) > 1 && (
            <Etiket ton="siyah">Aynı bina · {binaSayisi}</Etiket>
          )}
          {konumYok && <Etiket ton="siyah">Konum yok</Etiket>}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-gri">
          {siparis.adres ? adresYaz(siparis.adres) : "Adres tanımsız"}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[12px] font-semibold text-gri">
          <span
            className="rounded-hap px-2 py-0.5"
            style={DURUM_STIL[siparis.durum]}
          >
            {DURUM_ETIKET[siparis.durum]}
          </span>
          <span>{kalemSayisi} ürün</span>
          {siparis.planlanan_saat && (
            <span>· {saat(siparis.planlanan_saat)}</span>
          )}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-black">
          {para(siparis.tutar)}
        </span>
        <span
          className={`mt-0.5 block text-[11px] font-semibold ${
            siparis.odeme_alindi === false ? "text-turuncu" : "text-gri"
          }`}
        >
          {siparis.odeme_alindi === false
            ? "Ödeme alınmadı"
            : siparis.odeme_alindi
              ? "Tahsil edildi"
              : "Tahsilat"}
        </span>
      </span>
      {onIslemler && !secimModu && <IslemDugmesi onTikla={onIslemler} />}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Abonelik satırı                                                     */
/* ------------------------------------------------------------------ */

export function AbonelikSatiri({
  abonelik,
  bugun,
  onTikla,
  onIslemler,
}: {
  abonelik: Abonelik;
  bugun: boolean;
  onTikla: () => void;
  onIslemler?: () => void;
}) {
  const tutar = kayitTutari(abonelik);
  return (
    <motion.button
      layout
      onClick={onTikla}
      whileTap={{ scale: 0.985 }}
      className="flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3 text-left hover:bg-yuzey2"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-kontrast bg-yuzey">
        <span className="h-2.5 w-2.5 rounded-full bg-kirmizi" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold">
            {abonelik.musteri?.ad ?? "Müşteri"}
          </span>
          {bugun && <Etiket ton="kirmizi">Bugün</Etiket>}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-gri">
          {abonelik.baslik} · {gunlerYaz(abonelik.gunler)} ·{" "}
          {saat(abonelik.teslim_saati)}
        </span>
        <span className="mt-1 block text-[12px] font-semibold text-gri">
          {(abonelik.kalemler ?? []).length} kalem
        </span>
      </span>
      <span className="shrink-0 text-right text-[15px] font-black">
        {para(tutar)}
      </span>
      {onIslemler && <IslemDugmesi onTikla={onIslemler} />}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Sepet satırı                                                        */
/* ------------------------------------------------------------------ */

export function SepetSatiri({
  sepet,
  onTikla,
  onIslemler,
}: {
  sepet: Sepet;
  onTikla: () => void;
  onIslemler?: () => void;
}) {
  return (
    <motion.button
      layout
      onClick={onTikla}
      whileTap={{ scale: 0.985 }}
      className="flex w-full items-center gap-3 rounded-[20px] border border-cizgi bg-yuzey p-3 text-left hover:bg-yuzey2"
    >
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
        {sepet.musteri?.ad ?? "Müşteri"}
      </span>
      <Etiket>Açık sepet</Etiket>
      <span className="shrink-0 text-[15px] font-black">
        {para(kayitTutari(sepet))}
      </span>
      {onIslemler && <IslemDugmesi onTikla={onIslemler} />}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Ortak küçük parçalar                                                */
/* ------------------------------------------------------------------ */

/** Satır sağındaki üç nokta — düzenle / sil menüsünü açar. */
export function IslemDugmesi({ onTikla }: { onTikla: () => void }) {
  return (
    <motion.span
      whileTap={{ scale: 0.9 }}
      role="button"
      tabIndex={0}
      aria-label="Kayıt işlemleri"
      onClick={(e) => {
        e.stopPropagation();
        onTikla();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onTikla();
        }
      }}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[17px] font-black leading-none text-gri hover:bg-yuzey2"
    >
      ⋯
    </motion.span>
  );
}

export function Etiket({
  children,
  ton = "notr",
}: {
  children: React.ReactNode;
  ton?: "notr" | "kirmizi" | "siyah";
}) {
  const stiller = {
    notr: "bg-yuzey2 text-gri",
    kirmizi: "bg-kirmizi text-white",
    siyah: "bg-kontrast text-white",
  };
  return (
    <span
      className={`shrink-0 rounded-hap px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${stiller[ton]}`}
    >
      {children}
    </span>
  );
}

/**
 * Sipariş kalemleri. Kuryenin ürün bilgisine ihtiyacı yok — kapıda teslim
 * ederken önemli olan kaç birim taşıdığı ve satırın tutarı.
 */
export function KalemListesi({
  kalemler,
}: {
  kalemler: {
    id: string;
    miktar: number;
    birim_fiyat?: number;
    urun: { birim: string; fiyat: number } | null;
  }[];
}) {
  return (
    <ul className="divide-y divide-cizgi overflow-hidden rounded-[20px] border border-cizgi bg-yuzey">
      {kalemler.map((k) => {
        const fiyat = k.birim_fiyat ?? k.urun?.fiyat ?? 0;
        return (
          <li
            key={k.id}
            className="flex items-center justify-between gap-3 px-3.5 py-3"
          >
            <span className="text-[14px] font-bold">
              {miktarYaz(k.miktar, k.urun?.birim ?? "adet")}
            </span>
            <span className="text-[14px] font-black">
              {para(k.miktar * fiyat)}
            </span>
          </li>
        );
      })}
      {kalemler.length === 0 && (
        <li className="px-4 py-6 text-center text-sm text-gri">Kalem yok.</li>
      )}
    </ul>
  );
}
