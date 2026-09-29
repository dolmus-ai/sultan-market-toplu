"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { BuyukHarfGirdi } from "@/components/Girdi";
import { supabase } from "@/lib/supabase";
import { buyukHarf, KART_YONTEMLERI, YONTEM_LABEL } from "@/lib/format";
import type { Kart, KartYontemi } from "@/lib/types";

export default function KartlarPage() {
  const [kartlar, setKartlar] = useState<Kart[]>([]);
  const [yeniAd, setYeniAd] = useState<Record<KartYontemi, string>>({
    kredi_karti: "",
    yemek_karti: "",
  });
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  const [duzenAd, setDuzenAd] = useState("");
  const [mesaj, setMesaj] = useState("");

  const yukle = useCallback(async () => {
    const { data } = await supabase.from("kartlar").select("*").order("ad");
    setKartlar((data as Kart[]) ?? []);
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const ekle = async (tip: KartYontemi) => {
    const ad = buyukHarf(yeniAd[tip].trim());
    if (!ad) return;
    const { error } = await supabase.from("kartlar").insert({ tip, ad });
    setMesaj(
      error
        ? `Kart eklenemedi — aynı adda kart var. Listede pasifse "Aktif Et" diyebilirsiniz.`
        : `${ad} eklendi.`
    );
    setYeniAd((m) => ({ ...m, [tip]: "" }));
    yukle();
  };

  const adKaydet = async (k: Kart) => {
    const ad = buyukHarf(duzenAd.trim());
    setDuzenlenen(null);
    if (!ad || ad === k.ad) return;
    const { error } = await supabase
      .from("kartlar")
      .update({ ad })
      .eq("id", k.id);
    setMesaj(
      error
        ? "Ad değiştirilemedi — aynı adda kart olabilir."
        : "Kart adı güncellendi."
    );
    yukle();
  };

  const aktifDegistir = async (k: Kart) => {
    await supabase.from("kartlar").update({ aktif: !k.aktif }).eq("id", k.id);
    setMesaj(
      k.aktif
        ? `${k.ad} pasife alındı — yeni işlemlerde görünmez, geçmiş kayıtlar durur.`
        : `${k.ad} tekrar kullanıma açıldı.`
    );
    yukle();
  };

  const sil = async (k: Kart) => {
    const { count } = await supabase
      .from("hareketler")
      .select("id", { count: "exact", head: true })
      .eq("kart_id", k.id);
    const kullanim = count ?? 0;
    const uyari = kullanim
      ? `${k.ad} kartı ${kullanim} kayıtta kullanılmış. Silerseniz o kayıtlarda hangi kartla ödendiği bilgisi kaybolur (tutarlar durur). Bunun yerine "Pasife Al" diyebilirsiniz. Yine de silinsin mi?`
      : `${k.ad} silinsin mi?`;
    if (!confirm(uyari)) return;
    const { error } = await supabase.from("kartlar").delete().eq("id", k.id);
    setMesaj(error ? "Silinemedi." : `${k.ad} silindi.`);
    yukle();
  };

  return (
    <Shell title="Kartlar">
      <p className="rounded-2xl bg-white p-4 text-sm text-stone-500 shadow-sm">
        Kartla ödeme alınca hangi kartla ödendiği kaydedilir. Kartların adını
        siz verirsiniz; işlem ekranından da yeni kart ekleyebilirsiniz.
      </p>

      {mesaj && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {mesaj}
        </p>
      )}

      {KART_YONTEMLERI.map((tip) => {
        const liste = kartlar.filter((k) => k.tip === tip);
        return (
          <div key={tip} className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold text-stone-700">
              {YONTEM_LABEL[tip]} Kartları
            </div>

            {liste.length === 0 && (
              <p className="text-xs text-stone-400">Henüz kart eklenmemiş.</p>
            )}

            <ul className="divide-y divide-stone-100">
              {liste.map((k) => (
                <li key={k.id} className="py-2.5">
                  {duzenlenen === k.id ? (
                    <div className="flex gap-2">
                      <BuyukHarfGirdi
                        autoFocus
                        value={duzenAd}
                        onValueChange={setDuzenAd}
                        className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-green-600"
                      />
                      <button
                        onClick={() => adKaydet(k)}
                        className="rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white"
                      >
                        Kaydet
                      </button>
                      <button
                        onClick={() => setDuzenlenen(null)}
                        className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-bold text-stone-500"
                      >
                        Vazgeç
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          k.aktif ? "" : "text-stone-400 line-through"
                        }`}
                      >
                        💳 {k.ad}
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => {
                            setDuzenlenen(k.id);
                            setDuzenAd(k.ad);
                          }}
                          className="rounded bg-stone-100 px-2 py-1 font-bold text-stone-600"
                        >
                          Adını Değiştir
                        </button>
                        <button
                          onClick={() => aktifDegistir(k)}
                          className="rounded bg-stone-100 px-2 py-1 font-bold text-stone-600"
                        >
                          {k.aktif ? "Pasife Al" : "Aktif Et"}
                        </button>
                        <button
                          onClick={() => sil(k)}
                          className="rounded bg-red-50 px-2 py-1 font-bold text-red-500"
                        >
                          Sil
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex gap-2">
              <BuyukHarfGirdi
                placeholder={
                  tip === "kredi_karti"
                    ? "Yeni kart adı (örn. GARANTİ POS)"
                    : "Yeni kart adı (örn. SODEXO)"
                }
                value={yeniAd[tip]}
                onValueChange={(v) => setYeniAd((m) => ({ ...m, [tip]: v }))}
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-600"
              />
              <button
                onClick={() => ekle(tip)}
                disabled={!yeniAd[tip].trim()}
                className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Ekle
              </button>
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
