"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import {
  bugun,
  para,
  parseTutar,
  TUR_LABEL,
  YONTEM_LABEL,
} from "@/lib/format";
import type { Cari, HareketTur, OdemeYontemi } from "@/lib/types";

const TURLER: { tur: HareketTur; renk: string }[] = [
  { tur: "gelen_odeme", renk: "bg-green-700" },
  { tur: "veresiye", renk: "bg-amber-600" },
  { tur: "yapilan_odeme", renk: "bg-sky-700" },
  { tur: "fatura", renk: "bg-stone-700" },
];

const ODEME_TURLERI: HareketTur[] = ["gelen_odeme", "yapilan_odeme"];

function IslemInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [tur, setTur] = useState<HareketTur>(
    (TURLER.find((t) => t.tur === params.get("tur"))?.tur ??
      "gelen_odeme") as HareketTur
  );
  const [cariId, setCariId] = useState(params.get("cari") ?? "");
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [arama, setArama] = useState("");
  const [tutar, setTutar] = useState("");
  const [yontem, setYontem] = useState<OdemeYontemi>("nakit");
  const [tarih, setTarih] = useState(bugun());
  const [aciklama, setAciklama] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [tamam, setTamam] = useState<string | null>(null);

  const gerekliTip =
    tur === "gelen_odeme" || tur === "veresiye" ? "alici" : "satici";

  useEffect(() => {
    supabase
      .from("cariler")
      .select("*")
      .eq("tip", gerekliTip)
      .eq("aktif", true)
      .order("unvan")
      .then(({ data }) => setCariler((data as Cari[]) ?? []));
  }, [gerekliTip]);

  // Tür değişince seçili cari yanlış tipte kalmasın
  useEffect(() => {
    if (cariId && cariler.length && !cariler.some((c) => c.id === cariId)) {
      setCariId("");
    }
  }, [cariler, cariId]);

  const filtreli = useMemo(
    () =>
      cariler.filter((c) =>
        c.unvan.toLocaleLowerCase("tr").includes(arama.toLocaleLowerCase("tr"))
      ),
    [cariler, arama]
  );

  const secili = cariler.find((c) => c.id === cariId);
  const odemeMi = ODEME_TURLERI.includes(tur);

  const kaydet = async () => {
    setHata("");
    const t = parseTutar(tutar);
    if (!cariId) {
      setHata("Önce cari seçin.");
      return;
    }
    if (isNaN(t) || t <= 0) {
      setHata("Geçerli bir tutar girin.");
      return;
    }
    setBekliyor(true);
    const { error } = await supabase.from("hareketler").insert({
      cari_id: cariId,
      tur,
      tutar: t,
      odeme_yontemi: odemeMi ? yontem : null,
      aciklama: aciklama.trim() || null,
      tarih,
    });
    setBekliyor(false);
    if (error) {
      setHata("Kayıt yapılamadı. Tekrar deneyin.");
      return;
    }
    setTamam(`${TUR_LABEL[tur]} kaydedildi: ${secili?.unvan} — ${para(t)}`);
  };

  if (tamam) {
    return (
      <Shell title="İşlem">
        <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">✅</div>
          <p className="mt-3 font-bold">{tamam}</p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => {
                setTamam(null);
                setTutar("");
                setAciklama("");
                setCariId("");
              }}
              className="rounded-xl bg-green-700 py-3 font-bold text-white"
            >
              Yeni İşlem
            </button>
            <button
              onClick={() => router.push(`/cariler/${cariId}`)}
              className="rounded-xl bg-stone-200 py-3 font-bold text-stone-700"
            >
              Cari Hesaba Git
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="İşlem Girişi">
      <div className="grid grid-cols-2 gap-2">
        {TURLER.map((t) => (
          <button
            key={t.tur}
            onClick={() => setTur(t.tur)}
            className={`rounded-xl py-3 text-sm font-bold ${
              tur === t.tur
                ? `${t.renk} text-white`
                : "bg-white text-stone-500 shadow-sm"
            }`}
          >
            {TUR_LABEL[t.tur]}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">
          {gerekliTip === "alici" ? "Müşteri" : "Toptancı"} Seç
        </div>
        {secili ? (
          <div className="flex items-center justify-between rounded-xl bg-green-50 px-4 py-3">
            <span className="font-bold text-green-800">{secili.unvan}</span>
            <button
              onClick={() => setCariId("")}
              className="text-sm text-stone-400"
            >
              Değiştir
            </button>
          </div>
        ) : (
          <>
            <input
              placeholder="Ara…"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-base outline-none focus:border-green-600"
            />
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {filtreli.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCariId(c.id)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-stone-50 active:bg-green-50"
                >
                  {c.unvan}
                </button>
              ))}
              {filtreli.length === 0 && (
                <p className="py-3 text-center text-xs text-stone-400">
                  Bulunamadı.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={tutar}
          onChange={(e) => setTutar(e.target.value)}
          className="w-full rounded-xl border-2 border-green-600 px-4 py-4 text-center text-3xl font-bold outline-none"
        />

        {odemeMi && (
          <div className="mt-3 flex gap-2">
            {(Object.keys(YONTEM_LABEL) as OdemeYontemi[]).map((y) => (
              <button
                key={y}
                onClick={() => setYontem(y)}
                className={`flex-1 rounded-xl py-2.5 text-xs font-bold ${
                  yontem === y
                    ? "bg-green-700 text-white"
                    : "bg-stone-100 text-stone-500"
                }`}
              >
                {YONTEM_LABEL[y]}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />
          <input
            placeholder="Açıklama (isteğe bağlı)"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            className="flex-[2] rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />
        </div>

        {hata && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}

        <button
          onClick={kaydet}
          disabled={bekliyor}
          className="mt-3 w-full rounded-xl bg-green-700 py-4 text-lg font-bold text-white disabled:opacity-60"
        >
          {bekliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </Shell>
  );
}

export default function IslemPage() {
  return (
    <Suspense>
      <IslemInner />
    </Suspense>
  );
}
