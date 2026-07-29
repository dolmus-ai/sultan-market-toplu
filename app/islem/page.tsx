"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import { BuyukHarfGirdi, TutarGirdi } from "@/components/Girdi";
import { supabase } from "@/lib/supabase";
import {
  bugun,
  buyukHarf,
  para,
  parseTutar,
  tutarYaz,
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
  const [sonKayitId, setSonKayitId] = useState<string | null>(null);
  const [borcKapandi, setBorcKapandi] = useState(false);

  // Sesli işlem: kayıt → yazıya çevirme → alanları doldurma (kayıt yine
  // kullanıcının onayıyla, Kaydet düğmesiyle yapılır)
  const [sesDurum, setSesDurum] = useState<"hazir" | "kayit" | "cozum">(
    "hazir"
  );
  const [sesMesaj, setSesMesaj] = useState("");
  const kayitci = useRef<MediaRecorder | null>(null);
  const parcalar = useRef<Blob[]>([]);

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

  // Yazılan isim listede yoksa tek dokunuşla yeni cari aç ve seç
  const hizliEkle = async () => {
    const ad = arama.trim();
    if (!ad) return;
    const { data, error } = await supabase
      .from("cariler")
      .insert({ tip: gerekliTip, unvan: ad })
      .select("*")
      .single();
    if (error || !data) {
      setHata("Eklenemedi. Tekrar deneyin.");
      return;
    }
    setCariler((mevcut) =>
      [...mevcut, data as Cari].sort((a, b) =>
        a.unvan.localeCompare(b.unvan, "tr")
      )
    );
    setCariId(data.id);
    setArama("");
  };

  const sesliBaslat = async () => {
    setHata("");
    setSesMesaj("");
    try {
      const akis = await navigator.mediaDevices.getUserMedia({ audio: true });
      // iOS Safari webm desteklemez; mp4/aac üretir
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const mr = new MediaRecorder(akis, { mimeType: mime });
      parcalar.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) parcalar.current.push(e.data);
      };
      mr.onstop = () => {
        akis.getTracks().forEach((t) => t.stop());
        sesCozumle(new Blob(parcalar.current, { type: mime }), mime);
      };
      kayitci.current = mr;
      mr.start();
      setSesDurum("kayit");
    } catch {
      setHata("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin.");
    }
  };

  const sesliDurdur = () => {
    kayitci.current?.stop();
    setSesDurum("cozum");
  };

  const sesCozumle = async (blob: Blob, mime: string) => {
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const { data, error } = await supabase.functions.invoke("sesli-islem", {
      body: { audio: b64, mime },
    });
    setSesDurum("hazir");
    if (error || data?.error || !data?.sonuc) {
      setHata("Ses anlaşılamadı. Tekrar deneyin veya elle girin.");
      return;
    }
    const s = data.sonuc as {
      tur?: string | null;
      cari?: string | null;
      tutar?: number | null;
      odeme_yontemi?: string | null;
      tarih?: string | null;
      aciklama?: string | null;
    };

    const yeniTur: HareketTur = TURLER.some((t) => t.tur === s.tur)
      ? (s.tur as HareketTur)
      : tur;
    setTur(yeniTur);
    if (typeof s.tutar === "number" && s.tutar > 0) setTutar(tutarYaz(s.tutar));
    if (s.odeme_yontemi && s.odeme_yontemi in YONTEM_LABEL)
      setYontem(s.odeme_yontemi as OdemeYontemi);
    if (s.tarih && /^\d{4}-\d{2}-\d{2}$/.test(s.tarih)) setTarih(s.tarih);
    if (s.aciklama) setAciklama(buyukHarf(String(s.aciklama)));

    // Cari, söylenen türe uygun tipin taze listesinde aranır (tür değişince
    // eldeki liste eski tipte kalabiliyor; liste de birlikte güncellenir ki
    // "yanlış tip" temizliği seçimi silmesin)
    const tip =
      yeniTur === "gelen_odeme" || yeniTur === "veresiye" ? "alici" : "satici";
    const ad = (s.cari ?? "").trim();
    if (ad) {
      const { data: cs } = await supabase
        .from("cariler")
        .select("*")
        .eq("tip", tip)
        .eq("aktif", true)
        .order("unvan");
      const liste = (cs as Cari[]) ?? [];
      setCariler(liste);
      const adL = ad.toLocaleLowerCase("tr");
      const bulunan = liste.find((c) => {
        const u = c.unvan.toLocaleLowerCase("tr");
        return u.includes(adL) || adL.includes(u);
      });
      if (bulunan) {
        setCariId(bulunan.id);
      } else {
        setCariId("");
        setArama(buyukHarf(ad));
      }
    }
    setSesMesaj(`🎤 "${data.metin}" — bilgileri kontrol edip kaydedin.`);
  };

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
    const { data: kayit, error } = await supabase
      .from("hareketler")
      .insert({
        cari_id: cariId,
        tur,
        tutar: t,
        odeme_yontemi: odemeMi ? yontem : null,
        aciklama: aciklama.trim() || null,
        tarih,
      })
      .select("id")
      .single();
    setBekliyor(false);
    if (error || !kayit) {
      setHata("Kayıt yapılamadı. Tekrar deneyin.");
      return;
    }
    // Ödeme borcu tam kapattıysa müşteriyi silme seçeneği sunulur
    // (fiş taramasıyla açılan geçici veresiye müşterilerinin kalması gerekmiyor)
    let kapandi = false;
    if (tur === "gelen_odeme") {
      const { data: oz } = await supabase
        .from("cari_ozet")
        .select("kalan_bakiye")
        .eq("id", cariId)
        .single();
      kapandi = oz != null && Number(oz.kalan_bakiye) === 0;
    }
    setBorcKapandi(kapandi);
    setSonKayitId(kayit.id);
    setTamam(`${TUR_LABEL[tur]} kaydedildi: ${secili?.unvan} — ${para(t)}`);
  };

  const musteriSil = async () => {
    if (!cariId) return;
    if (
      !confirm(
        `${secili?.unvan ?? "Müşteri"} ve geçmişteki TÜM hareketleri kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?`
      )
    )
      return;
    const { error } = await supabase.from("cariler").delete().eq("id", cariId);
    if (error) {
      setHata("Silinemedi. Tekrar deneyin.");
      return;
    }
    setCariler((mevcut) => mevcut.filter((c) => c.id !== cariId));
    setBorcKapandi(false);
    setSonKayitId(null);
    setTamam(null);
    setTutar("");
    setAciklama("");
    setCariId("");
    setHata("Müşteri silindi.");
  };

  const geriAl = async () => {
    if (sonKayitId) {
      await supabase.from("hareketler").delete().eq("id", sonKayitId);
    }
    setSonKayitId(null);
    setBorcKapandi(false);
    setTamam(null);
    setTutar("");
    setAciklama("");
    setHata("Kayıt geri alındı.");
  };

  if (tamam) {
    return (
      <Shell title="İşlem">
        <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">✅</div>
          <p className="mt-3 font-bold">{tamam}</p>
          {borcKapandi && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Borç tamamen kapandı. Müşterinin kalmasına gerek yoksa
              silebilirsiniz.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {borcKapandi && (
              <button
                onClick={musteriSil}
                className="rounded-xl bg-red-600 py-3 font-bold text-white"
              >
                Müşteriyi Sil (borç kapandı)
              </button>
            )}
            <button
              onClick={() => {
                setTamam(null);
                setBorcKapandi(false);
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
            <button
              onClick={geriAl}
              className="rounded-xl bg-red-50 py-3 font-bold text-red-600"
            >
              Geri Al (kaydı sil)
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="İşlem Girişi">
      <button
        onClick={sesDurum === "kayit" ? sesliDurdur : sesliBaslat}
        disabled={sesDurum === "cozum"}
        className={`mb-3 w-full rounded-xl py-3 text-sm font-bold ${
          sesDurum === "kayit"
            ? "animate-pulse bg-red-600 text-white"
            : "bg-white text-stone-700 shadow-sm"
        } disabled:opacity-60`}
      >
        {sesDurum === "kayit"
          ? "⏹ Dinliyorum… bitirmek için dokunun"
          : sesDurum === "cozum"
            ? "Çözümleniyor…"
            : "🎤 Sesli İşlem — konuşarak doldurun"}
      </button>
      {sesMesaj && (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          {sesMesaj}
        </p>
      )}
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
            <BuyukHarfGirdi
              placeholder="Ara…"
              value={arama}
              onValueChange={setArama}
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
              {arama.trim() &&
                !filtreli.some(
                  (c) =>
                    c.unvan.toLocaleLowerCase("tr") ===
                    arama.trim().toLocaleLowerCase("tr")
                ) && (
                  <button
                    onClick={hizliEkle}
                    className="block w-full rounded-lg bg-green-50 px-3 py-2.5 text-left text-sm font-bold text-green-800"
                  >
                    ➕ &quot;{arama.trim()}&quot; adıyla yeni{" "}
                    {gerekliTip === "alici" ? "müşteri" : "toptancı"} ekle
                  </button>
                )}
              {filtreli.length === 0 && !arama.trim() && (
                <p className="py-3 text-center text-xs text-stone-400">
                  Kayıt yok — yukarıya adını yazıp ekleyin.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <TutarGirdi
          inputMode="decimal"
          placeholder="0,00"
          value={tutar}
          onValueChange={setTutar}
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
          <BuyukHarfGirdi
            placeholder="Açıklama (isteğe bağlı)"
            value={aciklama}
            onValueChange={setAciklama}
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
