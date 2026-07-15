"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { para, saatFmt, TUR_LABEL, YONTEM_LABEL } from "@/lib/format";
import type { CariOzet, Hareket, OdemeYontemi } from "@/lib/types";

type Donem = "gun" | "hafta" | "ay";

const baslangic = (d: Donem) => {
  const t = new Date();
  if (d === "hafta") t.setDate(t.getDate() - 6);
  if (d === "ay") t.setDate(1);
  const ay = String(t.getMonth() + 1).padStart(2, "0");
  const gun = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${ay}-${gun}`;
};

export default function RaporlarPage() {
  const [donem, setDonem] = useState<Donem>("gun");
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [bakiyeler, setBakiyeler] = useState<CariOzet[]>([]);
  const [audit, setAudit] = useState<Hareket[]>([]);

  useEffect(() => {
    supabase
      .from("hareketler")
      .select("*")
      .gte("tarih", baslangic(donem))
      .then(({ data }) => setHareketler((data as Hareket[]) ?? []));
  }, [donem]);

  useEffect(() => {
    supabase
      .from("cari_ozet")
      .select("*")
      .eq("aktif", true)
      .gt("kalan_bakiye", 0)
      .order("kalan_bakiye", { ascending: false })
      .then(({ data }) => setBakiyeler((data as CariOzet[]) ?? []));
    supabase
      .from("hareketler")
      .select("*, cariler(unvan,tip), profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAudit((data as Hareket[]) ?? []));
  }, []);

  const toplamlar = useMemo(() => {
    const t = { gelen_odeme: 0, yapilan_odeme: 0, veresiye: 0, fatura: 0 };
    const yontemler: Record<OdemeYontemi, number> = {
      nakit: 0,
      kredi_karti: 0,
      yemek_karti: 0,
    };
    for (const h of hareketler) {
      t[h.tur] += Number(h.tutar);
      if (h.tur === "gelen_odeme" && h.odeme_yontemi)
        yontemler[h.odeme_yontemi] += Number(h.tutar);
    }
    return { t, yontemler };
  }, [hareketler]);

  const borcluMusteriler = bakiyeler.filter((c) => c.tip === "alici").slice(0, 5);
  const borcluToptancilar = bakiyeler
    .filter((c) => c.tip === "satici")
    .slice(0, 5);

  return (
    <Shell title="Raporlar">
      <div className="flex gap-2">
        {(
          [
            ["gun", "Bugün"],
            ["hafta", "Son 7 Gün"],
            ["ay", "Bu Ay"],
          ] as const
        ).map(([d, l]) => (
          <button
            key={d}
            onClick={() => setDonem(d)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
              donem === d
                ? "bg-green-700 text-white"
                : "bg-white text-stone-600 shadow-sm"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">Özet</div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          {(Object.keys(TUR_LABEL) as (keyof typeof TUR_LABEL)[]).map((k) => (
            <div key={k} className="contents">
              <div className="text-stone-500">{TUR_LABEL[k]}</div>
              <div className="text-right font-semibold">
                {para(toplamlar.t[k])}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-stone-100 pt-2">
          <div className="mb-1 text-xs font-bold text-stone-400">
            Gelen Ödeme Dağılımı
          </div>
          <div className="grid grid-cols-3 text-center text-xs">
            {(Object.keys(YONTEM_LABEL) as OdemeYontemi[]).map((y) => (
              <div key={y}>
                <div className="text-stone-400">{YONTEM_LABEL[y]}</div>
                <div className="font-bold">{para(toplamlar.yontemler[y])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            En Borçlu Müşteriler
          </div>
          {borcluMusteriler.length === 0 && (
            <p className="text-xs text-stone-400">Borçlu müşteri yok. 🎉</p>
          )}
          {borcluMusteriler.map((c) => (
            <Link
              key={c.id}
              href={`/cariler/${c.id}`}
              className="flex justify-between py-1.5 text-sm"
            >
              <span>{c.unvan}</span>
              <span className="font-bold text-red-600">
                {para(Number(c.kalan_bakiye))}
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            En Çok Borçlu Olduğumuz Toptancılar
          </div>
          {borcluToptancilar.length === 0 && (
            <p className="text-xs text-stone-400">Toptancı borcu yok. 🎉</p>
          )}
          {borcluToptancilar.map((c) => (
            <Link
              key={c.id}
              href={`/cariler/${c.id}`}
              className="flex justify-between py-1.5 text-sm"
            >
              <span>{c.unvan}</span>
              <span className="font-bold text-red-600">
                {para(Number(c.kalan_bakiye))}
              </span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            İşlem Geçmişi (kim, ne zaman, ne girdi)
          </div>
          <ul className="divide-y divide-stone-100">
            {audit.map((h) => (
              <li key={h.id} className="py-2 text-xs">
                <span className="font-bold">{h.profiles?.full_name}</span>{" "}
                <span className="text-stone-500">
                  {saatFmt(h.created_at)} —
                </span>{" "}
                {h.cariler?.unvan}: {TUR_LABEL[h.tur]}{" "}
                <span className="font-bold">{para(Number(h.tutar))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
