"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

/**
 * Viewport etiketi: tarayıcının kendi sayfa yakınlaştırması hep kapalı.
 *
 * Neden: iPhone Safari, büyütülmüş sayfayı koddan küçültmeye izin vermiyor
 * ("Arayüzü sıfırla" ya hiç çalışmıyor ya da sayfayı yenilemek gerekiyordu).
 * Bu yüzden iki parmakla büyütmeyi uygulama kendisi yapıyor (aşağıda);
 * böylece sıfırlama yenilemeden, akıcı bir animasyonla oluyor.
 */
export const VIEWPORT_KILITLI =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

const EN_COK = 4;
const BUYUK_ESIK = 1.02;
const YAY = { type: "spring", stiffness: 260, damping: 32 } as const;

export type UygulamaYakinligi = {
  olcek: MotionValue<number>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Arayüz büyütülmüş mü (sıfırla düğmesi için). */
  buyuk: boolean;
  /** Büyütmeyi akıcı bir animasyonla ilk hâline döndürür. */
  sifirla: () => void;
};

/** Dokunuş haritada mı (orada iki parmak haritayı yakınlaştırır). */
function haritada(hedef: EventTarget | null) {
  return hedef instanceof Element && hedef.closest(".maplibregl-map") != null;
}

/**
 * Uygulamanın kendi iki parmak yakınlaştırması.
 *
 * Yakınlaştırma kilidi kapalıyken haritanın dışında (üst çubuk, paneller,
 * listeler) iki parmakla açıp kapatmak bütün arayüzü büyütür; iki parmakla
 * sürüklemek büyütülmüş arayüzde gezdirir. Tek parmak her şeyi eskisi gibi
 * yapar (liste kaydırma, dokunma). Büyütme ekranın dışına taşmayacak
 * şekilde sınırlı; bırakınca neredeyse 1'deyse tam 1'e oturur.
 */
export function useUygulamaYakinligi(acik: boolean): UygulamaYakinligi {
  const olcek = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [buyuk, setBuyuk] = useState(false);

  useEffect(
    () => olcek.on("change", (s) => setBuyuk(s > BUYUK_ESIK)),
    [olcek],
  );

  const sifirla = useCallback(() => {
    void animate(olcek, 1, YAY);
    void animate(x, 0, YAY);
    void animate(y, 0, YAY);
  }, [olcek, x, y]);

  useEffect(() => {
    if (!acik) {
      // Kilit açılınca büyütülmüş arayüz kendiliğinden normale dönsün.
      if (olcek.get() > 1) sifirla();
      return;
    }

    let jest: {
      d0: number;
      mx0: number;
      my0: number;
      s0: number;
      x0: number;
      y0: number;
    } | null = null;

    const uzaklik = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    /** Arayüz ekranı her zaman kaplasın: kenarlardan içeri boşluk açılmasın. */
    const sinirla = (s: number, tx: number, ty: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return {
        tx: Math.min(0, Math.max(w - w * s, tx)),
        ty: Math.min(0, Math.max(h - h * s, ty)),
      };
    };

    const basla = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      if (haritada(a.target) || haritada(b.target)) return;
      olcek.stop();
      x.stop();
      y.stop();
      jest = {
        d0: Math.max(1, uzaklik(a, b)),
        mx0: (a.clientX + b.clientX) / 2,
        my0: (a.clientY + b.clientY) / 2,
        s0: olcek.get(),
        x0: x.get(),
        y0: y.get(),
      };
      e.preventDefault();
    };

    const surukle = (e: TouchEvent) => {
      if (!jest || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const mx = (a.clientX + b.clientX) / 2;
      const my = (a.clientY + b.clientY) / 2;
      const s = Math.min(EN_COK, Math.max(1, (jest.s0 * uzaklik(a, b)) / jest.d0));
      // Parmakların başta tuttuğu nokta parmakların altında kalsın.
      const px = (jest.mx0 - jest.x0) / jest.s0;
      const py = (jest.my0 - jest.y0) / jest.s0;
      const { tx, ty } = sinirla(s, mx - px * s, my - py * s);
      olcek.set(s);
      x.set(tx);
      y.set(ty);
    };

    const bitir = (e: TouchEvent) => {
      if (!jest || e.touches.length >= 2) return;
      jest = null;
      if (olcek.get() < 1.05) sifirla();
    };

    const secenek = { passive: false } as const;
    document.addEventListener("touchstart", basla, secenek);
    document.addEventListener("touchmove", surukle, secenek);
    document.addEventListener("touchend", bitir);
    document.addEventListener("touchcancel", bitir);
    return () => {
      document.removeEventListener("touchstart", basla);
      document.removeEventListener("touchmove", surukle);
      document.removeEventListener("touchend", bitir);
      document.removeEventListener("touchcancel", bitir);
    };
  }, [acik, olcek, x, y, sifirla]);

  return { olcek, x, y, buyuk, sifirla };
}

/**
 * Arayüz büyütülmüşken ekranın tepesinde beliren "Arayüzü sıfırla" düğmesi.
 * Büyütülen arayüzün dışında (body'de) duruyor; hep normal boyutta görünür.
 */
export function YakinlikSifirlaDugmesi({
  buyuk,
  onSifirla,
}: {
  buyuk: boolean;
  onSifirla: () => void;
}) {
  // Sunucu çiziminde ve hidrasyonda portal kurulmaz; ikisi aynı kalsın.
  const istemcide = useSyncExternalStore(
    abonelikYok,
    () => true,
    () => false,
  );
  if (!istemcide) return null;
  return createPortal(
    <AnimatePresence>
      {buyuk && (
        <motion.div
          key="sifirla"
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[95] flex justify-center"
        >
          <button
            onClick={onSifirla}
            className="pointer-events-auto flex h-10 items-center gap-2 rounded-hap bg-kontrast px-4 text-[13px] font-black text-white shadow-yuzen active:scale-95"
          >
            <SifirlaSimgesi />
            Arayüzü sıfırla
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function SifirlaSimgesi({ boyut = 16 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const abonelikYok = () => () => {};
