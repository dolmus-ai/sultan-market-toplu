"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { bugun, buyukHarf, para, parseTutar } from "@/lib/format";
import type { Cari } from "@/lib/types";

// Tarama modu: toptancı faturası mı, müşteri veresiye fişi mi?
type Mod = "fatura" | "veresiye";

type OcrSonuc = {
  tedarikci?: string | null;
  el_yazisi?: string | null;
  tarih?: string | null;
  toplam?: number | null;
  kdv?: number | null;
  fatura_no?: string | null;
  markalar?: { marka?: string | null; tutar?: number | null }[] | null;
};

// Bir fiş birden fazla kaleme (markaya/cariye) bölünebilir; her kalem
// kendi carisine ayrı hareket olarak yazılır. markalar: bu kalemi besleyen
// OCR markaları — kayıt sırasında seçilen cariye eşlenerek öğrenilir.
type Kalem = {
  cariId: string;
  yeniCariAd: string;
  tutar: string;
  markalar?: string[];
};

const bosKalem = (): Kalem => ({ cariId: "", yeniCariAd: "", tutar: "" });

const MOD_META: Record<
  Mod,
  {
    cariTip: "satici" | "alici";
    cariAd: string;
    kayitAd: string;
    kaydetBtn: string;
  }
> = {
  fatura: {
    cariTip: "satici",
    cariAd: "Toptancı",
    kayitAd: "Fatura",
    kaydetBtn: "Faturayı Kaydet",
  },
  veresiye: {
    cariTip: "alici",
    cariAd: "Müşteri",
    kayitAd: "Veresiye",
    kaydetBtn: "Veresiyeyi Kaydet",
  },
};

