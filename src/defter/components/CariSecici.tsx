"use client";

import { useMemo } from "react";
import { BuyukHarfGirdi } from "@/defter/components/Girdi";
import type { Cari } from "@/defter/lib/types";

type Props = {
  liste: Cari[];
  cariId: string;
  // Aranan metin aynı zamanda yeni cari adıdır: listede tıklanmazsa bu ad
  // yeni cari olarak açılır.
  aramaAd: string;
  etiket: string; // "Toptancı" / "Müşteri"
  onSec: (id: string) => void;
  onAramaAd: (ad: string) => void;
};

export default function CariSecici({
  liste,
  cariId,
  aramaAd,
  etiket,
  onSec,
  onAramaAd,
}: Props) {
  const secili = liste.find((c) => c.id === cariId);

  const filtreli = useMemo(() => {
    const a = aramaAd.trim().toLocaleLowerCase("tr");
    if (!a) return liste;
    const kucuk = (c: Cari) => c.unvan.toLocaleLowerCase("tr");
    const tam = liste.filter((c) => kucuk(c).includes(a));
    if (tam.length) return tam;
    // Tam eşleşme yoksa kelime bazlı ara: fişten okunan uzun ünvan
    // ("AK GIDA SAN. TİC. LTD. ŞTİ.") kayıtlı kısa adı gizlemesin.
    // En çok kelimesi tutan cari üstte.
    const kelimeler = a.split(/\s+/).filter((k) => k.length >= 3);
    if (!kelimeler.length) return [];
    return liste
      .map((c) => ({
        c,
        puan: kelimeler.filter((k) => kucuk(c).includes(k)).length,
      }))
      .filter((p) => p.puan > 0)
      .sort((x, y) => y.puan - x.puan)
      .map((p) => p.c);
  }, [liste, aramaAd]);

  if (secili) {
    return (
      <div className="mt-1 flex items-center justify-between rounded-xl bg-green-50 px-4 py-3">
        <span className="font-bold text-green-800">{secili.unvan}</span>
        <button onClick={() => onSec("")} className="text-sm text-stone-400">
          Değiştir
        </button>
      </div>
    );
  }

  const tamEslesme = filtreli.some(
    (c) =>
      c.unvan.toLocaleLowerCase("tr") === aramaAd.trim().toLocaleLowerCase("tr")
  );

  return (
    <>
      {/* Şirket adı elle girilir; alana dokununca (fişten okunan) metnin
          tamamı seçilir, üzerine tek seferde yazılabilir. */}
      <BuyukHarfGirdi
        tumunuSec
        value={aramaAd}
        onValueChange={onAramaAd}
        placeholder={`${etiket} adını yazın veya listeden seçin…`}
        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-600"
      />
      <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
        {filtreli.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              onSec(c.id);
              onAramaAd("");
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-stone-50 active:bg-green-50"
          >
            {c.unvan}
          </button>
        ))}
      </div>
      {aramaAd.trim() && !tamEslesme && (
        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          ➕ Listeden seçmezseniz &quot;{aramaAd.trim()}&quot; adıyla yeni{" "}
          {etiket.toLocaleLowerCase("tr")} açılacak.
        </p>
      )}
      {!aramaAd.trim() && liste.length === 0 && (
        <p className="py-2 text-center text-xs text-stone-400">
          Kayıt yok — yukarıya adını yazın, yeni açılsın.
        </p>
      )}
    </>
  );
}
