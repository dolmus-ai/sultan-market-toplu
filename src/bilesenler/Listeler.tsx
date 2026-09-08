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
import { sepetToplami } from "@/lib/veri";
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
        <span className="mt-0.5 block text-[11px] font-semibold text-gri">
          {siparis.odeme_yontemi === "veresiye" ? "Veresiye" : "Tahsilat"}
        </span>
      </span>
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
}: {
  abonelik: Abonelik;
  bugun: boolean;
  onTikla: () => void;
}) {
  const tutar = sepetToplami(abonelik.kalemler ?? []);
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
        <span className="mt-1 block truncate text-[12px] font-semibold text-gri">
          {(abonelik.kalemler ?? [])
            .map((k) => `${k.urun?.emoji ?? ""} ${k.urun?.ad ?? ""}`.trim())
            .join(", ") || "Kalem yok"}
        </span>
      </span>
      <span className="shrink-0 text-right text-[15px] font-black">
        {para(tutar)}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Sepet satırı                                                        */
/* ------------------------------------------------------------------ */

export function SepetSatiri({
  sepet,
  onTikla,
}: {
  sepet: Sepet;
  onTikla: () => void;
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
        {para(sepetToplami(sepet.kalemler ?? []))}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Ortak küçük parçalar                                                */
/* ------------------------------------------------------------------ */

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
 * ederken önemli olan kaç birim taşıdığı; bu yüzden yalnızca miktar duruyor.
 */
export function KalemListesi({
  kalemler,
}: {
  kalemler: { id: string; miktar: number; urun: { birim: string } | null }[];
}) {
  return (
    <ul className="divide-y divide-cizgi overflow-hidden rounded-[20px] border border-cizgi bg-yuzey">
      {kalemler.map((k) => (
        <li key={k.id} className="px-3.5 py-3 text-[14px] font-bold">
          {miktarYaz(k.miktar, k.urun?.birim ?? "adet")}
        </li>
      ))}
      {kalemler.length === 0 && (
        <li className="px-4 py-6 text-center text-sm text-gri">Kalem yok.</li>
      )}
    </ul>
  );
}
