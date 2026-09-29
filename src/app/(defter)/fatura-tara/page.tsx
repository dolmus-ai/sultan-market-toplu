"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/defter/components/Shell";
import CariSecici from "@/defter/components/CariSecici";
import { BuyukHarfGirdi, TutarGirdi } from "@/defter/components/Girdi";
import { supabase } from "@/defter/lib/supabase";
import { bugun, buyukHarf, para, parseTutar, tutarYaz } from "@/defter/lib/format";
import type { Cari } from "@/defter/lib/types";

// Tarama modu: toptancı faturası mı, müşteri veresiye fişi mi?
type Mod = "fatura" | "veresiye";

type OcrSonuc = {
  tedarikci?: string | null;
  el_yazisi?: string | null;
  tarih?: string | null;
  toplam?: number | null;
  kdv?: number | null;
  fatura_no?: string | null;
  // OCR marka listesi: eski biçim {marka, tutar}, sade biçim "MARKA"
  markalar?: ({ marka?: string | null; tutar?: number | null } | string)[] | null;
};

// Fatura tek cariye (firmaya) yazılır. Aynı firmanın farklı bayiliklerini ayrı
// takip etmek isteyen kullanıcı fişi elle kaleme bölebilir; uygulama markaya
// göre kendiliğinden bölme yapmaz.
type Kalem = {
  cariId: string;
  yeniCariAd: string;
  tutar: string;
};

const bosKalem = (): Kalem => ({ cariId: "", yeniCariAd: "", tutar: "" });

// OCR'ın döndürdüğü marka listesini "İÇİM, NAMET" gibi tek satıra çevirir
const markaListesi = (ms: OcrSonuc["markalar"]) =>
  (ms ?? [])
    .map((m) => (typeof m === "string" ? m : (m?.marka ?? "")))
    .map((m) => String(m).trim())
    .filter(Boolean)
    .join(", ");

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

// Yüklenen belgenin küçük önizlemesi: fotoğrafta görsel, PDF'te dosya adı
function Onizleme({
  onizleme,
  pdfAdi,
  boy,
}: {
  onizleme: string;
  pdfAdi: string;
  boy: string;
}) {
  if (pdfAdi) {
    return (
      <div className="mx-auto flex items-center justify-center gap-2 rounded-lg bg-stone-50 px-3 py-4">
        <span className="text-3xl">📄</span>
        <span className="truncate text-sm font-semibold text-stone-600">
          {pdfAdi}
        </span>
      </div>
    );
  }
  if (!onizleme) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={onizleme}
      alt="Belge önizleme"
      className={`mx-auto ${boy} rounded-lg object-contain`}
    />
  );
}

