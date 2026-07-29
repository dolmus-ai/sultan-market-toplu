"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { girisBaslik, odemeBaslik, para } from "@/lib/format";
import type { CariOzet, CariTip } from "@/lib/types";

function CarilerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tip = (params.get("tip") === "alici" ? "alici" : "satici") as CariTip;
  const [liste, setListe] = useState<CariOzet[]>([]);
  const [tumCariler, setTumCariler] = useState<
    { tip: CariTip; aktif: boolean }[]
  >([]);
  const [arama, setArama] = useState("");
  const [pasifGoster, setPasifGoster] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    setYukleniyor(true);
    supabase
      .from("cari_ozet")
      .select("*")
      .eq("tip", tip)
      .order("kalan_bakiye", { ascending: false })
      .then(({ data }) => {
        setListe((data as CariOzet[]) ?? []);
        setYukleniyor(false);
      });
  }, [tip]);

  // Sekme başlıklarındaki toptancı/müşteri sayıları için (tip'ten bağımsız,
  // bir kez yüklenir)
  useEffect(() => {
    supabase
      .from("cariler")
      .select("tip, aktif")
      .then(({ data }) =>
        setTumCariler((data as { tip: CariTip; aktif: boolean }[]) ?? [])
      );
  }, []);

  const sayi = (t: CariTip) =>
    tumCariler.filter((c) => c.tip === t && (pasifGoster || c.aktif)).length;

  const filtreli = useMemo(
    () =>
      liste.filter(
        (c) =>
          (pasifGoster || c.aktif) &&
          c.unvan.toLocaleLowerCase("tr").includes(arama.toLocaleLowerCase("tr"))
      ),
    [liste, arama, pasifGoster]
  );

  return (
    <Shell title="Cari Hesaplar">
      <div className="flex gap-2">
        {(["satici", "alici"] as const).map((t) => (
          <button
            key={t}
            onClick={() => router.replace(`/cariler?tip=${t}`)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
              tip === t
                ? "bg-green-700 text-white"
                : "bg-white text-stone-600 shadow-sm"
            }`}
          >
            {t === "alici" ? "Müşteriler" : "Toptancılar"}
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                tip === t ? "bg-white/20" : "bg-stone-100 text-stone-500"
              }`}
            >
              {sayi(t)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          placeholder="Ara…"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-base outline-none focus:border-green-600"
        />
        <Link
          href={`/cariler/yeni?tip=${tip}`}
          className="shrink-0 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white"
        >
          + Yeni
        </Link>
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-xs text-stone-500">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pasifGoster}
            onChange={(e) => setPasifGoster(e.target.checked)}
          />
          Pasif carileri de göster
        </label>
        <span className="font-semibold">
          {sayi("satici")} toptancı · {sayi("alici")} müşteri
        </span>
      </div>

      <div className="mt-2 px-1 text-xs text-stone-400">
        Toplam {sayi(tip)} {tip === "satici" ? "toptancı" : "müşteri"}
        {arama.trim() && ` · listelenen ${filtreli.length}`}
      </div>

      <div className="mt-3 space-y-2">
        {yukleniyor && <p className="text-center text-stone-400">Yükleniyor…</p>}
        {!yukleniyor && filtreli.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-400">
            Kayıt bulunamadı.
          </p>
        )}
        {filtreli.map((c) => {
          const kalan = Number(c.kalan_bakiye);
          return (
            <Link
              key={c.id}
              href={`/cariler/${c.id}`}
              className={`block rounded-2xl bg-white p-4 shadow-sm active:bg-stone-50 ${
                !c.aktif ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold">
                  {c.unvan}
                  {!c.aktif && (
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      (pasif)
                    </span>
                  )}
                </div>
                {c.telefon && (
                  <div className="text-xs text-stone-400">{c.telefon}</div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[11px] text-stone-400">
                    {girisBaslik(tip)}
                  </div>
                  <div className="text-sm font-semibold text-stone-700">
                    {para(Number(c.toplam_giris))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-400">
                    {odemeBaslik(tip)}
                  </div>
                  <div className="text-sm font-semibold text-sky-700">
                    {para(Number(c.toplam_odeme))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-400">Kalan Bakiye</div>
                  <div
                    className={`text-sm font-bold ${
                      kalan > 0
                        ? "text-red-600"
                        : kalan < 0
                          ? "text-sky-600"
                          : "text-green-700"
                    }`}
                  >
                    {para(kalan)}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}

export default function CarilerPage() {
  return (
    <Suspense>
      <CarilerInner />
    </Suspense>
  );
}
