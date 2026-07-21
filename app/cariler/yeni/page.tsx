"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { buyukHarf } from "@/lib/format";
import type { CariTip } from "@/lib/types";

function YeniCariInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [tip, setTip] = useState<CariTip>(
    params.get("tip") === "satici" ? "satici" : "alici"
  );
  const [unvan, setUnvan] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    const { data, error } = await supabase
      .from("cariler")
      .insert({
        tip,
        unvan: unvan.trim(),
        telefon: telefon.trim() || null,
        adres: adres.trim() || null,
      })
      .select("id")
      .single();
    setBekliyor(false);
    if (error || !data) {
      setHata("Kayıt yapılamadı. Tekrar deneyin.");
      return;
    }
    router.replace(`/cariler/${data.id}`);
  };

  return (
    <Shell title="Yeni Cari">
      <form onSubmit={kaydet} className="space-y-3">
        <div className="flex gap-2">
          {(["satici", "alici"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTip(t)}
              className={`flex-1 rounded-xl py-3 text-sm font-bold ${
                tip === t
                  ? "bg-green-700 text-white"
                  : "bg-white text-stone-600 shadow-sm"
              }`}
            >
              {t === "alici" ? "Müşteri" : "Toptancı"}
            </button>
          ))}
        </div>
        <input
          required
          placeholder={tip === "alici" ? "Müşteri adı" : "Toptancı adı"}
          value={unvan}
          onChange={(e) => setUnvan(buyukHarf(e.target.value))}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base outline-none focus:border-green-600"
        />
        <input
          placeholder="Telefon (isteğe bağlı)"
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base outline-none focus:border-green-600"
        />
        <textarea
          placeholder="Adres (isteğe bağlı)"
          value={adres}
          onChange={(e) => setAdres(buyukHarf(e.target.value))}
          rows={2}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base outline-none focus:border-green-600"
        />
        {hata && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}
        <button
          type="submit"
          disabled={bekliyor}
          className="w-full rounded-xl bg-green-700 py-3.5 text-base font-bold text-white disabled:opacity-60"
        >
          {bekliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>
    </Shell>
  );
}

export default function YeniCariPage() {
  return (
    <Suspense>
      <YeniCariInner />
    </Suspense>
  );
}