export default function FaturaTaraPage() {
  const router = useRouter();
  // Üç kaynak: kamera, galeri ve PDF (bazı toptancılar faturayı PDF gönderiyor)
  const kameraRef = useRef<HTMLInputElement>(null);
  const galeriRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [mod, setMod] = useState<Mod>("fatura");
  const [asama, setAsama] = useState<"sec" | "isleniyor" | "onay" | "tamam">(
    "sec"
  );
  const [hata, setHata] = useState("");
  const [belgeYolu, setBelgeYolu] = useState("");
  const [onizleme, setOnizleme] = useState("");
  // PDF yüklendiyse görsel önizleme yerine dosya adı gösterilir
  const [pdfAdi, setPdfAdi] = useState("");
  const [cariListe, setCariListe] = useState<Cari[]>([]);

  const [kalemler, setKalemler] = useState<Kalem[]>([bosKalem()]);
  const [tarih, setTarih] = useState(bugun());
  const [faturaNo, setFaturaNo] = useState("");
  // Fişte okunan markalar — sadece not; istenirse elle düzeltilir
  const [markaNotu, setMarkaNotu] = useState("");
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
    const pdfMi =
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    setPdfAdi(pdfMi ? f.name : "");
    setOnizleme(pdfMi ? "" : URL.createObjectURL(f));

    // PDF olduğu gibi yüklenir; fotoğraf yüklemeden önce küçültülür
    const govde = pdfMi ? f : await kucult(f);
    const yol = `${crypto.randomUUID()}.${pdfMi ? "pdf" : "jpg"}`;
    const { error: upErr } = await supabase.storage
      .from("belgeler")
      .upload(yol, govde, {
        contentType: pdfMi ? "application/pdf" : "image/jpeg",
      });
    if (upErr) {
      setHata(
        pdfMi
          ? "PDF yüklenemedi. Tekrar deneyin."
          : "Görsel yüklenemedi. Tekrar deneyin."
      );
      setAsama("sec");
      return;
    }
    setBelgeYolu(yol);

    const [{ data: cs }, ocr] = await Promise.all([
      supabase
        .from("cariler")
        .select("*")
        .eq("tip", meta.cariTip)
        .eq("aktif", true)
        .order("unvan"),
      supabase.functions.invoke("fatura-ocr", { body: { path: yol, mod } }),
    ]);
    const liste = (cs as Cari[]) ?? [];
    setCariListe(liste);

    if (ocr.error || ocr.data?.error) {
      setHata("Belge okunamadı — bilgileri elle tamamlayabilirsiniz.");
    }
    const s: OcrSonuc = ocr.data?.sonuc ?? {};
    if (s.tarih && /^\d{4}-\d{2}-\d{2}$/.test(s.tarih)) setTarih(s.tarih);
    if (mod === "fatura" && s.fatura_no) setFaturaNo(String(s.fatura_no));

    const tutarStr = (n: number | null | undefined) =>
      typeof n === "number" && n > 0 ? tutarYaz(n) : "";

    // Markalar yalnızca not olarak taşınır; fiş markaya göre bölünmez.
    if (mod === "fatura") setMarkaNotu(buyukHarf(markaListesi(s.markalar)));

    // Şirket/cari kendiliğinden seçilmez: okunan ad yalnızca öneri olarak
    // alana yazılır, kullanıcı listeden seçer ya da üstüne yazar (alana
    // dokununca metnin tamamı seçili gelir). OCR yanlış firmaya yazmasın.
    const okunanAd = (mod === "fatura" ? s.tedarikci : s.el_yazisi) ?? "";
    setKalemler([
      {
        cariId: "",
        yeniCariAd: buyukHarf(okunanAd),
        tutar: tutarStr(s.toplam),
      },
    ]);
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
      mod === "fatura" && markaNotu.trim() ? `Marka: ${markaNotu.trim()}` : "",
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
    setPdfAdi("");
    setCariListe([]);
    setKalemler([bosKalem()]);
    setTarih(bugun());
    setFaturaNo("");
    setMarkaNotu("");
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
              ? "Faturanın fotoğrafını çekin, galeriden seçin veya PDF olarak yükleyin; tarih ve tutarı otomatik okuyalım. Firmayı siz seçersiniz. Fatura tek toptancıya yazılır; fişteki markalar sadece not olarak eklenir. Bayiliklere ayırmak isterseniz kalem ekleyip fişi kendiniz bölebilirsiniz."
              : "Üzerine müşterinin adresi (veya adı) el yazısıyla yazılmış fişin fotoğrafını çekin veya galeriden seçin; el yazısını, tarihi ve tutarı otomatik okuyalım. Müşteriyi siz seçer ya da adını kendiniz yazarsınız."}
          </p>
          {hata && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {hata}
            </p>
          )}
          {/* Kamera / galeri / PDF için ayrı gizli dosya alanları */}
          {(
            [
              [kameraRef, "image/*", true],
              [galeriRef, "image/*", false],
              [pdfRef, "application/pdf", false],
            ] as const
          ).map(([ref, kabul, kamera], i) => (
            <input
              key={i}
              ref={ref}
              type="file"
              accept={kabul}
              {...(kamera ? { capture: "environment" as const } : {})}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) dosyaSecildi(f);
                e.target.value = "";
              }}
            />
          ))}
          <button
            onClick={() => kameraRef.current?.click()}
            className="mt-5 w-full rounded-xl bg-green-700 py-4 text-lg font-bold text-white"
          >
            📷 Fotoğraf Çek
          </button>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => galeriRef.current?.click()}
              className="flex-1 rounded-xl bg-stone-100 py-3.5 text-sm font-bold text-stone-700"
            >
              🖼️ Galeriden Yükle
            </button>
            <button
              onClick={() => pdfRef.current?.click()}
              className="flex-1 rounded-xl bg-stone-100 py-3.5 text-sm font-bold text-stone-700"
            >
              📄 PDF Yükle
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            Satıcı faturayı fotoğraf olarak gönderdiyse galeriden, PDF olarak
            gönderdiyse PDF yükleyin.
          </p>
        </div>
      )}

      {asama === "isleniyor" && (
        <div className="mt-10 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Onizleme onizleme={onizleme} pdfAdi={pdfAdi} boy="max-h-48" />
          <p className="mt-4 animate-pulse font-bold text-stone-600">
            Okunuyor…
          </p>
        </div>
      )}

      {asama === "onay" && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <Onizleme onizleme={onizleme} pdfAdi={pdfAdi} boy="max-h-40" />
          <p className="mt-2 text-center text-xs text-stone-400">
            {kalemler.length > 1
              ? "Fişi kalemlere böldünüz. Her kalemin carisini ve tutarını kontrol edin."
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
              <CariSecici
                liste={cariListe}
                cariId={k.cariId}
                aramaAd={k.yeniCariAd}
                etiket={meta.cariAd}
                onSec={(id) => kalemGuncelle(i, { cariId: id })}
                onAramaAd={(ad) => kalemGuncelle(i, { yeniCariAd: ad })}
              />
              <label className="mt-3 block text-xs font-bold text-stone-400">
                {kalemler.length > 1 ? "Tutar" : "Toplam Tutar"}
              </label>
              <TutarGirdi
                inputMode="decimal"
                value={k.tutar}
                onValueChange={(t) => kalemGuncelle(i, { tutar: t })}
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
                ＋ Kalem ekle (başka cariye böl)
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
                <BuyukHarfGirdi
                  value={faturaNo}
                  onValueChange={setFaturaNo}
                  placeholder="—"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
                />
              </div>
            )}
          </div>

          {mod === "fatura" && (
            <div className="mt-3">
              <label className="block text-xs font-bold text-stone-400">
                Markalar (isteğe bağlı)
              </label>
              <BuyukHarfGirdi
                value={markaNotu}
                onValueChange={setMarkaNotu}
                placeholder="Örn. İÇİM, NAMET"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-[11px] text-stone-400">
                Fişten okunanlar yazılı gelir; düzeltebilir veya
                silebilirsiniz. Hareketin açıklamasına not olarak eklenir, ayrı
                cari açılmaz.
              </p>
            </div>
          )}

          <BuyukHarfGirdi
            value={aciklama}
            onValueChange={setAciklama}
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