export default function FaturaTaraPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mod, setMod] = useState<Mod>("fatura");
  const [asama, setAsama] = useState<"sec" | "isleniyor" | "onay" | "tamam">(
    "sec"
  );
  const [hata, setHata] = useState("");
  const [belgeYolu, setBelgeYolu] = useState("");
  const [onizleme, setOnizleme] = useState("");
  const [cariListe, setCariListe] = useState<Cari[]>([]);

  const [kalemler, setKalemler] = useState<Kalem[]>([bosKalem()]);
  const [tarih, setTarih] = useState(bugun());
  const [faturaNo, setFaturaNo] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sonHareketIds, setSonHareketIds] = useState<string[]>([]);
  const [sonCariId, setSonCariId] = useState<string | null>(null);
  const [tamamMesaj, setTamamMesaj] = useState("");

  const meta = MOD_META[mod];

  const kalemGuncelle = (i: number, degisiklik: Partial<Kalem>) =>
    setKalemler((ks) =>
      ks.map((k, j) => (j === i ? { ...k, ...degisiklik } : k))
    );

  const kalemSil = (i: number) =>
    setKalemler((ks) => (ks.length > 1 ? ks.filter((_, j) => j !== i) : ks));

  // Depolama maliyetini düşürmek için görseli yüklemeden önce telefonda küçült
  // (uzun kenar 1600px, %72 JPEG — fiş yazısı bu boyutta net okunur)
  const kucult = (f: File): Promise<Blob> =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const oran = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * oran);
        c.height = Math.round(img.height * oran);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => resolve(b ?? f), "image/jpeg", 0.72);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(f);
      };
      img.src = url;
    });

  const dosyaSecildi = async (f: File) => {
    setHata("");
    setAsama("isleniyor");
    setOnizleme(URL.createObjectURL(f));

    const kucukGorsel = await kucult(f);
    const yol = `${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("belgeler")
      .upload(yol, kucukGorsel, { contentType: "image/jpeg" });
    if (upErr) {
      setHata("Görsel yüklenemedi. Tekrar deneyin.");
      setAsama("sec");
      return;
    }
    setBelgeYolu(yol);

    const [{ data: cs }, { data: es }, ocr] = await Promise.all([
      supabase
        .from("cariler")
        .select("*")
        .eq("tip", meta.cariTip)
        .eq("aktif", true)
        .order("unvan"),
      supabase.from("marka_esleme").select("marka, cari_id"),
      supabase.functions.invoke("fatura-ocr", { body: { path: yol, mod } }),
    ]);
    const liste = (cs as Cari[]) ?? [];
    setCariListe(liste);
    // Öğrenilmiş marka→cari eşlemeleri (markalar DB'de büyük harfle tutulur)
    const esMap = new Map(
      ((es as { marka: string; cari_id: string }[] | null) ?? []).map((e) => [
        e.marka,
        e.cari_id,
      ])
    );

    if (ocr.error || ocr.data?.error) {
      setHata("Görsel okunamadı — bilgileri elle tamamlayabilirsiniz.");
    }
    const s: OcrSonuc = ocr.data?.sonuc ?? {};
    if (s.tarih && /^\d{4}-\d{2}-\d{2}$/.test(s.tarih)) setTarih(s.tarih);
    if (mod === "fatura" && s.fatura_no) setFaturaNo(String(s.fatura_no));

    const tutarStr = (n: number | null | undefined) =>
      typeof n === "number" && n > 0 ? String(n).replace(".", ",") : "";

    // Ad üzerinden gevşek cari eşleştirme (iki yönlü "içeriyor" kontrolü)
    const esle = (ad: string) => {
      const a = ad.toLocaleLowerCase("tr");
      return liste.find((c) => {
        const u = c.unvan.toLocaleLowerCase("tr");
        return u.includes(a) || a.includes(u);
      });
    };

    const markalar =
      mod === "fatura"
        ? (s.markalar ?? []).filter((m) => m?.marka && String(m.marka).trim())
        : [];

    if (markalar.length > 0) {
      // Aynı firmanın farklı bayilikleri ayrı cari tutulur. Önce öğrenilmiş
      // eşlemeler uygulanır: aynı cariye eşlenen markalar tek kaleme toplanır
      // (örn. LAYS + DORITOS → "MB GIDA - CİPS", NAMET → "... - İÇİM").
      const firma = (s.tedarikci ?? "").trim();
      const firmaL = firma.toLocaleLowerCase("tr");

      const gruplar = new Map<
        string,
        { markalar: string[]; toplam: number; eksik: boolean }
      >();
      const yeniler: { marka: string; tutar: number | null }[] = [];
      for (const m of markalar) {
        const marka = buyukHarf(String(m.marka).trim());
        const t =
          typeof m.tutar === "number" && m.tutar > 0
            ? m.tutar
            : markalar.length === 1 && typeof s.toplam === "number"
              ? s.toplam
              : null;
        const cid = esMap.get(marka);
        if (cid && liste.some((c) => c.id === cid)) {
          const g = gruplar.get(cid) ?? {
            markalar: [],
            toplam: 0,
            eksik: false,
          };
          g.markalar.push(marka);
          if (t == null) g.eksik = true;
          else g.toplam += t;
          gruplar.set(cid, g);
        } else {
          yeniler.push({ marka, tutar: t });
        }
      }

      const sonucKalemler: Kalem[] = [];
      for (const [cid, g] of gruplar) {
        sonucKalemler.push({
          cariId: cid,
          yeniCariAd: "",
          markalar: g.markalar,
          // Bir markanın ara toplamı okunamadıysa toplam güvenilmez — boş kalır
          tutar: g.eksik ? "" : tutarStr(g.toplam),
        });
      }
      for (const y of yeniler) {
        // Eşlemesi olmayan marka: ada göre cari önerilir; kullanıcının onay
        // ekranındaki seçimi kayıt sırasında eşleme olarak öğrenilir.
        const oneriAd = buyukHarf(firma ? `${firma} - ${y.marka}` : y.marka);
        const markaL = y.marka.toLocaleLowerCase("tr");
        // Yalnızca marka adı geçen cariler aday olur — sade firma carisiyle
        // eşleşip bayilikleri tek cariye karıştırmamak için.
        const adaylar = liste.filter((c) =>
          c.unvan.toLocaleLowerCase("tr").includes(markaL)
        );
        const eslesen =
          adaylar.find(
            (c) =>
              firmaL &&
              c.unvan.toLocaleLowerCase("tr").includes(firmaL.split(" ")[0])
          ) ?? adaylar[0];
        sonucKalemler.push({
          cariId: eslesen?.id ?? "",
          yeniCariAd: eslesen ? "" : oneriAd,
          markalar: [y.marka],
          tutar: tutarStr(y.tutar),
        });
      }
      setKalemler(sonucKalemler);
    } else {
      // Marka tespit edilemedi: eski davranış — tek kalem, firma/el yazısı adı
      const okunanAd = (mod === "fatura" ? s.tedarikci : s.el_yazisi) ?? "";
      const eslesen = okunanAd ? esle(okunanAd) : undefined;
      setKalemler([
        {
          cariId: eslesen?.id ?? "",
          yeniCariAd: eslesen ? "" : buyukHarf(okunanAd),
          tutar: tutarStr(s.toplam),
        },
      ]);
    }
    setAsama("onay");
  };

  const kaydet = async () => {
    setHata("");
    for (const k of kalemler) {
      const t = parseTutar(k.tutar);
      if (isNaN(t) || t <= 0) {
        setHata(
          kalemler.length > 1
            ? "Her kalem için geçerli bir tutar girin."
            : "Geçerli bir tutar girin."
        );
        return;
      }
      if (!k.cariId && !k.yeniCariAd.trim()) {
        setHata(
          `${meta.cariAd} seçin veya yeni ${meta.cariAd.toLocaleLowerCase("tr")} adı girin.`
        );
        return;
      }
    }
    setKaydediliyor(true);

    const notlar = [
      mod === "fatura" && faturaNo.trim() ? `Fatura No: ${faturaNo.trim()}` : "",
      aciklama.trim(),
    ]
      .filter(Boolean)
      .join(" · ");

    const ids: string[] = [];
    let ilkCari: string | null = null;
    let toplamT = 0;
    for (const k of kalemler) {
      let hedefCari = k.cariId;
      if (!hedefCari) {
        const { data: yeni, error: cErr } = await supabase
          .from("cariler")
          .insert({ tip: meta.cariTip, unvan: buyukHarf(k.yeniCariAd.trim()) })
          .select("id")
          .single();
        if (cErr || !yeni) {
          // Yarım kayıt bırakmamak için o ana dek yazılan hareketleri geri al
          if (ids.length) {
            await supabase.from("hareketler").delete().in("id", ids);
          }
          setHata(`${meta.cariAd} oluşturulamadı.`);
          setKaydediliyor(false);
          return;
        }
        hedefCari = yeni.id;
      }

      const t = parseTutar(k.tutar);
      const { data: h, error: hErr } = await supabase
        .from("hareketler")
        .insert({
          cari_id: hedefCari,
          tur: mod,
          tutar: t,
          tarih,
          aciklama: notlar || null,
          belge_yolu: belgeYolu || null,
        })
        .select("id")
        .single();
      if (hErr || !h) {
        if (ids.length) {
          await supabase.from("hareketler").delete().in("id", ids);
        }
        setHata("Kayıt yapılamadı. Tekrar deneyin.");
        setKaydediliyor(false);
        return;
      }
      ids.push(h.id);
      toplamT += t;
      if (!ilkCari) ilkCari = hedefCari;

      // Öğrenme: bu kalemi besleyen markalar artık seçilen cariye eşlenir;
      // sonraki taramalarda aynı markalar otomatik bu cariye toplanır.
      // (Eşleme yazılamazsa kayıt yine geçerlidir — hata yutuluyor.)
      if (k.markalar?.length) {
        await supabase
          .from("marka_esleme")
          .upsert(
            k.markalar.map((marka) => ({ marka, cari_id: hedefCari })),
            { onConflict: "marka" }
          );
      }
    }
    setKaydediliyor(false);
    setSonHareketIds(ids);
    setSonCariId(ilkCari);
    setTamamMesaj(
      kalemler.length > 1
        ? `${meta.kayitAd} kaydedildi — ${para(toplamT)} (${kalemler.length} cariye bölündü)`
        : `${meta.kayitAd} kaydedildi — ${para(toplamT)}`
    );
    setAsama("tamam");
  };

  const geriAl = async () => {
    if (!sonHareketIds.length) return;
    await supabase.from("hareketler").delete().in("id", sonHareketIds);
    setSonHareketIds([]);
    sifirla("Kayıt geri alındı. Görsel arşivde durmaya devam ediyor.");
  };

  const sifirla = (mesaj = "") => {
    setAsama("sec");
    setHata(mesaj);
    setBelgeYolu("");
    setOnizleme("");
    setCariListe([]);
    setKalemler([bosKalem()]);
    setTarih(bugun());
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
          <div className="flex gap-2">
            {(["fatura", "veresiye"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMod(m)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${
                  mod === m
                    ? "bg-green-700 text-white"
                    : "bg-stone-100 text-stone-600"
                }`}
              >
                {m === "fatura" ? "Toptancı Faturası" : "Müşteri Veresiyesi"}
              </button>
            ))}
          </div>
          <div className="mt-5 text-5xl">📷</div>
          <p className="mt-3 text-sm text-stone-500">
            {mod === "fatura"
              ? "Fatura veya fişin fotoğrafını çekin; tedarikçi, marka ve tutarı otomatik okuyalım. Aynı firmanın farklı bayilikleri markaya göre ayrı cariye yazılır; hangi markanın hangi cariye gideceğini seçimlerinizden öğreniriz."
              : "Üzerine müşterinin adresi (veya adı) el yazısıyla yazılmış fişin fotoğrafını çekin; el yazısını, tarihi ve tutarı otomatik okuyalım. El yazısı müşteri adı olarak kaydedilir."}
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
            {kalemler.length > 1
              ? "Fiş, markalara göre ayrı carilere bölündü. Kontrol edin, gerekirse düzeltin."
              : "Bilgileri kontrol edin, gerekirse düzeltin."}
          </p>
          {hata && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {hata}
            </p>
          )}

          {kalemler.map((k, i) => (
            <div
              key={i}
              className={
                kalemler.length > 1
                  ? "mt-3 rounded-xl border border-stone-200 p-3"
                  : ""
              }
            >
              {kalemler.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-400">
                    {i + 1}. kalem
                  </span>
                  <button
                    onClick={() => kalemSil(i)}
                    className="text-xs font-bold text-red-500"
                  >
                    Kaldır
                  </button>
                </div>
              )}

              <label className="mt-3 block text-xs font-bold text-stone-400">
                {meta.cariAd}
              </label>
              <select
                value={k.cariId}
                onChange={(e) => kalemGuncelle(i, { cariId: e.target.value })}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">
                  ➕ Yeni {meta.cariAd.toLocaleLowerCase("tr")} ekle…
                </option>
                {cariListe.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.unvan}
                  </option>
                ))}
              </select>
              {!k.cariId && (
                <input
                  value={k.yeniCariAd}
                  onChange={(e) =>
                    kalemGuncelle(i, { yeniCariAd: buyukHarf(e.target.value) })
                  }
                  placeholder={
                    mod === "fatura"
                      ? "Yeni toptancı adı (Firma - Marka)"
                      : "Müşteri adı (fişteki el yazısı)"
                  }
                  className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
                />
              )}
              {(k.markalar?.length ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-stone-400">
                  Okunan marka: {k.markalar!.join(", ")} — seçtiğiniz cari bu
                  markalar için öğrenilir.
                </p>
              )}

              <label className="mt-3 block text-xs font-bold text-stone-400">
                {kalemler.length > 1 ? "Tutar" : "Toplam Tutar"}
              </label>
              <input
                inputMode="decimal"
                value={k.tutar}
                onChange={(e) => kalemGuncelle(i, { tutar: e.target.value })}
                placeholder="0,00"
                className="mt-1 w-full rounded-xl border-2 border-green-600 px-4 py-3 text-center text-2xl font-bold outline-none"
              />
            </div>
          ))}

          {mod === "fatura" && (
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => setKalemler((ks) => [...ks, bosKalem()])}
                className="text-sm font-bold text-green-700"
              >
                ＋ Kalem ekle (fişi böl)
              </button>
              {kalemler.length > 1 && (
                <span className="text-sm font-bold text-stone-600">
                  Toplam:{" "}
                  {para(
                    kalemler.reduce(
                      (s, k) => s + (parseTutar(k.tutar) || 0),
                      0
                    )
                  )}
                </span>
              )}
            </div>
          )}

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
            {mod === "fatura" && (
              <div className="flex-1">
                <label className="block text-xs font-bold text-stone-400">
                  Fatura No
                </label>
                <input
                  value={faturaNo}
                  onChange={(e) => setFaturaNo(buyukHarf(e.target.value))}
                  placeholder="—"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
                />
              </div>
            )}
          </div>

          <input
            value={aciklama}
            onChange={(e) => setAciklama(buyukHarf(e.target.value))}
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
              {kaydediliyor ? "Kaydediliyor…" : meta.kaydetBtn}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
