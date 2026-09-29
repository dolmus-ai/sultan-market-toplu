"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";

import { gecisSesi } from "@/lib/jingle";

/**
 * Bakkal defteri ↔ kurye modu arasında tek dokunuşla, sesli ve animasyonlu
 * geçiş.
 *
 * İki taraf ayrı kök yerleşim (root layout) kullandığı için geçiş tam sayfa
 * yüklemesi; animasyon bu yüzden iki parçalı:
 *
 *  1. Çıkılan sayfa: dokunulan düğmeden hedef modun renginde bir daire açılır,
 *     ses çalar, ekran kapanınca yeni adrese gidilir.
 *  2. Varılan sayfa: aynı perde daha ilk boyamada ekranı kaplar (satır içi
 *     betik `<html data-gecis>` koyar, CSS perdeyi gösterir) ve sayfa
 *     hazır olunca daire kapanarak açılır. Arada boş ya da titreyen kare yok.
 */

export type Mod = "kurye" | "defter";

const GECIS_ANAHTARI = "sultan-gecis";
const TERCIH_ANAHTARI = "sultan-tercih";
/** Bu kadar eski bir geçiş kaydı yok sayılır (ör. sekme sonra yeniden açıldı). */
const GECIS_OMRU_MS = 15_000;
const PERDE_ID = "sultan-gecis-perde";

const MODLAR: Record<
  Mod,
  { adres: string; zemin: string; koyu: string; baslik: string; alt: string }
> = {
  kurye: {
    adres: "/harita",
    zemin: "#e30a17",
    koyu: "#16212e",
    baslik: "Kurye Modu",
    alt: "Harita · Teslimatlar · Rota",
  },
  defter: {
    adres: "/",
    zemin: "#15803d",
    koyu: "#14532d",
    baslik: "Bakkal Defteri",
    alt: "Cariler · Kasa · Raporlar",
  },
};

function sesAcikMi(): boolean {
  try {
    return JSON.parse(localStorage.getItem(TERCIH_ANAHTARI) ?? "{}").ses ?? true;
  } catch {
    return true;
  }
}

