"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { bugun, para, parseTutar } from "@/lib/format";
import type { Cari } from "@/lib/types";

type OcrSonuc = {
  tedarikci?: string | null;
  tarih?: string | null;
  toplam?: number | null;
  kdv?: number | null;
  fatura_no?: string | null;
};

export default function FaturaTaraPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [asama, setAsama] = useState<"sec" | "isleniyor" | "onay" | "tamam">(
    "sec"
  );
  const [hata, setHata] = useState("");
  const [belgeYolu, setBelgeYolu] = useState("");
  const [onizleme, setOnizleme] = useState("");
  const [saticilar, setSaticilar] = useState<Cari[]>([]);

  const [cariId, setCariId] = useState("");
  const [yeniTedarikci, setYeniTedarikci] = useState("");
  const [tarih, setTarih] = useState(bugun());
  const [tutar, setTutar] = useState("");
  const [faturaNo, setFaturaNo] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sonHareketId, setSonHareketId] = useState<string | null>(null);
  const [sonCariId, setSonCariId] = useState<string | null>(null);
  const [tamamMesaj, setTamamMesaj] = useState("");

  const dosyaSecildi = async (f: File) => {
    setHata("");
    setAsama("isleniyor");
    setOnizleme(URL.createObjectURL(f));

    const uzanti = f.name.toLowerCase().endsWith(".png") ? "png" : "jpg";
    const yol = `${crypto.randomUUID()}.${uzanti}`;
    const { error: upErr } = await supabase.storage
      .from("belgeler")
      .upload(yol, f, { contentType: f.type || "image/jpeg" });
    if (upErr) {
      setHata("Görsel yüklenemedi. Tekrar deneyin.");
      setAsama("sec");
      return;
    }
    setBelgeYolu(yol);

    const [{ data: sats }, ocr] = await Promise.all([
      supabase
        .from("cariler")
        .select("*")
        .eq("tip", "satici")
        .eq("aktif", true)
        .order("unvan"),
      supabase.functions.invoke("fatura-ocr", { body: { path: yol } }),
    ]);
    const liste = (sats as Cari[]) ?? [];
    setSaticilar(liste);

    if (ocr.error || ocr.data?.error) {
      setHata("Görsel okunamadı — bilgileri elle tamamlayabilirsiniz.");
    }
    const s: OcrSonuc = ocr.data?.sonuc ?? {};
    if (s.tarih && /^\d{4}-\d{2}-\d{2}$/.test(s.tarih)) setTarih(s.tarih);
    if (typeof s.toplam === "number" && s.toplam > 0)
      setTutar(String(s.toplam).replace(".", ","));
    if (s.fatura_no) setFaturaNo(String(s.fatura_no));
    if (s.tedarikci) {
      const ad = s.tedarikci.toLocaleLowerCase("tr");
      const eslesen = liste.find(
        (c) =>
          c.unvan.toLocaleLowerCase("tr").includes(ad) ||
          ad.includes(c.unvan.toLocaleLowerCase("tr"))
      );
      if (eslesen) {
        setCariId(eslesen.id);
      } else {
        setCariId("");
        setYeniTedarikci(s.tedarikci);
      }
    }
    setAsama("onay");
  };

  const kaydet = async () => {
    setHata("");
    const t = parseTutar(tutar);
    if (isNaN(t) || t <= 0) {
      setHata("Geçerli bir tutar girin.");
      return;
    }
    if (!cariId && !yeniTedarikci.trim()) {
      setHata("Toptancı seçin veya yeni toptancı adı girin.");
      return;
    }
    setKaydediliyor(true);

    let hedefCari = cariId;
    if (!hedefCari) {
      const { data: yeni, error: cErr } = await supabase
        .from("cariler")
        .insert({ tip: "satici", unvan: yeniTedarikci.trim() })
        .select("id")
        .single();
      if (cErr || !yeni) {
        setHata("Toptancı oluşturulamadı.");
        setKaydediliyor(false);
        return;
      }
      hedefCari = yeni.id;
    }

    const notlar = [
      faturaNo.trim() ? `Fatura No: ${faturaNo.trim()}` : "",
      aciklama.trim(),
    ]
      .filter(Boolean)
      .join(" · ");

    const { data: h, error: hErr } = await supabase
      .from("hareketler")
      .insert({
        cari_id: hedefCari,
        tur: "fatura",
        tutar: t,
        tarih,
        aciklama: notlar || null,
        belge_yolu: belgeYolu || null,
      })
      .select("id")
      .single();
    setKaydediliyor(false);
    if (hErr || !h) {
      setHata("Kayıt yapılamadı. Tekrar deneyin.");
      return;
    }
    setSonHareketId(h.id);
    setSonCariId(hedefCari);
    setTamamMesaj(`Fatura kaydedildi — ${para(t)}`);
    setAsama("tamam");
  };

  const geriAl = async () => {
    if (!sonHareketId) return;
    await supabase.from("hareketler").delete().eq("id", sonHareketId);
    setSonHareketId(null);
    sifirla("Kayıt geri alındı. Görsel arşivde durmaya devam ediyor.");
  };

  const sifirla = (mesaj = "") => {
    setAsama("sec");
    setHata(mesaj);
    setBelgeYolu("");
    setOnizleme("");
    setCariId("");
    setYeniTedarikci("");
    setTarih(bugun());
    setTutar("");
    setFaturaNo("");
    setAciklama("");
    setTamamMesaj("");
  };

  if (asama === "tamam") {
    return (
      <Shell title="Fiş / Fatura Tara">
        <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">✅</div>
          <p className="mt-3 font-bold">{tamamMesaj}</p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => sifirla()}
              className="rounded-xl bg-green-700 py-3 font-bold text-white"
            >
              Yeni Tarama
            </button>
            <button
              onClick={() => router.push(`/cariler/${sonCariId}`)}
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
    <Shell title="Fiş / Fatura Tara">
      {asama === "sec" && (
        <div className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-5xl">📷</div>
          <p className="mt-3 text-sm text-stone-500">
            Fatura veya fişin fotoğrafını çekin; tedarikçi, tarih ve tutarı
            otomatik okuyalım. Kaydetmeden önce her alanı
            düzeltebilirsiniz.
          </p>
          {hata && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {hata}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) dosyaSecildi(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-5 w-full rounded-xl bg-green-700 py-4 text-lg font-bold text-white"
          >
            Fotoğraf Çek / Seç
          </button>
        </div>
      )}

      {asama === "isleniyor" && (
        <div className="mt-10 rounded-2xl bg-white p-8 text-center shadow-sm">
          {onizleme && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={onizleme}
              alt="Fiş önizleme"
              className="mx-auto max-h-48 rounded-lg object-contain"
            />
          )}
          <p className="mt-4 animate-pulse font-bold text-stone-600">
            Okunuyor…
          </p>
        </div>
      )}

      {asama === "onay" && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          {onizleme && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={onizleme}
              alt="Fiş önizleme"
              className="mx-auto max-h-40 rounded-lg object-contain"
            />
          )}
          <p className="mt-2 text-center text-xs text-stone-400">
            Bilgileri kontrol edin, gerekirse düzeltin.
          </p>
          {hata && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {hata}
            </p>
          )}

          <label className="mt-3 block text-xs font-bold text-stone-400">
            Toptancı
          </label>
          <select
            value={cariId}
            onChange={(e) => setCariId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">➕ Yeni toptancı ekle…</option>
            {saticilar.map((c) => (
              <option key={c.id} value={c.id}>
                {c.unvan}
              </option>
            ))}
          </select>
          {!cariId && (
            <input
              value={yeniTedarikci}
              onChange={(e) => setYeniTedarikci(e.target.value)}
              placeholder="Yeni toptancı adı"
              className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
            />
          )}

          <label className="mt-3 block text-xs font-bold text-stone-400">
            Toplam Tutar
          </label>
          <input
            inputMode="decimal"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            placeholder="0,00"
            className="mt-1 w-full rounded-xl border-2 border-green-600 px-4 py-3 text-center text-2xl font-bold outline-none"
          />

          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-stone-400">
                Tarih
              </label>
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-stone-400">
                Fatura No
              </label>
              <input
                value={faturaNo}
                onChange={(e) => setFaturaNo(e.target.value)}
                placeholder="—"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <input
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Açıklama (isteğe bağlı)"
            className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => sifirla()}
              className="flex-1 rounded-xl bg-stone-100 py-3.5 font-bold text-stone-600"
            >
              Vazgeç
            </button>
            <button
              onClick={kaydet}
              disabled={kaydediliyor}
              className="flex-[2] rounded-xl bg-green-700 py-3.5 font-bold text-white disabled:opacity-60"
            >
              {kaydediliyor ? "Kaydediliyor…" : "Faturayı Kaydet"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
