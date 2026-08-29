"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { tarayiciIstemcisi } from "@/lib/supabase/client";
import { acilisSesi, onaySesi } from "@/lib/jingle";
import { SultanAcilis, SultanAmblem } from "@/bilesenler/SultanLogo";

const TERCIH_ANAHTARI = "sultan-tercih";

function sesTercihi(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return JSON.parse(localStorage.getItem(TERCIH_ANAHTARI) ?? "{}").ses ?? true;
  } catch {
    return true;
  }
}

export default function GirisSayfasi() {
  const yonlendir = useRouter();
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const [acilisBitti, setAcilisBitti] = useState(false);
  // Kullanıcı hareketi azaltmayı seçtiyse açılışı hiç oynatma.
  const hareketAz = useReducedMotion() ?? false;
  const formGorunur = acilisBitti || hareketAz;
  const [sesAcik, setSesAcik] = useState(sesTercihi);
  const calindiRef = useRef(false);

  // Animasyon herhangi bir sebeple tamamlanmazsa form yine de gelsin.
  useEffect(() => {
    const emniyet = setTimeout(() => setAcilisBitti(true), 2400);
    return () => clearTimeout(emniyet);
  }, []);

  /* Açılış sesi. Tarayıcı etkileşimden önce engellerse ilk dokunuşta çalar. */
  const jingleCal = useCallback(async () => {
    if (calindiRef.current || !sesAcik) return;
    calindiRef.current = await acilisSesi();
  }, [sesAcik]);

  useEffect(() => {
    void jingleCal();

    const ilkDokunus = () => void jingleCal();
    window.addEventListener("pointerdown", ilkDokunus, { once: true });
    window.addEventListener("keydown", ilkDokunus, { once: true });
    return () => {
      window.removeEventListener("pointerdown", ilkDokunus);
      window.removeEventListener("keydown", ilkDokunus);
    };
  }, [jingleCal]);

  function sesiDegistir() {
    const yeni = !sesAcik;
    setSesAcik(yeni);
    try {
      const mevcut = JSON.parse(localStorage.getItem(TERCIH_ANAHTARI) ?? "{}");
      localStorage.setItem(
        TERCIH_ANAHTARI,
        JSON.stringify({ ...mevcut, ses: yeni }),
      );
    } catch {
      /* depolama kapalıysa yok say */
    }
    if (yeni && !calindiRef.current) void acilisSesi();
  }

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

    if (sesAcik) void onaySesi();
    yonlendir.replace("/harita");
    yonlendir.refresh();
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-yuzey px-6 py-10">
      {/* Arka plan: kırmızı ışıklar + ince ızgara */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-kirmizi/20 blur-[110px]"
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-kontrast/15 blur-[130px]"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Ses anahtarı */}
      <button
        onClick={sesiDegistir}
        aria-label={sesAcik ? "Sesi kapat" : "Sesi aç"}
        title={sesAcik ? "Sesi kapat" : "Sesi aç"}
        className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-cizgi bg-yuzey/80 text-gri backdrop-blur-xl transition-colors hover:text-metin"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {sesAcik ? (
            <path
              d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="m16 9.5 5 5m0-5-5 5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {/* Açılış */}
      <div className="relative z-10 mb-9">
        {hareketAz ? (
          <div className="flex flex-col items-center gap-5">
            <SultanAmblem boyut={92} />
            <p className="text-[30px] font-black leading-none tracking-[-0.02em]">
              SULTAN MARKET
            </p>
            <div className="h-1 w-[168px] rounded-full bg-kirmizi" />
          </div>
        ) : (
          <SultanAcilis onBitti={() => setAcilisBitti(true)} />
        )}
      </div>

      {/* Giriş kartı — açılış bitince belirir */}
      <AnimatePresence>
        {formGorunur && (
          <motion.div
            initial={{ opacity: 0, y: 26, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-sm rounded-[28px] border border-cizgi bg-yuzey/90 p-7 shadow-yuzen backdrop-blur-xl"
          >
            <h1 className="text-2xl font-extrabold tracking-tight">
              Vardiyaya gir
            </h1>
            <p className="mt-1.5 text-sm text-gri">
              Teslimatların, abonelikler ve rotan seni bekliyor.
            </p>

            <form onSubmit={gonder} className="mt-6 space-y-3">
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
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: "linear",
                    }}
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
        )}
      </AnimatePresence>
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
