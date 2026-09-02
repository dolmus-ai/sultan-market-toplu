"use client";

import { useCallback, useEffect, useState } from "react";
import { BuyukHarfGirdi } from "./Girdi";
import { supabase } from "@/lib/supabase";
import { buyukHarf, YONTEM_LABEL } from "@/lib/format";
import type { Kart, KartYontemi } from "@/lib/types";

// Kartla ödemede "hangi kartla?" sorusunu soran seçici. Kart adlarını
// kullanıcı kendi verir; listede yoksa buradan tek dokunuşla eklenir.
export default function KartSecici({
  tip,
  kartId,
  onSecim,
}: {
  tip: KartYontemi;
  kartId: string;
  onSecim: (id: string, ad: string) => void;
}) {
  const [kartlar, setKartlar] = useState<Kart[]>([]);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState("");

  const yukle = useCallback(async () => {
    const { data } = await supabase
      .from("kartlar")
      .select("*")
      .eq("tip", tip)
      .eq("aktif", true)
      .order("ad");
    setKartlar((data as Kart[]) ?? []);
  }, [tip]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  // Yöntem değişince başka tipin kartı seçili kalmasın
  useEffect(() => {
    if (kartId && kartlar.length && !kartlar.some((k) => k.id === kartId)) {
      onSecim("", "");
    }
  }, [kartlar, kartId, onSecim]);

  const kartEkleVeSec = (k: Kart) => {
    setKartlar((m) =>
      [...m.filter((x) => x.id !== k.id), k].sort((a, b) =>
        a.ad.localeCompare(b.ad, "tr")
      )
    );
    onSecim(k.id, k.ad);
    setYeniAd("");
    setEkleAcik(false);
  };

  const pasifiAc = async (ad: string) => {
    const { data } = await supabase
      .from("kartlar")
      .update({ aktif: true })
      .eq("tip", tip)
      .eq("ad", ad)
      .select("*")
      .single();
    return (data as Kart | null) ?? null;
  };

  const ekle = async () => {
    const ad = buyukHarf(yeniAd.trim());
    if (!ad) return;
    const mevcut = kartlar.find((k) => k.ad === ad);
    if (mevcut) {
      onSecim(mevcut.id, mevcut.ad);
      setYeniAd("");
      setEkleAcik(false);
      return;
    }
    setBekliyor(true);
    setHata("");
    const { data, error } = await supabase
      .from("kartlar")
      .insert({ tip, ad })
      .select("*")
      .single();
    if (error || !data) {
      // Aynı adla pasife alınmış bir kart varsa yenisini açmak yerine onu
      // tekrar kullanıma alırız (benzersizlik kuralına takılmasın)
      const geriAlinan = error?.code === "23505" ? await pasifiAc(ad) : null;
      setBekliyor(false);
      if (!geriAlinan) {
        setHata("Kart eklenemedi. Tekrar deneyin.");
        return;
      }
      kartEkleVeSec(geriAlinan);
      return;
    }
    setBekliyor(false);
    kartEkleVeSec(data as Kart);
  };

  return (
    <div className="mt-3 rounded-xl bg-stone-50 p-3">
      {/* Kart yönetimi (ad değiştirme/silme) ayrı ekranda; buradan çıkmak
          yarım kalan işlemi kaybettireceği için yalnızca ekleme var */}
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">
        Hangi {YONTEM_LABEL[tip]}?
      </div>

      <div className="flex flex-wrap gap-2">
        {kartlar.map((k) => (
          <button
            key={k.id}
            onClick={() =>
              kartId === k.id ? onSecim("", "") : onSecim(k.id, k.ad)
            }
            className={`rounded-xl px-3 py-2 text-sm font-bold ${
              kartId === k.id
                ? "bg-green-700 text-white"
                : "bg-white text-stone-600 shadow-sm"
            }`}
          >
            💳 {k.ad}
          </button>
        ))}
        {!ekleAcik && (
          <button
            onClick={() => setEkleAcik(true)}
            className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-green-800 shadow-sm"
          >
            ➕ Yeni Kart
          </button>
        )}
      </div>

      {ekleAcik && (
        <div className="mt-2 flex gap-2">
          <BuyukHarfGirdi
            autoFocus
            placeholder="Kart adı (örn. GARANTİ POS)"
            value={yeniAd}
            onValueChange={setYeniAd}
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-600"
          />
          <button
            onClick={ekle}
            disabled={bekliyor || !yeniAd.trim()}
            className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {bekliyor ? "…" : "Ekle"}
          </button>
          <button
            onClick={() => {
              setEkleAcik(false);
              setYeniAd("");
              setHata("");
            }}
            className="rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-stone-500 shadow-sm"
          >
            Vazgeç
          </button>
        </div>
      )}

      {hata && <p className="mt-2 text-xs text-red-600">{hata}</p>}
      {!kartlar.length && !ekleAcik && (
        <p className="mt-2 text-xs text-stone-400">
          Kayıtlı kart yok — &quot;Yeni Kart&quot; ile adını verip ekleyin.
        </p>
      )}
    </div>
  );
}
