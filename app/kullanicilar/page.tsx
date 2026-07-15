"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .order("created_at")
      .then(({ data }) => setListe((data as Profile[]) ?? []));
  }, []);

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
              <span className="text-sm font-semibold">
                {p.full_name}
                {p.id === session?.user.id && (
                  <span className="ml-1 text-xs font-normal text-green-700">
                    (siz)
                  </span>
                )}
              </span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                {p.role === "sahip" ? "İşletme Sahibi" : "Personel"}
              </span>
            </li>
          ))}
        </ul>
      </div>

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

        <label className="mt-3 block text-xs text-stone-400">
          Yeni Şifre
        </label>
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

      <p className="mt-3 text-center text-xs text-stone-400">
        Yeni kullanıcı eklemek için Supabase panelinden davet gönderin.
      </p>
    </Shell>
  );
}
