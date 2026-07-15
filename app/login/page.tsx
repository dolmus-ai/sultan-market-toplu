"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [bekliyor, setBekliyor] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  const girisYap = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata("");
    setBekliyor(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: sifre,
    });
    setBekliyor(false);
    if (error) {
      setHata("Giriş yapılamadı. E-posta veya şifre hatalı.");
      return;
    }
    router.replace("/");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white">
          SM
        </div>
        <h1 className="text-2xl font-bold">Sultan Market</h1>
        <p className="text-stone-500">Bakkal Defteri</p>
      </div>

      <form onSubmit={girisYap} className="space-y-3">
        <input
          type="email"
          required
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-base outline-none focus:border-green-600"
        />
        <input
          type="password"
          required
          placeholder="Şifre"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-base outline-none focus:border-green-600"
        />
        {hata && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}
        <button
          type="submit"
          disabled={bekliyor}
          className="w-full rounded-xl bg-green-700 py-3.5 text-base font-bold text-white disabled:opacity-60"
        >
          {bekliyor ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-stone-400">
        Hesabınız yoksa işletme sahibine başvurun.
      </p>
    </div>
  );
}
