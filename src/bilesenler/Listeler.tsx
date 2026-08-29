"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  DURUM_ETIKET,
  DURUM_STIL,
  adresYaz,
  gunlerYaz,
  miktarYaz,
  para,
  saat,
} from "@/lib/bicim";
import { sepetToplami } from "@/lib/veri";
import type { Abonelik, Sepet, Siparis, Urun } from "@/lib/tipler";

/* ------------------------------------------------------------------ */
/* Teslimat satırı                                                     */
/* ------------------------------------------------------------------ */

export function TeslimatSatiri({
  siparis,
  sira,
  secili,
  secimModu,
  isaretli,
  onTikla,
}: {
  siparis: Siparis;
  sira?: number;
  secili: boolean;
  secimModu: boolean;
  isaretli: boolean;
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
  const tutar = sepetToplami(sepet.kalemler ?? []);
  return (
    <motion.button
      layout
      onClick={onTikla}
      whileTap={{ scale: 0.985 }}
      className="w-full rounded-[20px] border border-cizgi bg-yuzey p-3 text-left hover:bg-yuzey2"
    >
      <span className="flex items-center gap-2">
        <span className="truncate text-[15px] font-bold">
          {sepet.musteri?.ad ?? "Müşteri"}
        </span>
        <Etiket>Açık sepet</Etiket>
        <span className="ml-auto text-[15px] font-black">{para(tutar)}</span>
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {(sepet.kalemler ?? []).slice(0, 8).map((k) => (
          <span
            key={k.id}
            className="rounded-hap bg-yuzey2 px-2.5 py-1 text-[12px] font-semibold"
          >
            {k.urun?.emoji ? `${k.urun.emoji} ` : ""}
            {k.urun?.ad ?? "Ürün"}
            <span className="text-gri">
              {" "}
              ×{k.miktar % 1 === 0 ? k.miktar : k.miktar.toFixed(1)}
            </span>
          </span>
        ))}
        {(sepet.kalemler?.length ?? 0) > 8 && (
          <span className="rounded-hap bg-yuzey2 px-2.5 py-1 text-[12px] font-semibold text-gri">
            +{(sepet.kalemler?.length ?? 0) - 8}
          </span>
        )}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Ürün listesi                                                        */
/* ------------------------------------------------------------------ */

export function UrunListesi({ urunler }: { urunler: Urun[] }) {
  const [arama, setArama] = useState("");
  const [kategori, setKategori] = useState<string | null>(null);

  const kategoriler = useMemo(
    () => [...new Set(urunler.map((u) => u.kategori))].sort(),
    [urunler],
  );

  const suzulmus = useMemo(() => {
    const a = arama.trim().toLocaleLowerCase("tr");
    return urunler.filter(
      (u) =>
        (!kategori || u.kategori === kategori) &&
        (!a || u.ad.toLocaleLowerCase("tr").includes(a)),
    );
  }, [urunler, arama, kategori]);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 bg-yuzey/85 px-1 pb-2 pt-1 backdrop-blur-xl">
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Ürün ara…"
          className="h-11 w-full rounded-hap border border-cizgi bg-yuzey2 px-4 text-sm font-medium outline-none transition-all placeholder:text-gri/70 focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12"
        />
        <div className="ince-kaydirma -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Cip aktif={!kategori} onClick={() => setKategori(null)}>
            Tümü
          </Cip>
          {kategoriler.map((k) => (
            <Cip
              key={k}
              aktif={kategori === k}
              onClick={() => setKategori(kategori === k ? null : k)}
            >
              {k}
            </Cip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pb-4">
        <AnimatePresence initial={false}>
          {suzulmus.map((u) => (
            <motion.div
              key={u.id}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.18 }}
              className="rounded-[20px] border border-cizgi bg-yuzey p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl leading-none">{u.emoji ?? "🛒"}</span>
                <span
                  className={`rounded-hap px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    u.stok > 0
                      ? "bg-yuzey2 text-gri"
                      : "bg-kirmizi-sis text-kirmizi-koyu"
                  }`}
                >
                  {u.stok > 0 ? `${u.stok} ${u.birim}` : "Tükendi"}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug">
                {u.ad}
              </p>
              <p className="mt-1 text-[15px] font-black text-kirmizi">
                {para(u.fiyat)}
                <span className="text-[11px] font-bold text-gri">
                  {" "}
                  /{u.birim}
                </span>
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {suzulmus.length === 0 && (
        <p className="py-10 text-center text-sm text-gri">Ürün bulunamadı.</p>
      )}
    </div>
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

function Cip({
  children,
  aktif,
  onClick,
}: {
  children: React.ReactNode;
  aktif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-hap px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
        aktif ? "bg-kontrast text-white" : "bg-yuzey2 text-gri hover:bg-cizgi"
      }`}
    >
      {children}
    </button>
  );
}

export function KalemListesi({
  kalemler,
}: {
  kalemler: {
    id: string;
    miktar: number;
    birim_fiyat?: number;
    urun: { ad: string; birim: string; emoji: string | null; fiyat: number } | null;
  }[];
}) {
  return (
    <ul className="divide-y divide-cizgi overflow-hidden rounded-[20px] border border-cizgi bg-yuzey">
      {kalemler.map((k) => {
        const fiyat = k.birim_fiyat ?? k.urun?.fiyat ?? 0;
        return (
          <li key={k.id} className="flex items-center gap-3 px-3.5 py-3">
            <span className="text-xl leading-none">{k.urun?.emoji ?? "🛒"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">
                {k.urun?.ad ?? "Ürün"}
              </span>
              <span className="text-[12px] font-semibold text-gri">
                {miktarYaz(k.miktar, k.urun?.birim ?? "adet")} × {para(fiyat)}
              </span>
            </span>
            <span className="shrink-0 text-[14px] font-black">
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
