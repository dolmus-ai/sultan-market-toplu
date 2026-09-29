"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/defter/components/Shell";
import BelgeGoruntuleyici from "@/defter/components/BelgeGoruntuleyici";
import { BuyukHarfGirdi } from "@/defter/components/Girdi";
import { supabase } from "@/defter/lib/supabase";
import {
  girisBaslik,
  girisTuru,
  odemeBaslik,
  odemeTuru,
  para,
  tarihFmt,
  TUR_LABEL,
  YONTEM_LABEL,
} from "@/defter/lib/format";
import type { CariOzet, Hareket } from "@/defter/lib/types";

export default function CariDetay() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cari, setCari] = useState<CariOzet | null>(null);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [duzenle, setDuzenle] = useState(false);
  const [form, setForm] = useState({ unvan: "", telefon: "", adres: "" });
  const [mesaj, setMesaj] = useState("");
  const [belgeGoster, setBelgeGoster] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const [c, h] = await Promise.all([
      supabase.from("cari_ozet").select("*").eq("id", id).single(),
      supabase
        .from("hareketler")
        .select("*, profiles(full_name), kartlar(ad)")
        .eq("cari_id", id)
        .order("tarih", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const cd = c.data as CariOzet | null;
    setCari(cd);
    if (cd)
      setForm({
        unvan: cd.unvan,
        telefon: cd.telefon ?? "",
        adres: cd.adres ?? "",
      });
    setHareketler((h.data as Hareket[]) ?? []);
  }, [id]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const bilgiKaydet = async () => {
    if (!cari) return;
    const { error } = await supabase
      .from("cariler")
      .update({
        unvan: form.unvan.trim(),
        telefon: form.telefon.trim() || null,
        adres: form.adres.trim() || null,
      })
      .eq("id", cari.id);
    setMesaj(error ? "Kaydedilemedi." : "Bilgiler güncellendi.");
    setDuzenle(false);
    yukle();
  };

  const aktifDegistir = async () => {
    if (!cari) return;
    await supabase
      .from("cariler")
      .update({ aktif: !cari.aktif })
      .eq("id", cari.id);
    yukle();
  };

  const hareketSil = async (hid: string) => {
    if (!confirm("Bu kayıt silinsin mi?")) return;
    await supabase.from("hareketler").delete().eq("id", hid);
    yukle();
  };

  const cariSil = async () => {
    if (!cari) return;
    if (
      !confirm(
        `${cari.unvan} ve geçmişteki TÜM hareketleri kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?`
      )
    )
      return;
    const { error } = await supabase
      .from("cariler")
      .delete()
      .eq("id", cari.id);
    if (error) {
      setMesaj("Silinemedi. Tekrar deneyin.");
      return;
    }
    router.replace(`/cariler?tip=${cari.tip}`);
  };

  // Belgeyi uygulama içinde tam ekran göster (window.open mobilde
  // popup engeline takılıyordu; overlay her cihazda çalışır)
  const belgeAc = async (yol: string) => {
    const { data, error } = await supabase.storage
      .from("belgeler")
      .createSignedUrl(yol, 3600);
    if (error || !data?.signedUrl) {
      setMesaj("Belge açılamadı. Tekrar deneyin.");
      return;
    }
    setBelgeGoster(data.signedUrl);
  };

  if (!cari)
    return (
      <Shell title="Cari">
        <p className="py-10 text-center text-stone-400">Yükleniyor…</p>
      </Shell>
    );

  const kalan = Number(cari.kalan_bakiye);

  // Kronolojik (eskiden yeniye) yürüyen bakiye hesabı, ekranda yeniden eskiye gösterilir
  const kronolojik = [...hareketler].reverse();
  const yuruyen = new Map<string, number>();
  let b = 0;
  for (const h of kronolojik) {
    b +=
      h.tur === "fatura" || h.tur === "veresiye"
        ? Number(h.tutar)
        : -Number(h.tutar);
    yuruyen.set(h.id, b);
  }

  return (
    <Shell title={cari.unvan}>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-green-700">
              {cari.tip === "alici" ? "Müşteri" : "Toptancı"}
              {!cari.aktif && (
                <span className="ml-2 text-stone-400">· Pasif</span>
              )}
            </div>
            {cari.telefon && (
              <a
                href={`tel:${cari.telefon}`}
                className="text-sm text-sky-700 underline"
              >
                {cari.telefon}
              </a>
            )}
            {cari.adres && (
              <div className="text-xs text-stone-400">{cari.adres}</div>
            )}
          </div>
          <button
            onClick={() => setDuzenle(!duzenle)}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600"
          >
            Düzenle
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-stone-50 p-3 text-center">
          <div>
            <div className="text-[11px] text-stone-400">
              {girisBaslik(cari.tip)}
            </div>
            <div className="font-bold text-stone-700">
              {para(Number(cari.toplam_giris))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">
              {odemeBaslik(cari.tip)}
            </div>
            <div className="font-bold text-sky-700">
              {para(Number(cari.toplam_odeme))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">Kalan Bakiye</div>
            <div
              className={`font-bold ${
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

        {cari.tip === "alici" && kalan === 0 && hareketler.length > 0 && (
          <button
            onClick={cariSil}
            className="mt-3 w-full rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-600"
          >
            Borç kapandı — Müşteriyi Sil
          </button>
        )}

        {duzenle && (
          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            <BuyukHarfGirdi
              value={form.unvan}
              onValueChange={(v) => setForm({ ...form, unvan: v })}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Ünvan"
            />
            <input
              value={form.telefon}
              onChange={(e) => setForm({ ...form, telefon: e.target.value })}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Telefon"
            />
            <BuyukHarfGirdi
              value={form.adres}
              onValueChange={(v) => setForm({ ...form, adres: v })}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              placeholder="Adres"
            />
            <div className="flex gap-2">
              <button
                onClick={bilgiKaydet}
                className="flex-1 rounded-lg bg-green-700 py-2 text-sm font-bold text-white"
              >
                Kaydet
              </button>
              <button
                onClick={aktifDegistir}
                className="flex-1 rounded-lg bg-stone-200 py-2 text-sm font-bold text-stone-700"
              >
                {cari.aktif ? "Pasif Yap" : "Aktif Yap"}
              </button>
            </div>
            <button
              onClick={cariSil}
              className="w-full rounded-lg bg-red-50 py-2 text-sm font-bold text-red-600"
            >
              Cariyi Sil (tüm geçmişiyle)
            </button>
          </div>
        )}
        {mesaj && <p className="mt-2 text-xs text-green-700">{mesaj}</p>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={`/islem?tur=${odemeTuru(cari.tip)}&cari=${cari.id}`}
          className="rounded-xl bg-green-700 py-3 text-center text-sm font-bold text-white"
        >
          {cari.tip === "alici" ? "Ödeme Al" : "Ödeme Yap"}
        </Link>
        <Link
          href={`/islem?tur=${girisTuru(cari.tip)}&cari=${cari.id}`}
          className="rounded-xl bg-amber-600 py-3 text-center text-sm font-bold text-white"
        >
          {cari.tip === "alici" ? "Veresiye Yaz" : "Fatura Ekle"}
        </Link>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">
          Hesap Hareketleri
        </div>
        {hareketler.length === 0 && (
          <p className="text-sm text-stone-400">Henüz hareket yok.</p>
        )}
        <ul className="divide-y divide-stone-100">
          {hareketler.map((h) => {
            const giris = h.tur === "fatura" || h.tur === "veresiye";
            return (
              <li key={h.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {TUR_LABEL[h.tur]}
                    {h.odeme_yontemi && (
                      <span className="ml-1 text-xs font-normal text-stone-400">
                        ({YONTEM_LABEL[h.odeme_yontemi]}
                        {h.kartlar?.ad ? ` · ${h.kartlar.ad}` : ""})
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      giris ? "text-red-600" : "text-green-700"
                    }`}
                  >
                    {giris ? "+" : "−"}
                    {para(Number(h.tutar))}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-stone-400">
                  <span>
                    {tarihFmt(h.tarih)} · {h.profiles?.full_name ?? "—"}
                    {h.aciklama ? ` · ${h.aciklama}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {h.belge_yolu && (
                      <button
                        onClick={() => belgeAc(h.belge_yolu!)}
                        className="text-sky-600"
                        aria-label="Belgeyi aç"
                      >
                        📎 Belge
                      </button>
                    )}
                    <span>Bakiye: {para(yuruyen.get(h.id) ?? 0)}</span>
                    <button
                      onClick={() => hareketSil(h.id)}
                      className="rounded bg-red-50 px-1.5 py-0.5 text-red-500"
                      aria-label="Sil"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {belgeGoster && (
        <BelgeGoruntuleyici
          url={belgeGoster}
          onKapat={() => setBelgeGoster(null)}
        />
      )}
    </Shell>
  );
}
