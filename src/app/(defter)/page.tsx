"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/defter/components/Shell";
import { supabase } from "@/defter/lib/supabase";
import { bugun, gunBasiISO, para, saatFmt, TUR_LABEL } from "@/defter/lib/format";
import type { Hareket } from "@/defter/lib/types";

type Ozet = {
  gelenOdeme: number;
  yapilanOdeme: number;
  veresiye: number;
  fatura: number;
  toplamAlacak: number; // müşterilerden
  toplamBorc: number; // toptancılara
};

export default function AnaSayfa() {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [sonIslemler, setSonIslemler] = useState<Hareket[]>([]);

  const yukle = useCallback(async () => {
      const [gunluk, bakiyeler, son] = await Promise.all([
        supabase.from("hareketler").select("tur,tutar").eq("tarih", bugun()),
        supabase.from("cari_ozet").select("tip,kalan_bakiye").eq("aktif", true),
        // Son işlemler: bugün + dün (2 günlük) — liste uzun tutulur
        supabase
          .from("hareketler")
          .select("*, cariler(unvan,tip), profiles(full_name), kartlar(ad)")
          .gte("created_at", gunBasiISO(1))
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const g = { gelen_odeme: 0, yapilan_odeme: 0, veresiye: 0, fatura: 0 };
      for (const h of gunluk.data ?? []) {
        g[h.tur as keyof typeof g] += Number(h.tutar);
      }
      let toplamAlacak = 0;
      let toplamBorc = 0;
      for (const c of bakiyeler.data ?? []) {
        const k = Number(c.kalan_bakiye);
        if (k <= 0) continue;
        if (c.tip === "alici") toplamAlacak += k;
        else toplamBorc += k;
      }
      setOzet({
        gelenOdeme: g.gelen_odeme,
        yapilanOdeme: g.yapilan_odeme,
        veresiye: g.veresiye,
        fatura: g.fatura,
        toplamAlacak,
        toplamBorc,
      });
      setSonIslemler((son.data as Hareket[]) ?? []);
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const islemSil = async (h: Hareket) => {
    if (
      !confirm(
        `${h.cariler?.unvan ?? ""} — ${TUR_LABEL[h.tur]} ${para(
          Number(h.tutar)
        )} silinsin mi?`
      )
    )
      return;
    await supabase.from("hareketler").delete().eq("id", h.id);
    yukle();
  };

  const hizli = [
    { href: "/islem?tur=gelen_odeme", label: "Ödeme Al", desc: "Müşteriden", renk: "bg-green-700" },
    { href: "/islem?tur=veresiye", label: "Veresiye Yaz", desc: "Müşteriye", renk: "bg-amber-600" },
    { href: "/islem?tur=yapilan_odeme", label: "Ödeme Yap", desc: "Toptancıya", renk: "bg-sky-700" },
    { href: "/islem?tur=fatura", label: "Fatura Ekle", desc: "Toptancıdan", renk: "bg-stone-700" },
  ];

  return (
    <Shell title="Özet">
      <div className="grid grid-cols-2 gap-2">
        {hizli.map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className={`${b.renk} rounded-2xl px-4 py-4 text-white shadow active:scale-95`}
          >
            <div className="text-base font-bold">{b.label}</div>
            <div className="text-xs opacity-80">{b.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Link
          href="/fatura-tara"
          className="flex flex-[2] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-green-700 bg-white py-3.5 font-bold text-green-800 shadow-sm active:scale-95"
        >
          📷 Fiş / Fatura Tara
        </Link>
        <Link
          href="/kartlar"
          className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-white py-3.5 text-sm font-bold text-stone-600 shadow-sm active:scale-95"
        >
          💳 Kartlar
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs text-stone-500">Müşterilerdeki Alacak</div>
          <div className="mt-1 text-xl font-bold text-amber-600">
            {ozet ? para(ozet.toplamAlacak) : "—"}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs text-stone-500">Toptancılara Borç</div>
          <div className="mt-1 text-xl font-bold text-red-600">
            {ozet ? para(ozet.toplamBorc) : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">Bugün</div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-stone-500">Gelen Ödeme</div>
          <div className="text-right font-semibold text-green-700">
            {ozet ? para(ozet.gelenOdeme) : "—"}
          </div>
          <div className="text-stone-500">Yapılan Ödeme</div>
          <div className="text-right font-semibold text-sky-700">
            {ozet ? para(ozet.yapilanOdeme) : "—"}
          </div>
          <div className="text-stone-500">Yazılan Veresiye</div>
          <div className="text-right font-semibold text-amber-600">
            {ozet ? para(ozet.veresiye) : "—"}
          </div>
          <div className="text-stone-500">Gelen Fatura</div>
          <div className="text-right font-semibold text-stone-700">
            {ozet ? para(ozet.fatura) : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-bold text-stone-700">Son İşlemler</div>
          <div className="text-xs text-stone-400">
            Son 2 gün{sonIslemler.length ? ` · ${sonIslemler.length} kayıt` : ""}
          </div>
        </div>
        {sonIslemler.length === 0 && (
          <p className="text-sm text-stone-400">Son 2 günde işlem yok.</p>
        )}
        <ul className="max-h-[28rem] divide-y divide-stone-100 overflow-y-auto">
          {sonIslemler.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold">
                  {h.cariler?.unvan}
                </div>
                <div className="text-xs text-stone-400">
                  {TUR_LABEL[h.tur]}
                  {h.kartlar?.ad ? ` · 💳 ${h.kartlar.ad}` : ""} ·{" "}
                  {h.profiles?.full_name} · {saatFmt(h.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold">
                  {para(Number(h.tutar))}
                </div>
                <button
                  onClick={() => islemSil(h)}
                  className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-500"
                  aria-label="Sil"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