function hareketAzMi(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/* ------------------------------------------------------------------ */
/* Simgeler                                                            */
/* ------------------------------------------------------------------ */

function MotorSimgesi({ boyut = 64 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="1.8" y="7.6" width="6.4" height="5.2" rx="1.2" fill="#fff" />
      <circle cx="6" cy="17.2" r="2.7" stroke="#fff" strokeWidth="1.8" />
      <circle cx="18" cy="17.2" r="2.7" stroke="#fff" strokeWidth="1.8" />
      <path
        d="M6 17.2 9.4 13h5.2l3.4 4.2M14.6 13l-1.9-6.2h-2.2M11.4 6.8h3.2"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DefterSimgesi({ boyut = 64 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 6.2C10 4.8 7.2 4.3 3.8 4.6v13.6c3.4-.3 6.2.2 8.2 1.6 2-1.4 4.8-1.9 8.2-1.6V4.6c-3.4-.3-6.2.2-8.2 1.6Z"
        fill="#fff"
      />
      <path d="M12 6.2v13.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.4 8.6c1.3 0 2.5.2 3.4.6M6.4 11.6c1.3 0 2.5.2 3.4.6M14.2 9.2c.9-.4 2.1-.6 3.4-.6M14.2 12.2c.9-.4 2.1-.6 3.4-.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Simge({ mod, boyut }: { mod: Mod; boyut?: number }) {
  return mod === "kurye" ? (
    <MotorSimgesi boyut={boyut} />
  ) : (
    <DefterSimgesi boyut={boyut} />
  );
}

/** Perdenin ortasındaki yazı — hem çıkışta hem varışta aynı görünür. */
function PerdeYazisi({ mod }: { mod: Mod }) {
  const m = MODLAR[mod];
  return (
    <>
      <p
        style={{
          marginTop: 18,
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: "#fff",
        }}
      >
        {m.baslik}
      </p>
      <p
        style={{
          marginTop: 10,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "rgb(255 255 255 / 0.78)",
        }}
      >
        {m.alt}
      </p>
    </>
  );
}

const PERDE_STILI = {
  position: "fixed",
  inset: 0,
  zIndex: 2147483000,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

function perdeZemini(mod: Mod) {
  const m = MODLAR[mod];
  return `radial-gradient(120% 90% at 50% 40%, ${m.zemin} 0%, ${m.koyu} 100%)`;
}

/* ------------------------------------------------------------------ */
/* 1. Çıkış: geçiş düğmesi                                             */
/* ------------------------------------------------------------------ */

export function ModGecisDugmesi({
  hedef,
  className,
  children,
  title,
}: {
  hedef: Mod;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const [merkez, setMerkez] = useState<{ x: number; y: number } | null>(null);
  const gidiyorRef = useRef(false);
  const m = MODLAR[hedef];

  function gec(olay: React.MouseEvent<HTMLButtonElement>) {
    if (gidiyorRef.current) return;
    gidiyorRef.current = true;

    // Ses dokunuşun içinde başlamalı; sayfa değişince zaten kesilir.
    if (sesAcikMi()) void gecisSesi(hedef);

    if (hareketAzMi()) {
      window.location.assign(m.adres);
      return;
    }

    try {
      sessionStorage.setItem(
        GECIS_ANAHTARI,
        JSON.stringify({ hedef, zaman: Date.now() }),
      );
    } catch {
      /* depolama kapalıysa varışta perde yalnızca olmaz */
    }

    const kutu = olay.currentTarget.getBoundingClientRect();
    setMerkez({ x: kutu.left + kutu.width / 2, y: kutu.top + kutu.height / 2 });
  }

  return (
    <>
      <button type="button" onClick={gec} className={className} title={title ?? m.baslik}>
        {children}
      </button>
      {merkez &&
        createPortal(
          <motion.div
            role="status"
            aria-label={`${m.baslik} açılıyor`}
            style={{ ...PERDE_STILI, display: "flex", background: perdeZemini(hedef) }}
            initial={{ clipPath: `circle(0px at ${merkez.x}px ${merkez.y}px)` }}
            animate={{ clipPath: `circle(150vmax at ${merkez.x}px ${merkez.y}px)` }}
            transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
          >
            <motion.div
              style={{ color: m.zemin }}
              initial={
                hedef === "kurye"
                  ? { x: "-60vw", opacity: 0, rotate: -6 }
                  : { scale: 0.4, opacity: 0, rotate: -18 }
              }
              animate={{ x: 0, scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.18 }}
            >
              <Simge mod={hedef} boyut={76} />
            </motion.div>
            <motion.div
              style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.3 }}
              onAnimationComplete={() => window.location.assign(m.adres)}
            >
              <PerdeYazisi mod={hedef} />
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Varış: ilk boyamada ekranı kaplayan, sonra açılan perde          */
/* ------------------------------------------------------------------ */

/**
 * Kök yerleşimde `<body>`nin ilk çocuğu olarak durur. `<html>` etiketinde
 * `suppressHydrationWarning` gerekir: satır içi betik, React devralmadan önce
 * `data-gecis` özniteliğini ekliyor.
 */
export function GecisKarsilama({ mod }: { mod: Mod }) {
  const perdeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Kayıt tek kullanımlık: bu sayfaya ait olmasa da (ör. oturum düştü,
    // giriş ekranına yönlendirildi) bir sonraki açılışta perde çıkmasın.
    try {
      sessionStorage.removeItem(GECIS_ANAHTARI);
    } catch {
      /* yok say */
    }
    const kok = document.documentElement;
    if (kok.dataset.gecis !== mod) return;
    const perde = perdeRef.current;
    const bitir = () => {
      delete kok.dataset.gecis;
    };
    if (!perde || typeof perde.animate !== "function") {
      bitir();
      return;
    }

    const animasyon = perde.animate(
      [
        { clipPath: "circle(150vmax at 50% 50%)" },
        { clipPath: "circle(0px at 50% 50%)" },
      ],
      { duration: 620, delay: 120, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    );
    animasyon.onfinish = bitir;
    animasyon.oncancel = bitir;
    return () => animasyon.cancel();
  }, [mod]);

  const betik = `try{var g=JSON.parse(sessionStorage.getItem("${GECIS_ANAHTARI}")||"null");if(g&&g.hedef==="${mod}"&&Date.now()-g.zaman<${GECIS_OMRU_MS})document.documentElement.dataset.gecis="${mod}"}catch(e){}`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: betik }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `#${PERDE_ID}{display:none}html[data-gecis="${mod}"] #${PERDE_ID}{display:flex}`,
        }}
      />
      <div
        id={PERDE_ID}
        ref={perdeRef}
        aria-hidden
        style={{ ...PERDE_STILI, background: perdeZemini(mod) }}
      >
        <div style={{ color: MODLAR[mod].zemin }}>
          <Simge mod={mod} boyut={76} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <PerdeYazisi mod={mod} />
        </div>
      </div>
    </>
  );
}
