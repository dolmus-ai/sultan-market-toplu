"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { MarkaIsareti, MarkaYazi } from "@/bilesenler/Marka";

export default function GirisSayfasi() {
  const yonlendir = useRouter();
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(olay: React.FormEvent) {
    olay.preventDefault();
    setHata(null);
    setBekliyor(true);

    const db = tarayiciIstemcisi();
    const { error } = await db.auth.signInWithPassword({
      email: eposta.trim(),
      password: sifre,
    });

    if (error) {
      setHata(
        error.message.includes("Invalid login")
          ? "E-posta veya şifre hatalı."
          : error.message,
      );
      setBekliyor(false);
      return;
    }

    yonlendir.replace("/harita");
    yonlendir.refresh();
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-yuzey px-6">
      {/* Arka plan: kırmızı ışıklar + ince ızgara */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#0e0e11 1px, transparent 1px), linear-gradient(90deg, #0e0e11 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-kirmizi/25 blur-[110px]"
        animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-kontrast/15 blur-[130px]"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm rounded-[28px] border border-cizgi bg-yuzey/90 p-8 shadow-yuzen backdrop-blur-xl"
      >
        <div className="mb-8 flex items-center gap-3">
          <motion.div
            initial={{ rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 16 }}
          >
            <MarkaIsareti boyut={46} />
          </motion.div>
          <div className="text-lg">
            <MarkaYazi />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight">Vardiyaya gir</h1>
        <p className="mt-1.5 text-sm text-gri">
          Teslimatların, abonelikler ve rotan seni bekliyor.
        </p>

        <form onSubmit={gonder} className="mt-7 space-y-3">
          <Alan
            etiket="E-posta"
            tip="email"
            deger={eposta}
            degistir={setEposta}
            yer="kurye@sultanmarket.com"
          />
          <Alan
            etiket="Şifre"
            tip="password"
            deger={sifre}
            degistir={setSifre}
            yer="••••••••"
          />

          {hata && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-2xl bg-kirmizi-sis px-4 py-3 text-sm font-medium text-kirmizi-koyu"
            >
              {hata}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={bekliyor}
            whileTap={{ scale: 0.97 }}
            className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-hap bg-kirmizi text-base font-bold text-white shadow-kirmizi transition-colors hover:bg-kirmizi-koyu disabled:opacity-60"
          >
            {bekliyor ? (
              <motion.span
                className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <>
                Vardiyayı başlat
                <span aria-hidden>→</span>
              </>
            )}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-xs text-gri">
          Hesabın yoksa market yöneticisi seni tanımlamalı.
        </p>
      </motion.div>
    </main>
  );
}

function Alan({
  etiket,
  tip,
  deger,
  degistir,
  yer,
}: {
  etiket: string;
  tip: string;
  deger: string;
  degistir: (v: string) => void;
  yer: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gri">
        {etiket}
      </span>
      <input
        type={tip}
        value={deger}
        onChange={(e) => degistir(e.target.value)}
        placeholder={yer}
        required
        autoComplete={tip === "password" ? "current-password" : "email"}
        className="h-14 w-full rounded-2xl border border-cizgi bg-yuzey2 px-4 text-[15px] font-medium outline-none transition-all placeholder:text-gri/60 focus:border-kirmizi focus:bg-yuzey focus:ring-4 focus:ring-kirmizi/12"
      />
    </label>
  );
}
