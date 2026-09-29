"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import type { Profile } from "@/lib/types";

export default function KullanicilarPage() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [liste, setListe] = useState<Profile[]>([]);
  const [ad, setAd] = useState("");
  const [yeniSifre, setYeniSifre] = useState("");
  const [mesaj, setMesaj] = useState("");

  // Yeni kullanıcı formu (sadece sahip)
  const [yeniAd, setYeniAd] = useState("");
  const [yeniEmail, setYeniEmail] = useState("");
  const [yeniKullaniciSifre, setYeniKullaniciSifre] = useState("");
  const [ekleMesaj, setEkleMesaj] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);

  const sahipMi = profile?.role === "sahip";

  const listeYukle = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    setListe((data as Profile[]) ?? []);
  }, []);

  useEffect(() => {
    listeYukle();
  }, [listeYukle]);

  useEffect(() => {
    if (profile) setAd(profile.full_name);
  }, [profile]);

  const adKaydet = async () => {
    if (!session) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: ad.trim() })
      .eq("id", session.user.id);
    setMesaj(error ? "Kaydedilemedi." : "Ad güncellendi.");
    refreshProfile();
    listeYukle();
  };

  const sifreDegistir = async () => {
    if (yeniSifre.length < 6) {
      setMesaj("Şifre en az 6 karakter olmalı.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: yeniSifre });
    setMesaj(error ? "Şifre değiştirilemedi." : "Şifre değiştirildi.");
    setYeniSifre("");
  };

  const kullaniciEkle = async () => {
    setEkleMesaj("");
    if (!yeniAd.trim() || !yeniEmail.includes("@")) {
      setEkleMesaj("Ad ve geçerli bir e-posta girin.");
      return;
    }
    if (yeniKullaniciSifre.length < 6) {
      setEkleMesaj("Geçici şifre en az 6 karakter olmalı.");
      return;
    }
    setEkleniyor(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create",
        email: yeniEmail,
        password: yeniKullaniciSifre,
        full_name: yeniAd,
      },
    });
    setEkleniyor(false);
    if (error || data?.error) {
      setEkleMesaj(
        "Eklenemedi: " + (data?.error ?? "yetki veya bağlantı sorunu.")
      );
      return;
    }
    setEkleMesaj(
      `${yeniAd} eklendi. Geçici şifreyi kendisine iletin; ilk girişte bu ekrandan değiştirsin.`
    );
    setYeniAd("");
    setYeniEmail("");
    setYeniKullaniciSifre("");
    listeYukle();
  };

  const aktifDegistir = async (p: Profile) => {
    if (
      !p.aktif ||
      confirm(`${p.full_name} pasife alınsın mı? Artık giriş yapamaz.`)
    ) {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "set_active", user_id: p.id, aktif: !p.aktif },
      });
      if (error || data?.error) {
        setMesaj("İşlem yapılamadı.");
        return;
      }
      listeYukle();
    }
  };

  const cikis = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <Shell title="Kişiler">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">Ekip</div>
        <ul className="divide-y divide-stone-100">
          {liste.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <span
                className={`text-sm font-semibold ${
                  !p.aktif ? "text-stone-400 line-through" : ""
                }`}
              >
                {p.full_name}
                {p.id === session?.user.id && (
                  <span className="ml-1 text-xs font-normal text-green-700">
                    (siz)
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                  {p.role === "sahip" ? "İşletme Sahibi" : "Personel"}
                </span>
                {sahipMi && p.id !== session?.user.id && (
                  <button
                    onClick={() => aktifDegistir(p)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                      p.aktif
                        ? "bg-red-50 text-red-600"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {p.aktif ? "Pasife Al" : "Aktif Et"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {sahipMi && (
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-stone-700">
            Yeni Kullanıcı Ekle
          </div>
          <div className="space-y-2">
            <input
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              placeholder="Ad Soyad"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
            />
            <input
              value={yeniEmail}
              onChange={(e) => setYeniEmail(e.target.value)}
              type="email"
              placeholder="E-posta (girişte kullanılacak)"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
            />
            <input
              value={yeniKullaniciSifre}
              onChange={(e) => setYeniKullaniciSifre(e.target.value)}
              placeholder="Geçici şifre (en az 6 karakter)"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
            />
            <button
              onClick={kullaniciEkle}
              disabled={ekleniyor}
              className="w-full rounded-xl bg-green-700 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {ekleniyor ? "Ekleniyor…" : "Kullanıcı Ekle"}
            </button>
            {ekleMesaj && (
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
                {ekleMesaj}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-bold text-stone-700">Hesabım</div>
        <label className="text-xs text-stone-400">Görünen Ad</label>
        <div className="mt-1 flex gap-2">
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />
          <button
            onClick={adKaydet}
            className="rounded-xl bg-green-700 px-4 text-sm font-bold text-white"
          >
            Kaydet
          </button>
        </div>

        <label className="mt-3 block text-xs text-stone-400">Yeni Şifre</label>
        <div className="mt-1 flex gap-2">
          <input
            type="password"
            value={yeniSifre}
            onChange={(e) => setYeniSifre(e.target.value)}
            placeholder="••••••"
            className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />
          <button
            onClick={sifreDegistir}
            className="rounded-xl bg-stone-700 px-4 text-sm font-bold text-white"
          >
            Değiştir
          </button>
        </div>

        {mesaj && <p className="mt-2 text-xs text-green-700">{mesaj}</p>}
      </div>

      <button
        onClick={cikis}
        className="mt-4 w-full rounded-xl bg-red-50 py-3 text-sm font-bold text-red-600"
      >
        Çıkış Yap
      </button>
    </Shell>
  );
}
